// Builds src/data/openings.json from lichess-org/chess-openings (PROMPT.md B.8).
// Source data is released under the CC0 Public Domain Dedication (see the repository README).
// Each row's pgn is replayed with chess.js; the table is keyed by EPD (first 4 FEN fields of the
// position after the last move) and holds { eco, name }. When two lines transpose to one EPD the
// first row (files a to e, in file order) wins.
/* global console, fetch */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/'
const EXPECTED_ROWS = 3815
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'src', 'data', 'openings.json')

const table = {}
let rows = 0
let transpositions = 0

for (const letter of ['a', 'b', 'c', 'd', 'e']) {
  const url = `${BASE}${letter}.tsv`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`download failed: ${url} -> HTTP ${res.status}`)
    process.exit(1)
  }
  const lines = (await res.text()).split(/\r?\n/).filter((l) => l.trim() !== '')
  const header = lines.shift().split('\t')
  if (header.join(',') !== 'eco,name,pgn') {
    console.error(`unexpected header in ${letter}.tsv: ${header.join(',')}`)
    process.exit(1)
  }
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t')
    const chess = new Chess()
    chess.loadPgn(pgn)
    const moves = chess.history({ verbose: true })
    if (moves.length === 0) {
      console.error(`no moves parsed for ${eco} ${name}`)
      process.exit(1)
    }
    const epd = moves[moves.length - 1].after.split(' ').slice(0, 4).join(' ')
    rows++
    if (Object.hasOwn(table, epd)) {
      transpositions++
      continue
    }
    table[epd] = { eco, name }
  }
  console.log(`${letter}.tsv: ${lines.length} rows`)
}

mkdirSync(dirname(dest), { recursive: true })
const json = JSON.stringify(table)
writeFileSync(dest, json + '\n')
const keys = Object.keys(table).length
console.log(`rows parsed: ${rows} (expected ${EXPECTED_ROWS})`)
console.log(`keys written: ${keys} (${transpositions} transpositions skipped), ${json.length + 1} bytes`)
if (rows !== EXPECTED_ROWS) console.warn(`warning: expected ${EXPECTED_ROWS} rows, parsed ${rows}`)
