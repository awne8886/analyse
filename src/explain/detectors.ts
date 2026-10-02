// Motif detectors on chess.js 1.4.0 (PROMPT.md Appendix E.1, verbatim apart from lint/format fixes),
// followed by the "additional simple detectors" of E.1.
import { Chess, type Square, type Color, type Piece, type Move } from 'chess.js'
export const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 }
const RAY = new Set(['q', 'r', 'b'])
const FILES = 'abcdefgh'
const sq = (f: number, r: number) => (f < 0 || f > 7 || r < 0 || r > 7 ? null : ((FILES[f] + (r + 1)) as Square))
const fr = (s: Square) => [FILES.indexOf(s[0]), +s[1] - 1] as const
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/** chess.js has no null move: rebuild the position with the other side to move. */
export function withTurn(chess: Chess, color: Color): Chess {
  const p = chess.fen().split(' ')
  p[1] = color
  p[3] = '-'
  const c = new Chess()
  c.load(p.join(' '), { skipValidation: true })
  return c
}
/** NOTE: chess.attackers() is pseudo-legal (includes pinned pieces and the king). */
export function isDefended(chess: Chess, square: Square): boolean {
  const piece = chess.get(square)!
  if (chess.attackers(square, piece.color).length) return true
  for (const a of chess.attackers(square, other(piece.color))) {
    // lichess "ray defence"
    if (RAY.has(chess.get(a)!.type)) {
      const c = new Chess(chess.fen(), { skipValidation: true })
      c.remove(a)
      if (c.attackers(square, piece.color).length) return true
    }
  }
  return false
}
export const isHanging = (c: Chess, s: Square) => !isDefended(c, s)
export function canBeTakenByLowerPiece(c: Chess, s: Square) {
  const p = c.get(s)!
  return c.attackers(s, other(p.color)).some((a) => {
    const ap = c.get(a)!
    return ap.type !== 'k' && VAL[ap.type] < VAL[p.type]
  })
}
export function isInBadSpot(c: Chess, s: Square) {
  const p = c.get(s)!
  return c.attackers(s, other(p.color)).length > 0 && (isHanging(c, s) || canBeTakenByLowerPiece(c, s))
}

/** Static Exchange Evaluation of capturing on `square`, `color` captures first. Swap-list algorithm,
 *  least-valuable-attacker first, x-rays via remove()+re-query, pins ignored (acceptable: engine PV is the arbiter). */
export function see(chess: Chess, square: Square, color: Color): number {
  const b = new Chess(chess.fen(), { skipValidation: true })
  const target = b.get(square)
  if (!target) return 0
  const gains: number[] = []
  let side = color,
    onSquare = VAL[target.type]
  for (let d = 0; d < 32; d++) {
    const atts = b
      .attackers(square, side)
      .map((s) => ({ s, v: VAL[b.get(s)!.type] }))
      .sort((x, y) => x.v - y.v)
    if (!atts.length) break
    const lva = atts[0]
    if (b.get(lva.s)!.type === 'k' && b.attackers(square, other(side)).length) break // king may not take a defended piece
    gains.push(onSquare)
    onSquare = lva.v
    b.remove(lva.s)
    side = other(side)
  }
  if (!gains.length) return 0
  let rest = 0
  for (let i = gains.length - 1; i >= 1; i--) rest = Math.max(0, gains[i] - rest)
  return gains[0] - rest
}
export const enPrise = (c: Chess, s: Square) => see(c, s, other(c.get(s)!.color)) > 0

/** Fork: mover (non-king, not in a bad spot) attacks >=2 enemy non-pawn pieces that are more valuable
 *  than the mover, or hanging and not defending the mover's square. (lichess cook.fork) */
export function detectFork(after: Chess, to: Square) {
  const mover = after.get(to)
  if (!mover || mover.type === 'k' || isInBadSpot(after, to)) return null
  const targets: Square[] = []
  for (const row of after.board())
    for (const cell of row) {
      if (!cell || cell.color === mover.color || cell.type === 'p') continue
      if (!after.attackers(cell.square, mover.color).includes(to)) continue
      const moreValuable = VAL[cell.type] > VAL[mover.type]
      const hangingNotDefender =
        isHanging(after, cell.square) && !after.attackers(to, cell.color).includes(cell.square)
      if (moreValuable || hangingNotDefender) targets.push(cell.square)
    }
  return targets.length >= 2 ? { type: 'fork' as const, by: to, targets } : null
}

