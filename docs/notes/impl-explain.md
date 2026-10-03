# impl-explain notes

Assumptions and judgement calls made while implementing `src/explain` (PROMPT.md Appendix E):

1. `playedMaterialLoss` is measured from the position before the move over `[played move, ...playedPv]`, not
   from the position after it. Otherwise an even trade such as Nxe5 dxe5 would read as "loses a knight". It can be
   negative, meaning the mover gains material; the positive rules use `-playedMaterialLoss` for the played move's gain.
2. A PV that ends on a capture: the final capture is left out only when it favours the side being measured
   (`'gain'`: a final capture by the mover; `'loss'`: a final capture by the opponent). Neither a gain nor a loss is
   ever claimed on the strength of an unanswered final capture.
3. Depth gate (3.8): rules that rest on engine data are skipped below `min(depthTarget, explainDepthGate)`, and so
   is the E.7 swing sentence. Rules that rest only on chess.js facts about the played move still run below the gate:
   Checkmate, Castles, Develops, Recapture, Promotion, PassedPawn, Book, Forced and the generic sentences.
4. Swing buckets are symmetric: winning >= 80, better >= 60, equal > 40, worse > 20, losing <= 20. Worsening
   sentences appear only for Inaccuracy, Mistake, Blunder and Miss; improving ones only for Brilliant, Great, Best and
   Excellent; Good, Book and Forced get none. The personal swing sentences are written out with correct grammar
   ("You were winning ..."), not produced by substituting "you" into the impersonal ones.
5. The `sacrifice` motif is recorded only when `loss <= brilliant.maxLoss`, because a blunder that hangs a piece is
   not a sacrifice. Its sources are the B.3(a) detector, or the played line losing at least 2 points with a non-pawn
   piece.
6. Motif proofs need the engine to agree. A best-move or played-move tactic requires `>= 1` of material in the
   relevant line (`>= 2` for the Miss tactic rule), or a mate. An allowed tactic requires `playedMaterialLoss >= 1` or
   a forced mate. Rules that depend on the reply require `playedPv.length >= 2`. HangsMate and GettingMated do not,
   because they rest on the mate detector or a mate score.
7. HangsMate quotes the actual mate-in-one move: `replySan` when it ends in `#`, otherwise the mating move found
   on `fenAfter`.
8. Excellent names the best move, both in its sentence and in the chip, only when the best move's tactic is proven
   and the depth gate is open (Assumption 16c). Its generic sentence is original wording.
9. The win% for `gapToSecondBest` comes from `winPct` in `../analysis`. The facts test mocks it, because the stub in
   this worktree throws. `lookupOpening` failures are caught and treated as "no opening".
10. The WinsTempo and DefendsPiece targets, and the castling-rights check, are recomputed from `fenBefore` and
    `fenAfter`, because their `Motif` variants carry no squares. Without the FENs these rules do not fire.

Follow-ups (outside src/explain):

- The E.5 snapshot test over the three fixture games needs `src/test/fixtures/evals/`, which does not exist yet.
- Nothing in `src/explain` uses the E.2 "best move threatens bestPv[2]" claim.
