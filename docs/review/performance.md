# Review: performance and mobile (review-performance-mobile, Phase 4)

Scope: worker lifecycle, memory per device class, UCI serialisation (R17), progressive rendering, bundle size, no
engine start on cached reviews (R16, DoD 9), the phone MultiPV 2 re-search (R15, section 3.4), the watchdog (R16),
and the Pages first-visit flow (D.8, risk 12, PLAN Assumption 25). I edited no tracked file. Evidence comes from reading
the code, `dist/` and the PROGRESS.md build record, and from two scratch vitest runs. Those runs used a copy of
`MockWorker` from `src/engine/pool.test.ts` and the recorded eval table of `cc:live:129688175007`. They live in the
session scratchpad and are not committed.

Counts: **2 high, 4 medium, 3 low** gaps, plus optional notes (not gaps).

---

## High

### H1. A Retry move that needs a search cancels the running analysis, and every later analysis is rejected as stale (R16, R17 cancel semantics; DoD 8)

- Where: `src/state/controller.ts:55` (`retryJob: 1_000_000`), `src/state/controller.ts:593-594` (`session.retryJob += 1`;
  `pool.evaluate(..., session.retryJob)`), `src/analysis/analyzeGame.ts:38,240` (`lastJobId` starts at 0, `jobId = ++lastJobId`),
  `src/engine/pool.ts:175-179` (an older job id is rejected; a newer one cancels every older `eval` request).
- What is wrong: analysis and Retry draw job ids from two unrelated counters. When Retry evaluates a move, it calls the
  real pool with job id 1,000,001 whenever the tried move is neither the best line nor the second line.
  (a) If the analysis is still running, every queued and running main-pass request rejects with
  `AbortError: engine: job superseded by 1000001`. `runAnalysis` treats that as a cancellation and sets `phase: 'idle'`.
  The review stays partial and stops with no message. On desktop Retry is enabled while analysing
  (`src/ui/MoveByMove.tsx:91` disables it only when `multiPv === 1`).
  (b) The pool's `currentJobId` is now 1,000,001. Every later `analyzeGame` in the same page uses job id 2, 3 and so on.
  Those requests are rejected at once with `AbortError: engine: stale job 2`, cache hits included. Any game imported
  after one Retry search goes idle and is never analysed until the page is reloaded.
  The mock engine ignores `jobId`, so no unit test or e2e test can see this.
- How to verify: in a scratch vitest test, give `createEnginePool` the `MockWorker` of `pool.test.ts`. Call
  `evaluate(f0, L, 1)` and `evaluate(f1, L, 1)`, then `evaluate(f2, {...L, multiPv: 1}, 1_000_001)`. Both job-1 promises
  reject with "job superseded by 1000001". After that, `evaluate(f3, L, 2)` rejects with "stale job 2" (observed).
  In the app: on desktop with the real engine, import a game, click Retry on a finished ply while the analysis runs, and
  drop a third move. The progress bar disappears. Then import a second game: it never analyses.
- Fix direction: take every job id from one monotonic source, for example a `nextJobId()` exported from `src/analysis`.
  Retry must not supersede the main pass: give it its own non-cancelling request, or the current analysis job id. Send it
  through the priority lane too. Today a `multiPv: 1` request on desktop goes into the FIFO behind the whole remaining
  pass (`pool.ts:197-198`). Add a test in which Retry searches during a mock-Worker analysis.

### H2. After the respawn fails mid-analysis, the E-2 Retry button reuses a pool with no workers, and the analysis hangs forever (C.5, R16 watchdog fallback, risk 3)

- Where: `src/engine/pool.ts:409-427` (on a failed respawn the slot is removed; with no slot left, the queue is rejected
  and E-2 is emitted, but the pool is neither disposed nor rebooted). `src/engine/pool.ts:278-286` (`pump` loops over
  `slots.length === 0`, so new requests wait forever). `src/state/controller.ts:438-447` (the catch sets E-2 but keeps
  `session.enginePromise` and `session.pool`). `src/state/controller.ts:345-346,454-458` (`retryEngine` then gets the
  cached, resolved `enginePromise` back with the dead pool).
