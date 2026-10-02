// importGame: the import chain of PROMPT.md R3 and section 3.3. Vercel: proxy function, rewrite, username plus
// public API, PGN; Pages: username plus public API, PGN (P-5). Every path ends in the gate of draft.ts.
import type { ChesscomKind, ImportedGame, ImportErrorCode, ImportResult, ParsedInput } from '../types/game'
import { callbackDraft, type CallbackBody } from './chesscomGame'
import { lookupViaProxy, proxyIsDown, type ProxyFailure, type ProxyOutcome } from './chesscomProxy'
import { findInPublicApi } from './chesscomPublicApi'
import { finaliseDraft, type Finalised } from './draft'
import { ImportFailure, formatImportString } from './errors'
import { fetchLichessGame, lichessDraft } from './lichess'
import { timerWait, type Waits } from './net'
import { parsePgn, pgnDraft, splitPgnGames } from './pgn'

export interface ImportOptions {
  username?: string
  deployTarget: 'vercel' | 'pages'
  proxyUrl?: string
  /** progress / notice callback for non-error strings shown while importing (P-2, P-8, I-27 first line) */
  onStatus?: (key: string, message: string) => void
  /** the waits of the chain (2 s after a chess.com 429, 60 s after a lichess 429); setTimeout by default */
  wait?: (ms: number) => Promise<void>
}

type Ok = Extract<ImportResult, { ok: true }>

const NOT_FOUND: Record<ChesscomKind, ImportErrorCode> = {
  live: 'live_not_found',
  daily: 'daily_not_found',
  computer: 'computer_not_found',
}
const FAILURE: Record<ProxyFailure, { code: ImportErrorCode; key: string }> = {
  blocked: { code: 'proxy_blocked', key: 'P-1' },
  timeout: { code: 'proxy_timeout', key: 'P-4' },
  unreachable: { code: 'proxy_unreachable', key: 'I-18' },
  rate_limited: { code: 'proxy_rate_limited', key: 'P-3' },
}

function ok(f: Finalised, via: Ok['via'], notice: Ok['notice'] = f.notice): Ok {
  const result: Ok = { ok: true, game: f.game, via }
  if (notice) result.notice = notice
  if (f.pendingConfirmation) result.pendingConfirmation = f.pendingConfirmation
  return result
}

export async function importGame(parsed: ParsedInput, opts: ImportOptions): Promise<ImportResult> {
  const w: Waits = { wait: opts.wait ?? timerWait, onStatus: opts.onStatus }
  try {
    switch (parsed.kind) {
      case 'unrecognised':
        throw new ImportFailure('unrecognised')
      case 'lichess_not_a_game':
        throw new ImportFailure('lichess_not_a_game', { what: parsed.what })
      case 'pgn':
        return await importPgn(parsed.pgn)
      case 'lichess':
        return ok(
          await finaliseDraft(lichessDraft(parsed.id, await fetchLichessGame(parsed.id, w))),
          'lichess',
        )
      case 'chesscom':
        return await importChesscom(
          parsed.cckind,
          parsed.id,
          opts.username?.trim() || parsed.username,
          opts,
          w,
        )
    }
  } catch (e) {
    if (e instanceof ImportFailure) return { ok: false, error: e.toImportError() }
    throw e
  }
}

/** "Analyse so far" accepted for an in-progress game (I-4, I-20, I-30). */
export function confirmInProgress(game: ImportedGame): ImportedGame {
  return { ...game, inProgress: true }
}

async function importPgn(text: string): Promise<ImportResult> {
  const games = splitPgnGames(text)
  if (games.length > 1) {
    const choices: ImportedGame[] = []
    for (const g of games) {
      try {
        choices.push((await finaliseDraft(pgnDraft(parsePgn(g)))).game)
      } catch (e) {
        if (!(e instanceof ImportFailure)) throw e // a game that cannot be analysed is not offered
      }
    }
    throw new ImportFailure('pgn_multiple', { n: games.length }, { choices })
  }
  return ok(await finaliseDraft(pgnDraft(parsePgn(games[0]))), 'pgn')
}

