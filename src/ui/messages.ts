// Renders a keyed message from the three string tables (Appendix F preamble: components render by key).
import { ENGINE_STRINGS } from '../engine'
import { IMPORT_STRINGS } from '../import'
import type { KeyedText } from '../state'
import { UI_STRINGS, fmt } from './strings'

export function templateOf(key: string): string | undefined {
  return IMPORT_STRINGS[key] ?? ENGINE_STRINGS[key] ?? UI_STRINGS[key]
}

/** The string under `m.key` with its placeholders filled; the module-supplied fallback text is used only when
 *  the key is unknown or a placeholder has no value. */
export function renderKeyed(m: KeyedText): string {
  const template = templateOf(m.key)
  if (template === undefined) return m.fallback ?? ''
  const text = fmt(template, m.vars)
  return m.fallback && /\{[A-Za-z0-9_]+\}/.test(text) ? m.fallback : text
}
