# Cross-module contracts for Phase 2 (lead-owned; binding)

Phase 2 agents work in separate worktrees and never see each other's code. Everything that crosses a module
boundary or is shared between the UI and the e2e suite is pinned here, on top of `src/types/**`, the stub
signatures in `src/*/index.ts`, `PLAN.md` "Assumptions" and "Spec-gap resolutions".

## 1. Engine (`src/engine`, impl-engine)

- `createEnginePool(profile: EngineProfile, opts?: { onStatus?: (s: EngineStatus) => void }): EngineApi & { measureNps(): Promise<number> }`
  where `EngineStatus = { phase: 'loading'; percent: number | null } | { phase: 'ready'; build: 'lite-single' | 'lite'; threads: number } | { phase: 'error'; key: 'E-2'; message: string }`.
  Export the `EngineStatus` type from `src/engine/index.ts`. `init(profile)` boots the workers (lazily: nothing before the first `init`).
- Mock: when `window.__USE_MOCK_ENGINE__ === true`, `createEnginePool` returns a `MockEngine` (src/engine/mock/MockEngine.ts)
  built from `window.__MOCK_EVALS__` (`Record<string, PositionEval>` keyed `fen4|depth|multipv`). Lookup: exact key; else any entry whose
  key starts with `fen4|` (prefer multipv 2), with `lines` truncated to the requested multiPv and `multiPv` set accordingly; else reject
  with `Error('mock engine: no eval for <key>')`. It resolves asynchronously (`await Promise.resolve()`, no timers), never creates a
  Worker, `stats` stay `{ workersCreated: 0, uciSent: 0 }`, `measureNps()` resolves 1_000_000. Declare the two globals in
  `src/engine/mock/MockEngine.ts` with `declare global { interface Window { __USE_MOCK_ENGINE__?: boolean; __MOCK_EVALS__?: Record<string, PositionEval> } }`.
- `evalKey(fen, limits)` = `fen.split(' ').slice(0, 4).join(' ') + '|' + limits.depth + '|' + limits.multiPv` (the only builder; exported from `src/engine/index.ts`).
- `calibrate(pool)` per PLAN Assumption 15. `ENGINE_STRINGS` in `src/engine/errors.ts`, re-exported; the F.3 snapshot lives in `src/ui/strings.test.ts` (its ENGINE_STRINGS part is impl-engine's to make green).

## 2. Analysis (`src/analysis`, impl-analysis)

- `analyzeGame(game, engine, profile, opts)` evaluates positions 0..N (position k = `moves[k].before`, position N = last `after`)
  with `engine.evaluate(fen, profile.limits, jobId)`; terminal positions are synthesised, never evaluated. On phones
  (`profile.multiPv === 1`) the candidate re-search uses `{ ...profile.limits, multiPv: 2 }`.
- Returns and emits (`onPly`) a complete `GameReview` (schema 1). `engine.name` = 'Stockfish 19 Lite WASM' (or '... Multithreaded' for build 'lite'),
  'Mock engine' is not used: the name comes from `profile.build`.
- `opts.explainPly(review, ply)` fills `PlyReview.explanation` (blank `{ headline: '', sentences: [], arrows: [], highlights: [], reasonCode: '' }` without it).
- `resumeFrom`: plies with status `done` or `not-analysed` are kept; analysis restarts at the first other ply (re-evaluating the position before it).
- Progress: `onProgress({ done, total, etaMs, refining })`, `total` = number of positions to evaluate.

## 3. Explain (`src/explain`, impl-explain)

- `buildMoveFacts(review, ply, userColor)`: `ply` is `PlyReview.ply` (1-based). Data sources: `povBefore/After` from `evalBefore/After` with the
  single mover rule; `bestPv` = `plies[k].bestPv` replayed to SAN from `before` (max 8); `playedPv` = the next ply's `bestPv` (the engine line
  of the position after the move) replayed from `after`, or `playedLine.pv.slice(1)` for the last ply; `gapToSecondBest` from `bestPv`/`secondLine`;
  `opening` via `lookupOpening` from `../analysis`; `depthTarget` = `review.engine.depth`; `fenBefore/fenAfter` = `before/after`;
  `isUserMove` = `color === userColor`.

## 4. State and UI (`src/state`, `src/ui`, impl-ui)

- Persistence (idb-keyval): `game:<id>` -> ImportedGame, `review:v1:<id>` -> GameReview; also export `listRecent(): Promise<Array<{ gameId; white; black; result; date?; accuracy }>>` from `src/state/index.ts`.
- `window.__ANALYSE_ENGINE_STATS__ = () => ({ workersCreated, uciSent })` set by `src/state/` at startup (zeros until a pool exists), with the `declare global` of DoD item 9.
- Engine boot order (section 4.5): `deviceProfile()` -> null shows E-1; else `createEnginePool({ build, workers, threads, hashMb, multiPv, limits: tiers['standard-16'] + multiPv, tier: 'standard-16' })`
  lazily on the first analysis, `init`, `calibrate` once, then the final `EngineProfile` (tier/limits from settings: auto -> calibrated tier, standard, deep; fast-14 override below 300k nps).
- Explanations: `explainPly = (review, ply) => explain(buildMoveFacts(review, ply, userColor), voice)` where voice = settings.voice === 'me' && isUserMove ? 'personal' : 'impersonal'. The UI may recompute explanations on render when colour/voice settings change.

## 5. DOM contract shared by the UI and the e2e suite (`data-testid`)

Import screen: `import-input` (textarea; drop target), `import-username`, `import-submit` (button "Analyse"), `color-white` / `color-black` (toggle buttons, `aria-pressed`),
`profile-select`, `import-error` (role="alert"; text = the formatted Appendix F string), `import-notice` (P-5, P-8, I-10a, P-2 progress lines), `confirm-in-progress` (button "Analyse so far"),
`engine-status`, `recent-games` (list; items `recent-game`).
Review root: `review` with attribute `data-complete="true|false"` and `data-game-id`; `banner-custom-start` (I-15), `banner-in-progress` (I-36); `analysis-progress` (role="status", E-8 text).
Overview: `overview`, `summary`, `player-white`, `player-black` (names inside `player-white-name` / `player-black-name`), `result`, `accuracy-white`, `accuracy-black` (text with one decimal),
`chesscom-reported`, `tally` with rows `tally-<classification>` containing `tally-white-<classification>` and `tally-black-<classification>` (numbers),
`rating-white`, `rating-black`, `phase-grade-<white|black>-<opening|middlegame|endgame>`, `eval-graph` (the svg; attribute `data-points` = number of plotted plies), `key-moment-tick` (one per key moment), `start-review`, `share`.
Move-by-move: `board` (wrapper of react-chessboard), `board-badge` (attribute `data-square`, `aria-label` = class name), `eval-bar`, `move-list`, `move-<ply>` (one per ply; attributes `data-classification`, `aria-current="true"` on the active ply),
`coach-box`, `coach-headline`, `coach-text`, `best-chip`, `explain-toggle` (`aria-pressed`), buttons `show-best`, `show-reply`, `retry`, `prev`, `next`, `key-moves`, `first`, `last`, `retry-feedback`, `opening-name`, `flip`, `back-to-overview`.
Footer: `about-licenses` (button) opening `about-panel`. Settings: `settings` (button), `settings-panel`.
URL after a successful import: `?game=<id>` (replaceState) and `&ply=<n>` while stepping.
