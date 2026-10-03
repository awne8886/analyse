// Records the real-engine eval tables the mock engine answers from (PROMPT.md D.9, R33).
//
// For each of the three e2e fixture games it evaluates every `before` FEN plus the final position with the
// vendored stockfish 19 lite single build (MultiPV 2, Hash 32, `go depth 16 movetime 2000`) and writes
// src/test/fixtures/evals/<gameId with ':' replaced by '_'>.json as { "<FEN 4 fields>|16|2": PositionEval }
// with White-perspective scores, exactly as src/engine emits them.
//
// The vendored loader is CommonJS while this repository is "type": "module", so the loader is copied to a
// temporary directory as stockfish.cjs; under Node it loads `<basename>.wasm` from its own directory, so the
// wasm goes beside it as stockfish.wasm (PLAN.md Assumption 18). public/ is never modified.
//
// Usage: node scripts/record-evals.mjs [--limit N]   (--limit evaluates only the first N positions per game
// and writes nothing: a quick check that the engine pipeline works)
/* global console */
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const engineDir = join(root, 'public', 'engine', 'sf19')
const networkDir = join(root, 'src', 'test', 'fixtures', 'network')
const outDir = join(root, 'src', 'test', 'fixtures', 'evals')

const DEPTH = 16
const MOVETIME_MS = 2000
const MULTIPV = 2
const HASH_MB = 32

const limitArg = process.argv.indexOf('--limit')
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity
if (!(limit > 0)) throw new Error('--limit needs a positive number')

const fixture = (name) => JSON.parse(readFileSync(join(networkDir, name), 'utf8')).body

// ---- Appendix A.2 TCN decoder with castling normalisation (copy; the TS module cannot be imported here) ----
const TCN_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++='
const PROMO = 'qnrbkp'
const sq = (i) => 'abcdefgh'[i % 8] + (Math.floor(i / 8) + 1)

function decodeTcn(tcn) {
  const out = []
  for (let i = 0; i + 1 < tcn.length; i += 2) {
    const a = TCN_ALPHABET.indexOf(tcn[i])
    let b = TCN_ALPHABET.indexOf(tcn[i + 1])
    if (a < 0 || b < 0) throw new Error(`bad TCN char at ${i}`)
    const m = { to: '' }
    if (b > 63) {
      m.promotion = PROMO[Math.floor((b - 64) / 3)]
      b = a + (a < 16 ? -8 : 8) + ((b - 1) % 3) - 1
    }
    if (a > 75) m.drop = PROMO[a - 79]
    else m.from = sq(a)
    m.to = sq(b)
    out.push(m)
  }
  return out
}

function applyTcnMove(chess, m) {
  try {
    return chess.move({ from: m.from, to: m.to, promotion: m.promotion })
  } catch (e) {
    const p = chess.get(m.from)
    if (p && p.type === 'k') {
      const r = m.from[1]
      if (m.to === 'h' + r) return chess.move({ from: m.from, to: 'g' + r })
      if (m.to === 'a' + r) return chess.move({ from: m.from, to: 'c' + r })
    }
    throw e
  }
}

// ---- the three fixture games of R33 ----
function liveGame() {
  const callback = fixture('www.chess.com-live-129688175007.json').game
  const month = fixture('api.chess.com-month-arystanner-2025-01.json')
  const entry = month.games.find((g) => g.url.endsWith('/game/live/129688175007'))
  const chess = new Chess()
  chess.loadPgn(entry.pgn)
  const history = chess.history({ verbose: true })
  check('cc:live:129688175007', history.length, [112, callback.plyCount])
  return { id: 'cc:live:129688175007', history }
}

function dailyGame() {
  const game = fixture('www.chess.com-daily-1000337106.json').game
  const chess = new Chess(game.initialSetup)
  const moves = decodeTcn(game.moveList)
  if (moves.some((m) => m.drop)) throw new Error('daily 1000337106: drop move in TCN')
  for (const m of moves) applyTcnMove(chess, m)
  const history = chess.history({ verbose: true })
  check('cc:daily:1000337106', history.length, [game.plyCount, game.moveList.length / 2])
  return { id: 'cc:daily:1000337106', history }
}

function lichessGame() {
  const game = fixture('lichess.org-game-4S1PZUvW.json')
  const chess = new Chess(game.initialFen)
  for (const san of game.moves.split(' ')) chess.move(san)
  const history = chess.history({ verbose: true })
  check('li:4S1PZUvW', history.length, [13])
  return { id: 'li:4S1PZUvW', history }
}

function check(id, plies, expected) {
  for (const e of expected) if (plies !== e) throw new Error(`${id}: ${plies} plies, expected ${e}`)
  console.log(`${id}: ${plies} plies (cross-checked against ${expected.join(', ')})`)
}

