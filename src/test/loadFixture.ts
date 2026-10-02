/// <reference types="node" />
// Shared test helper (lead-owned). Recorded network fixtures live in src/test/fixtures/network/ as
// <host>-<kind>-<id>.json wrappers: { url, status, contentType, acao, body } where body is the parsed JSON
// (or the raw text when the upstream body was not JSON). Load them inside a test body, never with a static
// import, so one missing file fails one test.
import { readFileSync } from 'node:fs'
import { URL as NodeURL, fileURLToPath } from 'node:url'

export interface NetworkFixture {
  url: string
  status: number
  contentType: string
  acao: string | null
  body: unknown
}

const NETWORK_DIR = fileURLToPath(new NodeURL('./fixtures/network/', import.meta.url))

export function loadNetworkFixture(name: string): NetworkFixture {
  const file = name.endsWith('.json') ? name : `${name}.json`
  return JSON.parse(readFileSync(NETWORK_DIR + file, 'utf8')) as NetworkFixture
}

/** A fetch Response replaying a recorded fixture (status, content-type and body). */
export function fixtureResponse(f: NetworkFixture): Response {
  const text = typeof f.body === 'string' ? f.body : JSON.stringify(f.body)
  return new Response(f.status === 204 ? null : text, {
    status: f.status,
    headers: { 'content-type': f.contentType },
  })
}

/** Reads any file relative to src/test/fixtures/ (e.g. 'pgn/multi.pgn'). */
export function readFixtureText(relPath: string): string {
  return readFileSync(fileURLToPath(new NodeURL(`./fixtures/${relPath}`, import.meta.url)), 'utf8')
}
