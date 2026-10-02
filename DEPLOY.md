# Deploying Analyse

Analyse is a static site with one small serverless function. It deploys to two hosts from the same code:

| Host | URL | Chess.com links | Engine |
|---|---|---|---|
| Vercel (Hobby, personal project) | `https://<project-name>.vercel.app` | pasted links work (the `api/chesscom.ts` proxy) | multi-core in Chromium and Firefox (real COOP/COEP headers), single-core elsewhere |
| GitHub Pages | `https://awne8886.github.io/analyse/` | needs a player's username (public API), or paste the PGN | multi-core after one automatic reload (coi service worker), single-core elsewhere |

## Try it (2 minutes)

1. Open a finished game on chess.com.
2. Copy the address from the browser bar. It contains `/game/live/`, `/game/daily/` or `/game/computer/`.
3. Paste it into the box on the Analyse page and press **Analyse**.

Lichess links (`lichess.org/AbCd1234`) and a pasted PGN work the same way on both hosts.

- **First visit on GitHub Pages reloads once.** The page shows "Enabling multi-core analysis…" and reloads itself within about half a second; this installs the service worker that makes multi-core analysis possible. Later visits do not reload. If the service worker is blocked (some private-browsing modes), the page continues in single-core mode after 3 seconds.
- **Link import needs a username on GitHub Pages.** A static host cannot run the proxy, so after you paste a chess.com link the page asks for the chess.com username of either player and finds the game in that player's public archive. Bot games are not in the public archive: paste their PGN instead.

## Vercel

1. In Vercel, **Add New... > Project**, import this GitHub repository as a **Hobby** personal project.
2. Framework preset: auto-detected as **Vite** (`vercel.json` deliberately omits `framework`; add `"framework": "vite"` only if auto-detection fails). Build command `npm run build`, output directory `dist` (both come from `vercel.json`).
3. Environment variables: **none are required**.
   - `VITE_PROXY_URL` (optional) overrides the proxy path (default `/api/chesscom`).
   - `CONTACT_EMAIL` (optional) appends a contact address to the User-Agent the proxy function sends to chess.com.
4. Deploy. Every push to the production branch redeploys.

`vercel.json` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on every response, `Cache-Control: public, max-age=31536000, immutable` under `/engine/`, CORS on `/api/*`, and the external rewrite `/api/cc-rewrite/<live|daily>/<id>` that the client uses when the function is blocked.

## GitHub Pages

1. Repository **Settings > Pages > Build and deployment > Source = GitHub Actions** (once).
2. Push to `main`. The workflow `.github/workflows/pages.yml` builds with `VITE_DEPLOY_TARGET=pages` and takes the base path from `actions/configure-pages` (`/analyse/` for this repository).
3. The site appears at `https://awne8886.github.io/analyse/`.

The very first run of the workflow fails with **"Get Pages site failed"** if step 1 was not done yet. Set the Source to GitHub Actions, then open the **Actions** tab, select the failed "Deploy to GitHub Pages" run and press **Re-run jobs**.

## Local checks (run before pushing)

```sh
npm ci
node scripts/vendor-engine.mjs --check        # prints the five engine file sizes and OK
grep -q coepdegrade public/coi-serviceworker.min.js && echo coi ok
npm run build && grep -c coi-serviceworker dist/index.html             # 0 (Vercel build)
npm run build:pages && grep -c coi-serviceworker dist-pages/index.html # 1 (Pages build)
grep -l '/api/chesscom' dist/assets/*.js | wc -l                       # at least 1
npx playwright test                                                    # e2e (Chromium and WebKit)
```

## Post-deploy checks (needs the first deploy; record the output below)

Replace `<app>` with the Vercel project name. Use a browser User-Agent: chess.com's Cloudflare challenges `curl`'s own.

```sh
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
```

Risk 1, the proxy chain:

```sh
curl -sS -A "$UA" -D - -o /dev/null "https://<app>.vercel.app/api/chesscom?kind=live&id=129688175007"
# expected: HTTP/2 200 and content-type: application/json
curl -sS -A "$UA" -D - -o /dev/null "https://<app>.vercel.app/api/cc-rewrite/live/129688175007"
# expected: HTTP/2 200 and content-type: application/json
curl -sS -A "$UA" "https://<app>.vercel.app/api/chesscom?kind=live&id=1859764312"
# expected: status 404, body {"message":"Game is not found."}
curl -sS -A "$UA" "https://<app>.vercel.app/api/chesscom?kind=daily&id=285275822" | grep -o '"White":"[^"]*"'
# expected: "White":"jebogaled"
curl -sS -A "$UA" "https://<app>.vercel.app/api/chesscom?kind=computer&id=285275822" | grep -o '"White":"[^"]*"'
# expected: "White":"anomen_s"
```

Risk 4, isolation headers and the wasm MIME type:

```sh
curl -sS -I "https://<app>.vercel.app/"
# expected: cross-origin-opener-policy: same-origin and cross-origin-embedder-policy: require-corp
curl -sS -I "https://<app>.vercel.app/engine/sf19/stockfish-19-lite-single.wasm"
# expected: content-type: application/wasm and cache-control: public, max-age=31536000, immutable
curl -sS -I "https://awne8886.github.io/analyse/engine/sf19/stockfish-19-lite-single.wasm"
# expected: content-type: application/wasm (Pages sends cache-control: max-age=600)
```

Risk 13, COEP on 304 responses (WebKit refuses a pthread sub-worker answered by a 304 without COEP):

```sh
curl -sS -D - -o /dev/null "https://<app>.vercel.app/engine/sf19/stockfish-19-lite.js"
# record cache-control and etag
curl -sS -D - -o /dev/null -H 'If-None-Match: <etag from above>' "https://<app>.vercel.app/engine/sf19/stockfish-19-lite.js"
# record whether the 304 carries cross-origin-embedder-policy
```

### Known host behaviours

Needs the first deploy. Record here: the four risk 1 outputs (and the date and Vercel region), the risk 4 headers on both hosts, the risk 13 result (whether a 304 carries COEP), and whether the `"framework"` key was needed.

## Manual iPhone checklist

Automated tests cannot cover these (WebKit on iOS differs from Playwright's WebKit):

1. On an iPhone with iOS 26.2 or newer, open a game of about 40 moves (80 plies) on both hosts and keep the tab in the foreground. Confirm the tab is not reloaded during analysis (WebKit bug 304810; the engine is the single-threaded build). If it is reloaded, confirm the analysis resumes with the message "Analysis was interrupted (your device ran out of memory). Resuming from move {n} in fast mode."
2. Confirm the engine badge reads "Single-core mode" (iOS never gets the multi-core build).
3. Put the tab in the background for 30 s during analysis, return, and confirm the analysis continues (the hint "Keep this tab in the foreground while analysing." is shown on phones).
4. On GitHub Pages, confirm the first visit reloads once and later visits do not.
5. Open the same page in a private window and confirm it continues in single-core mode after 3 seconds if the service worker is unavailable.
6. Check the page at 360 to 430 px width: no horizontal scrolling, board full width, eval bar as a horizontal strip.
