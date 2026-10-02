# impl-analysis notes (Phase 2)

Judgement calls made in `src/analysis/**` (beyond PLAN "Assumptions" and "Spec-gap resolutions"):

1. **Brilliant (b) material** is the mover's material *balance* (`materialDiff` of E.1), not the mover's own
   material: with own material every exchange in the PV would count as a sacrifice.
2. **Brilliant (a) threshold**: a piece counts as sacrificed when `see(after, sq, opponent) - value(captured) >= 2`
   (`minSacrificePawnUnits`), it is worth more than the captured piece, and the opponent's cheapest *legal*
   capture neither allows a mate in 1 for the mover nor leaves an opponent piece bigger than the sacrificed one
   en prise. This makes "a rook that took a minor defended by one minor" (with the rook defended) not a sacrifice.
3. **Phone candidates** exclude Forced and Book (no line data can change them); a position already searched with
   MultiPV 2 is not re-searched.
4. **Classification order on phones**: plies are finalised strictly in ply order; ply k+1 waits for ply k's
   re-search because the Miss rule reads ply k's final `winBefore`. The main pass keeps running in the pool.
5. **Not analysed**: a position the watchdog gave up on (`notAnalysed: true` or no lines) marks *both* plies that
   need it (ply k uses it as `before`, ply k-1 as `after`). Placeholder fields: classification `good`,
   reasonCode `NotAnalysed`, loss 0; the status is what the UI and aggregates read. `explainPly` is called only
   for `done` plies (not-analysed keep the blank explanation; the UI renders E-9).
6. **Mid-game `terminal` flag** (repetition/fifty claimed but the game continued): the ply is still classified as a
   draw on board from the importer's flag; the position is evaluated because the next ply needs it as `before`.
   Only the final position is ever synthesised.
7. **Cancellation**: `signal` abort, or an `evaluate()` rejected with `name === 'AbortError'` (pool stop/dispose or a
   newer jobId), makes `analyzeGame` reject with that AbortError; completed plies were already emitted through
   `onPly`, nothing is marked not analysed. On our own `signal` it also awaits `engine.stop()`. Any other
   rejection propagates as an engine failure. One `jobId` per run (module counter).
8. **Aggregates** (accuracy, phase accuracy, tally, rating, key moments, summary) count `done` plies only, so a
   `refining` ply joins them when final. Accuracy values are stored unrounded.
9. **`GameReview.summary`** holds the impersonal White sentence (analysis does not know the user's colour); the UI
   calls `summarySentence(review, userColor, voice)` for display. Form 1 of B.10 is used.
10. **`engine.depth` per ply** = min(depth of position k, depth of position k+1) (before's depth for a terminal move).
11. **Opening**: only from the contiguous Book prefix; no fallback to the import's `eco`/`openingName` (the UI may
    show that itself).
12. `cache.ts` was not written: the `fen4|depth|multipv` cache is the pool's (C.1 item 8) and a resumed run only
    dispatches positions of unfinished plies.
13. Lichess preset harmonic mean guards values below 1 (division by zero); irrelevant to the B.6 numbers.

Extra exports from `src/analysis/index.ts`: `epdOf`, `phaseGrade(accuracy)` (R22 icon bands), `calibrationReport`
and its types, the `AccuracyPreset` type.
