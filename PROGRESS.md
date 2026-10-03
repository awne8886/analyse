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

## 2026-10-02 Gate 3 (integration)

```
$ npm run lint
> eslint .
exit 0
$ npm run format
Checking formatting...
All matched files use Prettier code style!
exit 0
$ npm run typecheck
> tsc -b
exit 0
$ npm test
   Duration  21.59s (environment 49%, tests 29%, setup 7%, transform 7%, import 6%, worker 1%)
exit 0
$ npm run build
dist/assets/index-CNdVSBcC.js                           995.64 kB │ gzip: 222.92 kB
✓ built in 1.14s
exit 0
$ grep -c coi-serviceworker dist/index.html
0
$ npm run build:pages
✓ built in 811ms
exit 0
$ grep -c coi-serviceworker dist-pages/index.html
1
$ R11 greps
stockfish-19-lite-single.js
stockfish-19-lite.js
2
0
0
$ grep -l /api/chesscom dist/assets/*.js | wc -l
1
$ ls src/test/fixtures/evals/
cc_daily_1000337106.json
cc_live_129688175007.json
li_4S1PZUvW.json
 Test Files  45 passed (45)
      Tests  1014 passed (1014)
$ PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test --project=chromium
[11/13] [chromium] › e2e/review.spec.ts:357:5 › mock engine › 360 px › R30: no horizontal scroll at 360 px on any screen
[12/13] [chromium] › e2e/review.spec.ts:376:5 › mock engine › G.5 screenshots › finished review at ply 40, desktop 1280x800 and mobile 390x844 @2x
[13/13] [chromium] › e2e/review.spec.ts:417:3 › real engine › the engine boots on the first analysis; WebKit loads lite-single only
  13 passed (40.3s)
```

- WebKit project: not runnable in this container (no WebKit build installed; `playwright install` is not allowed here, PLAN Assumption 5). It runs in `.github/workflows/ci.yml` (`npx playwright install --with-deps chromium webkit`). Recorded as CI-only.
- Eval tables recorded with the real engine (scripts/record-evals.mjs, stockfish 19 lite single under Node from a .cjs copy, MultiPV 2, Hash 32, go depth 16 movetime 2000): cc:live:129688175007 113 positions, cc:daily:1000337106 144 keys (145 positions, one repeated EPD), li:4S1PZUvW 14; ply counts cross-checked 112 / 144 = recorded plyCount / 13. Files are named with ':' replaced by '_'.
- Pinned R22 phase starts of cc:live:129688175007 (computed once by the merged implementation): middlegame board index **30**, endgame **76** (windows 18-40 and 50-112). Added to src/analysis/phases.test.ts.
- Explain snapshot over the three games: src/explain/snapshot.test.ts (3 snapshots written, stable on re-run).
- pages-coi flake fixed (PLAN Assumption 25): 5/5 runs green with engine-smoke concurrently on 2 workers (previously 4/11 failing).
- Screenshots: e2e/screenshots/review-desktop.png (1280x800), review-mobile.png (390x844 @2x).

## 2026-10-02 Phase 4 pre-review build record

```
$ ls -l dist/assets
total 1112
-rw-r--r-- 1 root root   3067 Oct  2 23:53 Calibration-ChWSzzpN.js
-rw-r--r-- 1 root root  19766 Oct  2 23:53 THIRD_PARTY_LICENSES-BRaxo8_2.js
-rw-r--r-- 1 root root  23195 Oct  2 23:53 index-CDCm0ZUi.css
-rw-r--r-- 1 root root 995707 Oct  2 23:53 index-DibWHfin.js
-rw-r--r-- 1 root root  20672 Oct  2 23:53 montserrat-latin-700-normal-BWkrl476.woff
-rw-r--r-- 1 root root  18824 Oct  2 23:53 montserrat-latin-700-normal-BdjcYUrC.woff2
-rw-r--r-- 1 root root  20660 Oct  2 23:53 montserrat-latin-800-normal-C3dfDxXV.woff
-rw-r--r-- 1 root root  19012 Oct  2 23:53 montserrat-latin-800-normal-axpkC1rd.woff2
$ cat dist/assets/*.js | gzip -c | wc -c
230041
```

