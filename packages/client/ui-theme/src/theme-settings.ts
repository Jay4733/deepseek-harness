/** Theme preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Built-in preferences accepted at the registry and settings boundaries. */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const

/** Settings namespace owned by the theme plugin. */
export const THEME_SETTINGS_NAMESPACE = 'ui-theme'

/** Field carrying the selected built-in theme preference. */
export const THEME_PREFERENCE_FIELD = 'preference'

/** Field carrying the conversation content font size. */
export const FONT_SIZE_FIELD = 'fontSize'

/** Field carrying the selected color palette. */
export const PALETTE_FIELD = 'palette'

/**
 * Built-in color palettes in picker order: the adaptive palettes, then the
 * fixed dark and fixed light ones. `classic` keeps the base token sheets
 * unchanged; every other palette rebinds the alias layer in
 * `styles/palettes.css`.
 */
export const THEME_PALETTES = [
  'neutral', 'warm', 'ocean', 'graphite', 'forest', 'violet', 'paper', 'classic',
  'midnight', 'phosphor', 'arctic', 'dusk', 'wine', 'ember', 'twilight', 'oled',
  'sand', 'mist', 'rose', 'lilac', 'mint', 'sunlit', 'storm',
] as const

/** Color palette persisted by the product Appearance row. */
export type ThemePalette = typeof THEME_PALETTES[number]

/** Default palette when the user-settings document has no override. */
export const DEFAULT_PALETTE: ThemePalette = 'neutral'

/** One of the two base token palettes. */
export type ColorScheme = 'light' | 'dark'

/** Preview colors of one palette in one color scheme, as CSS hex colors. */
export interface PaletteSwatch {
  /** Document ground (`--dsp-bg`). */
  bg: string
  /** Composer and card fill (`--dsp-surface`). */
  surface: string
  /** Primary text (`--dsp-ink`). */
  ink: string
  /** Accent fill (`--dsp-accent`). */
  accent: string
}

/**
 * How one palette relates to the Appearance preference. An `adaptive` palette
 * defines both schemes and follows the preference; a `fixed` palette defines
 * one scheme and forces it whatever the preference says.
 */
export type PaletteSpec =
  | {
    /** Follows the Appearance preference. */
    kind: 'adaptive'
    /** Colors while the light base palette is active. */
    light: PaletteSwatch
    /** Colors while the dark base palette is active. */
    dark: PaletteSwatch
  }
  | {
    /** Forces its own color scheme. */
    kind: 'fixed'
    /** The color scheme this palette forces. */
    scheme: ColorScheme
    /** Colors of that scheme. */
    swatch: PaletteSwatch
  }

/**
 * Preview colors and scheme behavior per palette: the Appearance row draws each
 * palette card from them, the theme service forces a fixed palette's scheme,
 * and the Host bootstrap paints `bg` as the document canvas before the token
 * sheets load. Values equal the palette primitives in `styles/palettes.css`;
 * `classic` repeats the base sheet's values.
 */