export type PinOrSkewer = {
  type: 'pin' | 'skewer'
  absolute?: boolean
  by: Square
  pinned?: Square
  to?: Square
  front?: Square
  behind?: Square
}
/** Pins and skewers: walk each ray of each slider of `color`; first enemy piece A, second enemy piece B.
 *  B is king -> absolute pin; B more valuable than A -> relative pin; A more valuable than B (or A is king) -> skewer. */
export function detectPinsAndSkewers(chess: Chess, color: Color) {
  const out: PinOrSkewer[] = []
  const R = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ],
    B = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]
  for (const row of chess.board())
    for (const cell of row) {
      if (!cell || cell.color !== color || !RAY.has(cell.type)) continue
      const dirs = cell.type === 'q' ? [...R, ...B] : cell.type === 'r' ? R : B
      for (const [df, dr] of dirs) {
        let [f, r] = fr(cell.square)
        let first: (Piece & { square: Square }) | null = null
        for (;;) {
          f += df
          r += dr
          const s = sq(f, r)
          if (!s) break
          const p = chess.get(s)
          if (!p) continue
          if (p.color === color) break
          if (!first) {
            first = { ...p, square: s }
            continue
          }
          if (p.type === 'k') out.push({ type: 'pin', absolute: true, by: cell.square, pinned: first.square, to: s })
          else if (VAL[p.type] > VAL[first.type])
            out.push({ type: 'pin', absolute: false, by: cell.square, pinned: first.square, to: s })
          else if (VAL[first.type] > VAL[p.type] || first.type === 'k')
            out.push({ type: 'skewer', by: cell.square, front: first.square, behind: s })
          break
        }
      }
    }
  return out
}
/** New pins/skewers created BY a move = detectPinsAndSkewers(after) minus detectPinsAndSkewers(before). */
export function newPinsAndSkewers(before: Chess, after: Chess, color: Color): PinOrSkewer[] {
  const key = (x: PinOrSkewer) => JSON.stringify(x)
  const old = new Set(detectPinsAndSkewers(before, color).map(key))
  return detectPinsAndSkewers(after, color).filter((x) => !old.has(key(x)))
}

/** Discovered attack/check: enemy pieces newly attacked by a piece OTHER than the mover. */
export function detectDiscovered(before: Chess, after: Chess, mv: { from: Square; to: Square; color: Color }) {
  const res: Array<{ type: 'discoveredAttack' | 'discoveredCheck'; target: Square; by: Square[] }> = []
  for (const row of after.board())
    for (const cell of row) {
      if (!cell || cell.color === mv.color) continue
      const now = after.attackers(cell.square, mv.color).filter((s) => s !== mv.to)
      const was = before.attackers(cell.square, mv.color).filter((s) => s !== mv.from)
      const fresh = now.filter((s) => !was.includes(s))
      if (fresh.length)
        res.push({ type: cell.type === 'k' ? 'discoveredCheck' : 'discoveredAttack', target: cell.square, by: fresh })
    }
  return res
}
/** Double check = after.inCheck() && checkers (attackers of enemy king by mover colour) >= 2. */

/** Mate threat: if the opponent passed, can the mover mate in one? (null-move via FEN swap) */
export function matesInOneIfPass(after: Chess, mover: Color): string | null {
  const c = withTurn(after, mover)
  if (c.inCheck()) return null
  return c.moves().find((s) => s.endsWith('#')) ?? null
}
/** Hangs mate: after the played move, does the OPPONENT have a mate in 1? -> after.moves().some(s => s.endsWith('#')) (opponent is to move). */
export const hangsMate = (after: Chess) => after.moves().some((s) => s.endsWith('#'))

