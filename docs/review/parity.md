# review-parity: Appendix G, section 3.6 anti-patterns, Appendix F rendering, R28

Reviewer: review-parity (Phase 4). Read-only review; no tracked file edited.

## Method

- Served the existing `dist/` with `npx vite preview --port 4190` and ran
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node e2e/parity-shots.mjs 4190`.
  Screenshots: `test-results/parity/{import,overview,move-by-move}-{1280,360}.png` (all six were looked at).
  Another agent's test run deleted `test-results/` part-way through this review, so the six were captured again
  at the end. The settings and About panels at 360 px are in `test-results/parity/probe-settings-about-360.png`.
- Ran standalone Playwright probes (scratchpad, not in the repo) with `e2e/mocks.ts` (`mockNetwork`,
  `enableMockEngine(loadMockEvals())`) on `cc:live:129688175007`. They measured element boxes, computed styles,
  contrast ratios, keyboard and click navigation, the clipboard, theme persistence, the About panel, recent games,
  the inline error panel, the Fast-mode selector (seeded `analyse:engineTier`) and the 360/390/430 px layouts.
- Read `src/App.tsx` and every file in `src/ui/`, plus the relevant parts of `src/state/controller.ts` and
  `src/state/reviewStore.ts`.
- PLAN.md Assumptions were read first. Nothing listed there is reported as a gap.

## Summary

| Severity | Count |
|---|---|
| high | 1 |
| medium | 1 |
| low | 3 |

Appendix F string grep: `grep -rn --exclude='*.test.ts' --exclude='*.test.tsx' "Couldn't\|couldn't\|isn't supported\|can't be analysed" src/ui`
prints nothing (exit 1). No component holds an inline user-facing sentence. Every visible string comes from
`src/ui/strings.ts` through `t()`, or from the I/P/E tables through `renderKeyed()` (`src/ui/messages.ts`).

## Gaps

### GAP-1 (high): import form and settings panel overflow and are clipped at phone widths (G.29, G.2, R30; anti-pattern "horizontal page scroll on phones" is masked, not fixed)

- Where: `src/ui/theme.css:203-206` (`.import-form { display: grid; gap: 10px }` sets no column template, so the
  implicit track is `auto`). `src/ui/theme.css:134-138` (`.settings-panel`, same issue). The masking is at
  `src/ui/theme.css:3-7` (`html, body { overflow-x: hidden }`) and `:19` (`.app { overflow-x: clip }`).
- What is wrong: the analysis-profile `<select>` (`src/ui/ProfileSelect.tsx:35-48`) has a min-content width of about
  493 px. The longest option is "Auto (calibrated: depth 14 to 18, 0.35 to 0.6 s per move)". The implicit grid track
  grows to 495 px, so every child of the form is 495 px wide: the textarea, the P-10/P-11 label, the username input,
  the "You played" row, the select and the Analyse button. They run past the panel's right edge at about x = 520 px
  and are then cut off by `overflow-x: hidden/clip`. `document.documentElement.scrollWidth` stays at 360, so the
  R30 Playwright check passes. In practice, at 360, 390 and 430 px the user sees the P-10 label cut off
  ("…shows wh"), the textarea placeholder cut off, and the input, select and Analyse button cut off on the right.
  The settings panel has the same overflow: every `.setting` row, the select and the "Re-test speed" button end at
  x = 520.
- Verify: open `test-results/parity/import-360.png` and `probe-settings-about-360.png`. Or, at a 360 px viewport,
  run `document.querySelector('.import-form').scrollWidth` (507) against `.clientWidth` (334);
  `getComputedStyle(form).gridTemplateColumns` is `"495px"`. The same values appear at 390 and 430 px.
- Fix direction: `.import-form, .settings-panel { grid-template-columns: minmax(0, 1fr) }` plus `width: 100%` on
  the select (or `flex: 1 1 100%; min-width: 0` on `.profile-line`). Add a Playwright assertion that no descendant
  of `.import-form` has a `getBoundingClientRect().right` greater than `innerWidth`, because the scrollWidth check
  alone cannot catch clipping.

### GAP-2 (medium): secondary text is below 4.5:1 in the dark theme (G.28; anti-pattern "body contrast below 4.5:1")

- Where: `src/index.css:63` (`--color-text-muted: #8b8987` in `.dark`). It is used for body-size text at
  `src/ui/theme.css:153-157` (`.footer`), `:91-97` (`.link-button`, the "About / Licenses" control), `:229-232`
  (`.note`, `.hint`, which covers the recent-games text and "from username"), `:273-277` (`.engine-status`, G.7),
  `:438-441` (`.stat-label`, "Accuracy" / "Game Rating"), `:465-469` (tally headers), `:494-497` (phase
  headers), `:402-410` (side chips), and `:728-732` (move numbers).
