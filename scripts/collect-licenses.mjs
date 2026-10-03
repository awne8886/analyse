// Appends the license texts of the runtime libraries to THIRD_PARTY_LICENSES.md (PROMPT.md D.9).
// Reads node_modules/<pkg>/LICEN[CS]E* and NOTICE* verbatim, plus the MIT text of coi-serviceworker
// (downloaded from the pinned commit). Idempotent: the "## License texts" section, from its heading
// to the end of the file, is replaced when it already exists. Re-run after any dependency change.
/* global console, fetch */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'THIRD_PARTY_LICENSES.md')
const HEADING = '## License texts'
const PACKAGES = [
  'chess.js',
  'react-chessboard',
  'react',
  'react-dom',
  'zustand',
  'idb-keyval',
  'lucide-react',
  '@fontsource/montserrat',
]
const COI_LICENSE =
  'https://raw.githubusercontent.com/gzuidhof/coi-serviceworker/7b1d2a092d0d2dd2b7270b6f12f13605de26f214/LICENSE'

/** Wraps verbatim text in a code fence longer than any backtick run inside it. */
function fenced(text) {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}text\n${text.replace(/\s+$/, '')}\n${fence}`
}

const sections = []
for (const pkg of PACKAGES) {
  const dir = join(root, 'node_modules', pkg)
  const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const files = readdirSync(dir)
    .filter((f) => /^(LICEN[CS]E|NOTICE)/i.test(f))
    .sort()
  if (files.length === 0) {
    console.error(`no LICENSE or NOTICE file in node_modules/${pkg}`)
    process.exit(1)
  }
  const bodies = files.map((f) => {
    const text = fenced(readFileSync(join(dir, f), 'utf8'))
    return files.length > 1 ? `${f}\n\n${text}` : text
  })
  sections.push(`### ${pkg}@${version}\n\n${bodies.join('\n\n')}`)
}

const res = await fetch(COI_LICENSE)
if (!res.ok) {
  console.error(`download failed: ${COI_LICENSE} -> HTTP ${res.status}`)
  process.exit(1)
}
sections.push(`### coi-serviceworker\n\n${fenced(await res.text())}`)

const current = readFileSync(target, 'utf8')
const at = current.search(/^## License texts\s*$/m)
const head = (at === -1 ? current : current.slice(0, at)).replace(/\s+$/, '')
writeFileSync(target, `${head}\n\n${HEADING}\n\n${sections.join('\n\n')}\n`)
console.log(`${HEADING}: ${sections.length} sections written to THIRD_PARTY_LICENSES.md`)
