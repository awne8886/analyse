# Correctness review (review-correctness, Phase 4)

Scope: PROMPT.md Appendix B (B.1 to B.10) in `src/analysis/`; import rules R2 to R9 (sections 2, 3.3, Appendix A) in
`src/import/` and `api/chesscom.ts` (D.2); eval sign conventions end to end (risk 5); mate handling (risk 6); the
`fen4|depth|multipv` cache key; the watchdog and UCI serialisation (R16, R17, C.1 modifications) in `src/engine/`; the
explanation engine against Appendix E (E.3 control flow, proof requirements, section 3.8 depth gate) including the
snapshot `src/explain/__snapshots__/snapshot.test.ts.snap`; the three string tables against Appendix F.

Resolutions in PLAN.md (Assumptions, Spec-gap resolutions), docs/research/spec-gaps.md and docs/notes/*.md were
treated as binding and are not reported. Method: code reading, `npx vitest run src/analysis src/explain src/engine
src/import api` (751 passed), a scratch vitest run (outside the repo) that rebuilds the snapshot pipeline and dumps the
`MoveFacts` behind every snapshot line, and a scratch byte-for-byte comparison of the F.1 to F.3 string columns against
`IMPORT_STRINGS` / `ENGINE_STRINGS`.

**Counts: 3 high, 2 medium, 10 low.**

---

## High

### H1. A Retry search supersedes the analysis job id: it cancels a running analysis, and every later analysis in the tab is rejected as stale

- Requirement: R16 ("cancellable ... discard stale job ids"), R26 / G.4 (Retry), C.1 item 8 (monotonic `jobId`).
- Where: `src/state/controller.ts:55` (`retryJob: 1_000_000`) and `:593` (`session.retryJob += 1`, then
  `pool.evaluate(..., session.retryJob)`); `src/analysis/analyzeGame.ts:38,240` (`lastJobId` module counter starting at
  0, `const jobId = ++lastJobId`); `src/engine/pool.ts:178-182` (`jobId < currentJobId` rejects as stale, a higher id
  cancels every older `eval` request).
- What is wrong: the two callers draw job ids from two unrelated counters. The first Retry whose move is not one of the
  stored lines sends job 1,000,001. The pool then (a) cancels every queued and running request of the current
  analysis (analysis ids are 1, 2, 3 ...), so `analyzeGame` rejects with an AbortError and `runAnalysis` silently
  sets `phase: 'idle'` with an incomplete review; Retry is enabled during analysis on desktop and tablets
  (`src/ui/MoveByMove.tsx:91` disables it only for `multiPv === 1`); and (b) rejects every later `analyzeGame` job
  (`jobId` 2, 3, ... < 1,000,001) as `engine: stale job`, because the pool is reused for the whole tab
  (`session.enginePromise`). Importing another game, or resuming, after one Retry never analyses anything and shows
  no error. The e2e suite cannot see this: `MockEngine.evaluate` ignores `jobId`.
- Verify: unit test on the real pool with the existing `MockWorker` of `src/engine/pool.test.ts`:
  `await pool.evaluate(fenA, L, 1_000_001)` then `pool.evaluate(fenB, L, 2)` rejects with `engine: stale job 2`.
  Manually: desktop, finish a review, Retry a move that is not the best or second line, then import a second game:
  the progress bar never moves.
- Fix: one job-id source for every `evaluate` caller (for example `nextJobId()` exported from `src/engine`, used by
  `analyzeGame` and the Retry path), and do not let a Retry probe supersede the analysis (run it after the analysis,
  or keep Retry disabled while analysing on every device class, and give it a flag the pool does not treat as a new
  job).

### H2. Positive "wins material" claims count an unanswered final capture by the mover (E.3 PV-truncation rule)

- Requirement: E.3 "if the PV ends mid-exchange do not count the last capture as a net gain"; R24 / E.3 "a sentence
  may claim a concrete consequence only when the engine data proves it".
- Where: `src/explain/facts.ts:160` builds `playedLine` with measure `'loss'`, and `:258` exports
  `playedMaterialLoss: -playedLine.net`; `src/explain/rules/shared.ts:202` `playedGain = -f.playedMaterialLoss` for a
  non-best move; `src/explain/rules/positive.ts:105-120` (`WinsMaterial`), `:89-104` (`FreePiece`), and every
  `playedTactic` proof (`shared.ts:324-332`) use that gain. With measure `'loss'`, `materialAlong`
  (`facts.ts:88-98`) drops only a final capture by the opponent; a final capture by the mover is kept as a gain.
- What is wrong: lines whose only (or last) capture is the mover's capture on the last counted ply are reported as
  material won, although the opponent's recapture is simply beyond the PV. Real snapshot outputs:
  - live 129688175007 ply 61 (Excellent): "your move wins material (about 4 pawns) after 31.Bb3 Nb6 32.Nh2." The
    counted line is `Bb3 Nb6 Nh2 d5 Ng4 Nxg4 hxg4 dxe4 Rxd7`; the +4 rests on the unanswered final `Rxd7`, while the
    engine eval moved from +0.10 to -0.06.
  - daily 1000337106 ply 2: "it wins a pawn after 1...e5 2.d4 e4." The only capture is `exf3`, ply 9 of
    `e5 d4 e4 Bh3 g6 f3 Nc6 c3 exf3` (eval for Black -0.33).
  - daily ply 14: "it wins a minor piece after 7...O-O-O 8.f4 Qe8" (final capture `Nfxd5`, unanswered); ply 18
    "wins a pawn after 9...Bb4 10.Kb1 Rhe8" (final capture `dxe3`).
  The code itself knows: `gainMaterial` recomputes the same line with `'gain'`, gets 0, and falls back to
  `describeMaterial(gain)` instead of withholding the claim (hence "a minor piece" rather than "a knight" at ply 14).
- Verify: the scratch dump of `buildMoveFacts` for those plies (`playedMaterialLoss` -4 / -1 / -3 / -1 while
  `materialAlong(fenBefore, [san, ...playedPv], color, 'gain').net` is 0); or add an `explain()` test with
  `playedPv` ending in an unanswered mover capture and assert no "wins".
- Fix: add a gain measured with `'gain'` (for example `playedMaterialGain` computed in `facts.ts` alongside
  `playedMaterialLoss`, or compute it in `playedGain` from `fenBefore`), use it in every positive rule, and drop the
  claim when `gainMaterial`'s recount disagrees.

### H3. `{pv}` shows a different window of the line than the one the material claim was counted on

- Requirement: E.3 proof requirement; E.6 `{pvShort}` ("the first 3 to 5 plies of the relevant PV"); the task's own
  example ("wins a pawn after 1...e5 2.d4 e4" where the shown line captures nothing).
- Where: `src/explain/rules/shared.ts:123-130` (`pvShort` scans only the first 5 plies and cuts after the last capture
  inside them, else shows 3 plies), versus `materialAlong` (`facts.ts:50-100`), which counts up to 9 plies and stops
  after the first quiet move that follows a capture.
- What is wrong: the claim and the displayed line disagree in both directions.
  - The capture that the claim rests on lies beyond the shown plies: daily ply 2 ("1...e5 2.d4 e4", capture at ply 9),
    ply 12 ("wins a knight for a pawn after 6...Qd7 7.Nc3 d5", captures at plies 6 and 7), ply 14, ply 18, live ply 61.
  - The shown line runs past the point where the count stopped and contradicts it: daily ply 67 "You come out ahead by
    a pawn after 34.axb3 Qh2 35.e6 Qxf2" (the shown `Qxf2` takes the pawn back; the count stopped at `Qh2`); daily
    ply 68 "it wins a pawn after 34...Qf3 35.e6 Qxf2 36.Re2 Qxe2" (the PV continues `Bxe2`, so over the shown sequence
    plus its recapture Black is down a queen for rook and pawn).
- Verify: `src/explain/__snapshots__/snapshot.test.ts.snap` lines for daily plies 2, 12, 14, 18, 67, 68 and live ply
  61, against the `bestPv` / `playedPv` in the scratch dump.
- Fix: return the consumed ply count from `materialAlong` (it already has `plies`) and render exactly that prefix as
  `{pv}`; when the counted prefix is longer than 5 plies, do not claim the gain (fall through to the next rule).

---

## Medium

### M1. Material along a PV stops at the first quiet move after any capture, so gains that the PV gives back are claimed

- Requirement: E.2 "stopping at the end of the PV or after a quiet move that follows the last capture"; E.3 proof
  requirement.
- Where: `src/explain/facts.ts:85` (`else if (seenChange) break`).
- What is wrong: the walk ends after the first quiet move following the first capture, not after the last capture of
  the exchange sequence, so a recapture two plies later is never counted. Snapshot outputs: daily ply 4 "it wins a
  pawn after 2...Nf6 3.d4 exd4" (PV continues `4.Nf3 d5 5.Nxd4`; Black's eval fell by 0.76 pawns); daily ply 11 "your
  move wins a pawn after 6.e3 Nb4 7.Kd1 Bf5 8.Bxb7" (PV continues `Rb8 Bg2 Bxc2+`); live ply 79 "You come out ahead
  by a pawn after 40.Nxe5 Qd1+ 41.Kh2" (PV continues `Qd6 f4 Nxb2`, eval -0.11 to -0.13). The same count feeds
  `bestMaterialGain`, `playedMaterialLoss` and hence the Blunder/Mistake `LosesMaterial` and Miss `MissedWin(Win)`
  rules. The E.2 wording is ambiguous, but the output contradicts the engine line it cites.
- Verify: the scratch dump for those plies; a unit test of `materialAlong` on `[Nf6, d4, exd4, Nf3, d5, Nxd4]` from
  the ply-4 FEN expects net 0.
- Fix: count to the end of the (truncated) PV and then apply the mid-exchange rule, or stop after two consecutive
  quiet plies as B.3 step 8(b) does; and never claim a gain the eval delta contradicts (for example require
  `loss` small and the mover's cp gain consistent with the claimed material).

### M2. Tactic sentences are "proven" by net material that has nothing to do with the motif

- Requirement: E.3 "motif detectors alone add colour only when the engine agrees on the consequence"; R24 "fork of X
  and Y ... only when the engine data proves it".
- Where: `src/explain/rules/shared.ts:310-320` (`bestTactic`: agreement = `bestMaterialGain >= minGain`) and
  `:324-332` (`playedTactic`: agreement = `playedGain(f) >= 1`); used by `positive.ts:74-88`
  (`Fork|Pin|Skewer|Discovered`) and `mistake.ts` (`MissedTactic`).
- What is wrong: any material gain anywhere in the line validates whichever motif the detector found first, so the
  sentence attributes the gain to a motif the engine line never exploits. Snapshot outputs: live ply 65 "You found it,
  skewering the knight and winning the pawn" (the +3 is the capture `Rxd5` itself; `bestPv` `Rxd5 Na4 Qe2 Nb6 R5d3 Na4`
  never wins a pawn); live ply 5 "You found it, pinning the pawn against the queen" (the gain is the captured c5 pawn);
  live ply 21 "You could have played Qb3, pinning the pawn against the knight" (the only gain is `Rxd6` at ply 7 of
  the PV); daily plies 3 and 23 the same pattern.
- Verify: the scratch dump (`motifsPlayed` / `motifsBest` and the PVs) for those plies.
- Fix: tie the agreement to the motif: the PV must capture one of the motif's target squares (fork targets, the
  pinned or rear piece, the skewered rear piece) within the counted prefix, or the line must mate; otherwise skip the
  tactic rule.

---

## Low

### L1. `src/explain/facts.ts` carries its own White-to-mover negation (risk 5)

- Requirement: risk 5 "the mover conversion exactly once in `src/analysis/classify.ts`; `src/explain/facts.ts` ...
  negates nothing".
- Where: `src/explain/facts.ts:15` (`moverPov`), used at `:146-147` and `:164`.
- Note: `docs/notes/contracts.md` section 3 tells facts.ts to apply "the single mover rule" and `PlyReview` stores
  only White-perspective scores, so a conversion is unavoidable; the gap is the second implementation of the rule.
- Fix: export `toMover` (`src/analysis/classify.ts:24`) from `src/analysis/index.ts` and call it in `facts.ts`, so
  one function is the only negation outside `src/engine`.

### L2. The stored explanation is built before the next ply exists, so it lacks `playedPv`

- Requirement: R24 "computed right after each ply's engine result and stored on the ply record"; E.2 `playedPv` =
  line of the position after the move.
- Where: `src/analysis/analyzeGame.ts:282-290` calls `explainPly` while ply k+1 is still `pending` (empty `bestPv`);
  `src/explain/facts.ts:153-157` then falls back to `playedLine`, which exists only when the played move was one of
  the MultiPV lines.
- Effect: the persisted `PlyReview.explanation` of most Inaccuracies, Mistakes and Blunders skips every reply-based
  rule. The UI rebuilds explanations on render (`src/ui/useExplanation.ts`), so the visible text is right once ply
  k+1 is done, but it changes under the user while analysing and the stored record disagrees with the shown one.
- Fix: pass position k+1's eval to `buildMoveFacts` (or explain ply k when ply k+1 is emitted).

### L3. Cache key built outside `evalKey`

- Requirement: C.1 item 8 "one `evalKey(fen, limits)` helper in `src/engine/` is the only place that builds it".
- Where: `scripts/record-evals.mjs:213` builds `` `${fen4}|${DEPTH}|${MULTIPV}` `` itself.
- Fix: import or mirror the helper with a test that `record-evals` keys equal `evalKey` for a sample FEN.

### L4. A request cancelled while its worker is in `newGame` still runs a full search

- Requirement: R16 / R17 cancel ("send `stop` and wait for `bestmove`").
- Where: `src/engine/pool.ts:249` sends `stop` only when `Engine.busy` (false during `newGame`'s `isready`), and
  `:332-338` proceeds to `engine.analyse` without re-checking `req.cancelled`.
- Effect: `stop()` / a superseding job waits up to a full movetime (6 s on Deep) instead of returning at once; the
  result is discarded correctly. Fix: `if (req.cancelled) throw cancelledError(...)` after `newGame`.

### L5. Inaccuracy and Mistake rule lists contain rules not in their E.4 lists

- Requirement: E.4 Inaccuracy list (MissedTactic, AllowsCounterplay, SlowerMate, generic) and Mistake list.
- Where: `src/explain/rules/inaccuracy.ts:22-31` adds HangsMate, GettingMated, MissedMate, EvalSwing;
  `src/explain/rules/mistake.ts:71` adds HangsMate, GettingMated, MissedMate.
- Example: daily ply 125 "Bxg2 is an inaccuracy | This lets your opponent force mate in 10". Consistent with the B.2
  cp-to-mate table, so it does not contradict the badge; record it as an assumption or trim the lists.

### L6. HangsPiece's direct-capture branch ignores the PV-length guard

- Requirement: E.3 "when `playedPv.length < 2` skip reply-based rules".
- Where: `src/explain/rules/blunder.ts:71` (the `reply.includes('x')` branch does not call `replyProven`); not listed
  among the documented exceptions (docs/notes/impl-explain.md item 6 names only HangsMate and GettingMated).

### L7. `{material}` / `{net}` wording departs from E.6 for unequal trades

- Requirement: E.6 ("2 with the rook-for-minor pattern 'the exchange'"; unequal trades "a rook for a bishop";
  "material (about {n} pawns)" only for sequences longer than 3 captures).
- Where: `src/explain/templates.ts:493` personal variant `{net}` = `describeMaterial(gain)` without the piece lists.
- Examples: daily ply 121 "You come out ahead by two pawns after 61.Kh5 Rf4 62.Bg4 Rxg4 63.Kxg4" (rook for bishop:
  "the exchange"); daily ply 71 "material (about 4 pawns)" for a queen-for-rook trade of 2 captures.

### L8. `{materialDetail}` can omit the capture it describes

- Requirement: E.4 LosesMaterial "{reply} {materialDetail}", E.6 `{materialDetail}` = the capture sequence.
- Where: `src/explain/rules/blunder.ts:156` `captureLine(f.playedPv)` looks at 3 plies only.
- Example: live ply 93 "You lose a pawn after Ke6." (the capture `Kxd4` is ply 5 of the line). Fix as H3: show the
  counted prefix, or skip the claim when it is longer than the shown window.

### L9. Brilliant "forces mate in {n}" uses the best line's distance, not the played move's

- Where: `src/explain/rules/brilliant.ts:29` uses `bestLeadsToMateIn` (from `mateBefore`); a Brilliant that is not
  the top move (loss <= 2, so it also mates) may mate more slowly. Use `mateAfter` when positive.

### L10. Bare chess.com link: a found live game is discarded when the daily probe fails with a proxy error

- Requirement: R2 ("when one succeeds, shows the ambiguous-link notice I-10a").
- Where: `src/import/importGame.ts:116`: when live is `found` and daily is `failed` (blocked, timeout, unreachable),
  the code drops the live game and goes to the username step (or errors with P-1 / P-4 / I-18 without a username).
- Fix: treat "one found, the other failed" as I-10a (the failed kind is unknown, not absent), or at least offer the
  found game as a choice.

---

## Optional (not gaps)

- FreePiece fires on ordinary recaptures because material is measured from the position after the opponent's
  capture, giving "Picks up a free knight" (live ply 18, after `Nxc8`), "You take the undefended queen on d4" (live
  ply 89, a queen trade), "Picks up a free bishop" (live ply 44). This follows the E.4 Best order (FreePiece before
  Recapture) and the E.4 proof (`see > 0`), so it is spec-conformant, but it reads as a gain where the trade was even.
- `src/explain/detectors.ts` `detectSacrifice` and `src/analysis/classify.ts` `sacrificeLeftEnPrise` implement B.3(a)
  differently (the classifier also requires `see - captured >= 2`); the explain motif only colours wording.
- B.3(b) Brilliant counts a two-pawn gambit (balance down 2) as a sacrifice; B.3 says "pawn-only sacrifices do not
  count" while B.1 implies the threshold of 2 is the mechanism. Worth one line in PLAN.md Assumptions.

## Checked, no gap found

- B.1 constants, B.2 curve and mate tables, B.3 order (Forced, Book, checkmate, draw-from-winning, top move, milder
  of top/played line, soft cap before the gates, shared gate, Brilliant before Great, Miss (a) before (b)), B.4 both
  rules incl. `winAfter > 0` and the afterTop-is-cp check, fixture behaviour (all B.5 / B.6 tests green).
- Mover POV: `toWhite` once in `src/engine/pool.ts` (stm of the searched FEN); `toMover` in `classify.ts`; Retry
  reuses line scores without extra negation (spec-gap 10). `mate 0` handled via `winPctWhite` / `acplCp` with the
  FEN's side to move.
- Accuracy (both presets), rating (regression / ACPL fallback, method precedence), phases (Divider, 0-based index,
  endgame-before-middlegame drop), key moments (candidates, bonuses, dedupe <= 2, cap 8, ply order), summary form 1.
- Engine: C.1 modifications 1 to 11, combined `go depth movetime`, `stop` at movetime + 2 s, wait timeout + 10 s,
  Threads before Hash, `newGame` once per game, MultiPV switch only between searches, depth-0 terminal detection,
  watchdog (10 s silence, terminate, respawn, one retry at depth 12, then `notAnalysed`), priority lane, `evalKey`.
- Import: A.1 regex set and order, A.2 decoder plus the five modifications, R2 bare-link sequence, R3 chain and
  `proxyDown` memo, R5 start FEN from data, variant gate order, R8 lichess 429 / TypeError, R9 serial lowercase
  requests and month caps, D.2 handler (only the documented `let finished: boolean` change).
- Strings: every F.1 to F.3 row matches byte for byte except the documented placeholder renames (I-10a `{kind}`,
  I-14 `{variant}`, I-28 `{what}`, P-9 `{months}`); F.4 / F.5 entries in `src/ui/strings.ts` match.
