/**
 * Theme bootstrap row for the browser's pre-plugin interval. Each index
 * render embeds the current durable built-in preference, palette, and content
 * font size. Head CSS colors the document canvas with the palette background
 * before script execution; the body script installs the palette selectors and
 * font size that the client presenters adopt. A fixed palette's own color
 * scheme replaces the preference in both rows.
 */

import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import {
  DEFAULT_FONT_SIZE, DEFAULT_PALETTE, DEFAULT_PREFERENCE, paletteScheme, paletteSwatch,
  type ThemePalette, type ThemePreference,
} from './theme-settings.ts'

/** CSS that colors the document canvas before any script executes. */
function bootThemeStyle(preference: ThemePreference, palette: ThemePalette): string {
  const lightBg = paletteSwatch(palette, 'light').bg
  const darkBg = paletteSwatch(palette, 'dark').bg
  const light = `:root{color-scheme:light}body{background-color:${lightBg};--dsh-boot-bg:${lightBg}}`
  const dark = `:root{color-scheme:dark}body{background-color:${darkBg};--dsh-boot-bg:${darkBg}}`
  const scheme = paletteScheme(palette) ?? preference
  if (scheme === 'light') return light
  if (scheme === 'dark') return dark
  return `${light}@media(prefers-color-scheme:dark){${dark}}`
}

/** Build the body script that installs the palette selectors and content size. */
function bootThemeBodyScript(preference: ThemePreference, palette: ThemePalette, fontSize: number): string {
  return `(() => {
  const preference = ${JSON.stringify(paletteScheme(palette) ?? preference)}
  const systemDark = preference === 'system'
    && typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || systemDark
  document.documentElement.dataset.dsThemeSource = preference
  document.body.toggleAttribute('data-ds-dark-theme', dark)
  document.body.dataset.dsPalette = ${JSON.stringify(palette)}
  document.body.style.setProperty('--dsh-content-font-size', ${JSON.stringify(`${fontSize}px`)})
})()`
}

/**
 * Theme bootstrap rows: head CSS colors the document canvas before
 * first paint, then the body script installs the palette selectors and font
 * size before the shell mount and module script.
 * @param preference - Current Host-backed built-in preference.
 * @param fontSize - Current Host-backed content font size in px.
 * @param palette - Current Host-backed color palette.
 * @returns head and body script rows in execution order.
 */
export function bootThemeInjections(
  preference: ThemePreference = DEFAULT_PREFERENCE,
  fontSize: number = DEFAULT_FONT_SIZE,
  palette: ThemePalette = DEFAULT_PALETTE,
): IndexInjection[] {
  return [
    { kind: 'style', text: bootThemeStyle(preference, palette) },
    { kind: 'script', placement: 'body', text: bootThemeBodyScript(preference, palette, fontSize) },
  ]
}
