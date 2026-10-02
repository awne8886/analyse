// Fetches and prepares the bundled assets (PROMPT.md H.1, H.2, D.9).
//   - Kaneo pieces (CC BY 4.0), width/height stripped from the root <svg>, viewBox kept
//   - cburnett pieces (GPL-2.0-or-later option), copied unchanged
//   - Kenney interface/impact sounds (CC0), transcoded to mp3 with ffmpeg (-codec:a libmp3lame -q:a 4)
//   - the Montserrat OFL text from @fontsource/montserrat
// Needs network access, `unzip` and `ffmpeg` on PATH. Never touches anything from chess.com.
/* global console, fetch */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')

const CODES = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK']
const KANEO = 'https://raw.githubusercontent.com/Kadagaden/chess-pieces/master/chess_kaneo/'
const CBURNETT = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/'
const KENNEY = {
  interface:
    'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
  impact: 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
}
// output mp3 -> [pack, source ogg inside Audio/]; castle.mp3 is built separately (medium + 60 ms + light)
const SOUNDS = {
  'move.mp3': ['impact', 'impactWood_light_000'],
  'capture.mp3': ['impact', 'impactWood_heavy_000'],
  'check.mp3': ['impact', 'impactBell_heavy_002'],
  'promote.mp3': ['interface', 'confirmation_001'],
  'game-end.mp3': ['interface', 'confirmation_002'],
  'brilliant.mp3': ['interface', 'glass_001'],
  'illegal.mp3': ['interface', 'error_004'],
  'notify.mp3': ['interface', 'select_001'],
}

async function get(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${url} -> HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Removes the width and height attributes of the root <svg> element only. */
function stripRootSize(svg) {
  return svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(?:width|height)="[^"]*"/g, ''))
}

async function pieces() {
  const kaneoDir = join(pub, 'pieces', 'kaneo')
  const cburnettDir = join(pub, 'pieces', 'cburnett')
  mkdirSync(kaneoDir, { recursive: true })
  mkdirSync(cburnettDir, { recursive: true })
  for (const code of CODES) {
    const raw = (await get(`${KANEO}${code}.svg`)).toString('utf8')
    const svg = stripRootSize(raw)
    if (!/viewBox="0 0 50 50"/.test(svg) || /\s(?:width|height)="/.test(svg.match(/<svg\b[^>]*>/)[0])) {
      throw new Error(`unexpected Kaneo root element in ${code}.svg`)
    }
    writeFileSync(join(kaneoDir, `${code}.svg`), svg)
    writeFileSync(join(cburnettDir, `${code}.svg`), await get(`${CBURNETT}${code}.svg`))
  }
  console.log(`pieces: ${CODES.length} Kaneo + ${CODES.length} cburnett SVGs written`)
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
}

async function sounds() {
  const outDir = join(pub, 'sounds')
  mkdirSync(outDir, { recursive: true })
  const tmp = mkdtempSync(join(tmpdir(), 'analyse-kenney-'))
  try {
    const zips = {}
    for (const [pack, url] of Object.entries(KENNEY)) {
      zips[pack] = join(tmp, `${pack}.zip`)
      writeFileSync(zips[pack], await get(url))
    }
    const ogg = (pack, name) => {
      const dest = join(tmp, `${name}.ogg`)
      writeFileSync(dest, execFileSync('unzip', ['-p', zips[pack], `Audio/${name}.ogg`], { maxBuffer: 1 << 26 }))
      return dest
    }
    for (const [out, [pack, name]] of Object.entries(SOUNDS)) {
      ffmpeg(['-i', ogg(pack, name), '-codec:a', 'libmp3lame', '-q:a', '4', join(outDir, out)])
    }
    // castle: impactWood_medium_000, 60 ms of silence, impactWood_light_000
    const fmt = 'aformat=sample_rates=44100:channel_layouts=stereo'
    ffmpeg([
      '-i',
      ogg('impact', 'impactWood_medium_000'),
      '-i',
      ogg('impact', 'impactWood_light_000'),
      '-filter_complex',
      `[0:a]${fmt},apad=pad_dur=0.06[a];[1:a]${fmt}[b];[a][b]concat=n=2:v=0:a=1[o]`,
      '-map',
      '[o]',
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '4',
      join(outDir, 'castle.mp3'),
    ])
    console.log(`sounds: ${Object.keys(SOUNDS).length + 1} mp3 files written`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function fontLicense() {
  const dest = join(pub, 'fonts', 'montserrat-OFL.txt')
  mkdirSync(dirname(dest), { recursive: true })
  const src = join(root, 'node_modules', '@fontsource', 'montserrat', 'LICENSE')
  readFileSync(src)
  copyFileSync(src, dest)
  console.log('fonts: public/fonts/montserrat-OFL.txt copied')
}

try {
  await pieces()
  await sounds()
  fontLicense()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
