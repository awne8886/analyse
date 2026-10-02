# Recorded upstream responses (scout-apis, Phase 1)

Recorded 2026-10-02 with `curl` through the sandbox proxy, strictly serially (1 s pause; 2 s between lichess requests; no 429 occurred). Browser-like User-Agent, `Accept: application/json`, redirects not followed. Each response is saved as a wrapper in `src/test/fixtures/network/<host>-<kind>-<id>.json` (`url`, `status`, `contentType`, `acao`, `body`; plus `truncatedFrom` when a monthly archive's `games` was cut to 20 entries). `acao` is the `access-control-allow-origin` value or null when the header is absent. Lichess URLs carry `?pgnInJson=true&clocks=true&evals=false&opening=true&accuracy=true`.

| url | status | content-type | ACAO | notes |
|---|---|---|---|---|
| `https://www.chess.com/callback/live/game/129688175007` | 200 | `application/json` | null | type `chess`, 112 plies, Arystanner vs Hikaru, 1-0, 2025.01.04, isFinished true, end resigned |
| `https://www.chess.com/callback/live/game/1034198172` | 200 | `application/json` | null | type `chess`, 78 plies, navega vs BadBoyNick, 0-1, 2015.01.19, isFinished true, end checkmated |
| `https://www.chess.com/callback/live/game/184718495500` | 200 | `application/json` | null | type `chess`, 73 plies, amelbsvc vs cardnails, 1-0, 2026.10.02, isFinished true, end abandoned |
| `https://www.chess.com/callback/live/game/185013511419` | 200 | `application/json` | null | type `chess`, 0 plies, Nurali3012 vs GORA2012, 0-1, 2026.09.29, isFinished true, end timeout |
| `https://www.chess.com/callback/live/game/184659320776` | 200 | `application/json` | null | type `chess960`, 65 plies, PenguinChocolate vs LyagushkaEnjoier, 1-0, 2026.10.01, isFinished true, end checkmated |
| `https://www.chess.com/callback/live/game/184867110839` | 200 | `application/json` | null | type `bughouse`, 34 plies, 2468kaswer vs VelesovSumar, 0-1, 2026.09.28, isFinished true, end timeout, partnerGameId set |
| `https://www.chess.com/callback/live/game/174531660852` | 200 | `application/json` | null | type `oddschess`, 53 plies, TOHayes vs QuantumChess5000, 1-0, 2026.09.15, isFinished true, end resigned |
| `https://www.chess.com/callback/live/game/1859764312` | 404 | `application/json` | null | body `{"message":"Game is not found."}` |
| `https://www.chess.com/callback/live/game/184546110505` | 200 | `application/json` | null | type `bughouse`, 37 plies, ShadowKing71 vs 12teen, 0-1, 2026.09.24, isFinished true, end bughousepartnerlose, partnerGameId set |
| `https://www.chess.com/callback/live/game/285275822` | 200 | `application/json` | null | type `chess`, 61 plies, zvanizajebani vs EylonRozen, 1-0, 2012.04.22, isFinished true, end resigned (R2 overlap: differs from daily and computer 285275822) |
| `https://www.chess.com/callback/daily/game/285275822` | 200 | `application/json` | null | type `chess`, 37 plies, jebogaled vs rmstew, 1-0, 2020.11.03, isFinished true, end resigned |
| `https://www.chess.com/callback/daily/game/1000337106` | 200 | `application/json` | null | type `chess`, 144 plies, DanielRensch vs JaxonsFluids, 0-1, 2026.07.16, isFinished true, end checkmated |
| `https://www.chess.com/callback/daily/game/1020832882` | 200 | `application/json` | null | type `chess960`, 78 plies, erik vs NorwegianViking82, 1/2-1/2, 2026.08.28, isFinished true, end agreed |
| `https://www.chess.com/callback/daily/game/1034198172` | 200 | `application/json` | null | type `chess`, 5 plies, erik vs crkanoff, *, 2026.09.24, isFinished false (still in progress at recording; no endTime; differs from live 1034198172) |
| `https://www.chess.com/callback/daily/game/234150048` | 200 | `application/json` | null | type `chess`, 91 plies, Oleksandr30 vs Opus64, 1-0, 2019.08.10, isFinished true, end resigned |
| `https://www.chess.com/callback/daily/game/1859764312` | 404 | `application/json` | null | body `[]` |
| `https://www.chess.com/computer/callback/game/285275822` | 200 | `application/json` | null | type `chess`, 54 plies, anomen_s vs Aerial-Powers-BOT, 0-1, 2025.05.17, isFinished true, end checkmated, isVsComputer true |
| `https://www.chess.com/computer/callback/game/1859764312` | 200 | `application/json` | null | type `chess`, 68 plies, stl0420402042 vs Komodo15, 0-1, 2026.08.01, isFinished true, end checkmated, isVsComputer true |
| `https://www.chess.com/computer/callback/game/12345678` | 404 | `application/json` | null | body `{"error":"Game not found"}` |
| `https://api.chess.com/pub/player/hikaru/games/archives` | 200 | `application/json; charset=utf-8` | * | 154 months, newest 2026/10 |
| `https://api.chess.com/pub/player/hikaru/games/2025/01` | 200 | `application/json; charset=utf-8` | * | 20 games kept, original count 485 (truncated) (contains 129688175007) |
| `https://api.chess.com/pub/player/hikaru/games/2024/01` | 200 | `application/json; charset=utf-8` | * | 20 games kept, original count 1045 (truncated) (contains 97872578329) |
| `https://api.chess.com/pub/player/arystanner/games/archives` | 200 | `application/json; charset=utf-8` | * | 92 months, newest 2026/09 |
| `https://api.chess.com/pub/player/arystanner/games/2025/01` | 200 | `application/json; charset=utf-8` | * | 20 games kept, original count 165 (truncated) (contains 129688175007) |
| `https://api.chess.com/pub/player/danielrensch/games/archives` | 200 | `application/json; charset=utf-8` | * | 206 months, newest 2026/10 |
| `https://api.chess.com/pub/player/danielrensch/games/2026/10` | 200 | `application/json; charset=utf-8` | * | 1 games kept, original count 1 |
| `https://api.chess.com/pub/player/danielrensch/games/2026/09` | 200 | `application/json; charset=utf-8` | * | 13 games kept, original count 13 |
| `https://api.chess.com/pub/player/danielrensch/games/2026/08` | 200 | `application/json; charset=utf-8` | * | 19 games kept, original count 19 (contains daily 1000337106, the stop month) |
| `https://api.chess.com/pub/player/erik/games/2026/09` | 200 | `application/json; charset=utf-8` | * | 13 games kept, original count 13 |
| `https://api.chess.com/pub/player/anomen_s/games/2025/05` | 200 | `application/json; charset=utf-8` | * | 0 games kept, original count 0 |
| `https://api.chess.com/pub/player/2468kaswer/games/2026/09` | 200 | `application/json; charset=utf-8` | * | 17 games kept, original count 17 (7 bughouse entries, none has a pgn key) |
| `https://api.chess.com/pub/player/admdz_2015/games/2026/09` | 200 | `application/json; charset=utf-8` | * | 20 games kept, original count 68 (truncated) (contains 234150048, white AdmDz_2015 vs Coach-Magnus) |
| `https://api.chess.com/pub/player/tohayes/games/2026/09` | 200 | `application/json; charset=utf-8` | * | 20 games kept, original count 537 (truncated) (8 oddschess entries kept) |
| `https://api.chess.com/pub/player/gothamchess/games/2026/09` | 200 | `application/json; charset=utf-8` | * | 20 games kept, original count 464 (truncated) (kept games all contain a promotion) |
| `https://api.chess.com/pub/player/nonexistent_user_xyz_123/games/2026/09` | 404 | `application/json; charset=utf-8` | * | body `{"code":0,"message":"User \"nonexistent_user_xyz_123\" not found."}` |
| `https://api.chess.com/pub/player/erik/games` | 200 | `application/json; charset=utf-8` | * | 7 games kept, original count 7 (current daily games; contains 1034198172) |
| `https://lichess.org/game/export/4S1PZUvW?pgnInJson=true&clocks=true&evals=false&opening=true&accuracy=true` | 200 | `application/json` | * | variant `fromPosition`, status `mate`, source `position`, 13 plies, IQ_4U_Academy vs AI {"aiLevel":8} |
| `https://lichess.org/game/export/4pSpQGR7?pgnInJson=true&clocks=true&evals=false&opening=true&accuracy=true` | 200 | `application/json` | * | variant `standard`, status `started`, source `import`, 39 plies, White vs Black |
| `https://lichess.org/game/export/2vUNiLP8?pgnInJson=true&clocks=true&evals=false&opening=true&accuracy=true` | 200 | `application/json` | * | variant `chess960`, status `mate`, source `arena`, 97 plies, DrNykterstein vs Vladimirovich9000 |
| `https://lichess.org/game/export/6kcoXS0y?pgnInJson=true&clocks=true&evals=false&opening=true&accuracy=true` | 200 | `application/json` | * | variant `crazyhouse`, status `resign`, source `lobby`, 51 plies, PekkaBlunder vs blitzeur88 |
| `https://lichess.org/game/export/f3mYca1i?pgnInJson=true&clocks=true&evals=false&opening=true&accuracy=true` | 200 | `application/json` | * | variant `standard`, status `mate`, source `pool`, 199 plies, Chesskingoriginal vs arturchix |
| `https://lichess.org/game/export/zzzzzzzz?pgnInJson=true&clocks=true&evals=false&opening=true&accuracy=true` | 404 | `application/json` | null | body `{"error":"Not found"}` |
| `https://lichess.org/game/export/TJxUmbWK?pgnInJson=true&clocks=true&evals=false&opening=true&accuracy=true` | 200 | `application/json` | * | variant `standard`, status `resign`, source `arena`, 41 plies, arex vs JERC-12Jesus (finished standard game; used as the I-19 standard fixture) |

All 43 requests succeeded on the first try; nothing is "unverified today".

## Verified facts

- Live `129688175007`: `game.plyCount` 112, `game.moveList` has 224 characters and equals the `tcn` of the same game in `api.chess.com-month-hikaru-2025-01` byte for byte.
- 404 bodies: live `1859764312` `{"message":"Game is not found."}`; daily `1859764312` `[]`; computer `12345678` `{"error":"Game not found"}`; unknown user `{"code":0,"message":"User \"nonexistent_user_xyz_123\" not found."}`; lichess `zzzzzzzz` `{"error":"Not found"}` with no ACAO. All as Appendix A.3 states.
- Daily `1000337106` `moveList` starts `ow0Kfo!Tjr5QcjZRpx6Smu7Zbs84ecRJlt9zgmJB` (144 plies) and equals the archive `tcn` byte for byte; archive entry has `initial_setup` `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1` and `rules` `chess` .
- Hikaru 2024/01 entry `97872578329` has `tcn` starting `mCYIbs2U`, 101 plies.
- `www.chess.com/callback/*` and `/computer/callback/*` responses carry no ACAO; `api.chess.com/pub/*` and lichess 200 responses send `*`.

## Differences from Appendices A and F

- Lichess `f3mYca1i` is now finished (`status: "mate"`, 199 plies, `source: "pool"`); A.3 recorded it while `started`. Tests that need the ongoing rule must use `4pSpQGR7` (still `status: "started"`, 39 plies) or a hand-made fixture.
- Lichess `zzzzzzzz` 404 body is `{"error":"Not found"}` (JSON, no ACAO), consistent with A.3.
- Counts today: `2468kaswer` 2026/09 has 17 entries (7 bughouse, no `pgn`), `tohayes` 2026/09 has 537 (8 oddschess kept), `erik` current games lists 7 daily games including `1034198172`.
- Hikaru's archive list now ends at 2026/10 and danielrensch's at 2026/10 (1 game); the newest month containing daily `1000337106` is 2026/08.
- Daily `1034198172` was still in progress (isFinished false, 5 plies, no `endTime`) as A.3 says.
- No 403 "Archive crawl" or 429 was provoked or observed; those A.3/A.6 facts stay unverified today.