- What is wrong: the documented phone recovery path (C.5) is a dead end. It starts when a worker dies mid-analysis or the
  watchdog fires, and the replacement worker cannot boot (low memory, no `uciok` within 15 s, a worker error). The user
  sees E-2 with Retry. Retry restarts `analyzeGame` against the same pool. Every `evaluate` that misses the cache is queued
  with no slot to run it, so the screen shows "Analysing move 1 of N" with no end and no timeout. A full page reload is
  the only way out.
- How to verify (observed in a scratch test): `pool.init(ONE)` with `MockWorker.boot = () => 'ok'`, then
  `MockWorker.boot = () => 'error'` and `script = () => 'silent'`. Call `evaluate(f0, L, 10)` and advance fake timers by
  11 s: it rejects with the worker error. Restore `boot = 'ok'` and call `evaluate(f1, L, 11)`. After another 120 s of
  fake time it is still pending, and no worker was created.
- Fix direction: on a non-AbortError engine failure in `runAnalysis`, dispose `session.pool` and clear
  `session.enginePromise`, as the boot-failure path at `controller.ts:373-378` already does. Alternatively, have the
  pool reject `evaluate` (or reboot) when no slot is left. Add a unit test: fatal respawn, then Retry boots a fresh worker.

---

## Medium

### M1. With the mock engine, the whole analysis runs in one task, so the page cannot paint between plies (progressive rendering, R16 "results render progressively"; review criterion "no render blocked longer than 100 ms per ply")

- Where: `src/analysis/analyzeGame.ts:292-337` (the per-ply loop only `await`s promises that are already settled),
  `src/engine/mock/MockEngine.ts:181-193` (resolves after `await Promise.resolve()`, a microtask, as pinned by
  `docs/notes/contracts.md` section 1), and `src/state/controller.ts:428-431` (every ply runs `persistReview`, a
  structured clone of the whole review, plus a store patch that re-renders the screen).
- What is wrong: everything is chained through microtasks. That covers the classification, `aggregate`, `explainPly`,
  the IndexedDB clone and the zustand patch for all plies. The event loop never reaches a macrotask turn, so the browser
  cannot paint or handle input until the last ply is done. Per-ply work stays under 100 ms. But the main thread is
  blocked for the whole run, and the progress bar jumps from empty to complete. The same applies, for those plies, to
  positions answered from the real pool's in-memory cache (`pool.ts:180-184`, `Promise.resolve`). With the real engine,
  each ply arrives in a worker `message` task, so production runs without cache hits are not affected.
- Measured (vitest/jsdom, this 4-core container, `cc:live:129688175007`, 112 plies, mock engine with explainPly):
  `analyzeGame` took **1,086 ms with 0 macrotask turns** (a `setTimeout(0)` ticker never fired). Per-ply cost was
  median 8.9 ms and maximum 28.3 ms. Structured clones of the partial review added 112 ms in total, for a final review of
  about 133 kB of JSON. React render time comes on top of these numbers in a browser.
- How to verify: in Chromium, record a Performance profile of the mock-engine e2e import. There is one long task across
  the whole analysis and no frames in between. Or run the scratch ticker test described above.
