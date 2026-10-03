// G.28 contrast and G.29 layout rules, computed from the CSS values themselves (a11y H1, H2, M1, M2, L3, L4;
// parity GAP-1, GAP-2): every text colour token against every background it is drawn on, in both themes.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLASSIFICATIONS } from '../types/review'

const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
const themeCss = readFileSync(resolve(process.cwd(), 'src/ui/theme.css'), 'utf8')

/** `--name: #hex` declarations of the first block that starts with `selector {`. */
function tokens(selector: string): Record<string, string> {
  const start = indexCss.indexOf(`${selector} {`)
  const block = indexCss.slice(start, indexCss.indexOf('\n}', start))
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]),
  )
}
const LIGHT = tokens(':root')
const DARK = { ...LIGHT, ...tokens('.dark') }

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** CSS declarations of the rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const start = themeCss.indexOf(`\n${selector} {`)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  return themeCss.slice(start, themeCss.indexOf('}', start))
}

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
] as const)('%s theme text contrast (G.28)', (_name, v) => {
  // backgrounds behind classification-coloured text: panels, alternate and active move rows
  const classBackgrounds = ['color-panel', 'color-row-alt', 'color-active']

  it('the theme defines every token the checks read', () => {
    for (const c of CLASSIFICATIONS) expect(v[`color-classification-text-${c}`], c).toMatch(/^#/)
    for (const k of ['color-text', 'color-text-muted', 'color-panel', 'color-page', 'color-title-bg'])
      expect(v[k], k).toMatch(/^#/)
  })

  it.each(CLASSIFICATIONS)('%s text is at least 4.5:1 on panels and on alternate and active rows', (c) => {
    for (const bg of classBackgrounds) {
      expect(contrast(v[`color-classification-text-${c}`], v[bg]), `${c} on ${bg}`).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })

  it('body and muted text are at least 4.5:1 on the page, panels and rows', () => {
    for (const fg of ['color-text', 'color-text-muted']) {
      for (const bg of ['color-page', 'color-panel', 'color-row-alt', 'color-active', 'color-button']) {
        expect(contrast(v[fg], v[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    // links sit in the footer, the About panel and the import panel
    for (const bg of ['color-page', 'color-panel']) {
      expect(contrast(v['color-link'], v[bg]), `color-link on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('eval-graph phase labels and the title chip are at least 4.5:1', () => {
    for (const p of ['middlegame', 'endgame']) {
      expect(contrast(v[`color-phase-${p}-text`], v['color-panel']), p).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast('#ffffff', v['color-title-bg'])).toBeGreaterThanOrEqual(4.5)
  })
})

describe('section 3.6 values stay for icons, tints and arrows', () => {
  it('keeps the pinned classification colours and the pinned dark-theme grey', () => {
    expect(LIGHT['color-classification-inaccuracy']).toBe('#e3aa24')
    expect(DARK['color-classification-blunder']).toBe('#fa412d')
    expect(DARK['color-text-muted']).toBe('#bebdb9') // PLAN Assumption 29
  })

  it('classification-coloured text uses the text tokens', () => {
    for (const sel of [
      '.grade-correct',
      '.grade-good',
      '.grade-ok',
      '.grade-incorrect',
      '.winner .player-name',
    ]) {
      expect(rule(sel)).toMatch(/color: var\(--color-classification-text-/)
    }
    expect(rule('.player-title')).toContain('background: var(--color-title-bg)')
  })
})

describe('360 px layout rules (G.29, a11y H1)', () => {
  it('the import form and the settings panel use one shrinkable column', () => {
    expect(rule('.import-form')).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(rule('.settings-panel')).toContain('grid-template-columns: minmax(0, 1fr)')
  })

  it('the profile select never grows past its line', () => {
    const select = rule('.profile-line select')
    expect(select).toContain('min-width: 0')
    expect(select).toContain('max-width: 100%')
    expect(rule('.profile-line')).toContain('min-width: 0')
  })
})
