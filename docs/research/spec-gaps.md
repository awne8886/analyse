# Spec gaps (scout-spec, Phase 1, 2026-10-02)

Written by the lead from the `scout-spec` report (read-only Explore agent). Resolutions are binding and repeated in `PLAN.md` ("Spec-gap resolutions").

## 1. B.5 fixtures re-derived by hand

All 19 expected labels follow from B.2 / B.3 / B.4 as written (win% = 50 + 50 tanh(0.00184104 cp), mover POV per B.2):

| # | Label | Deciding numbers |
|---|---|---|
| 1 | Brilliant | +246 -> +256 mover, 71.21 -> 71.96, loss 0; gate ok (2nd -108, winAfter >= 45); step 8(a): see(b6,'w') = 9 - 3 = 6 |
| 2 | Best | gate fails: 2nd line M4 for mover |
| 3 | Great:gap | winAfter 49.45; gap 49.54 - 14.68 = 34.86 win% (473 cp); not Brilliant (PV loses 1, SEE e5 after f4 = 0) |
| 4 | Great:gap | gap 46.42 - 9.56 = 36.85, winAfter 49.54 |
| 5 | Best | gate fails twice: in check; winAfter 41.70 < 45 |
| 6 | Blunder | cp -> mate table, M-1 >= -2; 50.09 -> 0 |
| 7 | Miss:a | base Mistake (M1 -> 0 cp); preMistakeWin 49.91, gain 50.09, loss 50, abs(50 - 49.91) = 0.09 (needs `previous`) |
| 8 | Blunder | M1 -> M-2; Miss (a) fails, winAfter 0 |
| 9 | Forced | 1 legal move |
| 10 | Blunder | DrawFromWinning, winBefore 100 |
| 11 | Best | CheckmateBest; Brilliant blocked (2nd M2) |
| 12 | Book | |
| 13 | Excellent | lossTop 1.001, lossPlayed 0.455 -> loss 0.455; gate fails (winAfter 44.14) |
| 14 | Good | 52.30 -> 48.80, loss 3.50 |
| 15 | Inaccuracy | 50.74 -> 43.23, loss 7.51 |
| 16 | Mistake | 26.94 -> 11.93, loss 15.01 |
| 17 | Blunder | 50.92 -> 16.02, loss 34.90 |
| 18 | Excellent | mateLoss 1; gate fails on M4 2nd line |
| 19 | Miss:b | base Good; winAfter 91.11 (90% threshold at 596.7 cp); rule (a): loss 8.89 < 10 |

## 2. B.6 recomputed

| | moves | sum 1/max(acc,20) | harmonic | expected |
|---|---|---|---|---|
| White | 15 | 0.168499 | 89.02 | 89.0 |
| Black | 14 | 0.194011 | 72.16 | 72.2 |

Both hold. Black ply 24 accuracy 2.93 is floored to 20. Side note: through the `+1` term any drop <= about 0.16 clamps to 100.

## 3. Ambiguities and resolutions

1. **preMistakeWin / opponent gain (Miss a):** preMistakeWin = 100 - previous.winBefore; gain = this.winBefore - preMistakeWin (signed, top lines). Same value feeds `MoveFacts.previous.opponentGain`. Skip rule (a) when the previous ply is not analysed or absent.
2. **Terminal moves:** checkmate: winAfter 100, loss 0. Draw on board: winAfter 50, loss = max(0, winBefore - 50). DrawFromWinning (Blunder) is final: no soft cap, no Miss override.
3. **Great exclusions:** "undefended" = `!isDefended(before-after-board, to)` per E.1 semantics evaluated on the position before the move for the captured piece's square (en passant: the captured pawn's square); "worth more than the capturer" via `pieceValues` (equal trades allowed); "attacked by a cheaper piece on its origin square" = `canBeTakenByLowerPiece(before, from)`.
4. **Book with customStart:** never Book (even on transposition). Forced outranks Book. EPD uses chess.js 1.4.0 `fen()` fields 1-4 both in `build-openings.mjs` and at runtime.
5. **Phases:** `phaseStarts` is the 0-based board index (board before ply index+1). Ply p is in phase X when p - 1 >= start(X). Book and Forced count as 100 and count toward the 4-move minimum; not-analysed plies excluded.
6. **ACPL:** White-POV line 1 of positions k and k+1, cp clamped +-1000, mate = +-1000 (mate 0: by the mated side), per-move = max(0, min(1000, (before - after) * sign)) with sign +1 White / -1 Black; Book/Forced count 0. Amended by the lead: the fallback value stays the literal R21 formula (unrounded, unclamped; the UI rounds it for display), as pinned by `src/analysis/rating.test.ts`. Regression uses the unrounded accuracy.
7. **rating.method (one field for two sides):** 'regression' if either side used it, else 'acpl' if either side used the fallback, else 'none'. The UI labels each side from `Player.rating` presence and that side's analysed move count (>= 10).
8. **Miss order:** rule (a) is evaluated before (b); the first that fires sets reasonCode. Rule (b) checks that afterTop is cp.
9. **Brilliant needs loss <= 2;** an isBest move with loss > 2 (depth noise) can still be Great. Tests may assert it.
10. **Retry (G.4):** a retried move equal to `lines[1].pv[0]` uses that line's score converted to mover POV by the single B.2 rule (no extra negation); a fresh search's PV1 of the position after the retry is negated (opponent to move). Book is not applied in Retry (isBook false), so a book move gets its engine label.
