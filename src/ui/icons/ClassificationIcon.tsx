// The 11 classification icons (section 3.6): hand-drawn inline SVGs, 18x18 viewBox, a filled disc r=8.5 at (9,9)
// in the class colour with a 1 px darker ring and a soft drop shadow, and a white glyph. Glyph paths for the
// thumbs-up and the open book follow Lucide (ISC); everything else is drawn here. GPL-3.0-or-later as part of
// the site (THIRD_PARTY_LICENSES.md).
import type { CSSProperties } from 'react'
import type { Classification } from '../../types/review'
import { UI_STRINGS } from '../strings'

const GLYPH_STROKE = {
  fill: 'none',
  stroke: '#fff',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Lucide glyphs are drawn on a 24-unit grid; this fits one into the disc. */
const LUCIDE = 'translate(4.2 4.2) scale(0.4)'
const LUCIDE_STROKE = { ...GLYPH_STROKE, strokeWidth: 4.4 } as const

function starPoints(): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 5.6 : 2.4
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push(`${(9 + r * Math.cos(a)).toFixed(2)},${(9.4 + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}
const STAR = starPoints()

function Text({ children, size = 10.5 }: { children: string; size?: number }) {
  return (
    <text
      x="9"
      y="9"
      dy="0.36em"
      textAnchor="middle"
      fontSize={size}
      fontWeight={800}
      fontFamily="Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
      fill="#fff"
      letterSpacing={-0.6}
    >
      {children}
    </text>
  )
}

function Glyph({ c }: { c: Classification }) {
  switch (c) {
    case 'brilliant':
      return <Text size={9.5}>!!</Text>
    case 'great':
      return <Text>!</Text>
    case 'best':
      return <polygon points={STAR} fill="#fff" />
    case 'excellent':
      return (
        <g {...GLYPH_STROKE} strokeWidth={1.7}>
          <path d="M3.6 9.4 5.9 11.7 10.4 6.6" />
          <path d="M8.6 11.2 9.1 11.7 13.9 6.6" />
        </g>
      )
    case 'good':
      return (
        <g transform={LUCIDE} {...LUCIDE_STROKE}>
          <path d="M7 10v12" />
          <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </g>
      )
    case 'book':
      return (
        <g transform={LUCIDE} {...LUCIDE_STROKE}>
          <path d="M12 7v14" />
          <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
        </g>
      )
    case 'inaccuracy':
      return <Text size={9.5}>?!</Text>
    case 'mistake':
      return <Text>?</Text>
    case 'miss':
      return (
        <g {...GLYPH_STROKE}>
          <path d="M6 6l6 6M12 6l-6 6" />
        </g>
      )
    case 'blunder':
      return <Text size={9.5}>??</Text>
    case 'forced':
      return (
        <g {...GLYPH_STROKE} strokeWidth={1.8}>
          <path d="M5 5.5 8.5 9 5 12.5" />
          <path d="M9.5 5.5 13 9 9.5 12.5" />
        </g>
      )
  }
}

export function ClassificationIcon({
  classification,
  size = 18,
  title,
  style,
  decorative = false,
}: {
  classification: Classification
  size?: number | string
  title?: string
  style?: CSSProperties
  /** inside an element that already carries the class name as its label */
  decorative?: boolean
}) {
  const colour = `var(--color-classification-${classification})`
  return (
    <svg
      viewBox="0 0 18 18"
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : UI_STRINGS[`class.${classification}`]}
      data-classification={classification}
      className="class-icon"
      style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.35))', flexShrink: 0, ...style }}
    >
      {title ? <title>{title}</title> : null}
      <circle
        cx="9"
        cy="9"
        r="8.5"
        style={{ fill: colour, stroke: `color-mix(in srgb, ${colour} 70%, black)`, strokeWidth: 1 }}
      />
      <Glyph c={classification} />
    </svg>
  )
}