- Fix direction (keep the mock's no-timer contract): yield once per emitted ply in `analyzeGame` or in the controller's
  `onPly`, with `await new Promise(r => setTimeout(r, 0))` or `scheduler.yield()` where available. Alternatively, batch
  store patches and persistence per animation frame.

### M2. `ucinewgame` and the per-game options are sent only once per page, not once per game (R17, C.1 item 5)

- Where: `src/state/controller.ts:345-372`. `ensureEngine` is memoised per session, and `pool.init(provisional)` is its
  only `init` call (grep: `src/state/controller.ts:365` is the only `.init(` outside tests). `runAnalysis` at
  `controller.ts:403-435` and `analyzeGame` never call `init` for later games. `pool.ts:96-105` already supports a
  second `init` that keeps the workers and re-sends `Hash`/`MultiPV`/`ucinewgame`/`isready` before the next search
  (`pool.test.ts:250`), but nothing uses it.
- What is wrong: R17 requires `setoption ... Hash`, `MultiPV`, `ucinewgame` and `isready` once per game. Here the second
  and later games in a page reuse the previous game's hash table and search state, so their evaluations depend on what
  was analysed before.
- How to verify: in a controller test with the mock Worker, import two games one after the other and count the
  `ucinewgame` lines sent: today 1, expected 2.
- Fix direction: in `runAnalysis`, after `ensureEngine()`, call `await engine.pool.init(profile)` with the game's final
  profile (cheap, because the pool keeps its workers).

### M3. The engine boots, and E-3 shows, for a stored complete review of an accepted in-progress game, and for any run with nothing to evaluate (R16 lazy pool: "no worker exists ... until an imported game needs at least one position evaluated")

- Where: `src/state/controller.ts:164-170`. Only `review.complete && !game.inProgress` skips the engine. Any stored game
  with `inProgress: true` falls through to `runAnalysis`, and so does every resumed run. `src/state/controller.ts:403-414`:
  `runAnalysis` calls `ensureEngine()` before it knows whether any ply is left to do (`analyzeGame` returns early when
  `todo` is empty, `analyzeGame.ts:237`). `controller.ts:169`: in the same reload case, `resumedFrom` is set to
  `plies.length + 1`, so the E-3 banner ("Analysis was interrupted (your device ran out of memory). Resuming from move
  N+1 in fast mode") is shown for a review that is already finished.
- What is wrong: the user accepts "Analyse so far" for a daily game. The review completes, and the user reloads
  `?game=cc:daily:<id>`, or re-pastes the link when there are no new moves. The page then downloads and boots a worker
  and runs the calibration search, even though no position needs evaluating. On a phone that is about 1.8 MB of wasm
  and about 111 MiB RSS for nothing.
- How to verify: e2e or controller test. Store a game with `inProgress: true` and a complete review in IndexedDB, open
  `/?game=<id>`, and read `window.__ANALYSE_ENGINE_STATS__()` after idle: today `workersCreated` is at least 1, expected 0.
- Fix direction: decide "needs the engine" from the plies (some ply not `done`/`not-analysed`, or more moves than
  stored plies) before `ensureEngine`. Set `resumedFrom` only when that is true.

### M4. The R16 check "e2e reload mid-analysis resumes from the persisted ply" is missing (R16 Check)

- Where: `e2e/review.spec.ts`. None of its tests reloads during an analysis (`grep -n "reload" e2e/review.spec.ts` finds
  only the DoD 7 Explain-toggle reload). `src/state` has no equivalent test of `openCached(..., fromReload=true)`.
- What is wrong: R16 names this e2e as its check. It covers the IndexedDB resume, the `fast-14` tier and E-3, which are
  the phone OOM recovery path of C.5 and section 3.4. No test exercises it. Because of M1, such a test cannot reload in
  the middle of a mock-engine run without a yield or a gate in the mock.
- How to verify: `grep -rn "resum" e2e/` returns nothing.
- Fix direction: after M1, add an e2e test. Hold the mock (for example, have `__MOCK_EVALS__` lack the keys after ply
  20, so evaluation stalls there), reload, and assert E-3, the resumed ply in the progress text, and that plies 1 to 19
  are not re-evaluated.

---

## Low

### L1. On phones the "refining" progress text almost never appears (section 3.4, "the progress text shows 'refining'"; R15)

- Where: `src/ui/ProgressBar.tsx:295`. E-10 is shown only when `done >= total && refining > 0`.
- What is wrong: re-searches run in the priority lane right after the current search, so the main pass is rarely
  finished while a re-search is pending. The classifier holds candidate plies (`status: 'refining'`), but the text keeps
  showing E-8.
- How to verify: in a UI test with the phone profile, stub progress to `{ done: 10, total: 60, refining: 1 }`. The
  status shows E-8, not E-10.
- Fix direction: show E-10, or E-8 plus E-10, whenever `refining > 0`.

### L2. A hard reload on the Pages build leaves the app interactive for 2 s and then reloads it (D.8, risk 12; a consequence of PLAN Assumption 25 that the assumption does not record)

- Where: `vite.config.ts:155` (inline `doReload`: with no reason and no controller, it waits for `controllerchange` with
  a 2 s fallback) and `src/main.tsx:9-10` (`coiReloading` is already `'1'` in this tab, so no splash).
- What is wrong: Shift-reload bypasses the service worker, so the page is uncontrolled and not isolated. The vendored
  script takes its "active but not controlling" branch and calls `doReload()`. The worker is already active, so
  `clients.claim()` does not run again and `controllerchange` never fires. The reload therefore waits the full 2 s
  fallback. Meanwhile `main.tsx` has skipped the splash (the guard flag is already set in this tab) and has booted the
  app with its import input. A paste during those 2 s starts the fetch, IndexedDB writes and the engine, and the reload
  then cuts them off. The keyed and idempotent writes and `?game=` keep this from losing data, but the "nothing happens
  before the isolation decision" intent of risk 12 does not hold on this path. Before Assumption 25 the reload was
  immediate.
- How to verify: in Chromium on `npm run preview:pages`, load `/analyse/`, wait for isolation, then Shift-reload. The
  import screen stays usable for about 2 s before the reload.
- Fix direction: in `doReload`, reload at once when `navigator.serviceWorker.controller` is null but the registration
  is already `active` (no install pending). Or have `main.tsx` show the splash whenever `!crossOriginIsolated` and a
  registration is active.

### L3. An IndexedDB failure is reported as an engine failure (E-2), and the finished review is never marked complete (R16 persistence, C.5 strings)

- Where: `src/state/controller.ts:429` (`void persistReview(partial)`: a rejection on any ply is unhandled),
  `src/state/controller.ts:436` (the final `await persistReview(review)` throws on quota errors or unavailable storage),
  and `src/state/controller.ts:438-447` (any non-AbortError becomes `engine: { phase: 'error', key: 'E-2' }`).
- What is wrong: on a phone that is out of storage quota, the analysis finishes and then E-2 appears ("The engine
  couldn't start (WebAssembly error: QuotaExceededError ...)") with a Retry button that re-analyses. `phase` never
  becomes `complete`, so `data-complete` stays `false`. The engine itself worked.
- How to verify: in a unit test, stub `idb-keyval.set` to reject and run `submitInput` with the mock engine. The store
  ends with `engine.phase === 'error'`, key `E-2`, and `phase === 'idle'`.
- Fix direction: catch persistence errors separately, keep the in-memory review, set `phase: 'complete'`, and log the
  error or show a non-engine notice. Attach `.catch` to the per-ply writes.

---

## Checked and found compliant (no action)

- **Device classes (R12, R13, C.4).** `src/engine/deviceProfile.ts:56-95`: every phone, every tablet and desktop Safari
  get 1 lite-single worker. Hash is 16 on phones, 32 on tablets, 64 on desktop lite-single and 128 with pthreads. The
  pthreads build runs only when `coi && !isWebKit && !isMobile`, with `Threads = min(hc - 1, 8)` and 1 worker. MultiPV is
  1 on phones only. A missing SIMD probe returns `null`, so no worker is created and E-1 shows.
- **Workers (R11).** Classic `new Worker(BASE + FILES[variant])` (`Engine.ts:159`). A failed `multi` boot falls back to
  `single` once and remembers it. The boot timeout is 15 s.
- **Per-search protocol (R17).** `newGame` sends Threads (multi only), Hash, MultiPV, `ucinewgame` and `isready`
  (`Engine.ts:252-259`). Each search is `position fen` then `go depth D movetime T`. The safety `stop` comes at
  `maxMs + 2000` and the wait times out at `maxMs + 10000`. `setoption MultiPV` for the phone re-search is sent only
  between searches. A slot stays busy until `bestmove`. Cancel sends `stop` and waits for `slot.running`, so no
  `position` or `go` is ever sent mid-search (`pool.ts:227-249,278-296`). The one plain `go depth` is the calibration
  on `startpos`.
- **Watchdog (R16).** Every `info` or `bestmove` line re-arms a 10 s watchdog (`pool.ts:311-343`). On expiry it
  terminates the worker, respawns it, retries once at depth 12 in the priority lane, and then marks the position
  `notAnalysed` (`pool.ts:345-382`). Unit tests use the issue #124 FEN.
- **Phone re-search (R15, 3.4).** Exactly one `multiPv: 2` evaluate per candidate ply, at the same depth and movetime,
  queued ahead of the FIFO (`pool.ts:196-198`), cached under `fen4|depth|2`, with the final label emitted after it
  (`analyzeGame.ts:322-336`).
- **Lazy pool and DoD 9.** Importing `src/engine` creates nothing. A stored complete review of a finished game returns
  before `runAnalysis` (`controller.ts:164-167`). The e2e test at `e2e/review.spec.ts:329-355` asserts
  `{ workersCreated: 0, uciSent: 0 }` and that no engine file was requested. M3 above is the exception.
- **Worker leaks.** A boot timeout, a boot error, a failed `newGame`, a respawn after dispose, a profile change in
  `init`, and `dispose()` each terminate their workers. `ensureEngine`'s boot-failure path disposes the pool. H2 is the
  one path that keeps a dead pool.
- **Bundle (PROGRESS.md "Phase 4 pre-review build record").** `cat dist/assets/*.js | gzip -c | wc -c` = 230,041 B, well
  under 900 kB. Per file at gzip level 9: `index-DibWHfin.js` 995,707 B raw / 220,544 B gz, `THIRD_PARTY_LICENSES` 5,862 B
  gz, `Calibration` 1,345 B gz. There is no `.wasm` in `dist/assets`. The engine files are only under `dist/engine/sf19/`.
  The R11 grep prints exactly `stockfish-19-lite-single.js` and `stockfish-19-lite.js`.
- **Pages first visit (D.8, risk 12).** `src/main.tsx` is the D.8 block. Its only engine import is `ENGINE_STRINGS` plus
  `deviceProfile`, which the block calls itself; importing `src/engine` creates no pool. The splash is a
  `role="status"` text with no input. No module in `src` has an import-time fetch, IndexedDB access or worker.
  `renderApp` and `bootApp` are guarded and create one root, one store and one import (`src/ui/boot.test.tsx`).
  `dist/index.html` has no `coi` reference. The inline `doReload` matches PLAN Assumption 25 (see L2 for one edge case).

## Optional (not gaps; no requirement is affected)

- **`src/data/openings.json` in the main chunk.** Minified it is 507,305 B raw and 63,323 B gzip (50,022 B brotli). That
  is about 51 % of the main chunk's raw bytes and about 28 % of its gzip. A dynamic `import()` would save about 63 kB of
  first-load transfer and about half of the JS parse and compile on phones. But the data is read synchronously by
  `bookPrefix`, by `lookupOpening` inside `buildMoveFacts`, and by `useExplanation` on every rendered ply, cached reviews
  included. Lazy-loading would need an async gate before the first review render and before `analyzeGame`. With the
  total at 230 kB against a 900 kB budget, it would not help materially now. Revisit only if first-load time on slow
  phones becomes a problem. If done, preload the chunk when the import screen mounts.
- **Whole-review persistence on every ply.** About 133 kB is structured-cloned per ply, which is O(n²) bytes over a run
  (about 7 MB for 112 plies). It costs about 1 ms per ply on desktop. Debouncing to every few plies, with a final write,
  would cut phone main-thread time. Keep the write on the last ply so the resume point is not lost.
- **Idle workers after "New game".** By design there is one pool per page, so it stays alive. On desktop without
  isolation that is up to 4 idle workers of about 128 MiB of wasm memory plus 64 MB of Hash each. On mobile there is
  1 worker of about 111 MiB. Terminating idle workers after a few minutes would free that memory, at the cost of a
  re-boot.
- **The verbatim C.2 detection misses "desktop site" modes.** Android Chrome's "Desktop site" sends an `X11; Linux` user
  agent with `userAgentData.mobile === false`, so the page treats the phone as desktop Chromium: up to 4 workers, or
  pthreads with Hash 128 on Vercel. An iPhone with "Request Desktop Website" is classified as an iPad (Hash 32, MultiPV 2
  pass). Both cases are user-initiated, and the detection code is pinned by the spec. If this is wanted, add a
  `maxTouchPoints > 0 && /linux/` (not CrOS) heuristic and record it as an assumption.
- **The 15 s boot timeout includes the wasm download** (1.79 MB lite-single). Below about 1 Mbit/s the first boot can
  hit E-2 before the download finishes. This is spec-mandated (R17, C.1 item 3). The download-progress port could
  extend the timer while bytes are still arriving.