- What is wrong: the measured ratios (WCAG relative luminance, computed styles in the served build) are
  `#8b8987` on panel `#262522` = **4.40:1**, and `#8b8987` on page `#312e2b` = **3.87:1**. The page-background case
  covers the engine status line, the footer tagline and the About / Licenses button. G.28 requires at least 4.5:1
  for body text on panels in both themes. The light theme passes: muted `#4b4847` on white is 9.06:1. Note:
  section 3.6 itself lists `#8b8987` as a dark-theme text colour. Its only compliant use is large text (at least
  18.66 px bold), so this is a spec tension for the lead to settle.
- Verify: in the dark theme, compare the computed `color` of `.stat-label` and `.engine-status` against the
  background of their nearest ancestor with a background colour.
- Fix direction: use `#BEBDB9`, which is in the section 3.6 chrome grey scale and gives about 9:1 on `#262522`, for
  `--color-text-muted` in `.dark`. Alternatively, restrict `#8b8987` to large or non-text uses.

### GAP-3 (low): the "You played" toggle does not show the username-resolved colour during the in-progress confirmation, and "from username" persists after New game (G.3)

- Where: `src/state/controller.ts:248` and `:263-267`. For I-4, I-20 and I-30 the resolved colour is kept only in
  the module variable `pendingColor`. `settings().update({ userColor })` and `colorFromUsername` are applied only in
  `startGame` (`:306`, `:310`). `src/state/reviewStore.ts:87-100` (`perGameReset`) and `:134` (`reset`) never clear
  `colorFromUsername`.
- What is wrong: the in-progress panel ("Analyse so far?") is the one moment the user is still on the import screen
  after the username resolved the colour. At that moment the toggle still shows the old persisted colour, with no
  "from username" note. The other case: after a resolved import, "New game" shows the "from username" note on the
  next, unrelated game until a toggle button is clicked.
- Verify: in a unit test, give a username equal to Black of daily `1034198172` (I-4) and submit. While `pending` is
  set, expect `color-black` to have `aria-pressed="true"` and the note to be visible. Then call `newGame()` and
  expect no note.

### GAP-4 (low): the opening line shows the game's final book opening at every book ply and contradicts the coach box (G.22, E.8)

