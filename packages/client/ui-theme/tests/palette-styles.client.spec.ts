/**
 * Color palette stylesheet contract, asserted against palettes.css on disk:
 * every non-classic adaptive palette declares the full primitive set for both
 * color schemes and every fixed palette for its own scheme, the PALETTES table
 * the Appearance row and Host bootstrap read equals those primitives, text and
 * accent pairs stay readable, and the shared derivation blocks rebind the same
 * alias set in both schemes.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PALETTES, THEME_PALETTES, type ColorScheme, type ThemePalette } from '../src/theme-settings.ts'
import { parseRules } from './stylesheet-scan.ts'

const css = readFileSync(fileURLToPath(new URL('../src/styles/palettes.css', import.meta.url)), 'utf8')
const rules = parseRules(css)

const PRIMITIVES = [
  '--dsp-bg', '--dsp-sidebar', '--dsp-surface', '--dsp-raised', '--dsp-high', '--dsp-code',
  '--dsp-ink', '--dsp-ink-2', '--dsp-ink-3', '--dsp-ink-4',
  '--dsp-accent', '--dsp-accent-strong', '--dsp-accent-ink', '--dsp-on-accent',
]

const LIGHT_DERIVATION = "body[data-ds-palette]:not([data-ds-palette='classic']):not([data-ds-dark-theme])"
const DARK_DERIVATION = "body[data-ds-palette]:not([data-ds-palette='classic'])[data-ds-dark-theme]"

/** Primitive declarations of one palette in one scheme. */
function primitives(palette: ThemePalette, scheme: ColorScheme): Map<string, string> {
  const selector = PALETTES[palette].kind === 'fixed'
    ? `body[data-ds-palette='${palette}']`
    : scheme === 'light'
      ? `body[data-ds-palette='${palette}']:not([data-ds-dark-theme])`
      : `body[data-ds-palette='${palette}'][data-ds-dark-theme]`
  const rule = rules.find(candidate => candidate.selectors.length === 1 && candidate.selectors[0] === selector)
  return new Map(rule?.declarations)
}

/** Declared property names of the rule with exactly this selector. */
function declaredNames(selector: string): string[] {
  return rules.find(rule => rule.selectors[0] === selector)?.declarations.map(([name]) => name) ?? []
}

/** Expand `#rgb` / `#rrggbb` to a lower-case `#rrggbb`. */
function normalizeHex(hex: string): string {
  const body = hex.slice(1).toLowerCase()
  return body.length === 3 ? `#${body.replace(/./g, digit => digit + digit)}` : `#${body}`
}

/** WCAG 2 relative luminance of an opaque hex color. */
function luminance(hex: string): number {
  const body = normalizeHex(hex).slice(1)
  const channels = [0, 2, 4].map((start) => {
    const value = Number.parseInt(body.slice(start, start + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [red = 0, green = 0, blue = 0] = channels
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** WCAG 2 contrast ratio between two opaque hex colors. */
function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((left, right) => right - left)
  return (lighter! + 0.05) / (darker! + 0.05)
}

/** Every stylesheet-defined palette with each scheme it declares. */
const CASES = THEME_PALETTES.filter(palette => palette !== 'classic').flatMap((palette) => {
  const spec = PALETTES[palette]
  return spec.kind === 'fixed'
    ? [[palette, spec.scheme] as const]
    : (['light', 'dark'] as const).map(scheme => [palette, scheme] as const)
})

/** The preview swatch the table stores for one palette and scheme. */
function swatchOf(palette: ThemePalette, scheme: ColorScheme) {
  const spec = PALETTES[palette]
  return spec.kind === 'fixed' ? spec.swatch : spec[scheme]
}

describe('palette primitives', () => {
  it.each(CASES)('%s (%s) declares every primitive exactly once as a hex color', (palette, scheme) => {
    const declared = primitives(palette, scheme)
    expect([...declared.keys()].sort()).toEqual([...PRIMITIVES].sort())
    for (const value of declared.values()) expect(value).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/)
  })

  it.each(CASES)('%s (%s) swatch equals its stylesheet primitives', (palette, scheme) => {
    const declared = primitives(palette, scheme)
    const swatch = swatchOf(palette, scheme)
    expect(normalizeHex(swatch.bg)).toBe(normalizeHex(declared.get('--dsp-bg')!))
    expect(normalizeHex(swatch.surface)).toBe(normalizeHex(declared.get('--dsp-surface')!))
    expect(normalizeHex(swatch.ink)).toBe(normalizeHex(declared.get('--dsp-ink')!))
    expect(normalizeHex(swatch.accent)).toBe(normalizeHex(declared.get('--dsp-accent')!))
  })

  it.each(CASES)('%s (%s) keeps text and accent pairs readable', (palette, scheme) => {
    const value = (name: string): string => primitives(palette, scheme).get(name)!
    for (const ground of ['--dsp-bg', '--dsp-sidebar', '--dsp-surface']) {
      expect(contrast(value('--dsp-ink'), value(ground))).toBeGreaterThanOrEqual(12)
      expect(contrast(value('--dsp-ink-2'), value(ground))).toBeGreaterThanOrEqual(6)
      expect(contrast(value('--dsp-ink-3'), value(ground))).toBeGreaterThanOrEqual(4.5)
    }
    // Captions and placeholders follow the base palette's caption tier.
    expect(contrast(value('--dsp-ink-4'), value('--dsp-bg'))).toBeGreaterThanOrEqual(2.4)
    expect(contrast(value('--dsp-accent-ink'), value('--dsp-bg'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(value('--dsp-on-accent'), value('--dsp-accent'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(value('--dsp-on-accent'), value('--dsp-accent-strong'))).toBeGreaterThanOrEqual(4.5)
  })

  it('covers every adaptive and fixed palette, eight of them fixed dark and seven fixed light', () => {
    const fixed = THEME_PALETTES.flatMap((palette) => {
      const spec = PALETTES[palette]
      return spec.kind === 'fixed' ? [spec.scheme] : []
    })
    expect(fixed.filter(scheme => scheme === 'dark')).toHaveLength(8)
    expect(fixed.filter(scheme => scheme === 'light')).toHaveLength(7)
    expect(CASES).toHaveLength(7 * 2 + 15)
  })

  it('declares no rule for classic, which keeps the base token sheets', () => {
    expect(rules.some(rule => rule.selectors.some(selector => selector.includes("[data-ds-palette='classic']")
      && !selector.includes(':not(')))).toBe(false)
  })
})

describe('palette derivation', () => {
  it('rebinds the same alias set in both schemes', () => {
    const light = declaredNames(LIGHT_DERIVATION)
    const dark = declaredNames(DARK_DERIVATION).filter(name => !name.startsWith('--dsw-alias-border-inverted'))
    expect(light.length).toBeGreaterThan(50)
    expect([...light].sort()).toEqual([...dark].sort())
  })

  it('derives only from palette primitives and alias tokens, never literal colors', () => {
    for (const selector of [LIGHT_DERIVATION, DARK_DERIVATION]) {
      const rule = rules.find(candidate => candidate.selectors[0] === selector)!
      for (const [, value] of rule.declarations) expect(value).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i)
    }
  })
})
