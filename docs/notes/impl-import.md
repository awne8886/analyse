# impl-import notes

## Test table defect (needs the lead)

`src/import/errors.test.ts` expects `IMPORT_STRINGS['I-27'] === 'error'` and `IMPORT_STRINGS['I-27b'] === 'Please only
run 1 request(s) at a time'` (lines 259-260, and `MSG.I27_first` / `MSG.I27_second` at lines 209-210). Those are the key and
value of lichess's 429 body, not the Appendix F.1 strings. The implementation uses the Appendix F.1 text:

- `I-27`: `Lichess is rate-limiting requests. Retrying in 60 s…`
- `I-27b`: `Lichess is still rate-limiting requests. Wait a minute and try again.`

Three tests fail only because of this: the snapshot test and the two I-27 tests, which otherwise pass on the
path they assert (one retry after 60 s, onStatus key `I-27`, code `lichess_rate_limited`). The fix is to replace the
four literal values in the test file with the two strings above.

## Assumptions

- Module layout: besides the files listed in section 3.2, `src/import` has `draft.ts` (the gate in its binding order and
  the `pgn:` hash), `replay.ts` (the single chess.js replay that sets `GameMove.terminal`), `chesscomGame.ts` (callback
  and public API entry mapping) and `net.ts` (per-provider serial queue, timer wait).
- `ImportOptions.wait?: (ms) => Promise<void>` was added (defaults to `setTimeout`) so the 2 s and 60 s waits can be
  injected. Fake timers work with the default.
- The `proxyDown` memo is set when both proxy paths fail as blocked, timeout or unreachable. A rate limit (P-3) does
  not set it. When the two paths fail differently, the last path that was tried decides P-1, P-4 or I-18.
  If the proxy steps are skipped (memo, or an empty `proxyUrl`) and there is no username, the error is I-18 with
  `needsUsername`.
- If the proxy fails and a username is known (typed, or `?username=` on the link), the failure string is sent through
  `onStatus` (key P-1 / P-4 / I-18 / P-3) and the public API step runs.
- Bare link on Vercel: if the live lookup fails as a proxy failure, daily is not asked; the username step follows.
  When exactly one kind resolves, the result has `notice: 'ambiguous_resolved'` (this also applies to a Pages archive match),
  and the filled I-10a text goes out through `onStatus('I-10a', …)`. The game's `customStart` flag still carries I-15 in
  that case, because `notice` holds only one value.
- Public API order: live means the archive list, then the 3 predicted months (only those in the list are fetched).
  Daily means the current-games list first, then the archive list, then the newest 6 months. A bare id means the
  archive list, the 3 live months, the current games, then the daily months not already fetched. A month that returns
  404 "internal error" is skipped. Any 403 is P-7. A network error is I-18. A 429 shows P-2, waits 2 s and retries once,
  then P-3. P-9 `{months}` lists the candidate months joined by `, `.
- Variant names in I-14: Crazyhouse, Three-check, King of the Hill, Antichess, Atomic, Horde, Racing Kings. An unknown
  PGN or lichess variant name is shown as written. A SAN containing `@` with no Variant header is reported as Crazyhouse.
- `pgn:` id: SHA-256 of the replayed SAN moves joined by single spaces. Headers, comments and numbering do not affect it.
  The start FEN is not part of it.
- Dates are ISO `YYYY-MM-DD` when the source has `YYYY.MM.DD` (lichess: from `createdAt`). Other forms are kept as written.
- Lichess AI players are named `Stockfish level N` with `isComputer: true`. Lichess `clocks` (centiseconds) are
  converted to tenths. `timeClass` is the lichess `speed`.
- The chess.com time class for live games (the callback has no `time_class`) is derived from TimeControl as base + 40 x
  increment: under 180 s bullet, under 600 s blitz, otherwise rapid. Daily kind is `daily`.
- `api/chesscom.ts` follows D.2 except `let finished: boolean` (no initialiser), which ESLint's
  `no-useless-assignment` requires. Behaviour is unchanged.
- The `// @vitest-environment node` docblocks of the existing tests were kept. The new test files run under jsdom (the
  default).

## Follow-ups (outside src/import and api)

- `src/import/errors.test.ts` I-27 values (see above).
- PLAN.md follow-up on A.5 still applies: ids that are out of time order (oddschess) can fall outside the 3 predicted months.
