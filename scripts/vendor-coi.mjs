// Vendors the pinned master build of coi-serviceworker (PROMPT.md D.9, H.4).
// The npm package coi-serviceworker@0.1.7 must not be used (backwards Safari detection, no loop guard).
/* global console, fetch */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const COMMIT = '7b1d2a092d0d2dd2b7270b6f12f13605de26f214'
const URL_ = `https://raw.githubusercontent.com/gzuidhof/coi-serviceworker/${COMMIT}/coi-serviceworker.min.js`
const SHA256 = '166cb9395cd1f7e5790f22eefa2b3b966cc0fa7215f18174453fecbd6f3cab5d'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public', 'coi-serviceworker.min.js')

const res = await fetch(URL_)
if (!res.ok) {
  console.error(`download failed: ${URL_} -> HTTP ${res.status}`)
  process.exit(1)
}
const bytes = Buffer.from(await res.arrayBuffer())
const sha = createHash('sha256').update(bytes).digest('hex')
if (sha !== SHA256) {
  console.error(`sha256 mismatch: got ${sha}, expected ${SHA256}`)
  process.exit(1)
}
if (!bytes.toString('utf8').includes('coepdegrade')) {
  console.error('coepdegrade not found in the downloaded file')
  process.exit(1)
}
mkdirSync(dirname(dest), { recursive: true })
writeFileSync(dest, bytes)
console.log(
  `wrote public/coi-serviceworker.min.js (${bytes.length} bytes, sha256 ${sha}, contains coepdegrade)`,
)
