// End-to-end wiring (docs/notes/contracts.md section 4): import -> variant gate / confirmation -> lazy engine
// pool -> calibrate -> analyzeGame with explainPly -> incremental persistence -> progressive rendering.
// Every entry point is idempotent: the first GitHub Pages visit can start the app twice (risk 12).
import { Chess } from 'chess.js'
import { REVIEW_CONFIG, analyzeGame, classifyPly, latestJobId, nextJobId } from '../analysis'
import { calibrate, createEnginePool } from '../engine'
import { buildMoveFacts, explain } from '../explain'
import { confirmInProgress, importGame, parseInput } from '../import'
import type {
  DeviceProfile,
  EngineApi,
  EngineProfile,
  PositionEval,
  ProfileName,
  Tier,
} from '../types/engine'
import type { Explanation } from '../types/explain'
import type { GameMove, ImportedGame, ImportResult, ParsedInput } from '../types/game'
import type { Classification, GameReview } from '../types/review'
import { installEngineStats, setStatsSource } from './engineStats'
import { importErrorText, wantsUsername } from './importKeys'
import { loadGame, loadReview, persistReview, saveGame } from './persistence'
import { useReviewStore, type KeyedText, type RetryGrade } from './reviewStore'
import { hasStoredSettings, resolveUserColor, useSettingsStore } from './settingsStore'
import { gameIdOf, readUrlState, receiveGameId, writeUrlState } from './urlState'

/** The engine status callback of createEnginePool (docs/notes/contracts.md section 1). */
export type EngineStatus =
  | { phase: 'loading'; percent: number | null }
  | { phase: 'ready'; build: 'lite-single' | 'lite'; threads: number }
  | { phase: 'error'; key: 'E-2'; message: string }
type CreatePool = (profile: EngineProfile, opts?: { onStatus?: (s: EngineStatus) => void }) => EngineApi
const createPool: CreatePool = createEnginePool

const deployTarget: 'vercel' | 'pages' = import.meta.env.VITE_DEPLOY_TARGET === 'pages' ? 'pages' : 'vercel'
const TIER_STORAGE_KEY = 'analyse:engineTier'

interface Session {
  booted: boolean
  device: DeviceProfile | null
  enginePromise: Promise<{ pool: EngineApi; tier: Tier }> | null
  pool: EngineApi | null
  importing: Promise<void> | null
  analysis: AbortController | null
  revertTimer: ReturnType<typeof setTimeout> | null
}
const session: Session = {
  booted: false,
  device: null,
  enginePromise: null,
  pool: null,
  importing: null,
  analysis: null,
  revertTimer: null,
}

const store = () => useReviewStore.getState()
const settings = () => useSettingsStore.getState()

/** The tier stored by the last calibration (`analyse:engineTier`, C.4), if any. */
export function storedTier(): Tier | undefined {
  try {
    const raw = localStorage.getItem(TIER_STORAGE_KEY)
    return raw ? ((JSON.parse(raw) as { tier?: Tier }).tier ?? undefined) : undefined
  } catch {
    return undefined
  }
}

/** Device-default profile of C.4: Auto on phones and tablets, Standard elsewhere. */
export function defaultProfileFor(device: DeviceProfile | null): ProfileName {
  return device?.isMobile ? 'auto' : 'standard'
}

/** The search tier for a profile choice and a calibrated tier; fast-14 overrides every choice (R14). */
export function tierFor(choice: ProfileName, calibrated: Tier | undefined, forceFast = false): Tier {
  if (forceFast || calibrated === 'fast-14') return 'fast-14'
  if (choice === 'deep') return 'deep-20'
  if (choice === 'auto' && calibrated) return calibrated
  return 'standard-16'
}

