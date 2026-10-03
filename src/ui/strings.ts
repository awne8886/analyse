// Review screen strings (PROMPT.md Appendix F.4 and F.5) plus the labels of the UI chrome. Every user-facing
// sentence of the UI lives here, keyed; components render by key (the import and engine sentences live in
// src/import/errors.ts and src/engine/errors.ts). Key scheme: src/ui/strings.test.ts. Dashes are plain hyphens.
export const UI_STRINGS: Record<string, string> = {
  // F.4 headlines (R25): rendered as "<SAN> <headline>"
  'headline.brilliant': 'is brilliant',
  'headline.great': 'is a great move',
  'headline.best': 'is best',
  'headline.excellent': 'is excellent',
  'headline.good': 'is good',
  'headline.book': 'is a book move',
  'headline.inaccuracy': 'is an inaccuracy',
  'headline.mistake': 'is a mistake',
  'headline.miss': 'is a miss',
  'headline.blunder': 'is a blunder',
  'headline.forced': 'is forced',

  // F.4 classification one-liners (tooltips)
  'tooltip.class.brilliant': 'The best move, and a sacrifice that was hard to find',
  'tooltip.class.great': 'The one move that changed the course of the game',
  'tooltip.class.best': "The engine's first choice",
  'tooltip.class.excellent': "Within a hair of the engine's choice",
  'tooltip.class.good': 'A reasonable move, not the best',
  'tooltip.class.book': 'A known opening move',
  'tooltip.class.inaccuracy': 'A small slip',
  'tooltip.class.mistake': 'A move that clearly worsens the position',
  'tooltip.class.miss': 'A missed chance to punish or to win',
  'tooltip.class.blunder': 'A serious error that swings the game',
  'tooltip.class.forced': 'The only legal move',

  // Classification display names (tally rows, icon aria-labels)
  'class.brilliant': 'Brilliant',
  'class.great': 'Great',
  'class.best': 'Best',
  'class.excellent': 'Excellent',
  'class.good': 'Good',
  'class.book': 'Book',
  'class.inaccuracy': 'Inaccuracy',
  'class.mistake': 'Mistake',
  'class.miss': 'Miss',
  'class.blunder': 'Blunder',
  'class.forced': 'Forced',

  // F.4 labels, buttons, toggle, share, settings
  'label.chesscomReported': 'Chess.com reported: {white} / {black}',
  'button.startReview': 'Start Review',
  'button.back': 'Highlights',
  'button.showBest': 'Show best',
  'button.showReply': 'Show reply',
  'button.retry': 'Retry',
  'button.prev': 'Prev',
  'button.next': 'Next',
  'button.keyMoves': 'Key Moves',
  'toggle.explain': 'Explain',
  'button.share': 'Share',
  'message.linkCopied': 'Link copied',
  'settings.retestSpeed': 'Re-test speed',
  'settings.coachAddresses': 'Coach addresses: me / neutral',
  'settings.coloredMoves': 'Coloured moves',
  'settings.sounds': 'Sounds',
  'settings.pieces': 'Pieces: Kaneo / cburnett',
  'settings.theme': 'Theme: dark / light',

  // F.4 eval bar end text, players row result, bot / n/a / None markers
  'evalbar.whiteWins': '1-0',
  'evalbar.blackWins': '0-1',
  'evalbar.draw': '1/2-1/2',
  'evalbar.unknown': '*',
  'result.whiteWins': '1-0',
  'result.blackWins': '0-1',
  'result.draw': '½-½',
  'result.unknown': '*',
  'label.bot': 'Bot',
  'label.notAvailable': 'n/a',
  'label.none': 'None',

  // F.4 retry feedback
  'retry.correct': 'Correct',
  'retry.good': 'Good',
  'retry.ok': 'OK',
  'retry.incorrect': 'Incorrect',
  'retry.checking': 'Checking...',
  'praise.correct.1': "Yes, that's the move.",
  'praise.correct.2': 'Found it.',
  'praise.correct.3': "That's the sacrifice.",
  'praise.correct.4': 'Exactly what the engine wants.',
  'retry.tryAgain': 'Not this one. Try again or press Show best.',
  'retry.prompt': 'Play the move you would choose on the board.',
  'retry.exit': 'Exit retry',

  // F.4 honesty line
  honesty:
    "Labels follow chess.com's published expected-points bands; accuracy was calibrated to within about 4 points (mean absolute error) of chess.com's on 244 game sides. Results are an approximation, not chess.com's numbers.",

  // F.5 tooltips
  'tooltip.G-T1':
    "Accuracy: 0 to 100, how close each side's moves came to the engine's top choices. Chess.com-style; it approximates Chess.com's number.",
  'tooltip.G-T2':
    "Estimated rating: what this one game's accuracy suggests about the player's strength. An approximation, not a Chess.com figure.",
  'tooltip.G-T2.acplSuffix': ' (rough estimate, no rating known.)',
  'tooltip.G-T3': '{color} in the {phase}: accuracy {acc}, shown as a move-quality icon.',
  'tooltip.G-T4': 'No grade: {color} made fewer than 4 {phase} moves.',
  'tooltip.G-T5': "From Chess.com's own review of this game, when the public API provided it.",

  // F.5 About panel lines
  'about.engine':
    'Engine: Stockfish 19 via stockfish.js v19.0.0 (stockfish.js (c) Chess.com, LLC / Nathan Rugg; Stockfish (c) the Stockfish developers), GPLv3.',
  'about.source': "This site's source is GPL-3.0-or-later: {repo}.",
  'about.notAffiliated': 'Not affiliated with Chess.com.',
  'about.trademark': 'Chess.com is a trademark of Chess.com, LLC.',
  'about.browsers': 'Minimum browsers: Safari/iOS 16.4+, Chrome 91+, Firefox 89+, Edge 91+.',
  'about.licenses': 'Licenses',
  'about.title': 'About / Licenses',
  'about.linkStockfish': 'Stockfish',
  'about.linkStockfishJs': 'stockfish.js',
  'about.linkCopying': 'GPLv3 text (Copying.txt)',
  'about.close': 'Close',

  // F.5 attribution
  'attribution.chesscom': 'Game data from Chess.com',
  'attribution.lichess': 'Game data from Lichess',
  'attribution.pgn': 'Game data from a pasted PGN',

  // App chrome
  'app.name': 'Analyse',
  'app.tagline': 'Chess.com-style game review, computed in your browser.',
  'button.settings': 'Settings',
  'button.newGame': 'New game',
  'button.flip': 'Flip board',
  'button.first': 'First move',
  'button.last': 'Last move',
  'button.cancel': 'Cancel',
  'button.retryEngine': 'Retry',
  'error.unexpected': 'Something went wrong while importing: {message}',

  // Import screen
  'import.title': 'Game Review',
  'import.inputLabel': 'Game link or PGN',
  'import.placeholder':
    'Paste a Chess.com or Lichess game link, or a full PGN (you can also drop a .pgn file here)',
  'import.submit': 'Analyse',
  'import.youPlayed': 'You played',
  'import.white': 'White',
  'import.black': 'Black',
  'import.fromUsername': 'from username',
  'import.profile': 'Analysis profile',
  'import.recent': 'Recent games',
  'import.recentEmpty': 'Reviews you open are kept in this browser and listed here.',
  'import.analyseSoFar': 'Analyse so far',
  'import.choiceLine': '{White} vs {Black}, {date}, {result}',
  'profile.auto': 'Auto (calibrated: depth {d1} to {d2}, {t1} to {t2} s per move)',
  'profile.standard': 'Standard (depth {depth}, {time} s per move)',
  'profile.deep': 'Deep (depth {depth}, {time} s per move)',
  'engine.notLoaded': 'Engine: not loaded',
  'engine.loading': 'Engine: loading {percent}%',
  'engine.loadingNoPercent': 'Engine: loading',
  'engine.ready': 'Engine: {badge}',

  // Overview
  'overview.title': 'Highlights',
  'overview.accuracy': 'Accuracy',
  'overview.gameRating': 'Game Rating',
  'overview.roughEstimate': 'rough estimate',
  'overview.phases': 'Phases',
  'phase.opening': 'Opening',
  'phase.middlegame': 'Middlegame',
  'phase.endgame': 'Endgame',
  'phase.lower.opening': 'opening',
  'phase.lower.middlegame': 'middlegame',
  'phase.lower.endgame': 'endgame',
  'color.white': 'White',
  'color.black': 'Black',
  'label.winner': 'Winner',
  'label.keyMoments': 'Key moments',

  // Move-by-move
  'coach.start': 'Starting position. Step forward with Next or the right arrow key.',
  'coach.pending': 'This move is still being analysed.',
  'coach.inBook': 'Opening: {name} ({eco})',
  'board.label': 'Chess board, {orientation} at the bottom',
  'graph.label': 'Evaluation graph: from {min} to {max} over {n} moves',
  'graph.labelEmpty': 'Evaluation graph: no moves analysed yet',
  'graph.slider': 'Evaluation graph: choose a move with the arrow keys, open it with Enter',
  'graph.start': 'Start position',
  'graph.value': '{move}: {eval}',
  'graph.valueClassified': '{move}, {class}: {eval}',
  'moves.title': 'Move by move',
  'phase.gradeLabel': '{grade}. {tip}',
  'progress.complete': 'Analysis complete.',
  'retry.moveLabel': 'Or type your move (for example Nf3)',
  'retry.play': 'Play',
  'retry.illegal': 'That move is not legal here.',
  'evalbar.label': 'Evaluation: {value}',
  'movelist.label': 'Moves',
  'settings.title': 'Settings',
  'settings.themeDark': 'Dark',
  'settings.themeLight': 'Light',
  'settings.piecesKaneo': 'Kaneo',
  'settings.piecesCburnett': 'cburnett',
  'settings.coachMe': 'me',
  'settings.coachNeutral': 'neutral',

  // Calibration dev page (/?dev=calibration, R20)
  'calibration.title': 'Accuracy calibration (developer page)',
  'calibration.username': 'Chess.com username',
  'calibration.month': 'Month (YYYY/MM)',
  'calibration.run': 'Run',
  'calibration.status': 'Analysed {done} of {total} sides with reported accuracies',
  'calibration.mae': '{preset}: MAE {mae} over {n} sides',
  'calibration.presetShipped': 'Shipped preset (harmonic)',
  'calibration.presetLichess': 'Lichess preset',
  'calibration.fetchFailed': 'The month archive could not be loaded (HTTP {status}).',
}

/** Fills named `{placeholders}`; unknown placeholders stay as written. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  )
}

/** UI string by key, with placeholders filled. */
export function t(key: string, vars?: Record<string, string | number>): string {
  return fmt(UI_STRINGS[key] ?? key, vars)
}
