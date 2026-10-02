// Players row (G.10): avatars (chess.com avatars only as <img crossorigin="anonymous" referrerpolicy="no-referrer">,
// bundled placeholder on error; R28), titles, names, ratings, the "Bot" marker, the result and the winner.
import type { ImportedGame, Player } from '../types/game'
import { playersRowResult } from './format'
import { renderKeyed } from './messages'
import { t } from './strings'

const PLACEHOLDER = `${import.meta.env.BASE_URL}avatar-placeholder.svg`

function PlayerCard({ player, side, winner }: { player: Player; side: 'white' | 'black'; winner: boolean }) {
  return (
    <div className={`player player-${side} ${winner ? 'winner' : ''}`} data-testid={`player-${side}`}>
      <img
        className="avatar"
        src={player.avatarUrl || PLACEHOLDER}
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
        alt=""
        width={40}
        height={40}
        onError={(e) => {
          if (!e.currentTarget.src.endsWith('avatar-placeholder.svg')) e.currentTarget.src = PLACEHOLDER
        }}
      />
      <div className="player-text">
        <div className="player-name-line">
          {player.title ? <span className="player-title">{player.title}</span> : null}
          <span className="player-name" data-testid={`player-${side}-name`}>
            {player.name}
          </span>
          {player.isComputer ? <span className="bot-tag">{t('label.bot')}</span> : null}
        </div>
        <div className="player-meta">
          <span className={`side-chip side-${side}`}>{t(`color.${side}`)}</span>
          {player.rating !== undefined ? <span>{player.rating}</span> : null}
          {winner ? <span className="winner-tag">{t('label.winner')}</span> : null}
        </div>
      </div>
    </div>
  )
}

export function PlayersRow({ game }: { game: ImportedGame }) {
  const unknown = game.result === '*' && !game.inProgress
  return (
    <div className="players-row">
      <PlayerCard player={game.white} side="white" winner={game.result === '1-0'} />
      <div className="result" data-testid="result">
        {unknown ? renderKeyed({ key: 'I-21' }) : playersRowResult(game.result)}
      </div>
      <PlayerCard player={game.black} side="black" winner={game.result === '0-1'} />
    </div>
  )
}
