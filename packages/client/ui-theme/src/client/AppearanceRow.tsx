/**
 * Appearance preference row registered into the General section item slot
 * (figma 501:30012 'Frame 2117131228'): title + three preference cubes, then
 * the color palette cards. Registered by this package — the theme feature owns
 * its own settings surface. Selection follows the persisted preference and
 * palette, never the resolved active theme.
 */
import { useId, type CSSProperties } from 'react'
import clsx from 'clsx'
import {
  IconDarkOutlineMedium, IconFollowsystemOutlineMedium, IconLightOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  paletteScheme, paletteSwatch, THEME_PALETTES, type ThemePalette, type ThemePreference,
} from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference and palette writes (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
  /** Switch the color palette. */
  setPalette: (id: ThemePalette) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Cube order and icons (figma 501:30015-30017: Light, Dark, System). */
const CUBES: readonly { id: ThemePreference; labelKey: ThemeKey; Icon: typeof IconLightOutlineMedium }[] = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutlineMedium },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutlineMedium },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutlineMedium },
]

/**
 * Card preview colors as component-local custom properties; the stylesheet
 * picks the light or dark set from the active base palette. A fixed palette
 * passes its one scheme's colors for both sets.
 */
function swatchStyle(palette: ThemePalette): CSSProperties {
  const light = paletteSwatch(palette, 'light')
  const dark = paletteSwatch(palette, 'dark')
  return {
    '--palette-light-bg': light.bg,
    '--palette-light-surface': light.surface,
    '--palette-light-ink': light.ink,
    '--palette-light-accent': light.accent,
    '--palette-dark-bg': dark.bg,
    '--palette-dark-surface': dark.surface,
    '--palette-dark-ink': dark.ink,
    '--palette-dark-accent': dark.accent,
  } as CSSProperties
}

/**
 * Render the Appearance row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceRow({ t, setTheme, setPalette, useStore }: AppearanceRowComponentProps) {
  const preference = useStore(s => s.preference)
  const palette = useStore(s => s.palette)
  const paletteLabel = useId()
  return (
    <div className={css.group}>
      <div className={css.title}>{t('appearance.title')}</div>
      <div className={css.cubeRow}>
        {CUBES.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCube, preference === id && css.selected)}
            aria-pressed={preference === id}
            onClick={() => { setTheme(id) }}
          >
            <Icon />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className={css.paletteHeading}>
        <div className={css.subtitle} id={paletteLabel}>{t('appearance.palette')}</div>
        <div className={css.hint}>{t('appearance.paletteHint')}</div>
      </div>
      <div className={css.paletteGrid} role="group" aria-labelledby={paletteLabel}>
        {THEME_PALETTES.map((id) => {
          const scheme = paletteScheme(id)
          return (
            <button
              key={id}
              type="button"
              className={clsx(css.paletteCard, palette === id && css.selected)}
              aria-pressed={palette === id}
              style={swatchStyle(id)}
              onClick={() => { setPalette(id) }}
            >
              <span className={css.preview} aria-hidden="true">
                <span className={css.previewLine} />
                <span className={css.previewLineShort} />
                <span className={css.previewComposer}>
                  <span className={css.previewSend} />
                </span>
              </span>
              <span className={css.paletteLabel}>
                <span className={css.paletteName}>{t(`palette.${id}`)}</span>
                {scheme !== null && <>{' '}<span className={css.paletteTag}>{t(`palette.tag.${scheme}`)}</span></>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
