# PLAN

Build of "Analyse" per PROMPT.md. Current phase: **4 (review)**.

## Requirements checklist (R1 to R34)

- [ ] R1 URL / PGN input forms (parseInput, A.4)
- [ ] R2 kind selects one endpoint; bare-link live-then-daily rule
- [ ] R3 Vercel import chain with degradation, content-type check, proxyDown memo
- [ ] R4 TCN decoder verbatim + castling normalisation + plyCount cross-check
- [ ] R5 start position from data; custom start disables Book, banner I-15
- [ ] R6 supported / unsupported inputs, variant gate before engine
- [ ] R7 "which colour am I" resolution, persisted
- [ ] R8 lichess fetch, 429 retry, TypeError path
- [ ] R9 public API serial, lowercase, 3 live months / 6 daily months
- [ ] R10 engine files vendored, sizes checked, no stockfish dependency
- [ ] R11 classic workers, build-output greps
- [ ] R12 pthreads only isolated + non-WebKit; SIMD probe gate
- [ ] R13 worker counts and Hash per device class
- [ ] R14 combined go depth+movetime; profiles; calibration tiers
- [ ] R15 MultiPV 2 desktop/tablet; phone re-search of candidates
- [ ] R16 forwards analysis, progressive, cancellable, cached, IndexedDB resume, lazy pool, watchdog
- [ ] R17 UCI protocol handling
- [ ] R18 win% curve, mover POV
- [ ] R19 classification per Appendix B (19 fixtures)
- [ ] R20 accuracy formula + harmonic aggregation; lichess preset on dev page
- [ ] R21 estimated game rating
- [ ] R22 phases (Divider), phase grades
- [ ] R23 key moments
- [ ] R24 explanation engine (rules, proofs, seeded variants)
- [ ] R25 headlines and voice
- [ ] R26 Explain toggle and coach box buttons
- [ ] R27 screens per Appendix G
- [ ] R28 colours/icons/pieces/sounds/fonts; no chess.com runtime assets
- [ ] R29 query-string navigation; ?game receiving cases
- [ ] R30 360 px, keyboard, aria-current, role=status, badge aria-labels
- [ ] R31 deploy files, COOP/COEP, coi SW on Pages only
- [ ] R32 licensing, About panel
- [ ] R33 unit + e2e tests
- [ ] R34 lint/format/typecheck/test/build/build:pages green

## Gates

- [x] Gate 0 (scaffold + red tests): 19 red test files, 735 failing tests (649 not implemented, 86 stub-table mismatches)
- [x] Gate 1 (vendor + scouts)
- [x] Gate 2 (per agent): all six branches reported lint/format/typecheck/owned tests green (impl-import 3 test-literal failures fixed by the lead, Assumption 22)
- [x] Gate 3 (integration): 1014 unit tests, 13/13 Chromium e2e; WebKit CI-only
- [ ] Gate 4 (review)
- [ ] Final gates (5.2)

## Assumptions

