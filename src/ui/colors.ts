// Colour values for places CSS variables cannot reach (SVG arrow strokes drawn by react-chessboard, square tints).
// Same values as the --color-classification-* tokens in src/index.css (section 3.6).
import type { Classification } from '../types/review'

export const CLASS_COLORS: Record<'dark' | 'light', Record<Classification, string>> = {
  dark: {
    brilliant: '#26C2A3',
    great: '#749BBF',
    best: '#81B64C',
    excellent: '#81B64C',
    good: '#95B776',
    book: '#D5A47D',
    inaccuracy: '#F7C631',
    mistake: '#FFA459',
    miss: '#FF7769',
    blunder: '#FA412D',
    forced: '#96AF8B',
  },
  light: {
    brilliant: '#109888',
    great: '#486688',
    best: '#5D9948',
    excellent: '#5D9948',
    good: '#95B776',
    book: '#8D694B',
    inaccuracy: '#E3AA24',
    mistake: '#DD7C2C',
    miss: '#FF7769',
    blunder: '#E02828',
    forced: '#96AF8B',
  },
}

export const BOARD_LIGHT = '#eeeed2'
export const BOARD_DARK = '#769656'
export const LAST_MOVE = 'rgba(255,255,0,.5)'
export const ARROW_BEST = 'rgba(159,207,63,.64)'
export const ARROW_THREAT = 'rgba(203,52,48,.8)'
export const PHASE_MIDDLEGAME = '#FFA459'
export const PHASE_ENDGAME = '#649bf6'
/** grey of a "not analysed" ply (E-9) */
export const NOT_ANALYSED = '#8B8987'

/** `#rrggbb` at an alpha: square tints use 0.6, played-move arrows 0.8 (section 3.6). */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