- Where: `src/ui/MoveByMove.tsx:92` and `:146-149` render `review.opening` (the last book position's name) for
  every `ply <= lastBookPly`.
- What is wrong: at ply 1 (1.e4) of `cc:live:129688175007` the line above the move list reads "B06 Modern Defense".
  In the same view the coach box says "You are following the King's Pawn Game (B00)". The opening named for a ply
  should be the one that ply has reached.
- Verify: open `?game=cc:live:129688175007&ply=1` and compare `[data-testid=opening-name]` with
  `[data-testid=coach-text]`.
- Fix direction: look up the name per ply. The explanation facts already carry it as `MoveFacts.opening`. The frozen
  `GameReview.opening` contract holds only the final name, so the per-ply lookup must go through the `src/analysis`
  openings entry point or through the explanation.

### GAP-5 (low): the R28 grep does not produce the documented result

- Where: `src/ui/test-fixtures.ts:80` (`avatarUrl: 'https://images.chesscomfiles.com/x.png'`) and
  `src/import/chesscomProxy.test.ts:395`.
- What is wrong: R28 says that
  `grep -rn --exclude-dir=fixtures "chesscomfiles\|chess.com/bundles\|chessglyph\|ChessSans\|fonts.googleapis" src public index.html`
  returns only the avatar `<img>` code path in `src/ui/PlayersRow.tsx`. It actually returns the two test-only lines
  above, and nothing in `PlayersRow.tsx`, which reads `player.avatarUrl` from data. No runtime asset is affected:
  `dist/` has no matches, and the only chess.com requests in the e2e run are the avatar `<img>` loads, which fall back
  to `avatar-placeholder.svg`.
- Verify: run the grep above.
- Fix direction: use a neutral URL in `src/ui/test-fixtures.ts`, or record the test-only hits as an Assumption.

## Appendix G verdicts (one line per item)

1. Met. The single `<textarea>` takes multi-line PGN, and `onDrop` reads a dropped file with `file.text()`
   (`ImportScreen.tsx:59-64`).
2. Met on desktop: the P-10 label is rendered by key; Pages uses P-11 and the field is always visible. At 360 to
   430 px the label is clipped (GAP-1).
3. Partly met. The note and preselection appear after a resolved import, but not during the in-progress
   confirmation, and the note goes stale after New game (GAP-3).
4. Met. The labels give depth and time for Auto, Standard and Deep. With a seeded `fast-14` tier the select is
   `greyed` with the "Fast mode (depth 14)" badge beside it.
5. Met. The IndexedDB list shows "Arystanner - Hikaru | 1-0 | 2025-01-04 | 89.0 / 86.3" and reopens on click.
6. Met. The I-34 text is shown inline in `role="alert"`; there is no dialog or modal anywhere.
7. Met. The line shows "Engine: not loaded" before the first analysis, then "Engine: Multi-core: 3 threads" (plus
   " · Fast mode (depth 14)" on the fast tier). The loading percent is in code (`EngineStatus.tsx:16-19`); the mock
   engine cannot show it.
8. Met. The summary sentence sits directly under the title and banners. It is shown once the review is complete.
9. Met. Hand-rolled SVG, clamped to ±5, mates at ±5, white area and zero line. The tooltip shows icon, SAN and eval
   ("17...Ngf6 +0.4"). Clicking jumps to the ply. Ticks are 1.6 px (0.1 rem), widening to 0.5 rem. Phase lines
   use `#FFA459` / `#649bf6`, with labels. There is a cursor line, hollow interpolated points, and `role="img"` with
   a range `aria-label`.
10. Met. Names, ratings, IM/GM titles, the Bot tag, the placeholder avatar on error (verified, since the avatars
    were aborted), the result, the Winner tag, and I-21 "Result unknown".
11. Met. One decimal, an animated counter while analysing, the G-T1 tooltip, and the "Chess.com reported" line
    with G-T5 when `reportedAccuracies` is present.
12. Met. All 11 rows in the specified order; columns are white count | icon + label | black count.
13. Met. The G-T2 tooltip (with the ACPL suffix), "n/a" below 10 moves, and the "rough estimate" label on the
    ACPL method.
14. Met. Three columns of icons; the G-T3 text matches F.5 exactly; "None" uses G-T4.
15. Met. The "Start Review" primary button (4 px radius) and "Share" (shows "Link copied").
16. Met. Kaneo pieces, `#eeeed2` / `#769656`, dragging only in Retry, oriented to `userColor`; `f` flips (board
    label and eval bar both flip).
17. Met. The badge is on the destination square, top-right, 0.360 of the square, with `aria-label="Best"`.
18. Met. From/to are `rgba(129,182,76,0.6)` for Best; unclassified moves use `rgba(255,255,0,.5)`.
19. Met. The bar sits beside the board and flips with it; the text is at the winning end ("+0.2"), and "1-0" at
    the last move.
20. Met. The E.8 headline, sentences, "Best was" chip and buttons are present; Explain follows R26 (also covered by
    e2e DoD 7). The key-moment strip is in ply order and jumps on click (ply 93).
21. Met. Two columns, 30 px rows, alternating background, coloured SAN, `aria-current`, and scroll into view
    (verified with scrollTop measurements). A phone strip is present; see the optional note on its width.
22. Partly met. The line is shown only within the book prefix, but it names the wrong opening for early plies
    (GAP-4).
23. Met. Left/Right, Home/End, `f` and `e` work; clicking the right or left half of the board steps; there are four
    first/prev/next/last buttons.
24. Met. `soundFor` covers move, capture, castle, check, promote and game-end; the chime plays on the user's own
    Brilliant/Great moves; the persisted "Sounds" toggle mutes them.
25. Met. The progress region (`role="status"`) shows E-8 ("Analysing move N of N, about N s left") and E-10 while
    refining, with a bar; plies are navigable during analysis.
26. Met. A drop is graded per G.4 with a praise key, the board reverts after 1.5 s, and "Show best" adds the arrow
    (the arrow count went from 1 to 2). Grading is also covered by e2e DoD 8.
27. Met. The clipboard got `http://localhost:4190/?game=cc:live:129688175007&ply=20`, built from origin + BASE_URL.
28. Partly met. Dark is the default, and light is persisted across reload. The About panel has every F.5 line, the
    links, Copying.txt under BASE_URL, and the Licenses text. Dark muted text is below 4.5:1 (GAP-2).
29. Partly met. The review screens stack correctly (board, eval strip, coach box, move strip, graph) with no
    overflow. The import screen and the settings panel overflow and are clipped (GAP-1).

## Section 3.6 anti-patterns

| Anti-pattern | Result |
|---|---|
| generic gradient hero / `linear-gradient` on the landing | none (no gradient in `src/index.css` or `src/ui/theme.css`) |
| emoji as classification icons | none: 11 hand-drawn SVG icons (`ClassificationIcon.tsx`), no emoji in UI sources or string tables |
| Google Fonts `<link>` | none: Montserrat 700/800 come from `@fontsource/montserrat` (bundled woff2); the only `<link>`s are the `data:` icon and the bundle CSS |
| spinner without progress and ETA | none: a progress bar plus E-8 with seconds left |
| error modals | none: errors are inline in `role="alert"`; there are 0 `dialog` / `role=dialog` elements |
| horizontal scroll on phones | `scrollWidth` is 360 on all three screens, but the import and settings content is clipped (GAP-1) |
| low-contrast grey text | dark muted text is at 4.40:1 and 3.87:1 (GAP-2) |
| centred-everything | none: the review uses a board plus side-panel grid, left-aligned |
| card-grid landing | none: the landing is a form plus the recent-games panel |
| cream/off-white background in dark mode | none: the page is `#312e2b` |
| purple gradients | none |
| italic accent words | none |
| 01/02/03 labels | none |
| pill-shaped primary buttons | none: `border-radius: 4px` |

## Appendix F by key, and R28

- The F-string grep prints nothing. The I-34 error, P-10 label, E-4/E-5 badges, E-8 progress, G-T1 to G-T5
  tooltips, F.4 labels and the About lines were checked in the served build. All come from the keyed tables.
- R28: no chess.com or chesscomfiles asset is fetched apart from the avatar `<img crossorigin="anonymous"
  referrerpolicy="no-referrer">` (`PlayersRow.tsx:13-24`), which falls back to the bundled placeholder. `dist/`
  contains no `chesscomfiles`, `chess.com/bundles` or `fonts.googleapis` string. The `neo` whole-word grep is
  empty. The documented grep output differs (GAP-5).

## Optional (not requirement gaps)

- Phone move strip (`theme.css:853-856`): cells use `flex: 0 0 20%`, but content such as "20. Be3 ✓" widens them.
  At 360 px about 3 whole plies and 2 partial ones are visible, against "about 5" in G.21.
- Light theme: the classification colours mandated by section 3.6 are used as text on white (tally labels and
  coloured SAN), for example good `#95B776` and inaccuracy `#E3AA24`, at roughly 2:1 to 2.6:1. The colours are the
  spec's.
- Light theme eval bar: the white share (`#f1f1f1`, `theme.css:614`) is the same colour as the light page
  background and has no border, so only the dark share is visible.
- The eval-graph cursor line uses the Great colour (`theme.css:529-532`), so it looks the same as a Great key-moment
  tick.
- At 360 px the overview breaks a player name mid-word ("Arystann/er") because of `overflow-wrap: anywhere`
  (`theme.css:392`).
- Book commentary repeats the opening name: "You are following the King's Pawn Game (B00). This enters the King's
  Pawn Game." This comes from the explain templates, not the UI.
