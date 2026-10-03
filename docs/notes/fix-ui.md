# fix-ui (Phase 4 review fixes, UI and state)

Base 0c232f5. Owned paths only: src/ui/**, src/state/**, src/App.tsx, src/index.css, src/main.tsx (plus this note).

## Items

| Item | Fix | Test |
|---|---|---|
| a11y H1 = parity GAP-1 | `.import-form` and `.settings-panel` get `grid-template-columns: minmax(0, 1fr)`; `.profile-line` and its select shrink (`min-width: 0`, `max-width: 100%`, `width: 100%`). Option labels unchanged (R14 text kept; the closed select truncates). Measured on the built dist in Chromium: at 360/390/430 px with Settings open, `.app.scrollWidth` = viewport and the right-most element ends at 348/378/418 (Analyse button 335/365/405). | `src/ui/contrast.test.ts` (CSS rules) |
| a11y H2, M1 | New tokens `--color-classification-text-<class>` per theme (darker shades in light, lighter in dark; inaccuracy and mistake unchanged in dark), each >= 4.5:1 on panel, alternate row and active row (dark also on page). Used by move SAN, tally labels, coach headline, Retry grade text, winner name. Icons, tints, arrows keep section 3.6 values. | `src/ui/contrast.test.ts` computes every ratio from src/index.css; `a11y.test.tsx` checks the components use the tokens |
| a11y M2 = parity GAP-2 | dark `--color-text-muted: #bebdb9` (Assumption 29). | contrast.test.ts |
| a11y L3 | phase labels use `--color-phase-<phase>-text` (light #87572f / #40639d; dark #ffa459 / #96bbf9); the lines keep #FFA459 / #649bf6. | contrast.test.ts, a11y.test.tsx |
| a11y L4 | `.player-title` background `--color-title-bg` (light #e02828, dark #d73827: white 4.68:1). | contrast.test.ts |
| a11y M3 | Focusable `role="slider"` overlay on the graph (`data-testid="eval-graph-keyboard"`, new): arrows/PageUp/PageDown/Home/End move a cursor (tooltip shown, `aria-valuetext` = move, class, eval), Enter/Space select like a click (overview opens move-by-move). The svg keeps `role="img"` and its label. Key events stop before the global hotkeys. | a11y.test.tsx |
| a11y M4 | A MutationObserver in `Board.tsx` sets `tabindex=-1` and `aria-hidden=true` on react-chessboard's draggable piece wrappers (it has no keyboard sensor). | a11y.test.tsx |
| a11y M5 | Retry keyboard path: a form in the coach box (`retry-move-input`, `retry-move-submit`, new test ids) takes SAN or UCI (`tryRetryText` in src/state); illegal input shows an inline alert. `handleKey` ignores events already `defaultPrevented` and events from inside the board. | a11y.test.tsx |
| a11y M6 | Phase-grade cells are `role="img"` with `aria-label` "<Grade>. <G-T3/G-T4>"; `title` unchanged. | a11y.test.tsx |
| a11y L1 | `ProgressBar` is mounted once by the app shell (also on the import screen), so the `analysis-progress` status region exists empty before the first message and stays after completion ("Analysis complete." for a run the page watched). The visible bar shows only while analysing, now above the screen title. | a11y.test.tsx |
| a11y L2 | `App.tsx` focuses the new screen's `h1` (tabindex -1) when the screen changes and focus fell to `<body>`; move-by-move gained a visually hidden h1 "Move by move". | a11y.test.tsx |
| parity GAP-3 | During I-4/I-20/I-30 the username colour is applied (persisted, as `startGame` already did) with the "from username" note; `reset()` (New game) clears the note. | controller.test.tsx |
| parity GAP-4 | `openingAt(game, review, ply)` (format.ts): each book ply names its own position via `lookupOpening(epdOf(after))`; the last book ply uses `review.opening`. Used by the opening line and the coach-box book text. | a11y.test.tsx |
| performance H2 (UI) | A non-Abort analysis failure disposes the pool and clears the memoised engine; the E-2 Retry also cancels, disposes and boots a new pool, then restarts the analysis. | controller.test.tsx |
| performance M3 | `needsEngine(game, review)`: a stored review whose plies cover every move (done / not-analysed, same uci) renders complete with no worker and no E-3, for in-progress games too. | controller.test.tsx |
| performance L1 | E-10 shows whenever `refining > 0` (next to E-8 during the main pass, alone after it). | a11y.test.tsx |
| performance L2 | `main.tsx` clears `coiReloading` when the document is cross-origin isolated (before the unchanged D.8 block), so a later hard reload in the same tab waits behind the splash. | src/ui/main.test.ts |
| performance L3 | Review writes go through `persistQuietly` (console.warn on failure); the review still completes and no E-2 is shown. | controller.test.tsx |
| correctness L2 | `runAnalysis` re-explains ply k when ply k+1 is emitted with a line, and applies the corrected explanations to every partial and to the final (persisted) review. | controller.test.tsx |
| lead: per-game init | `runAnalysis` calls `pool.init(profile)` with the game's final profile before every analysis. | controller.test.tsx |
| lead: boot.test unhandled error | `renderApp.tsx` exports `unmountApp()` (test seam); boot.test.tsx unmounts inside `act` after each test. 5 coverage runs: no Errors line. | boot.test.tsx |

Also: `prefers-reduced-motion` disables the eval-bar, progress and key-tick transitions; the key-moment strip is `role="group"`.

## Follow-ups (outside my paths)

- e2e R30 check: assert element rectangles (e.g. `[data-testid=import-submit]` right <= 360 with Settings open), not only `scrollWidth` (lead).
- `e2e/screenshots/*.png` change with these colours and layout; the e2e run rewrote them and I restored the committed files. Regenerate on the lead branch.
- `scripts`/vite.config.ts `doReload` could reload at once when the registration is already active (performance L2 alternative).

## Assumptions

- A30 (proposed): classification-coloured text uses `--color-classification-text-*` shades computed by mixing the section 3.6 colour toward black (light) or white (dark) until >= 4.6:1 on every background it is drawn on.
- A31 (proposed): during the in-progress confirmation the username-resolved colour is persisted immediately (same as an accepted import), even if the user then cancels.