export function engineProfileFor(device: DeviceProfile, tier: Tier): EngineProfile {
  return {
    build: device.build,
    workers: device.workers,
    threads: device.threads,
    hashMb: device.hashMb,
    multiPv: device.multiPv,
    limits: { ...REVIEW_CONFIG.tiers[tier], multiPv: device.multiPv },
    tier,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------------------------

/** Idempotent app start: one store, one engine pool (created lazily), one import of the URL's game. */
export function bootApp(device: DeviceProfile | null): void {
  if (session.booted) return
  session.booted = true
  session.device = device
  installEngineStats()
  if (!hasStoredSettings()) settings().update({ profile: defaultProfileFor(device) })
  const applyTheme = (theme: 'dark' | 'light') =>
    document.documentElement.classList.toggle('dark', theme === 'dark')
  applyTheme(settings().theme)
  useSettingsStore.subscribe((s, prev) => {
    if (s.theme !== prev.theme) applyTheme(s.theme)
  })
  store().patch({
    tier: storedTier(),
    engine: device ? { phase: 'not-loaded' } : { phase: 'error', key: 'E-1', message: '' },
  })
  void startFromUrl()
}

async function startFromUrl(): Promise<void> {
  const url = readUrlState()
  if (url.dev === 'calibration') {
    store().setScreen('calibration')
    return
  }
  if (!url.game) return
  const gameId = url.game
  const cachedGame = await loadGame(gameId)
  const action = receiveGameId(gameId, {
    deployTarget,
    cached: cachedGame !== undefined,
    username: settings().username,
  })
  switch (action.type) {
    case 'render-cached':
      await openCached(cachedGame as ImportedGame, url.ply, true)
      return
    case 'import':
      await runImport(action.parsed, null)
      return
    case 'import-screen': {
      const id = gameId.split(':')[2]
      store().patch({
        inputText: action.link,
        screen: 'import',
        importNotice: { key: 'P-5', vars: { id } },
        focusUsername: store().focusUsername + 1,
      })
      if (action.autoScan) await submitInput(action.link)
      return
    }
    case 'error':
      store().patch({ screen: 'import', importError: { key: action.key } })
  }
}

/** Renders a stored game: a complete review instantly (no engine), a partial one resumed (E-3 on reload). */
async function openCached(game: ImportedGame, ply: number | undefined, fromReload: boolean): Promise<void> {
  const review = await loadReview(game.id)
  store().openGame(game, review, ply ?? 0)
  store().patch({ screen: ply !== undefined ? 'moves' : 'overview', colorFromUsername: false })
  writeUrlState({ game: game.id, ply })
  if (review?.complete && !game.inProgress) {
    store().patch({ phase: 'complete' })
    return
  }
  const firstOpen = review?.plies.find((p) => p.status !== 'done' && p.status !== 'not-analysed')
  if (review && fromReload) store().patch({ resumedFrom: firstOpen?.ply ?? review.plies.length + 1 })
  await runAnalysis(game, review, fromReload && review !== undefined)
}

// ---------------------------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------------------------

/** The Analyse button: parse, then import (debounced: one import at a time). */
export function submitInput(text: string): Promise<void> {
  if (session.importing) return session.importing
  const parsed = parseInput(text.trim())
  return runImport(parsed, text)
}

function runImport(parsed: ParsedInput, text: string | null): Promise<void> {
  if (session.importing) return session.importing
  session.importing = doImport(parsed, text).finally(() => {
    session.importing = null
  })
  return session.importing
}

async function doImport(parsed: ParsedInput, text: string | null): Promise<void> {
  store().patch({
    phase: 'importing',
    importError: undefined,
    importNotice: undefined,
    pending: undefined,
    ...(text !== null ? { inputText: text } : {}),
  })
  if (parsed.kind === 'unrecognised') return failImport({ key: 'I-34' })
  if (parsed.kind === 'lichess_not_a_game') return failImport({ key: 'I-28', vars: { what: parsed.what } })

  const knownId = gameIdOf(parsed)
  let resumeFrom: GameReview | undefined
  if (knownId) {
    writeUrlState({ game: knownId }) // risk 12: a reload from here on keeps the game
    const cached = await loadGame(knownId)
    if (cached && !cached.inProgress) {
      store().patch({ phase: 'idle' })
      return openCached(cached, undefined, false)
    }
    if (cached) resumeFrom = await loadReview(knownId)
  }

  const username = parsed.kind === 'chesscom' && parsed.username ? parsed.username : settings().username
  let result: ImportResult
  try {
    result = await importGame(parsed, {
      username: username || undefined,
      deployTarget,
      proxyUrl: import.meta.env.VITE_PROXY_URL || undefined,
      onStatus: (key, message) => store().patch({ importNotice: { key, fallback: message } }),
    })
  } catch (e) {
    const err = e as { code?: string; message?: string; detail?: Record<string, string | number> }
    if (err.code) {
      return failImport(
        importErrorText({ code: err.code as never, message: err.message ?? '', detail: err.detail }),
      )
    }
    return failImport({ key: 'error.unexpected', vars: { message: err.message ?? String(e) } })
  }
  if (!result.ok) {
    const error = result.error
    const keyed = importErrorText(error)
    if (error.code === 'pages_needs_username') {
      store().patch({ phase: 'idle', importNotice: keyed, focusUsername: store().focusUsername + 1 })
      return
    }
    store().patch({
      phase: 'idle',
      importError: { ...keyed, choices: error.choices },
      importNotice: undefined,
      ...(wantsUsername(error) ? { focusUsername: store().focusUsername + 1 } : {}),
    })
    return
  }
  const usernameColor = resolveUserColor(result.game.white.name, result.game.black.name, username)
  if (result.pendingConfirmation) {
    const key =
      result.pendingConfirmation === 'in_progress_daily'
        ? 'I-4'
        : result.pendingConfirmation === 'in_progress_lichess'
          ? 'I-20'
          : 'I-30'
    store().patch({
      phase: 'idle',
      importNotice: undefined,
      pending: {
        key,
        vars: { plyCount: result.game.moves.length },
        game: result.game,
        notice: result.notice,
      },
    })
    pendingResume = resumeFrom
    pendingColor = usernameColor
    return
  }
  await startGame(result.game, result.notice, usernameColor, resumeFrom)
}

let pendingResume: GameReview | undefined
let pendingColor: 'w' | 'b' | null = null

function failImport(text: KeyedText): void {
  store().patch({ phase: 'idle', importError: text, importNotice: undefined })
}

/** "Analyse so far" (I-4, I-20, I-30). */
export async function confirmPending(): Promise<void> {
  const pending = store().pending
  if (!pending) return
  store().patch({ pending: undefined })
  await startGame(confirmInProgress(pending.game), pending.notice, pendingColor, pendingResume)
}

export function cancelPending(): void {
  store().patch({ pending: undefined, phase: 'idle' })
}

/** A game picked from the I-10b / I-33 list. */
export async function chooseGame(game: ImportedGame): Promise<void> {
  store().patch({ importError: undefined })
  await startGame(game, undefined, resolveUserColor(game.white.name, game.black.name, settings().username))
}

async function startGame(
  game: ImportedGame,
  notice: 'ambiguous_resolved' | 'custom_start' | undefined,
  usernameColor: 'w' | 'b' | null,
  resumeFrom?: GameReview,
): Promise<void> {
  await saveGame(game)
  writeUrlState({ game: game.id })
  if (usernameColor) settings().update({ userColor: usernameColor })
  store().openGame(game, resumeFrom)
  store().patch({
    screen: 'overview',
    colorFromUsername: usernameColor !== null,
    importNotice:
      notice === 'ambiguous_resolved'
        ? {
            key: 'I-10a',
            vars: {
              kind: game.kind ?? '',
              White: game.white.name,
              Black: game.black.name,
              date: game.date ?? '',
            },
          }
        : undefined,
  })
  await runAnalysis(game, resumeFrom, false)
}

/** Opens a review listed under "Recent games". */
export async function openRecent(gameId: string): Promise<void> {
  const game = await loadGame(gameId)
  if (game) await openCached(game, undefined, false)
}

/** Back to an empty import screen (cancels a running analysis). */
export function newGame(): void {
  cancelAnalysis()
  store().reset()
  writeUrlState({})
}

// ---------------------------------------------------------------------------------------------------------------
// Engine and analysis
// ---------------------------------------------------------------------------------------------------------------

/** The lazily created pool and its calibrated tier (R16: nothing exists before the first analysis needs it). */
export function ensureEngine(): Promise<{ pool: EngineApi; tier: Tier }> {
  if (session.enginePromise) return session.enginePromise
  const device = session.device
  if (!device) return Promise.reject(Object.assign(new Error('no SIMD'), { key: 'E-1' }))
  const provisional = engineProfileFor(device, 'standard-16')
  session.enginePromise = (async () => {
    store().patch({ engine: { phase: 'loading', percent: null } })
    const pool = createPool(provisional, {
      onStatus: (s) =>
        store().patch({
          engine:
            s.phase === 'error'
              ? { phase: 'error', key: 'E-2', message: s.message }
              : s.phase === 'loading'
                ? { phase: 'loading', percent: s.percent }
                : { phase: 'ready', build: s.build, threads: s.threads },
        }),
    })
    session.pool = pool
    setStatsSource(pool)
    await pool.init(provisional)
    if (store().engine.phase !== 'ready') {
      store().patch({ engine: { phase: 'ready', build: device.build, threads: device.threads } })
    }
    const tier = await calibrate(pool)
    store().patch({ tier })
    return { pool, tier }
  })()
  session.enginePromise.catch((e: unknown) => {
    session.enginePromise = null
    session.pool?.dispose()
    session.pool = null
    store().patch({ engine: { phase: 'error', key: 'E-2', message: (e as Error)?.message ?? String(e) } })
  })
  return session.enginePromise
}

function cancelAnalysis(): void {
  if (!session.analysis) return
  session.analysis.abort()
  session.analysis = null
  void session.pool?.stop()
}

/** The explanation of a ply in the current (or given) colour and coach voice (contracts section 4). */
export function explanationFor(
  review: GameReview,
  ply: number,
  userColor: 'w' | 'b' = settings().userColor,
  voice: 'me' | 'neutral' = settings().voice,
): Explanation {
  const isUserMove = review.plies[ply - 1]?.color === userColor
  return explain(
    buildMoveFacts(review, ply, userColor),
    voice === 'me' && isUserMove ? 'personal' : 'impersonal',
  )
}

async function runAnalysis(
  game: ImportedGame,
  resumeFrom: GameReview | undefined,
  fast: boolean,
): Promise<void> {
  cancelAnalysis()
  const ctrl = new AbortController()
  session.analysis = ctrl
  store().patch({ phase: 'analysing', progress: undefined })
  let engine: { pool: EngineApi; tier: Tier }
  try {
    engine = await ensureEngine()
  } catch {
    if (session.analysis === ctrl) session.analysis = null
    store().patch({ phase: 'idle' })
    return // the engine status (E-1 / E-2 with Retry) is in the store
  }
  if (ctrl.signal.aborted || !session.device) return
  const profile = engineProfileFor(session.device, tierFor(settings().profile, engine.tier, fast))
  const live = () => !ctrl.signal.aborted && store().game?.id === game.id
  try {
    const review = await analyzeGame(game, engine.pool, profile, {
      signal: ctrl.signal,
      resumeFrom,
      explainPly: (rev, ply) => explanationFor(rev, ply),
      onPly: (_ply, partial) => {
        void persistReview(partial)
        if (live()) store().patch({ review: partial })
      },
      onProgress: (p) => {
        if (live()) store().patch({ progress: p })
      },
    })
    await persistReview(review)
    if (live()) store().patch({ review, phase: 'complete', progress: undefined })
  } catch (e) {
    if (!live()) return
    if ((e as Error)?.name === 'AbortError') {
      store().patch({ phase: 'idle' }) // cancelled by stop()/dispose()/a newer job: not an engine failure
      return
    }
    store().patch({
      phase: 'idle',
      engine: { phase: 'error', key: 'E-2', message: (e as Error)?.message ?? String(e) },
    })
  } finally {
    if (session.analysis === ctrl) session.analysis = null
  }
}

/** The E-2 Retry button: boot again and continue the current game from what is stored. */
export async function retryEngine(): Promise<void> {
  const game = store().game
  store().patch({ engine: { phase: 'not-loaded' } })
  if (game) await runAnalysis(game, store().review, false)
}

/** Settings "Re-test speed": forget the stored tier and calibrate again when a pool exists (C.4). */
export async function retestSpeed(): Promise<void> {
  try {
    localStorage.removeItem(TIER_STORAGE_KEY)
  } catch {
    /* storage unavailable */
  }
  store().patch({ tier: undefined })
  if (session.pool && session.enginePromise && !session.analysis) {
    const tier = await calibrate(session.pool)
    session.enginePromise = Promise.resolve({ pool: session.pool, tier })
    store().patch({ tier })
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Retry (Appendix G.4)
// ---------------------------------------------------------------------------------------------------------------

export function gradeOf(c: Classification): RetryGrade {
  if (c === 'brilliant' || c === 'great' || c === 'best') return 'correct'
  if (c === 'excellent') return 'good'
  if (c === 'good' || c === 'book' || c === 'forced') return 'ok'
  return 'incorrect'
}

/** Praise line for a Correct retry; the sacrifice line only for a Brilliant retried move (F.4). */
export function praiseKey(c: Classification, ply: number): string {
  if (gradeOf(c) !== 'correct') return 'retry.tryAgain'
  if (c === 'brilliant') return 'praise.correct.3'
  return ['praise.correct.1', 'praise.correct.2', 'praise.correct.4'][ply % 3]
}

export function startRetry(): void {
  store().patch({ retry: { active: true, checking: false, fen: null }, showBest: false, showReply: false })
}

export function stopRetry(): void {
  if (session.revertTimer) clearTimeout(session.revertTimer)
  store().patch({ retry: { active: false, checking: false, fen: null } })
}

/** A move dropped on the board in Retry mode. Returns false for an illegal move (the board snaps back). */
export function tryRetryMove(from: string, to: string, promotion = 'q'): boolean {
  const { game, review, ply } = store()
  const pr = review?.plies[ply - 1]
  const played = game?.moves[ply - 1]
  if (!game || !review || !pr || !played || pr.status === 'pending') return false
  const chess = new Chess(played.before)
  let mv
  try {
    mv = chess.move({ from, to, promotion })
  } catch {
    return false
  }
  const terminal: GameMove['terminal'] = chess.isCheckmate()
    ? 'checkmate'
    : chess.isStalemate()
      ? 'stalemate'
      : chess.isInsufficientMaterial()
        ? 'insufficient'
        : chess.isDrawByFiftyMoves()
          ? 'fifty'
          : undefined
  const move: GameMove = {
    ply,
    color: mv.color,
    san: mv.san,
    uci: mv.lan,
    from: mv.from,
    to: mv.to,
    piece: mv.piece,
    captured: mv.captured,
    promotion: mv.promotion,
    before: mv.before,
    after: mv.after,
    terminal,
  }
  if (session.revertTimer) clearTimeout(session.revertTimer)
  store().patch({ retry: { active: true, checking: true, fen: mv.after } })
  void gradeRetry(move, game, review, ply)
  return true
}

async function gradeRetry(
  move: GameMove,
  game: ImportedGame,
  review: GameReview,
  ply: number,
): Promise<void> {
  const pr = review.plies[ply - 1]
  const lines = [
    {
      multipv: 1,
      depth: pr.depth,
      score: pr.evalBefore,
      pv: pr.bestPv.length ? pr.bestPv : [pr.bestUci ?? ''],
    },
    ...(pr.secondLine ? [{ ...pr.secondLine, multipv: 2 }] : []),
  ]
  const before: PositionEval = {
    fen: move.before,
    lines,
    depth: pr.depth,
    multiPv: pr.multiPv,
    bestmove: pr.bestUci,
  }
  let after: PositionEval
  const sameLine = lines.find((l) => l.pv[0] === move.uci)
  if (move.terminal) {
    after = {
      fen: move.after,
      lines: [],
      depth: 0,
      multiPv: 1,
      bestmove: null,
      terminal:
        move.terminal === 'checkmate' ? 'checkmate' : move.terminal === 'stalemate' ? 'stalemate' : 'draw',
    }
  } else if (sameLine) {
    // the line's score is already the White-perspective value of the position after its first move
    after = {
      fen: move.after,
      lines: [{ multipv: 1, depth: sameLine.depth, score: sameLine.score, pv: sameLine.pv.slice(1) }],
      depth: sameLine.depth,
      multiPv: 1,
      bestmove: sameLine.pv[1] ?? null,
    }
  } else {
    try {
      const { pool, tier } = await ensureEngine()
      const device = session.device as DeviceProfile
      const profile = engineProfileFor(device, tierFor(settings().profile, tier))
      // One job-id sequence with the analysis (review H1): during a running pass the search reuses its id, so it
      // cancels nothing; otherwise it takes a fresh one.
      const jobId = session.analysis ? latestJobId() : nextJobId()
      after = await pool.evaluate(move.after, { ...profile.limits, multiPv: 1 }, jobId)
    } catch {
      store().patch({ retry: { active: true, checking: false, fen: null } })
      return
    }
  }
  if (store().ply !== ply || !store().retry.active) return
  const prevPly = review.plies[ply - 2]
  const prevMove = game.moves[ply - 2]
  const { classification } = classifyPly({
    move,
    before,
    after,
    isBook: false,
    previous:
      prevPly && prevMove && prevPly.status !== 'not-analysed'
        ? {
            winBefore: prevPly.winBefore,
            winAfter: prevPly.winAfter,
            uci: prevPly.uci,
            to: prevMove.to,
            captured: prevMove.captured,
          }
        : undefined,
  })
  store().patch({
    retry: {
      active: true,
      checking: false,
      fen: move.after,
      feedback: { grade: gradeOf(classification), classification, praise: praiseKey(classification, ply) },
    },
  })
  session.revertTimer = setTimeout(() => {
    const r = store().retry
    if (r.active && store().ply === ply) store().patch({ retry: { ...r, fen: null } })
  }, 1500)
}

// Test seam: the boot state is module-level by design (one per page); tests reset it explicitly.
export function __resetSessionForTests(): void {
  cancelAnalysis()
  session.booted = false
  session.device = null
  session.enginePromise = null
  session.pool = null
  session.importing = null
  setStatsSource(null)
}

export { deployTarget }

export function getDevice(): DeviceProfile | null {
  return session.device
}
