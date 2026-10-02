# PROGRESS

Gate evidence, newest last. Dates are UTC.

## 2026-10-02 Gate 1 (vendor + scouts)

```
$ node scripts/vendor-engine.mjs --check
stockfish-19-lite-single.js: 21415 bytes
stockfish-19-lite-single.wasm: 1787571 bytes
stockfish-19-lite.js: 32817 bytes
stockfish-19-lite.wasm: 1636291 bytes
Copying.txt: 35821 bytes
OK
exit 0
$ sha256sum public/coi-serviceworker.min.js
166cb9395cd1f7e5790f22eefa2b3b966cc0fa7215f18174453fecbd6f3cab5d  public/coi-serviceworker.min.js
$ grep -q coepdegrade public/coi-serviceworker.min.js
exit 0
$ ls public/pieces/kaneo | wc -l; ls public/pieces/cburnett | wc -l; grep -L 'width="50mm"' public/pieces/kaneo/*.svg | wc -l
12
12
12
$ ls public/sounds
brilliant.mp3 capture.mp3 castle.mp3 check.mp3 game-end.mp3 illegal.mp3 move.mp3 notify.mp3 promote.mp3 
$ openings keys
3815
$ docs/research
apis.md
packages.md
spec-gaps.md
$ network fixtures
44
montserrat-OFL ok
Copying.txt ok
1
7
```

Engine smoke under Node (vendor-assets, run from a .cjs copy because the repo is "type": "module"): `id name Stockfish 19 Lite WASM`; `info depth 12 seldepth 14 multipv 1 score cp 31 nodes 12743 nps 231690 ... pv e2e4 c7c5`; `bestmove e2e4 ponder c7c5` (a second run: nps 146471).
Openings: 3,815 rows parsed, 3,815 keys written (no EPD collisions), 507,306 B (B.8 estimated 250-300 kB).
Network (Appendix I 'Network availability for the Phase 1 probes'): reachable; scout-apis recorded 43 endpoints on the first try, nothing written by hand. Differences from Appendix A: lichess f3mYca1i had finished (mate, 199 plies) by 2026-10-02; the I-20 fixture is a derived frozen 'started' copy (see the commit message). 403 'Blocked:' and 429 bodies were not provoked (unverified today).
ffmpeg (Appendix I): available (/usr/bin/ffmpeg); 9 mp3 written.
react-refresh configs.vite (Appendix I): exists (scout-packages + Gate 0 lint).
openings key count (Appendix I): 3815.
LICENSE: GPL text from line 10 is byte-identical to public/engine/sf19/Copying.txt (cmp).

## 2026-10-02 Gate 0 (scaffold + red tests)

```
$ npm run lint
> analyse@1.0.0 lint
> eslint .
exit 0
$ npm run typecheck
> analyse@1.0.0 typecheck
> tsc -b
exit 0
$ npm run build
dist/assets/index-DL0bCbGL.css                           10.96 kB │ gzip:  2.96 kB
dist/assets/index-4gNk-4dK.js                           219.85 kB │ gzip: 68.70 kB
✓ built in 450ms
exit 0
$ npx vitest run --reporter=dot
      Tests  735 failed (735)
   Start at  22:57:20
   Duration  10.06s (environment 71%, setup 13%, transform 8%, tests 5%, import 2%, worker 1%)
$ cat .claude/settings.json
{ "worktree": { "baseRef": "head" } }
```

Failure classification (vitest JSON reporter): 19 test files, 735 tests, all red: 649 with "Error: not implemented" (stubs), 86 snapshot/table mismatches against the stub tables (src/ui/strings.test.ts 85, src/import/errors.test.ts 1). No other failure kind. Note: the recorded network fixtures already existed (Phase 1 overlapped, PLAN Assumption 14), so no test failed for a missing fixture file.
