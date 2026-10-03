# fix-explain: explanation proof gaps (docs/review/correctness.md H2, H3, M1, M2, L1, L5 to L9)

## What changed

- `src/explain/facts.ts` `materialAlong`: counts to the end of the (truncated) PV, then applies the E.3
  mid-exchange rule (a final capture by the measured side's beneficiary is dropped: the mover's for `'gain'`, the
  opponent's for `'loss'`). It returns `window` (plies through the quiet move that follows the last counted capture,
  the E.2 stopping point; replaying exactly these plies reproduces `net`) and `taken` (each capture in the window with
  the path of squares the captured piece stood on). Mover POV now comes from `toMover` (exported by
  `src/analysis/index.ts`); facts.ts negates nothing.
- `src/explain/rules/shared.ts`: `bestCount` / `gainCount` / `lossCount` return a `Counted` (figure, the quoted plies
  `shown`, piece lists, captures). Positive claims for a non-best move are re-counted with `'gain'` (H2).
  `motifProven` ties every tactic sentence (played, best, allowed; Best/Excellent/Good/Great/Brilliant, Inaccuracy and
  Mistake MissedTactic, Mistake AllowsTactic, Blunder PermitsFork/PinOrSkewer/AllowsDiscovered, Miss) to the motif's
  own consequence (M2).
- `{pv}` (WinsMaterial, Brilliant +Material) is exactly `shown` (H3); a window over 5 plies is not claimed.
  `{line}` of LosesMaterial / HangsPiece is `shown` after the move, at most 4 plies (reply + 3-ply `{materialDetail}`),
  otherwise not claimed (L8).
- `{material}` always uses the counted piece lists (L7): "the exchange", "the queen for a rook"; `{net}` is gone.
- Inaccuracy list = MissedTactic, AllowsCounterplay, SlowerMate, generic; Mistake list = LosesMaterial, AllowsTactic,
  MissedTactic, LosesCastling, SlowerMate, EvalSwing, generic (L5). The E.7 swing is still the second sentence.
- HangsPiece: both branches need `playedPv.length >= 2` (L6); the line branch needs the hung piece captured inside the
  counted window.
- Brilliant +Mate quotes `mateAfter` and needs it positive (L9).
- Recapture variant "...and restore(s) the balance" reworded to "...straight away" (the balance claim was unproven).

## Assumptions (for PLAN.md)

1. The counted window includes the quiet ply that settles the exchange and is never padded to 3 plies: E.6's "3 to 5
   plies" yields to "quote exactly the counted window".
2. Motif consequence: the line mates for the attacker, or nets at least the rule's minimum for the attacker and the
   attacker captures a piece that stood on a target square (fork targets; pinned or rear piece; skewer rear piece;
   discovered-attack target; trapped piece) after the motif-creating ply; a discovered check needs a capture on the
   attacker's next move; a free piece needs the creating move's own capture; a mate threat stays a board fact
   (mate, or net gain).
3. "Bare" facts: when `fenBefore` is missing, or a PV does not reproduce the facts' own figure (impossible for facts
   from `buildMoveFacts`, which derives each figure from the same PV on the same board), rules fall back to the facts'
   numeric fields and the previous shortest-capture window. This keeps the hand-written E.5 `explain()` fixtures
   (which carry figures without consistent PVs) valid; L9's bare fallback quotes `bestLeadsToMateIn`.
4. No eval-delta check on material claims (M1's "for example"): the eval before the move already prices in material
   that the move recovers, so a delta cannot confirm or refute a material count.

## Snapshot (src/explain/__snapshots__/snapshot.test.ts.snap): 47 lines changed, every one checked

Removed unproven claims: material gains resting on an unanswered final capture, on a window longer than 5 plies, or
given back later in the PV (daily 2, 4, 11, 12, 14, 18, 53, 57, 63, 67, 68, 72, 73, 86, 116, 121; live 61, 79, 94);
tactics without their consequence (daily 3, 29, 41, 48, 61; live 5, 8, 21, 27, 65, 75, 77, 80); "even trade" where
the full count is not level (daily 25, 32, 66; live 72); daily 125 (GettingMated is not in the Inaccuracy list); live
93 (a loss whose capture lies 6 plies after the reply). The replacements are board facts (Develops, Castles,
Recapture, DefendsPiece, CaptureThreat, FreePiece with its capture counted) or the generic sentence. Lines that now claim material quote exactly the counted
window: daily 29, 71, 75, 76, 93; live 76, 80, 88, 96. Remaining FreePiece lines are recaptures (the review's
"Optional, not gaps"). Daily 23 and 60 keep their pin sentences: the PV captures the rear queen on d7 (23) and the
pinned knight after `Nd6+` (60).

## Follow-ups (outside src/explain)

- PLAN.md: record assumptions 1 to 4 above.
- Optional review note: FreePiece on ordinary recaptures ("Picks up a free knight") is spec-conformant (E.4 order) but
  reads as a gain; a `recapture` exclusion would need a spec decision.
