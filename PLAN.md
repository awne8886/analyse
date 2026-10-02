# PLAN

Build of "Analyse" per PROMPT.md. Current phase: **0a (scaffold and contracts)**.

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

- [ ] Gate 0 (scaffold + red tests)
- [ ] Gate 1 (vendor + scouts)
- [ ] Gate 2 (per agent)
- [ ] Gate 3 (integration)
- [ ] Gate 4 (review)
- [ ] Final gates (5.2)

## Assumptions

1. **Branch instead of `main`.** This cloud session must develop and push only on `claude/chess-review-website-y8cb15` (session instruction). Every "commit on `main`" / "`git push origin main`" in PROMPT.md is applied to that branch; the final step opens a draft PR into `main`. Nothing is pushed to `main` directly.
2. **Node 24.** The container shipped Node 22.22.0; Node 24.21.0 LTS (npm 11.19.0) was installed under `/opt/node24` and put first on `PATH` (original binaries kept as `*22.orig`).
3. **`.claude/settings.json` created mid-session** (it did not exist at launch). Its effect on worktree spawns is unverified; the template's `wrong base` check catches a failure. Worktree agents are additionally told to `git reset --hard <sha>` once if their worktree starts from the wrong commit (the worktree shares this repository's object store, so the commit is present) and to report `wrong base` only if that fails.
4. **Copyright author `awne8886`.** `git config user.name` prints `Claude`, which is the cloud container's agent identity, not the human author; the rule's fallback (the repository owner `awne8886`) is used in `LICENSE` and `THIRD_PARTY_LICENSES.md`.
5. **Playwright browsers.** The container has only Chromium (revision 1194, from Playwright 1.56.1) under `/opt/pw-browsers` and its instructions forbid `playwright install`. Locally the Chromium project runs with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (an opt-in `executablePath` in `playwright.config.ts`); the WebKit project cannot run in this container and is exercised by `ci.yml` (which installs both browsers). Gate commands that need WebKit are recorded as "CI only" in PROGRESS.md.
6. **Extra devDependencies** demanded by the tests (allowed by section 3.1): `@testing-library/dom` (peer of `@testing-library/react` 16), `@testing-library/jest-dom`, `@testing-library/user-event`, `fake-indexeddb` (IndexedDB in jsdom). `@types/node` pinned to `^24` (Node 24 runtime), `js-yaml ^5.4.2` + `@types/js-yaml ^4.0.9` (what `npm view` reported).
7. **Contract details beyond section 4.5** (all in the Phase 0 stubs, binding for Phase 0b tests): `deviceProfile(env?: DeviceEnv)` takes optional injected browser facts (defaults to globals) so the R12 cases are testable; `tierForNps(nps)`; `winPctWhite`, `majorsAndMinors`, `backrankSparse`, `mixedness` exported by `src/analysis`; `ClassifyContext` / `ClassifyResult` (result also carries `winBefore`, `winAfter`, `loss`); `gameAccuracy(moves, { preset, whiteWinSeries })`; `estimateRating({ rating, accuracy, acpl, moveCount })`; `dividePhases(beforeFens)` returns indices into the array (index i = board before ply i+1); `AnalyzeOptions.explainPly` callback (the UI wires `explain(buildMoveFacts(...))`, so analysis never imports explain internals); state helpers `resolveUserColor`, `toSearch`, `buildShareLink`, `gameIdToLink`, `receiveGameId`, `SETTINGS_STORAGE_KEY = 'analyse:settings'`; string tables keyed by Appendix F row key (`'I-2'`, `'P-5'`, `'E-7'`, `'I-27b'` for the second I-27 sentence) with named placeholders `{kind}` (I-10a), `{variant}` (I-14), `{what}` (I-28).
8. **Engine runtime constants live in `src/analysis/config.ts`** (`profiles`, `tiers`, `calibration`, `engineTimeouts`), per the "constants only in config.ts" rule; `src/engine` imports them through `REVIEW_CONFIG` from `src/analysis` (an entry-point export).
9. **Brilliant sacrifice test** needs SEE/en-prise; because nothing but entry-point exports crosses module boundaries, `src/analysis` carries its own copy of the E.1 `see`/`enPrise` code.
10. **B.4 non-monotonic band (lead decision, kept as specified):** after a lost forced mate, a mover cp between +400 and about +597 (win% < 90) stays Good from the mate-to-cp table, between about +597 and +799 it is Miss (rule b), from +800 it is Excellent.
11. **Terms (section 3.7):** chess.com's Published-Data API is public read-only data with documented etiquette (serial requests, identifiable User-Agent where possible, no harvesting or offline storage, no competing service built from API data); the User Agreement forbids data mining/robots except as permitted and reserves all Content. The callback endpoints are undocumented; proxying them is common in community tools but not covered by the published API terms (unverified). This build fetches one game per user action, stores game data only in the user's own browser (IndexedDB) plus the function's 24 h CDN cache, never bulk-downloads, hot-links avatars only as `<img>`, ships no chess.com Content, and keeps the username/public-API and PGN paths as first-class alternatives.
12. `eslint-plugin-react-refresh` 0.5.7 exports `configs.vite` (verified: `recommended`, `vite`, `next`), so D.7's config is used unchanged.

## Follow-ups

(none yet)

## Review triage

(Phase 4)

## Subagents

| Name | Phase | Type | Branch | Status |
|---|---|---|---|---|
