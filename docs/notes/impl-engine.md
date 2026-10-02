# impl-engine notes (src/engine)

## Files

- `src/engine/Engine.ts`: C.1 wrapper (`parseInfo`, `toWhite`, `Engine`), modifications 1 to 11 applied.
- `src/engine/pool.ts`: `createRealEnginePool`, `evalKey`, `EngineStatus`, `EnginePool` (C.1 item 8).
- `src/engine/deviceProfile.ts`: C.2 with the 7 modifications (`DeviceEnv` injection).
- `src/engine/calibrate.ts`: `tierForNps`, `calibrate(pool, { force? })`, `TIER_STORAGE_KEY`.
- `src/engine/mock/MockEngine.ts`: the table-driven mock plus the two `Window` globals.
- `src/engine/errors.ts`: `ENGINE_STRINGS` (F.3).
- `src/engine/index.ts`: entry point; `createEnginePool(profile, { onStatus })` returns `EngineHandle` (the mock when
  `window.__USE_MOCK_ENGINE__ === true`).

## Behaviour decisions (assumptions)

1. **Cancel semantics.** `stop()` rejects every queued and running request with an `Error` whose `name` is
   `'AbortError'`, sends `stop` to busy workers and resolves after their `bestmove`. A request with a job id lower
   than the highest seen is rejected as stale (`engine: stale job <id>`); a higher job id cancels older ones the
   same way. `stop()` does not blacklist the current job id. Callers (analyzeGame, UI) should ignore `AbortError`.
2. **MultiPV switching.** `newGame` sets MultiPV from `profile.multiPv`. A request whose `multiPv` differs (the phone
   re-search) gets `setoption name MultiPV value N` between searches, after `bestmove` (never mid-search); the next
   main-pass request switches back. This is the only per-position option ever sent.
3. **Priority lane.** Every `multiPv: 2` request goes to the priority lane (on desktop all requests are MultiPV 2,
   so the order is still FIFO). Watchdog retries and `measureNps` go to the front of that lane.
4. **Watchdog.** Silence = no `info…` or `bestmove` line for `engineTimeouts.watchdogMs`; a worker `error` event or
   the wrapper's own `waitFor` timeout take the same path. Retry runs at `retryDepth` with the same movetime and
   multiPv; its result is cached under `fen4|12|multipv`, not under the original key. `notAnalysed` results are not
   cached. If a respawn fails and no worker is left, queued requests reject and `onStatus` reports E-2.
5. **init.** The first `init` boots `profile.workers` workers in parallel (partial failures shrink the pool; all
   failing gives E-2 and a rejected `init`, and `init` may be called again for Retry). A later `init` with the same
   build and worker count keeps the workers and re-sends Hash/MultiPV/`ucinewgame`/`isready` before each worker's
   next search (use it per game); a different build or worker count reboots.
6. **Download progress.** Only requested when an `onStatus` listener exists, on the first worker; `percent` is the
   loader's 0..1 value (C.1 item 9), passed through unchanged in `{ phase: 'loading', percent }`.
7. **Progress/ETA.** Not part of `EngineApi`: the real pool exposes `progress()` (`queued`, `inFlight`, `completed`,
   `cacheHits`, `meanMs`, `workers`) and `etaMs(remaining)`; both are optional on `EngineHandle` (absent on the mock).
8. **Calibrate.** Follows contracts.md: the mock has `measureNps()` = 1,000,000, so `calibrate(mock)` gives
   `auto-18` and stores it; an `EngineApi` without `measureNps` gets `standard-16` (PLAN Assumption 15). A stored
   value is re-mapped through `tierForNps` on read.
9. **Mock lookup.** Prefix fallback prefers a `|2` key, else the first entry; `multiPv` is set to the requested value
   and `lines` sliced to it; `fen` is the requested FEN. `init` emits a `ready` status.
10. **parseInfo** defaults `pv` to `[]` (the depth-0 terminal lines have none); `analyse` ignores non-terminal lines
    with an empty pv or a bound.

## Verification

- R11 greps: with `createEnginePool` referenced, a minified rolldown bundle of `src/engine/index.ts` contains
  `` new Worker(`/engine/sf19/`+t[n]) `` and exactly `stockfish-19-lite-single.js` and `stockfish-19-lite.js`.
  The current `npm run build` output has neither, because the Phase 0 `App.tsx` never references the pool.
- Loader check (C.1 item 9): both vendored loaders answer `setoption name CanOutputEngineDownloadProgress` with
  `info WillOutputEngineDownloadProgress` and post `{ percent, loaded, total, ... }` on the `progressPort`.

## Follow-ups (outside src/engine)

- The UI must reference `createEnginePool` for the R11 build greps to find the engine file names.
- `analyzeGame` should treat an `AbortError` rejection from `evaluate` as cancellation, not as a failure.
