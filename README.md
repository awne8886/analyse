# Analyse

A chess.com-style Game Review website. Paste a chess.com or lichess game link, or a PGN, and Analyse runs Stockfish 19 in your browser to label every move (Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder, Forced), compute an accuracy and an estimated game rating for each side, grade the opening, middlegame and endgame, pick the key moments and explain each move in plain words. The analysis runs on your device; the only network requests fetch the game itself.

It is a static site (Vite, React, TypeScript) with one small serverless function for chess.com links, deployed to Vercel and to GitHub Pages. See [DEPLOY.md](DEPLOY.md).

## How to use

1. Open a finished game on chess.com.
2. Copy the address from the browser bar. It contains `/game/live/`, `/game/daily/` or `/game/computer/`.
3. Paste it into the box and press **Analyse**.

Lichess links (`lichess.org/AbCd1234`) and a pasted or dropped PGN work too. On the GitHub Pages build a chess.com link also needs the chess.com username of either player (the static host has no proxy, so the game is found in that player's public archive). The first visit to the GitHub Pages build reloads the page once to enable multi-core analysis.

Reviews are kept in your browser (IndexedDB), so reopening a reviewed game is instant. Share links have the form `?game=cc:live:<id>&ply=<n>`.

## Browser support

Safari / iOS 16.4+, Chrome 91+, Firefox 89+, Edge 91+ (WebAssembly SIMD is required). Chromium and Firefox use the multi-threaded engine when the page is cross-origin isolated; Safari, iOS and every phone use the single-threaded build.

## What "chess.com-style" means

The move labels use chess.com's published expected-points bands, and the accuracy formula was calibrated against chess.com's own reported accuracies: on 122 chess.com games (244 game sides, 8,933 plies) analysed with Stockfish 19 lite single-threaded at MultiPV 2, depth 16 and a 2 s cap, the shipped accuracy has a mean absolute error of 4.06 points (bias +0.02) against chess.com's numbers; the plain lichess formula has 7.91. With the "Great move" exclusions, Great fires on 1.5 to 2.5 % of moves (4 to 6 % without them).

It does **not** mean identical to chess.com. Chess.com's engine, depth and exact rules are not public, so individual labels and accuracies can differ, and a single game can differ by more than the average.

> Labels follow chess.com's published expected-points bands; accuracy was calibrated to within about 4 points (mean absolute error) of chess.com's on 244 game sides. Results are an approximation, not chess.com's numbers.

The calibration was measured at depth 16. The "Deep" profile (depth 20) searches further, which changes evaluation noise, so it is an option, not the default.

## Running it locally

Requires Node 24.

```sh
npm ci
npm run dev            # http://localhost:5173
npm test               # unit tests (vitest)
npx playwright test    # e2e tests (Chromium and WebKit; mock engine, network mocked)
npm run build          # Vercel build -> dist/
npm run build:pages    # GitHub Pages build -> dist-pages/ (base /analyse/)
npm run lint && npm run format && npm run typecheck
```

On a machine with a preinstalled Chromium of another revision, set `PW_CHROMIUM_PATH=/path/to/chrome` to run the Chromium e2e project without `playwright install`.

### Engine update step

The Stockfish 19 lite builds (stockfish.js v19.0.0) are committed under `public/engine/sf19/` and are never imported through Vite. To update or restore them:

```sh
npm install --no-save stockfish@19.0.0   # optional; otherwise the GitHub release assets are downloaded
node scripts/vendor-engine.mjs           # copies the four engine files and Copying.txt
node scripts/vendor-engine.mjs --check   # verifies the exact byte sizes; prints OK
```

### Mock-engine eval tables

The e2e suite answers engine requests from recorded tables in `src/test/fixtures/evals/` (one file per fixture game, `cc_live_129688175007.json`, `cc_daily_1000337106.json`, `li_4S1PZUvW.json`). `npm run record-evals` re-records them with the vendored engine under Node (MultiPV 2, Hash 32, `go depth 16 movetime 2000`; about 5 minutes).

## Terms

Chess.com terms, as read on 2026-10-02: the Published-Data API is public read-only data with documented etiquette (serial requests, identifiable User-Agent where possible, no harvesting or offline storage, and a clause that API data may not be used to create or augment a competing service); the User Agreement forbids data mining or robots on user-generated content except as expressly permitted and reserves all Content (images, fonts, sounds, UI). The callback endpoints are undocumented; proxying them is common in community tools but is not covered by the published API terms (unverified). This build therefore: fetches one game per user action, stores game data only in that user's own browser (IndexedDB) plus the function's 24 hour CDN cache, never bulk-downloads, hot-links avatars only as `<img>`, ships no chess.com Content, and keeps the username/public-API and PGN paths as first-class alternatives.

Not affiliated with Chess.com. Chess.com is a trademark of Chess.com, LLC.

## Known limitations

- **iOS 26.** Whether the single-threaded engine triggers WebKit bug 304810 (memory spikes that can make iOS reload the tab) on iOS 26.2 to 26.6 is unknown. Manual check: open a 40-move game on an iPhone running iOS 26.2 or newer and confirm the tab is not reloaded during analysis. If it is, the analysis resumes from where it stopped in fast mode. Keep the tab in the foreground while analysing on a phone.
- **Chess.com proxy.** Link import on Vercel goes through a small function that calls chess.com's undocumented callback endpoints. Chess.com's firewall may start blocking the host at any time (it has blocked whole hosting providers before). The app then asks for a player's username and uses the public API, or you can paste the PGN (chess.com: Share > PGN).
- **Bot games** are not in chess.com's public archive: on GitHub Pages paste their PGN.
- **Variants.** Chess960, bughouse, crazyhouse and other variants are not supported. Games from a custom position (odds games, lichess "From Position") are analysed without opening-book labels.
- **Pieces.** The default Kaneo piece set (CC BY 4.0) is described by its author as inspired by chess.com's pieces. The residual look-alike risk is believed low, but no legal opinion was obtained. To switch the default to cburnett, change `defaultPieceSet` in `src/state/settingsStore.ts`; users can also pick cburnett in settings.
- **Accuracy and labels** approximate chess.com's (see above); "Deep" analysis is not calibrated.

## Licences

Analyse is free software under the **GNU General Public License v3.0 or later** (`LICENSE`), because it distributes Stockfish (GPLv3). Engine: Stockfish 19 via stockfish.js v19.0.0 (stockfish.js (c) Chess.com, LLC / Nathan Rugg; Stockfish (c) the Stockfish developers), GPLv3; its licence text is served at `/engine/sf19/Copying.txt`. Pieces, sounds, fonts and libraries keep their own licences (Kaneo pieces CC BY 4.0, cburnett pieces GPL-2.0-or-later, Kenney sounds CC0, Montserrat OFL, runtime libraries MIT/ISC/BSD); see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) and the About / Licenses panel in the app footer.