export const PALETTES: Readonly<Record<ThemePalette, PaletteSpec>> = Object.freeze({
  neutral: {
    kind: 'adaptive',
    light: { bg: '#fcfcfd', surface: '#fff', ink: '#0d0e12', accent: '#4562f5' },
    dark: { bg: '#131416', surface: '#1b1c1f', ink: '#ececf1', accent: '#4865fb' },
  },
  warm: {
    kind: 'adaptive',
    light: { bg: '#fbf8f4', surface: '#fff', ink: '#221b16', accent: '#bd5720' },
    dark: { bg: '#15120f', surface: '#211c18', ink: '#f2ebe3', accent: '#e27b41' },
  },
  ocean: {
    kind: 'adaptive',
    light: { bg: '#f7f8fd', surface: '#fff', ink: '#141a2e', accent: '#3e5bd8' },
    dark: { bg: '#0e1220', surface: '#181e33', ink: '#e6eaf7', accent: '#6b86f8' },
  },
  graphite: {
    kind: 'adaptive',
    light: { bg: '#fafafa', surface: '#fff', ink: '#18181b', accent: '#27272a' },
    dark: { bg: '#141416', surface: '#1f1f22', ink: '#ededf0', accent: '#d4d4d8' },
  },
  forest: {
    kind: 'adaptive',
    light: { bg: '#f6faf7', surface: '#fff', ink: '#13201a', accent: '#237a4d' },
    dark: { bg: '#0e1511', surface: '#17221c', ink: '#e5f0e9', accent: '#5fbf8a' },
  },
  violet: {
    kind: 'adaptive',
    light: { bg: '#faf8fe', surface: '#fff', ink: '#1c1530', accent: '#6d4ed6' },
    dark: { bg: '#140f1e', surface: '#1f182d', ink: '#eee8fa', accent: '#a78bfa' },
  },
  paper: {
    kind: 'adaptive',
    light: { bg: '#f5f1ea', surface: '#fbf9f5', ink: '#2b2520', accent: '#b45a3b' },
    dark: { bg: '#1b1815', surface: '#26211d', ink: '#efe8dc', accent: '#d97757' },
  },
  classic: {
    kind: 'adaptive',
    light: { bg: '#fff', surface: '#fff', ink: '#0f1115', accent: '#4176e6' },
    dark: { bg: '#151517', surface: '#2c2c2e', ink: '#f9fafb', accent: '#7aaaff' },
  },
  midnight: { kind: 'fixed', scheme: 'dark', swatch: { bg: '#0c1528', surface: '#111c31', ink: '#e3e9f8', accent: '#5b9bff' } },
  phosphor: { kind: 'fixed', scheme: 'dark', swatch: { bg: '#0b120d', surface: '#0f1812', ink: '#cfe8d2', accent: '#2ecc71' } },
  arctic: { kind: 'fixed', scheme: 'dark', swatch: { bg: '#252c38', surface: '#2d3543', ink: '#fbfcfc', accent: '#8ec3d1' } },
  dusk: { kind: 'fixed', scheme: 'dark', swatch: { bg: '#1a1528', surface: '#201b32', ink: '#ece7f8', accent: '#b38cff' } },
  wine: { kind: 'fixed', scheme: 'dark', swatch: { bg: '#1e1114', surface: '#251519', ink: '#efe0e4', accent: '#d44b69' } },
  ember: { kind: 'fixed', scheme: 'dark', swatch: { bg: '#201512', surface: '#261b17', ink: '#f3ebe2', accent: '#ff8a4c' } },
  twilight: { kind: 'fixed', scheme: 'dark', swatch: { bg: '#032a3a', surface: '#063142', ink: '#f5f0e3', accent: '#2aa198' } },
  oled: { kind: 'fixed', scheme: 'dark', swatch: { bg: '#000000', surface: '#080808', ink: '#f2f2f2', accent: '#ffffff' } },
  sand: { kind: 'fixed', scheme: 'light', swatch: { bg: '#f3efe4', surface: '#fbf9f6', ink: '#202b2b', accent: '#1f7a6d' } },
  mist: { kind: 'fixed', scheme: 'light', swatch: { bg: '#f0f4fa', surface: '#fafbfd', ink: '#1c2433', accent: '#2f6fdb' } },
  rose: { kind: 'fixed', scheme: 'light', swatch: { bg: '#fdf3f5', surface: '#fefbfc', ink: '#2e1f27', accent: '#c2386a' } },
  lilac: { kind: 'fixed', scheme: 'light', swatch: { bg: '#f3f1fa', surface: '#fbfafd', ink: '#2a2340', accent: '#7651c9' } },
  mint: { kind: 'fixed', scheme: 'light', swatch: { bg: '#eff8f3', surface: '#f9fdfb', ink: '#1f2b25', accent: '#1e8255' } },
  sunlit: { kind: 'fixed', scheme: 'light', swatch: { bg: '#fbf5e4', surface: '#fefcf6', ink: '#2e2e26', accent: '#2477b6' } },
  storm: { kind: 'fixed', scheme: 'light', swatch: { bg: '#eef0f3', surface: '#f9fafb', ink: '#20262f', accent: '#4a6899' } },
})

/**
 * The color scheme a palette forces.
 * @param palette - built-in palette id.
 * @returns the fixed palette's scheme, or `null` for a palette that follows the preference.
 */
export function paletteScheme(palette: ThemePalette): ColorScheme | null {
  const spec = PALETTES[palette]
  return spec.kind === 'fixed' ? spec.scheme : null
}

/**
 * A palette's preview colors in one scheme.
 * @param palette - built-in palette id.
 * @param scheme - requested color scheme; a fixed palette answers with its own scheme's colors.
 * @returns the swatch drawn for that palette.
 */
export function paletteSwatch(palette: ThemePalette, scheme: ColorScheme): PaletteSwatch {
  const spec = PALETTES[palette]
  return spec.kind === 'fixed' ? spec.swatch : spec[scheme]
}

/** Theme preference persisted by the product Appearance row. */
export type ThemePreference = typeof THEME_PREFERENCES[number]

/** Default preference when the user-settings document has no override. */
export const DEFAULT_PREFERENCE: ThemePreference = 'system'

/** Smallest accepted content font size (px). */
export const FONT_SIZE_MIN = 10

/** Largest accepted content font size (px). */
export const FONT_SIZE_MAX = 22

/** Content font size when the user-settings document has no override (px). */
export const DEFAULT_FONT_SIZE = 14

/** Durable theme section shared by the Host schema and the browser scope. */
export interface ThemeSettings {
  /** Selected built-in preference. */
  preference: ThemePreference
  /** Conversation content font size in px (integer within {@link FONT_SIZE_MIN}..{@link FONT_SIZE_MAX}). */
  fontSize: number
  /** Selected color palette. */
  palette: ThemePalette
}

/** Durable theme schema; also the wire envelope the browser scope validates against. */
export const ThemeSettingsSchema: z<ThemeSettings> = z.object({
  [THEME_PREFERENCE_FIELD]: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE),
  [FONT_SIZE_FIELD]: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE),
  [PALETTE_FIELD]: z.union([...THEME_PALETTES]).default(DEFAULT_PALETTE),
})

/**
 * Narrow one wire or registry value to a persistable preference.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a built-in preference.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some(preference => preference === value)
}

/**
 * Narrow one wire or registry value to a persistable palette.
 * @param value - value crossing the settings or runtime boundary.
 * @returns whether the value is a built-in palette.
 */
export function isThemePalette(value: unknown): value is ThemePalette {
  return THEME_PALETTES.some(palette => palette === value)
}