1. **Branch instead of `main`.** This cloud session must develop and push only on `claude/chess-review-website-y8cb15` (session instruction). Every "commit on `main`" / "`git push origin main`" in PROMPT.md is applied to that branch; the final step opens a draft PR into `main`. Nothing is pushed to `main` directly.
2. **Node 24.** The container shipped Node 22.22.0; Node 24.21.0 LTS (npm 11.19.0) was installed under `/opt/node24` and put first on `PATH` (original binaries kept as `*22.orig`).
3. **`.claude/settings.json` created mid-session** (it did not exist at launch). Verified in Phase 2: impl-engine's worktree started at the lead's HEAD 67e3344, so the setting is honoured; the template's `wrong base` check catches a failure. Worktree agents are additionally told to `git reset --hard <sha>` once if their worktree starts from the wrong commit (the worktree shares this repository's object store, so the commit is present) and to report `wrong base` only if that fails.
4. **Copyright author `awne8886`.** `git config user.name` prints `Claude`, which is the cloud container's agent identity, not the human author; the rule's fallback (the repository owner `awne8886`) is used in `LICENSE` and `THIRD_PARTY_LICENSES.md`.
5. **Playwright browsers.** The container has only Chromium (revision 1194, from Playwright 1.56.1) under `/opt/pw-browsers` and its instructions forbid `playwright install`. Locally the Chromium project runs with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (an opt-in `executablePath` in `playwright.config.ts`); the WebKit project cannot run in this container and is exercised by `ci.yml` (which installs both browsers). Gate commands that need WebKit are recorded as "CI only" in PROGRESS.md.
6. **Extra devDependencies** demanded by the tests (allowed by section 3.1): `@testing-library/dom` (peer of `@testing-library/react` 16), `@testing-library/jest-dom`, `@testing-library/user-event`, `fake-indexeddb` (IndexedDB in jsdom). `@types/node` pinned to `^24` (Node 24 runtime), `js-yaml ^5.4.2` + `@types/js-yaml ^4.0.9` (what `npm view` reported).
7. **Contract details beyond section 4.5** (all in the Phase 0 stubs, binding for Phase 0b tests): `deviceProfile(env?: DeviceEnv)` takes optional injected browser facts (defaults to globals) so the R12 cases are testable; `tierForNps(nps)`; `winPctWhite`, `majorsAndMinors`, `backrankSparse`, `mixedness` exported by `src/analysis`; `ClassifyContext` / `ClassifyResult` (result also carries `winBefore`, `winAfter`, `loss`); `gameAccuracy(moves, { preset, whiteWinSeries })`; `estimateRating({ rating, accuracy, acpl, moveCount })`; `dividePhases(beforeFens)` returns indices into the array (index i = board before ply i+1); `AnalyzeOptions.explainPly` callback (the UI wires `explain(buildMoveFacts(...))`, so analysis never imports explain internals); state helpers `resolveUserColor`, `toSearch`, `buildShareLink`, `gameIdToLink`, `receiveGameId`, `SETTINGS_STORAGE_KEY = 'analyse:settings'`; string tables keyed by Appendix F row key (`'I-2'`, `'P-5'`, `'E-7'`, `'I-27b'` for the second I-27 sentence) with named placeholders `{kind}` (I-10a), `{variant}` (I-14), `{what}` (I-28).
8. **Engine runtime constants live in `src/analysis/config.ts`** (`profiles`, `tiers`, `calibration`, `engineTimeouts`), per the "constants only in config.ts" rule; `src/engine` imports them through `REVIEW_CONFIG` from `src/analysis` (an entry-point export).
9. **Brilliant sacrifice test** needs SEE/en-prise; because nothing but entry-point exports crosses module boundaries, `src/analysis` carries its own copy of the E.1 `see`/`enPrise` code.
10. **B.4 non-monotonic band (lead decision, kept as specified):** after a lost forced mate, a mover cp between +400 and about +597 (win% < 90) stays Good from the mate-to-cp table, between about +597 and +799 it is Miss (rule b), from +800 it is Excellent.
11. **Terms (section 3.7):** chess.com's Published-Data API is public read-only data with documented etiquette (serial requests, identifiable User-Agent where possible, no harvesting or offline storage, no competing service built from API data); the User Agreement forbids data mining/robots except as permitted and reserves all Content. The callback endpoints are undocumented; proxying them is common in community tools but not covered by the published API terms (unverified). This build fetches one game per user action, stores game data only in the user's own browser (IndexedDB) plus the function's 24 h CDN cache, never bulk-downloads, hot-links avatars only as `<img>`, ships no chess.com Content, and keeps the username/public-API and PGN paths as first-class alternatives.
12. `eslint-plugin-react-refresh` 0.5.7 exports `configs.vite` (verified: `recommended`, `vite`, `next`), so D.7's config is used unchanged.
13. **Recorded network fixtures** (`src/test/fixtures/network/`, written by `scout-apis`) are wrappers `{ "url", "status", "contentType", "acao", "body" }` (body = parsed JSON, or the raw text when not JSON), named `<host>-<kind>-<id>.json`: callbacks `www.chess.com-live-<id>.json`, `www.chess.com-daily-<id>.json`, `www.chess.com-computer-<id>.json`; public API `api.chess.com-archives-<username>.json`, `api.chess.com-month-<username>-<YYYY>-<MM>.json`, `api.chess.com-games-<username>.json` (current games), `api.chess.com-player-<username>.json`; lichess `lichess.org-game-<id>.json`. Tests load them only through `src/test/loadFixture.ts` (`loadNetworkFixture`, `fixtureResponse`, `readFixtureText`; lead-owned) inside the test body. Added to the `scout-apis` list for the F.1 row tests: `/callback/live/game/285275822` (R2 overlap), `/pub/player/erik/games` (I-5 in-progress daily), and one finished lichess `standard` game (I-19).
14. **Phase overlap.** To save wall-clock time, Phase 1 agents are launched as soon as Phase 0b slots free up (never more than 6 running); their owned paths are disjoint from Phase 0b's. Gate 0 is evaluated on the Phase 0b tests only.
15. **`calibrate(pool)` reads nps** through an engine-internal method `measureNps(): Promise<number>` that the pool object returned by `createEnginePool` implements (it sends `position startpos` + `go depth 12` on the first ready worker and returns `nps` of the last complete `info` line). `calibrate` maps it with `tierForNps`, stores `{ nps, tier, at }` under `analyse:engineTier` (reused 7 days) and returns the tier; on an `EngineApi` without `measureNps` (the mock engine) it returns the provisional tier `standard-16` and sends nothing.
16. **Explain open questions (fixtures-explain):** (a) E.3's "a Blunder never yields a sentence containing 'wins'" beats E.4's HangsPiece wording: the impersonal HangsPiece variant reads "...; {reply} simply takes it." (b) `MoveFacts` gains optional `fenBefore` / `fenAfter` (lead edit to `src/types/explain.ts` before Phase 2) so templates can name the piece on a motif square. (c) E.4 has no generic Excellent sentence: impl-explain writes an original one ("Nearly as strong as the engine's choice." style), and Excellent's bestLine appears only when a best-move tactic description exists.
17. **Key-moment dedupe** "within 2 plies" = a ply distance of 2 or less is dropped (3 is kept), as pinned by `keyMoments.test.ts`. The phases test's mixedness values (51, 87, 117, 163, 41) were re-derived independently by the lead from B.7 with a separate script and match.
18. **Engine under Node.** The vendored loaders are CommonJS but the repo is `"type": "module"`, so `node public/engine/sf19/stockfish-19-lite-single.js` fails (`require is not defined in ES module scope`). `public/` stays exactly the R10 file set; `scripts/record-evals.mjs` copies the loader to a temp dir as `.cjs` (with the `.wasm` beside it under the matching name) and spawns that.
19. **Phase 0b test files (19, all red at Gate 0):** src/import/{parseInput,tcn,variantGate,errors}.test.ts (201), src/engine/{parseInfo,deviceProfile,calibrate}.test.ts (91), src/analysis/{winPercent,classify,accuracy,rating,phases,keyMoments}.test.ts (82), src/explain/{detectors,explain}.test.ts (160), src/state/{urlState,settingsStore}.test.ts + src/ui/strings.test.ts (163), api/chesscom.test.ts (38). Expected failure count before Phase 2: 735.
20. **Live ids vs time (fixtures-import):** the tohayes recordings show live ids that are not monotonic in time (174531660852 ended 2026-09-15, 173846034210 on 2026-09-01, while the anchor 183193101523 is 2026-09-08), so the A.5 prediction can miss; the 3-month scan then ends with P-9 and the PGN path. Kept as specified; follow-up below.
21. **Engine cancellation semantics (impl-engine):** evaluate() promises cancelled by stop()/dispose()/a newer jobId reject with `name === 'AbortError'`; the watchdog give-up resolves `notAnalysed: true`; loading percent is 0..1; calibrate on the mock engine returns 'auto-18' (mock measureNps = 1,000,000, docs/notes/contracts.md), superseding the 'standard-16' wording of Assumption 15 for the mock.
22. **Test correction (lead, not a weakening):** `src/import/errors.test.ts` expected `'I-27': 'error'` and `'I-27b': 'Please only run 1 request(s) at a time'` (the lichess 429 body from the F.1 "Input and detection" column). The expected values were corrected to the F.1 string column ("Lichess is rate-limiting requests. Retrying in 60 s…" / "Lichess is still rate-limiting requests. Wait a minute and try again."), which is what the appendix pins. `ImportOptions` gained an optional `wait(ms)` (impl-import).
23. **Container restart during Phase 2** killed impl-explain, impl-ui and impl-deploy mid-run. Their uncommitted worktree changes were committed by the lead as WIP commits on their own branches (5b81dda, 1b2c052, f5a47ec) and the three agents were resumed from their transcripts. Node 24 under /opt survived the restart.
24. **Explain depth gate:** below `min(depthTarget, 14)` only rules naming material, mate or a motif are suppressed (section 3.8 "tactical rules"); board-fact rules (Checkmate, Castles, Develops, Recapture, Promotion, PassedPawn, Book, Forced) and the generic sentence still run.
25. **coi reload timing (lead fix, deviation from D.5's inline `window.coi`):** the vendored coi-serviceworker calls `doReload()` on `updatefound`, while the new worker is still installing; reloading that early can leave the second page uncontrolled and not isolated (impl-deploy saw `pages-coi.spec.ts` fail 4/11 under load: `controlled:false`, 2 documents). The inline `doReload(reason)` now waits for `controllerchange` (the worker calls `clients.claim()` on activate) with a 2 s fallback before reloading; the `coepdegrade` reload stays immediate. Still one reload / at most 2 navigations, so the risk-4 assertion is unchanged.
26. **Phase 3 integration fixes (lead):** `data-complete` on the review root is true only once the finished review is persisted (`phase === 'complete'`), so a reload right after completion never re-analyses (DoD 9 race); the engine status line (G.7) is also shown above the review (`src/ui/EngineStatus.tsx`), so the badge stays visible while analysing; `e2e/review.spec.ts` waits for the piece to land on its square before a Retry drag (the board animates back one ply) and selects only numeric `move-<ply>` test ids (the UI also has `move-by-move`).
27. **No download-progress port on WebKit (lead fix from CI evidence):** in WebKit 26.6 the app's lite-single engine stuck at "Engine: loading 100%" for 60 s and never became ready, while the plain worker of `e2e/engine-smoke.spec.ts` (no progress handshake) works. With the progress port the loader streams the `.wasm` through a synthetic `Response`; the pool now requests progress only off WebKit (`src/engine/pool.ts`), so WebKit shows "Engine: loading" without a percent (C.1 item 9 is optional).
28. **WebKit needs a third document on the Pages first visit (deviation from risk 4's "at most 2 navigations", recorded for the user):** CI diagnostics on WebKit 26.6: document 1 `{isolated:false, controlled:false}`, document 2 `{isolated:false, controlled:true}`, document 3 `{isolated:true, controlled:true}`. WebKit does not isolate the controlled document reloaded from the non-isolated first visit; the vendored script's `coepdegrade` reload then isolates it. `e2e/pages-coi.spec.ts` keeps "at most 2" for Chromium and allows 3 for WebKit; every other assertion (isolated, controlled, scope, URL preserved) is unchanged. D.8's "WebKit 170 to 195 ms, reloads once" did not reproduce here.
29. **Muted text colour (a11y M2 / parity GAP-2):** section 3.6 lists dark-theme text `#e8e6e3` and `#8b8987`, but `#8b8987` is 4.40:1 on the `#262522` panels, below the 4.5:1 body-text rule of G.28. Muted body text uses `#BEBDB9` (same section 3.6 grey scale); `#8b8987` stays for non-text chrome.

## Spec-gap resolutions (from docs/research/spec-gaps.md; binding for Phase 2)

All 10 proposals of `docs/research/spec-gaps.md` section 3 are accepted as written: (1) preMistakeWin = 100 - previous.winBefore, gain = winBefore - preMistakeWin; (2) checkmate winAfter 100 loss 0, draw winAfter 50, DrawFromWinning final; (3) Great exclusions via E.1 isDefended / pieceValues / canBeTakenByLowerPiece; (4) customStart never Book, Forced before Book, EPD from chess.js fen(); (5) phaseStarts 0-based board index, Book/Forced = 100 and counted, not-analysed excluded; (6) ACPL definition; the fallback value is the literal R21 `3100 * exp(-0.01 * ACPL)` (unrounded, unclamped in data; the UI shows it rounded to the nearest 50 with "rough estimate"), amended after the fixtures-analysis tests pinned the literal formula; (7) one rating.method: regression > acpl > none; (8) Miss (a) before (b); (9) Brilliant needs loss <= 2, Great independent; (10) Retry uses line scores via the single mover-POV rule, Book off in Retry.

## Follow-ups

- A.5 live-id month prediction can miss games whose ids are out of time order (oddschess/variant ids seen in tohayes 2026/09); consider widening the scan or keying anchors per game type.

## Review triage

Phase 4 reports: docs/review/correctness.md (3 high, 2 medium, 10 low), a11y.md (2 high, 6 medium, 4 low), performance.md (2 high, 4 medium, 3 low), parity.md (1 high, 1 medium, 3 low).

| Finding | Decision |
|---|---|
| correctness H1 = performance H1 (Retry job ids make later analyses stale) | fixed now by the lead (cf64085: one job-id sequence in src/analysis, regression test) |
| correctness L10 (bare link: live found + daily failed drops the live game) | fixed now by the lead (src/import/importGame.ts + src/import/bareLink.test.ts) |
| correctness H2, H3, M1, M2 (unproven material/tactic claims, shown line vs counted line), L1 (second mover negation in facts.ts), L5, L6, L7, L8, L9 | fix now: `fix-explain` |
| correctness L2 (stored explanation built before ply k+1 exists, no playedPv) | fix now: `fix-ui` (re-explain plies whose successor arrived; the UI renders explanations from the full review) |
| correctness L3 (record-evals builds its own key) | fix now (lead): a unit test asserts the script's key format equals `evalKey` |
| correctness L4 (cancel during newGame still searches) | fix now: `fix-engine` |
| performance H2 (respawn failure leaves an empty pool; E-2 Retry reuses it and hangs) | fix now: `fix-engine` (pool fails pending jobs and reports E-2) + `fix-ui` (E-2 Retry disposes and recreates the pool) |
| performance M2 (`ucinewgame` once per page, not per game) | fix now: `fix-engine` |
| performance M3 (engine boots for a complete stored review of an accepted in-progress game) | fix now: `fix-ui` |
| performance L1 (phones: "refining" text rarely shown), L2 (Pages hard reload: app usable 2 s then reloads), L3 (IndexedDB failure shown as E-2) | fix now: `fix-ui` |
| performance M1 (mock engine resolves the whole analysis in one task) | rejected: mock-only; the real pool resolves each position from a worker message, so the browser paints between plies; the mock stays timer-free per docs/notes/contracts.md |
| performance M4 (no e2e for reload mid-analysis resume) | Phase 5 `test-writer` |
| a11y H1 = parity GAP-1 (import form and settings panel overflow at 360-430 px, masked by overflow-x hidden) | fix now: `fix-ui`, and the R30 e2e also asserts no element extends past the viewport (lead) |
| a11y H2, M1, L3, L4 (classification-coloured and chip text below 4.5:1) | fix now: `fix-ui` (text uses an accessible darker/lighter shade of each class colour; icons and tints keep the section 3.6 values) |
| a11y M2 = parity GAP-2 (dark muted text #8b8987 is 4.40:1) | fix now: `fix-ui`; muted body text uses #BEBDB9 from the same section 3.6 grey scale (deviation recorded as Assumption 29) |
| a11y M3, M4, M5, M6, L1, L2 (graph keyboard, board tab stops, keyboard Retry, phase-grade labels, persistent status region, focus on screen change) | fix now: `fix-ui` |
| parity GAP-3 (username colour during confirmation; stale "from username"), GAP-4 (opening line shows the final book name at every book ply) | fix now: `fix-ui` |
| parity GAP-5 (R28 grep wording) | follow-up: documented in README (docs-deploy): the grep's matches are the avatar path and test-only lines |

## Subagents

| Name | Phase | Type | Branch | Status |
|---|---|---|---|---|
| fixtures-import | 0b | general-purpose (sonnet) | main checkout | done |
| fixtures-engine | 0b | general-purpose (sonnet) | main checkout | done |
| fixtures-analysis | 0b | general-purpose (sonnet) | main checkout | done |
| fixtures-explain | 0b | general-purpose (sonnet) | main checkout | done |
| fixtures-ui | 0b | general-purpose (sonnet) | main checkout | done |
| fixtures-api | 0b | general-purpose (sonnet) | main checkout | done |
| scout-apis | 1 | general-purpose (sonnet) | main checkout | done (43 endpoints) |
| vendor-assets | 1 | general-purpose (sonnet) | main checkout | done |
| scout-spec | 1 | Explore | - | done (0 fixture mismatches) |
| scout-packages | 1 | Explore | - | done |
| impl-engine | 2 | general-purpose (inherit) | worktree-agent-a62fcdf3378209847 @ fb7521e | merged |
| impl-import | 2 | general-purpose (inherit) | worktree-agent-a797c52c6ecf65e5e @ 63f7665 | merged |
| impl-analysis | 2 | general-purpose (inherit) | worktree-agent-a2500c47c9eafbd4d @ 6fdd440 | merged (before impl-import: disjoint paths, merged as it arrived) |
| impl-explain | 2 | general-purpose (inherit) | worktree-agent-a120e6c225c5dd86c @ 49363b6 | merged |
| impl-ui | 2 | general-purpose (inherit) | worktree-agent-ad98a86a3637f9fb6 @ b914ae4 | merged |
| impl-deploy | 2 | general-purpose (inherit) | worktree-agent-a88957d9b2d897a61 @ 85c13a3 | merged |
| review-correctness | 4 | general-purpose (inherit) | main checkout (docs/review/correctness.md) | running |
| review-a11y | 4 | general-purpose (inherit) | main checkout (docs/review/a11y.md) | running |
| review-performance-mobile | 4 | general-purpose (inherit) | main checkout (docs/review/performance.md) | running |
| review-parity | 4 | general-purpose (inherit) | main checkout (docs/review/parity.md) | running |
