# impl-ui notes (Phase 2)

## Structure
- `src/state/`: `settingsStore.ts` (persist 'analyse:settings', `defaultPieceSet`), `reviewStore.ts` (screen, ply, import/engine/progress/retry state), `urlState.ts`, `persistence.ts` (idb-keyval, `listRecent`), `importKeys.ts` (ImportErrorCode -> Appendix F key), `engineStats.ts` (`window.__ANALYSE_ENGINE_STATS__`), `controller.ts` (boot, import chain, lazy pool, calibrate, analyzeGame, persistence, resume, Retry G.4).
- `src/ui/renderApp.tsx` holds `renderApp` / `renderSplash` (idempotent); `src/main.tsx` keeps the D.8 block verbatim and imports them.
- Messages are stored as `{ key, vars, fallback }` and rendered by `ui/messages.ts#renderKeyed` from IMPORT_STRINGS / ENGINE_STRINGS / UI_STRINGS; `fallback` (the importer's formatted `message`) is used only when a placeholder has no value in `error.detail`.

## Assumptions
1. `createEnginePool(profile, { onStatus })` is called through a local function type (the Phase 0 stub takes one argument); `EngineStatus` is redeclared in `src/state/controller.ts` (exported from `src/state`). After the merge it may import the engine's type instead.
2. Engine loading percent is 0..1 (lead note); AbortError from `evaluate`/`analyzeGame` is cancellation (partial review kept, already persisted via `onPly`).
3. Profile default: when no settings are stored yet, phones/tablets get Auto, desktop Standard (C.4). `tierFor`: fast-14 overrides all; Auto uses the calibrated tier; Deep = deep-20; Standard = standard-16.
4. E-3 `{n}` is the first unfinished ply number; resume (reload with a partial review) uses tier fast-14.
5. Explanations are rebuilt on render for the current colour/voice (`explanationFor`), falling back to the stored one.
6. P-5 (`pages_needs_username`) renders in `import-notice` (contracts section 5), all other import errors in `import-error`.
7. `variant_unsupported` maps to I-14 when `detail.variant` is set, else I-13; `lichess_rate_limited` maps to I-27b, `proxy_rate_limited` to P-3.
8. Retry: a move equal to a stored line's first move reuses that line (White-perspective score, no negation); otherwise one search at the current tier with `multiPv: 1` and jobId from 1,000,001 upward; the board reverts after 1.5 s; disabled on MultiPV-1 devices while analysing.
9. The calibration page uses `parseInput`/`importGame`/`analyzeGame`/`gameAccuracy`/`winPctWhite` directly; impl-analysis's `calibrationReport` can replace the local MAE code after the merge.
10. "Licenses" lazy-loads `THIRD_PARTY_LICENSES.md?raw` (separate 6 kB gzip chunk).

## Follow-ups
- `src/import/errors.test.ts` expects `IMPORT_STRINGS['I-27'] === 'error'` and `'I-27b' === 'Please only run 1 request(s) at a time'`, which look like recorded-response text rather than the F.1 strings; the UI renders whatever the table holds.