// ---- engine process ----
const tmp = mkdtempSync(join(tmpdir(), 'analyse-sf19-'))
copyFileSync(join(engineDir, 'stockfish-19-lite-single.js'), join(tmp, 'stockfish.cjs'))
copyFileSync(join(engineDir, 'stockfish-19-lite-single.wasm'), join(tmp, 'stockfish.wasm'))
const child = spawn(process.execPath, [join(tmp, 'stockfish.cjs')], { stdio: ['pipe', 'pipe', 'inherit'] })
const lines = createInterface({ input: child.stdout })
let waiter = null
const pending = []
lines.on('line', (line) => {
  if (waiter) waiter(line)
  else pending.push(line)
})
child.on('exit', (code) => {
  if (code && code !== 0) console.error(`engine exited with ${code}`)
})

const send = (cmd) => child.stdin.write(cmd + '\n')
/** Collects engine lines until `done(line)` is true; resolves with all collected lines. */
function readUntil(done) {
  return new Promise((resolve) => {
    const got = []
    const take = (line) => {
      got.push(line)
      if (done(line)) {
        waiter = null
        resolve(got)
        return true
      }
      return false
    }
    while (pending.length) if (take(pending.shift())) return
    waiter = take
  })
}

/** Parses an `info` line with a score and a pv; null for anything else (currmove, string, bound lines). */
function parseInfo(line) {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null
  const t = line.split(' ')
  const at = (k) => t.indexOf(k)
  if (at('lowerbound') >= 0 || at('upperbound') >= 0) return null
  const s = at('score')
  if (s < 0) return null
  return {
    multipv: at('multipv') >= 0 ? Number(t[at('multipv') + 1]) : 1,
    depth: Number(t[at('depth') + 1]),
    score: { type: t[s + 1], value: Number(t[s + 2]) },
    pv: t.slice(at('pv') + 1),
  }
}

const toWhite = (score, stm) => ({ type: score.type, value: stm === 'w' ? score.value : -score.value })

async function evaluate(fen) {
  send(`position fen ${fen}`)
  send(`go depth ${DEPTH} movetime ${MOVETIME_MS}`)
  const out = await readUntil((l) => l.startsWith('bestmove'))
  const stm = fen.split(' ')[1]
  const best = new Map()
  for (const l of out) {
    const info = parseInfo(l)
    if (info) best.set(info.multipv, info)
  }
  const engineLines = [...best.values()]
    .sort((a, b) => a.multipv - b.multipv)
    .map((l) => ({ ...l, score: toWhite(l.score, stm) }))
  const bm = out[out.length - 1].split(' ')[1]
  const chess = new Chess(fen)
  const pe = {
    fen,
    lines: engineLines,
    depth: engineLines.length ? engineLines[0].depth : 0,
    multiPv: MULTIPV,
    bestmove: !bm || bm === '(none)' ? null : bm,
  }
  if (chess.isCheckmate()) pe.terminal = 'checkmate'
  else if (chess.isStalemate()) pe.terminal = 'stalemate'
  else if (chess.isDraw()) pe.terminal = 'draw'
  // Stockfish reports `score mate 0` for a mated side to move at depth 0; it carries no pv, so add it here.
  if (pe.terminal === 'checkmate' && pe.lines.length === 0)
    pe.lines = [{ multipv: 1, depth: 0, score: { type: 'mate', value: 0 }, pv: [] }]
  return pe
}

try {
  send('uci')
  await readUntil((l) => l === 'uciok')
  send(`setoption name MultiPV value ${MULTIPV}`)
  send(`setoption name Hash value ${HASH_MB}`)
  mkdirSync(outDir, { recursive: true })
  for (const game of [liveGame(), dailyGame(), lichessGame()]) {
    send('ucinewgame')
    send('isready')
    await readUntil((l) => l === 'readyok')
    const fens = [...game.history.map((m) => m.before), game.history[game.history.length - 1].after]
    const table = {}
    const started = Date.now()
    for (const fen of fens.slice(0, limit)) {
      const key = `${fen.split(' ').slice(0, 4).join(' ')}|${DEPTH}|${MULTIPV}`
      table[key] = await evaluate(fen)
      if (limit !== Infinity)
        console.log(key, JSON.stringify(table[key].lines.map((l) => [l.depth, l.score, l.pv[0]])))
    }
    const n = Object.keys(table).length
    console.log(`${game.id}: ${n} positions in ${((Date.now() - started) / 1000).toFixed(1)} s`)
    if (limit === Infinity) {
      const file = join(outDir, `${game.id.replace(/:/g, '_')}.json`)
      writeFileSync(file, JSON.stringify(table, null, 1) + '\n')
      console.log(`wrote ${file}`)
    }
  }
} finally {
  send('quit')
  child.stdin.end()
  rmSync(tmp, { recursive: true, force: true })
}
