# Deploying Analyse

Analyse is a static site with one small serverless function. It deploys to two hosts from the same code:

| Host | URL | Chess.com links | Engine |
|---|---|---|---|
| Vercel (Hobby, personal project) | `https://<project-name>.vercel.app` | pasted links work (the `api/chesscom.ts` proxy) | multi-core in Chromium and Firefox (real COOP/COEP headers), single-core elsewhere |
| GitHub Pages | `https://awne8886.github.io/analyse/` | needs a player's username (public API), or paste the PGN | multi-core in Chromium and Firefox after one automatic reload (coi service worker), single-core elsewhere |

Contents: [Try it](#try-it-2-minutes) | [Vercel](#vercel) | [GitHub Pages](#github-pages) | [Local checks](#local-checks-run-before-pushing) | [Post-deploy checks](#post-deploy-checks-all-need-the-first-deploy) | [Known host behaviours](#known-host-behaviours) | [Items that need the first deploy](#items-that-need-the-first-deploy) | [Manual iPhone checklist](#manual-iphone-checklist)

## Try it (2 minutes)

1. Open a finished game on chess.com.
2. Copy the address from the browser bar. It contains `/game/live/`, `/game/daily/` or `/game/computer/`.
3. Paste it into the box on the Analyse page and press **Analyse**.

Lichess links (`lichess.org/AbCd1234`) and a pasted PGN work the same way on both hosts. The review appears move by move while the engine works; reopening the same game later is instant because the review is kept in your browser.

- **First visit on GitHub Pages reloads.** The page shows "Enabling multi-core analysis…" and reloads itself within about half a second; this installs the service worker that makes multi-core analysis possible. In Chromium and Firefox that is one reload. In WebKit (Safari, and every browser on iOS) the first visit reloads twice (PLAN.md Assumption 28: the controlled page is not isolated until the service worker's `coepdegrade` reload). The `?game=` part of the address is kept across the reloads. Later visits do not reload. If the service worker is blocked (some private-browsing modes), the page continues in single-core mode after 3 seconds.
- **Link import needs a username on GitHub Pages.** A static host cannot run the proxy, so after you paste a chess.com link the page asks for the chess.com username of either player and finds the game in that player's public archive. Bot games are not in the public archive: paste their PGN instead. (On Vercel no username is needed.)

## Vercel

1. In Vercel, **Add New... > Project**, import this GitHub repository as a **Hobby** (personal) project. Hobby is for non-commercial use and personal repositories only.
2. Framework preset: auto-detected as **Vite** (`vercel.json` deliberately omits `framework`; add `"framework": "vite"` only if auto-detection fails, and record that below). Build command `npm run build`, output directory `dist` (both come from `vercel.json`).
3. Environment variables: **none are required**.
   - `VITE_PROXY_URL` (optional, build time) overrides the proxy path (default `/api/chesscom`).
   - `CONTACT_EMAIL` (optional, runtime) appends a contact address to the User-Agent the proxy function sends to chess.com (default `contact: GitHub issues`).
4. Deploy. Every push to the production branch redeploys. The site is at `https://<project-name>.vercel.app`.

`vercel.json` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on every response, `Cache-Control: public, max-age=31536000, immutable` under `/engine/`, CORS on `/api/*`, and the external rewrite `/api/cc-rewrite/<live|daily>/<id>` that the client uses when the function is blocked. Only `api/chesscom.ts` is deployed as a function (`.vercelignore` excludes its test file).

## GitHub Pages

1. Repository **Settings > Pages > Build and deployment > Source = GitHub Actions** (once).
2. Push to `main`. The workflow `.github/workflows/pages.yml` builds with `VITE_DEPLOY_TARGET=pages` and takes the base path from `actions/configure-pages` (`/analyse/` for this repository), then publishes `dist/`.
3. The site appears at `https://awne8886.github.io/analyse/`.

The very first run of the workflow fails with **"Get Pages site failed"** if step 1 was not done yet. Set the Source to GitHub Actions, then open the **Actions** tab, select the failed "Deploy to GitHub Pages" run and press **Re-run jobs** (or push again, or use **Run workflow**).

The Pages build injects the vendored `public/coi-serviceworker.min.js` (sha256 pinned below) so the page can become cross-origin isolated without server headers. The Vercel build never contains it.

## Local checks (run before pushing)

```sh
npm ci
node scripts/vendor-engine.mjs --check          # prints the five engine file sizes, then OK
sha256sum public/coi-serviceworker.min.js       # expected: 166cb9395cd1f7e5790f22eefa2b3b966cc0fa7215f18174453fecbd6f3cab5d
grep -q coepdegrade public/coi-serviceworker.min.js && echo coi ok
npm run build                                   # Vercel build -> dist/
npm run build:pages                             # GitHub Pages build -> dist-pages/ (base /analyse/)
grep -c coi-serviceworker dist*/index.html      # expected: dist/index.html:0 and dist-pages/index.html:1
grep -l '/api/chesscom' dist/assets/*.js | wc -l   # at least 1 (the proxy is enabled in the Vercel build)
npm run lint && npm run format && npm run typecheck && npm test
npx playwright test                             # e2e (Chromium and WebKit; mock engine, network blocked)
```

The `dist/index.html:0` line is expected (the Vercel build has no service worker). Run on a single file, `grep -c` exits with status 1 when the count is 0; that is not an error here. The workflow itself builds into `dist/`; `build:pages` writes `dist-pages/` only so that both builds can coexist for the e2e suite. WebKit needs `npx playwright install webkit`; on a machine with a preinstalled Chromium of another revision, set `PW_CHROMIUM_PATH=/path/to/chrome` to run only the Chromium project.

## Post-deploy checks (all need the first deploy)

Replace `<app>` with the Vercel project name. Use a browser User-Agent: chess.com's Cloudflare challenges `curl`'s own. Run these once after the first deploy and paste the output under each heading in [Known host behaviours](#known-host-behaviours).

```sh
APP=https://<app>.vercel.app
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
```

### Risk 1: the proxy chain (four checks to record)

```sh
# 1a. the function
curl -sS -A "$UA" -D - -o /dev/null "$APP/api/chesscom?kind=live&id=129688175007"
# expected: HTTP/2 200 and content-type: application/json

# 1b. the external rewrite (the client's fallback when the function is blocked)
curl -sS -A "$UA" -D - -o /dev/null "$APP/api/cc-rewrite/live/129688175007"
# expected: HTTP/2 200 and content-type: application/json

# 1c. a missing game passes the upstream 404 through unchanged
curl -sS -A "$UA" -w '\nHTTP %{http_code}\n' "$APP/api/chesscom?kind=live&id=1859764312"
# expected: {"message":"Game is not found."} then HTTP 404

# 1d. daily and computer ids overlap numerically but are different games
curl -sS -A "$UA" "$APP/api/chesscom?kind=daily&id=285275822" | grep -o '"White": *"[^"]*"'
curl -sS -A "$UA" "$APP/api/chesscom?kind=computer&id=285275822" | grep -o '"White": *"[^"]*"'
# expected: "White":"jebogaled" for daily, then "White":"anomen_s" for computer (two different values)
```

If 1a answers `503 {"error":"upstream_blocked"}`, chess.com's firewall is refusing the host; the app then falls back to 1b, to the username path and to PGN paste (see README "Known limitations").

### Risk 4: isolation headers and the wasm MIME type

```sh
curl -sS -I "$APP/" | grep -i '^cross-origin'
# expected: cross-origin-opener-policy: same-origin and cross-origin-embedder-policy: require-corp

curl -sS -I "$APP/engine/sf19/stockfish-19-lite-single.wasm" | grep -i '^\(content-type\|cache-control\|cross-origin\)'
# expected: content-type: application/wasm and cache-control: public, max-age=31536000, immutable

curl -sS -I "https://awne8886.github.io/analyse/engine/sf19/stockfish-19-lite-single.wasm" | grep -i '^\(content-type\|cache-control\|access-control\)'
# expected: content-type: application/wasm (Pages sends cache-control: max-age=600 and access-control-allow-origin: *)
```

A wrong `.wasm` content type (stockfish.js issue #108) makes the engine fail to compile; the app then shows the E-2 "engine couldn't start" message with a Retry button.

The Pages isolation itself is covered by `npx playwright test e2e/pages-coi.spec.ts` (Chromium and WebKit against a preview of `dist-pages/`). To check the live site, open `https://awne8886.github.io/analyse/` in Chrome, reload once, and run `crossOriginIsolated` in the console: it must print `true`, and the engine badge reads "Multi-core: n threads".

### Risk 13: COEP on 304 responses

WebKit refuses an Emscripten pthread sub-worker when the engine script is re-fetched and answered with a `304 Not Modified` that lacks COEP. Two mitigations are built in (versioned path with `immutable` caching, so there is normally no revalidation; and no multi-threaded build on WebKit at all). Whether Vercel echoes the `vercel.json` headers on a 304 is unverified; record the answer.

```sh
curl -sS -D - -o /dev/null "$APP/engine/sf19/stockfish-19-lite.js"
# record: cache-control (expected public, max-age=31536000, immutable) and etag

ETAG=$(curl -sSI "$APP/engine/sf19/stockfish-19-lite.js" | awk -F': ' 'tolower($1)=="etag"{print $2}' | tr -d '\r')
curl -sS -D - -o /dev/null -H "If-None-Match: $ETAG" "$APP/engine/sf19/stockfish-19-lite.js"
# record: the status (304 expected) and whether it carries cross-origin-embedder-policy
```

## Known host behaviours

Needs the first deploy. Fill in each block after the first deploy (date, host, and for Vercel the function region, expected `iad1`). Leave "not run" until it has been run.

**Deploy record**

| Field | Value |
|---|---|
| Date | not run |
| Vercel URL | not run |
| Vercel function region | not run |
| Was `"framework": "vite"` needed in `vercel.json`? | not run (expected: no) |
| Commit deployed | not run |

**Risk 1 (four outputs)**

```text
1a (function, expected 200 application/json):            not run
1b (rewrite, expected 200 application/json):             not run
1c (404 body, expected {"message":"Game is not found."}): not run
1d (daily vs computer White, expected jebogaled / anomen_s): not run
```

**Risk 4 (isolation headers and wasm)**

```text
Vercel / (COOP + COEP):                                  not run
Vercel stockfish-19-lite-single.wasm (type, cache):      not run
GitHub Pages stockfish-19-lite-single.wasm (type, cache): not run
Pages crossOriginIsolated after the reload (Chrome):     not run
```

**Risk 13 (304 header check)**

```text
cache-control on stockfish-19-lite.js:                   not run
etag:                                                    not run
status of the If-None-Match request:                     not run
304 carries cross-origin-embedder-policy (yes / no):     not run
```

If the 304 carries no COEP, nothing breaks by itself: the multi-threaded build is never used on WebKit, and `immutable` caching avoids revalidation. Record it anyway; a "no" is the reason these two mitigations are mandatory.

## Items that need the first deploy

Each of these is open until the check below has been run against a real deployment (the status is as of 2026-10-02).

| Item | Status | Check after the first deploy |
|---|---|---|
| Chess.com's Cloudflare keeps accepting Vercel/AWS egress | needs the first deploy: verified for one day from `iad1`, unknown long-term | Risk 1 checks 1a to 1d; repeat them occasionally. The username and PGN paths are the fallback. |
| Vercel serves the static `.wasm` as `application/wasm` | needs the first deploy: verified only on a third-party Vercel Stockfish site | Risk 4, second command |
| Vercel echoes COOP/COEP on 304 responses | needs the first deploy: unknown | Risk 13 |
| Actions-published GitHub Pages serves `.wasm` as `application/wasm` | needs the first deploy: verified only on branch-published Pages sites (same CDN) | Risk 4, third command |
| `"framework": "vite"` slug in `vercel.json` | needs the first deploy: the key is omitted | If Vercel does not detect Vite, add `"framework": "vite"` to `vercel.json`, redeploy and record it in the deploy record |
| `stockfish-19-lite-single.wasm` and WebKit bug 304810 on iOS 26.2 to 26.6 | needs the first deploy and a real iPhone: no reports either way | Manual iPhone checklist, item 1 |
| Real iPhone and Android engine speed (nps) | needs the first deploy and real devices: unmeasured | Checklist item 2: the badge shows "Fast mode (depth 14)" when the runtime calibration puts the device below 300,000 nps; no speed is promised |
| Safari background-tab throttling during a 30 to 60 s analysis on iOS | needs the first deploy and a real iPhone: likely suspends | Checklist item 4 |
| Private-browsing modes without `navigator.serviceWorker` | needs the first deploy on Pages: untestable in Playwright | Checklist item 6 (the 3 second fallback) |

## Manual iPhone checklist

Automated tests cannot cover these (WebKit on iOS differs from Playwright's WebKit). Run them on a real iPhone against both deployed hosts and record the iOS version and result of each item.

1. **Tab survives analysis (WebKit bug 304810).** On an iPhone running iOS 26.2 or newer, open a game of about 40 moves (80 plies) and keep the tab in the foreground. Confirm the tab is not reloaded during analysis. The engine is the single-threaded build. If the tab is reloaded, go to item 3.
2. **Engine badge.** Confirm the badge reads "Single-core mode" (iOS never gets the multi-core build), or "Fast mode (depth 14)" if the device calibrated slowly.
3. **Resume (E-3).** While a game of about 40 moves is analysing, reload the tab by hand after move 15 or so (or let iOS do it). Confirm the page shows "Analysis was interrupted (your device ran out of memory). Resuming from move {n} in fast mode." with the move number you reached (not move 1), and that the analysis finishes without starting over. Reopening the finished game afterwards must show the review at once without starting the engine.
4. **Backgrounding.** Put the tab in the background for 30 s during analysis, return, and confirm the analysis continues or resumes (the hint "Keep this tab in the foreground while analysing." is shown on phones).
5. **Pages first visit.** On GitHub Pages, confirm the first visit reloads (twice on Safari is expected) and ends on the same `?game=` address, and that later visits do not reload.
6. **Private window.** Open the Pages site in a private window and confirm it continues in single-core mode after 3 seconds if the service worker is unavailable.
7. **Layout.** Check the page at 360 to 430 px width: no horizontal scrolling, board full width, eval bar as a horizontal strip.
8. **Engine download progress.** On WebKit the engine shows "Engine: loading" without a percentage (PLAN.md Assumption 27); confirm it still becomes ready within a few seconds on Wi-Fi.