async function importChesscom(
  kind: ChesscomKind | 'unknown',
  id: string,
  username: string | undefined,
  opts: ImportOptions,
  w: Waits,
): Promise<ImportResult> {
  if (opts.deployTarget === 'pages') {
    if (kind === 'computer') throw new ImportFailure('computer_via_public_api')
    if (!username) throw new ImportFailure('pages_needs_username', { id }, { needsUsername: true })
    return viaPublicApi(kind, id, username, w)
  }

  const proxyUrl = opts.proxyUrl ?? '/api/chesscom'
  let failure: ProxyFailure = 'unreachable' // what the user is told when the proxy steps are skipped (memo)
  if (proxyUrl !== '' && !proxyIsDown()) {
    if (kind === 'unknown') {
      // R2: a bare link tries live, then daily, once each, one after the other
      const live = await lookupViaProxy('live', id, proxyUrl, w)
      if (live.status !== 'failed') {
        const daily = await lookupViaProxy('daily', id, proxyUrl, w)
        if (daily.status !== 'failed') return resolveBareLink(id, live, daily, w)
        failure = daily.reason
      } else {
        failure = live.reason
      }
    } else {
      const r = await lookupViaProxy(kind, id, proxyUrl, w)
      if (r.status === 'found') return ok(await finaliseDraft(callbackDraft(kind, id, r.body)), r.via)
      if (r.status === 'not_found') throw new ImportFailure(NOT_FOUND[kind])
      failure = r.reason
    }
  }

  // step (3): the username and the public API; without a username the failure is shown by the username field
  const { code, key } = FAILURE[failure]
  if (!username) throw new ImportFailure(code, undefined, { needsUsername: true })
  w.onStatus?.(key, formatImportString(key))
  if (kind === 'computer') throw new ImportFailure('computer_via_public_api')
  return viaPublicApi(kind, id, username, w)
}

async function viaPublicApi(
  kind: ChesscomKind | 'unknown',
  id: string,
  username: string,
  w: Waits,
): Promise<ImportResult> {
  const match = await findInPublicApi(kind, id, username, w)
  const f = await finaliseDraft(match.draft)
  if (kind !== 'unknown') return ok(f, 'public-api')
  announceResolved(match.kind, f.game, w)
  return ok(f, 'public-api', 'ambiguous_resolved')
}

function announceResolved(kind: ChesscomKind, game: ImportedGame, w: Waits): void {
  w.onStatus?.(
    'I-10a',
    formatImportString('I-10a', {
      kind,
      White: game.white.name,
      Black: game.black.name,
      date: game.date ?? '',
    }),
  )
}

/** I-10a when exactly one kind answered with a game, I-10b (with the games as choices) otherwise. */
async function resolveBareLink(
  id: string,
  live: ProxyOutcome,
  daily: ProxyOutcome,
  w: Waits,
): Promise<ImportResult> {
  const found = (
    [
      ['live', live],
      ['daily', daily],
    ] as const
  ).flatMap(([kind, r]) => (r.status === 'found' ? [{ kind, body: r.body, via: r.via }] : []))
  const build = (f: { kind: ChesscomKind; body: CallbackBody }) =>
    finaliseDraft(callbackDraft(f.kind, id, f.body))

  if (found.length === 1) {
    const f = await build(found[0])
    announceResolved(found[0].kind, f.game, w)
    return ok(f, found[0].via, 'ambiguous_resolved')
  }
  const choices: ImportedGame[] = []
  for (const f of found) {
    try {
      choices.push((await build(f)).game)
    } catch (e) {
      if (!(e instanceof ImportFailure)) throw e
    }
  }
  throw new ImportFailure('ambiguous_kind', undefined, { choices })
}
