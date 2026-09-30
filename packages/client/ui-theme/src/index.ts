/** Host registration for the browser theme preference and pre-plugin palette. */
import type {} from '@deepseek-ai/dsh-settings'

import type { Volatile } from '@deepseek-ai/cordis'
import type { ThemePalette, ThemePreference } from './theme-settings.ts'
import z from '@deepseek-ai/schemastery'

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { bootThemeInjections } from './boot-theme.ts'
import {
  DEFAULT_FONT_SIZE, DEFAULT_PALETTE, DEFAULT_PREFERENCE, FONT_SIZE_MIN, FONT_SIZE_MAX, THEME_PALETTES,
  THEME_PREFERENCES,
} from './theme-settings.ts'

export {
  DEFAULT_FONT_SIZE, DEFAULT_PALETTE, DEFAULT_PREFERENCE, FONT_SIZE_FIELD, FONT_SIZE_MAX, FONT_SIZE_MIN,
  PALETTE_FIELD, PALETTES, paletteScheme, paletteSwatch, THEME_PALETTES, THEME_PREFERENCE_FIELD, THEME_PREFERENCES,
  THEME_SETTINGS_NAMESPACE,
  type ColorScheme, type PaletteSpec, type PaletteSwatch, type ThemePalette, type ThemePreference, type ThemeSettings,
} from './theme-settings.ts'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Browser palette preference. */
  preference: Volatile<ThemePreference>
  /** Browser font size in pixels. */
  fontSize: Volatile<number>
  /** Browser color palette. */
  palette: Volatile<ThemePalette>
}

/** Live theme and typography preferences. */
export const Config = z.object({
  preference: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE).volatile(),
  fontSize: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE).volatile(),
  palette: z.union([...THEME_PALETTES]).default(DEFAULT_PALETTE).volatile(),
})

/** Supply the current palette before browser plugins start.
 * @param ctx Host plugin context.
 * @param config Validated live theme preferences.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  ctx.on('webserver/index-inject', (table) => {
    table.push(...bootThemeInjections(config.preference.get(), config.fontSize.get(), config.palette.get()))
  }, { prepend: true })
}