## 2026-10-03 CI on GitHub Actions (WebKit evidence)

- Run 8 (https://github.com/awne8886/analyse/actions/runs/37080644235) on 3d9e663: conclusion **success** — `checks` (lint, format, typecheck, `npm test -- --coverage`, both builds and coi greps) and `e2e` (26 tests: Chromium 153 and WebKit 26.6, including engine-smoke and pages-coi in WebKit).
- Earlier runs on the same PR failed and were fixed: Retry drag during the step-back animation (Chrome 153), WebKit engine stuck at "loading 100%" with the download-progress port (PLAN Assumption 27), WebKit Pages first visit needing a third document (PLAN Assumption 28; diagnostics `[{isolated:false,controlled:false},{isolated:false,controlled:true},{isolated:true,controlled:true}]`).

## 2026-10-03 Final gates (section 5.2) on the integration branch

```
$ npm ci
61 packages are looking for funding
  run `npm fund` for details
found 0 vulnerabilities
exit 0
$ npm run lint
> analyse@1.0.0 lint
> eslint .
exit 0
$ npm run format
Checking formatting...
All matched files use Prettier code style!
exit 0
$ npm run typecheck
> analyse@1.0.0 typecheck
> tsc -b
exit 0
$ npm test 2>&1 | grep -E 'Test Files|Tests |Errors'
 Test Files  57 passed (57)
      Tests  1150 passed (1150)
exit 0
$ npm run build
dist/assets/index-Bft0LHdU.js                           1,002.50 kB │ gzip: 225.40 kB
✓ built in 1.15s
exit 0
$ npm run build:pages
dist-pages/assets/index-Bpz6KFBW.js                           1,002.81 kB │ gzip: 225.49 kB
✓ built in 800ms
exit 0
$ PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test --project=chromium
  ✓  15 [chromium] › e2e/review.spec.ts:455:3 › real engine › the engine boots on the first analysis; WebKit loads lite-single only (1.7s)
  15 passed (51.6s)
exit 0
(WebKit project: CI only, see PLAN Assumption 5)
$ test -f e2e/screenshots/review-desktop.png
exit 0
$ test -f e2e/screenshots/review-mobile.png
exit 0
$ node scripts/vendor-engine.mjs --check
stockfish-19-lite-single.js: 21415 bytes
stockfish-19-lite-single.wasm: 1787571 bytes
stockfish-19-lite.js: 32817 bytes
stockfish-19-lite.wasm: 1636291 bytes
Copying.txt: 35821 bytes
OK
exit 0
$ grep -q coepdegrade public/coi-serviceworker.min.js
exit 0
$ node -e "const y=require('js-yaml');for(const f of ['ci','pages'])y.load(require('fs').readFileSync('.github/workflows/'+f+'.yml','utf8'));console.log('yaml ok')"
yaml ok
exit 0
```

- `gh run list --workflow ci.yml --limit 1`: the `gh` CLI is not available for this in the session; the GitHub Actions runs are read through the GitHub API instead and recorded below after the final push.
- `git push origin main`: not done by design. The session may push only `claude/chess-review-website-y8cb15` (PLAN Assumption 1); everything is on that branch and in draft PR awne8886/analyse#2 into `main`.
- WebKit project: runs in CI only (PLAN Assumption 5).

### Definition of done (section 5.3) mapping

| Item | Evidence |
|---|---|
| 1 | e2e `DoD 1` (Chromium local, Chromium + WebKit CI); integration test `cc:live:129688175007 (DoD 1)` |
| 2 | e2e `DoD 2`; integration test `cc:daily:1000337106 (DoD 2)` |
| 3 | e2e `DoD 3` |
| 4 | e2e `Pages build › DoD 4` |
| 5 | e2e `DoD 5`; integration test `li:4S1PZUvW (DoD 5)` |
| 6 | unit: 19 classification fixtures + B.6 accuracy (`src/analysis/classify.test.ts`, `accuracy.test.ts`), TCN, URL, UCI, detector and string-table tests (1150 unit tests green) |
| 7 | e2e `DoD 7` |
| 8 | e2e `DoD 8` |
| 9 | e2e `DoD 9` (real engine, mock off: workersCreated 0, uciSent 0) |
| 10 | `e2e/engine-smoke.spec.ts` and the WebKit `afterEach` request check in `e2e/review.spec.ts`, green in CI WebKit 26.6 |
| 11 | `e2e/screenshots/review-desktop.png`, `review-mobile.png`; `e2e/pages-coi.spec.ts` green in Chromium and WebKit (CI); the no-service-worker 3 s fallback is manual (Appendix I) |
| 12 | README.md, DEPLOY.md, CLAUDE.md, PLAN.md, PROGRESS.md, THIRD_PARTY_LICENSES.md, LICENSE present; Appendix I outcomes below; branch clean |

### Appendix I outcomes

| Item | Outcome |
|---|---|
| Vercel/AWS egress accepted by chess.com's Cloudflare over time | needs the first deploy: DEPLOY.md risk 1 curl checks (record there) |
| Vercel serves `.wasm` as `application/wasm` | needs the first deploy: DEPLOY.md risk 4 curl |
| Vercel echoes COOP/COEP on 304 | needs the first deploy: DEPLOY.md risk 13 ("Known host behaviours") |
| Actions-published Pages serves `.wasm` as `application/wasm` | needs the first deploy: DEPLOY.md post-deploy curl |
| `"framework": "vite"` slug | key omitted as specified; needs the first deploy (add only if auto-detection fails) |
| lite-single wasm vs WebKit bug 304810 on iOS 26.2-26.6 | unknown; manual iPhone checklist in DEPLOY.md; auto-resume (E-3) covered by `e2e/resume.spec.ts` |
| Real iPhone and Android nps | unmeasured; runtime calibration decides the tier |
| `eslint-plugin-react-refresh` `configs.vite` | verified: exists (0.5.7), lint passes with it |
| `openings.json` key count | verified: 3,815 rows, 3,815 keys |
| chess.com variants platform URLs | unknown URL form; rejected as unrecognised by the parser; follow-up in PLAN |
| TCN drop-character mapping | not needed: any drop ply is rejected (I-13), tested |
| Lichess `Retry-After` on 429 | none observed (no 429 provoked on 2026-10-02); fixed 60 s wait implemented and unit-tested |
| Private browsing without `navigator.serviceWorker` | untestable in Playwright; the 3 s fallback is implemented (src/main.tsx, unit-tested via src/ui/main.test.ts); manual check in a private window |
| Safari background-tab throttling on iOS | likely; E-8b hint shown on phones; manual iPhone checklist |
| `ffmpeg` availability | verified: present; 9 mp3 files transcoded |
| Network for the Phase 1 probes | verified: 43 endpoints recorded on the first try (f3mYca1i had finished; frozen in-progress copy derived) |
| Callback endpoints through a proxy vs the API terms | unverified (not covered by the published terms); README "Terms" paragraph and PLAN Assumption 11 |
| `anthropic-dangerous-direct-browser-access` header | unverified: Phase 6 ("Ask AI") not built |
| Kaneo trade-dress exposure | no legal opinion; README Known limitations and the `defaultPieceSet` switch |
| `.claude/settings.json` honoured for worktree spawns | verified: every worktree agent started at the lead's HEAD |
| `"type": "module"` and the dev-dependency row of 3.1 | verified at Gate 0 (lint, typecheck, build, vitest) |

Found during the build and recorded (not in Appendix I): WebKit 26.6 needs a third document on the Pages first visit (PLAN Assumption 28); WebKit stalls with the loader's download-progress port (Assumption 27).