/** Trapped piece (lichess util.is_trapped). */
export function isTrapped(chess: Chess, square: Square): boolean {
  const p = chess.get(square)
  if (!p || p.type === 'p' || p.type === 'k') return false
  const c = withTurn(chess, p.color)
  if (c.inCheck() || !isInBadSpot(c, square)) return false
  for (const esc of c.moves({ square, verbose: true })) {
    if (esc.captured && VAL[esc.captured] >= VAL[p.type]) return false
    const t = new Chess(c.fen(), { skipValidation: true })
    t.move(esc)
    if (!isInBadSpot(t, esc.to)) return false
  }
  return true
}

/** Back-rank weakness: king on home rank, the three squares in front occupied by own pieces, enemy has R/Q. */
export function backRankWeak(chess: Chess, color: Color): boolean {
  const k = chess.findPiece({ type: 'k', color })[0]
  if (!k) return false
  const [f, r] = fr(k)
  if (r !== (color === 'w' ? 0 : 7)) return false
  const fwd = color === 'w' ? 1 : -1
  const ahead = [sq(f - 1, r + fwd), sq(f, r + fwd), sq(f + 1, r + fwd)].filter(Boolean) as Square[]
  if (!ahead.every((s) => chess.get(s)?.color === color)) return false
  return (
    chess.findPiece({ type: 'r', color: other(color) }).length +
      chess.findPiece({ type: 'q', color: other(color) }).length >
    0
  )
}

export function materialCount(c: Chess, color: Color) {
  let s = 0
  for (const row of c.board()) for (const p of row) if (p && p.color === color && p.type !== 'k') s += VAL[p.type]
  return s
}
export const materialDiff = (c: Chess, color: Color) => materialCount(c, color) - materialCount(c, other(color))

// ---------------------------------------------------------------------------------------------------------------
// Additional simple detectors (E.1, last paragraph). `mv` is the chess.js Move that led from `before` to `after`.

type MoveLike = Pick<Move, 'from' | 'to' | 'color' | 'piece' | 'captured'>

/** Squares of the mover's pieces (not the king) en prise after the move that were not en prise before
 *  (the moved piece is compared with its origin square). */
export function newlyHanging(before: Chess, after: Chess, mv: MoveLike): Square[] {
  const out: Square[] = []
  for (const row of after.board())
    for (const cell of row) {
      if (!cell || cell.color !== mv.color || cell.type === 'k') continue
      if (!enPrise(after, cell.square)) continue
      const origin = cell.square === mv.to ? mv.from : cell.square
      if (before.get(origin)?.color === mv.color && enPrise(before, origin)) continue
      out.push(cell.square)
    }
  return out
}

/** Sacrifice, B.3 step 8 (a): after the move a mover piece that is not a pawn or king, worth more than the piece
 *  just captured, is en prise, and taking it neither allows a mate in one for the mover nor hangs a bigger piece. */
export function detectSacrifice(after: Chess, mv: MoveLike): { square: Square; value: number } | null {
  const capturedValue = mv.captured ? VAL[mv.captured] : 0
  let best: { square: Square; value: number } | null = null
  for (const row of after.board())
    for (const cell of row) {
      if (!cell || cell.color !== mv.color || cell.type === 'p' || cell.type === 'k') continue
      if (VAL[cell.type] <= capturedValue || !enPrise(after, cell.square)) continue
      const takes = after
        .moves({ verbose: true })
        .filter((m) => m.to === cell.square && m.captured)
        .sort((x, y) => VAL[x.piece] - VAL[y.piece])
      if (!takes.length) continue // the attackers are pinned: nothing can actually take it
      const t = new Chess(after.fen(), { skipValidation: true })
      t.move(takes[0])
      if (t.moves().some((s) => s.endsWith('#'))) continue
      let hangsBigger = false
      for (const r2 of t.board())
        for (const c2 of r2)
          if (c2 && c2.color !== mv.color && c2.type !== 'k' && VAL[c2.type] > VAL[cell.type] && enPrise(t, c2.square))
            hangsBigger = true
      if (hangsBigger) continue
      if (!best || VAL[cell.type] > best.value) best = { square: cell.square, value: VAL[cell.type] }
    }
  return best
}

