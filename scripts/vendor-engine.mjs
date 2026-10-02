// Engine update step (PROMPT.md R10, D.9).
//
// Copies the stockfish.js v19.0.0 lite builds into public/engine/sf19/.
//   - Preferred source: node_modules/stockfish (run `npm install --no-save stockfish@19.0.0` first;
//     the package is never a dependency in package.json).
//   - Fallback: the GitHub release assets of nmrugg/stockfish.js v19.0.0.
// `--check` only verifies the committed files (exact byte sizes, GPL text) and exits 1 on any mismatch.
/* global console, fetch, URL */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'engine', 'sf19')
const pkgDir = join(root, 'node_modules', 'stockfish')
const releaseBase = 'https://github.com/nmrugg/stockfish.js/releases/download/v19.0.0/'

// null size = existence only (Copying.txt is checked for its text instead).
const FILES = [
  { name: 'stockfish-19-lite-single.js', size: 21415, from: 'bin' },
  { name: 'stockfish-19-lite-single.wasm', size: 1787571, from: 'bin' },
  { name: 'stockfish-19-lite.js', size: 32817, from: 'bin' },
  { name: 'stockfish-19-lite.wasm', size: 1636291, from: 'bin' },
  { name: 'Copying.txt', size: null, from: '.' },
]

async function vendor() {
  mkdirSync(outDir, { recursive: true })
  for (const f of FILES) {
    const dest = join(outDir, f.name)
    const src = join(pkgDir, f.from, f.name)
    if (existsSync(src)) {
      copyFileSync(src, dest)
      console.log(`copied   ${f.name} (node_modules/stockfish)`)
      continue
    }
    const url = new URL(f.name, releaseBase).href
    const res = await fetch(url)
    if (!res.ok) throw new Error(`download failed: ${url} -> HTTP ${res.status}`)
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
    console.log(`download ${f.name} (${url})`)
  }
}

function check() {
  let ok = true
  for (const f of FILES) {
    const p = join(outDir, f.name)
    if (!existsSync(p)) {
      console.log(`MISSING ${f.name}`)
      ok = false
      continue
    }
    const size = statSync(p).size
    if (f.size === null) {
      const hasText = readFileSync(p, 'utf8').includes('GNU GENERAL PUBLIC LICENSE')
      console.log(`${f.name}: ${size} bytes${hasText ? '' : ' (GPL text NOT found)'}`)
      if (!hasText) ok = false
    } else {
      const match = size === f.size
      console.log(`${f.name}: ${size} bytes${match ? '' : ` (expected ${f.size})`}`)
      if (!match) ok = false
    }
  }
  console.log(ok ? 'OK' : 'FAILED')
  return ok
}

if (process.argv.includes('--check')) {
  process.exit(check() ? 0 : 1)
} else {
  await vendor()
  process.exit(check() ? 0 : 1)
}
