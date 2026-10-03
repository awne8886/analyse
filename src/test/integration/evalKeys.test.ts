// Review correctness L3: scripts/record-evals.mjs builds its table keys itself; every recorded key must equal the
// one key builder of C.1 item 8 (`evalKey` in src/engine), or the mock engine would miss positions.
import { describe, expect, it } from 'vitest'
import { evalKey } from '../../engine'
import type { PositionEval } from '../../types/engine'
import { readFixtureText } from '../loadFixture'

describe('recorded eval tables use evalKey', () => {
  it.each(['cc_live_129688175007', 'cc_daily_1000337106', 'li_4S1PZUvW'])('%s', (name) => {
    const table = JSON.parse(readFixtureText(`evals/${name}.json`)) as Record<string, PositionEval>
    const entries = Object.entries(table)
    expect(entries.length).toBeGreaterThan(0)
    for (const [key, ev] of entries) {
      expect(key).toBe(evalKey(ev.fen, { depth: 16, movetimeMs: 2000, multiPv: 2 }))
    }
  })
})