/** Passed pawn: no enemy pawn on the same or an adjacent file ahead of it. */
export function isPassedPawn(chess: Chess, square: Square): boolean {
  const p = chess.get(square)
  if (!p || p.type !== 'p') return false
  const [f, r] = fr(square)
  const dir = p.color === 'w' ? 1 : -1
  for (let rr = r + dir; rr >= 0 && rr <= 7; rr += dir)
    for (let ff = f - 1; ff <= f + 1; ff++) {
      const s = sq(ff, rr)
      const q = s ? chess.get(s) : undefined
      if (q && q.type === 'p' && q.color !== p.color) return false
    }
  return true
}

/** Castling rights lost on this move without castling. */
export function castlingRightsLost(before: Chess, after: Chess, mv: Move): boolean {
  if (mv.isKingsideCastle() || mv.isQueensideCastle()) return false
  const b = before.getCastlingRights(mv.color)
  const a = after.getCastlingRights(mv.color)
  return (b.k && !a.k) || (b.q && !a.q)
}

const MINOR_HOME: Record<Color, string[]> = { w: ['b1', 'g1', 'c1', 'f1'], b: ['b8', 'g8', 'c8', 'f8'] }
/** Develops: a knight or bishop leaves its start square within the first 12 moves. */
export function develops(mv: MoveLike, moveNumber: number): boolean {
  return (mv.piece === 'n' || mv.piece === 'b') && moveNumber <= 12 && MINOR_HOME[mv.color].includes(mv.from)
}

/** Kicks: the moved piece attacks a more valuable enemy piece (not a pawn or the king) that cannot profitably take
 *  it, so its only sensible responses are retreats. Returns the attacked square. */
export function detectKick(after: Chess, mv: MoveLike): Square | null {
  if (enPrise(after, mv.to)) return null
  const legal = after.moves({ verbose: true })
  for (const row of after.board())
    for (const cell of row) {
      if (!cell || cell.color === mv.color || cell.type === 'p' || cell.type === 'k') continue
      if (VAL[cell.type] <= VAL[mv.piece] || !after.attackers(cell.square, mv.color).includes(mv.to)) continue
      const own = legal.filter((m) => m.from === cell.square)
      if (own.length && own.every((m) => m.to !== mv.to)) return cell.square
    }
  return null
}

/** Wins tempo: the moved piece attacks a more valuable enemy piece (not the king) and is not in a bad spot itself. */
export function detectTempo(after: Chess, mv: MoveLike): Square | null {
  if (isInBadSpot(after, mv.to)) return null
  let best: Square | null = null
  for (const row of after.board())
    for (const cell of row) {
      if (!cell || cell.color === mv.color || cell.type === 'k') continue
      if (VAL[cell.type] <= VAL[mv.piece] || !after.attackers(cell.square, mv.color).includes(mv.to)) continue
      if (!best || VAL[cell.type] > VAL[after.get(best)!.type]) best = cell.square
    }
  return best
}

/** Defends: mover pieces (other than the moved one) that were en prise before the move and are not after. */
export function defendedSquares(before: Chess, after: Chess, mv: MoveLike): Square[] {
  const out: Square[] = []
  for (const row of before.board())
    for (const cell of row) {
      if (!cell || cell.color !== mv.color || cell.type === 'k' || cell.square === mv.from) continue
      if (!enPrise(before, cell.square)) continue
      const now = after.get(cell.square)
      if (now && now.color === mv.color && !enPrise(after, cell.square)) out.push(cell.square)
    }
  return out
}

/** Pieces of `color` trapped in `after` that were not trapped (or not there) in `before`. */
export function newlyTrapped(before: Chess, after: Chess, color: Color): Square[] {
  const out: Square[] = []
  for (const row of after.board())
    for (const cell of row) {
      if (!cell || cell.color !== color || !isTrapped(after, cell.square)) continue
      const was = before.get(cell.square)
      if (was && was.color === color && was.type === cell.type && isTrapped(before, cell.square)) continue
      out.push(cell.square)
    }
  return out
}
