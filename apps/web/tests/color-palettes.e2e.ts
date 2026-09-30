/**
 * The shipped Neutral palette paints from the Host bootstrap, a palette picked
 * in Settings persists across reload, and a fixed palette forces its scheme.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { openSettings } from './support.ts'

/** @param page - Application page. @returns The body's palette selectors and painted ground. */
function paint(page: Page) {
  return page.evaluate(() => ({
    palette: document.body.dataset.dsPalette,
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    background: getComputedStyle(document.body).backgroundColor,
  }))
}

it('boots the Neutral palette, persists a picked palette across reload, and lets a fixed palette force its scheme', async () => {
  const scaffold = await launchWebScaffold({ shippedPalette: true })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', locale: 'en-US' })
  const tripwire = watchConsole(page)

  // The index bootstrap names the palette and paints its ground before any plugin script runs.
  const index = await (await page.request.get(scaffold.authenticatedUrl)).text()
  expect(index).toContain('document.body.dataset.dsPalette = "neutral"')
  expect(index).toContain('background-color:#131416')
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await expect.poll(() => paint(page)).toEqual({ palette: 'neutral', dark: true, background: 'rgb(19, 20, 22)' })

  await openSettings(page, 'en')
  const palettes = page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('group', { name: 'Color palette' })
  expect(await palettes.getByRole('button').allTextContents()).toEqual([
    'Neutral', 'Warm', 'Ocean', 'Graphite', 'Forest', 'Violet', 'Paper', 'Classic',
    'Midnight Dark', 'Phosphor Dark', 'Arctic Dark', 'Dusk Dark', 'Wine Dark', 'Ember Dark', 'Twilight Dark',
    'OLED Black Dark', 'Sand Light', 'Mist Light', 'Rose Light', 'Lilac Light', 'Mint Light', 'Sunlit Light',
    'Storm Light',
  ])
  expect(await palettes.getByRole('button', { name: 'Neutral', exact: true }).getAttribute('aria-pressed')).toBe('true')

  await palettes.getByRole('button', { name: 'Forest', exact: true }).click()
  await expect.poll(() => paint(page)).toEqual({ palette: 'forest', dark: true, background: 'rgb(14, 21, 17)' })
  await expect.poll(() => palettes.getByRole('button', { name: 'Forest', exact: true }).getAttribute('aria-pressed')).toBe('true')
  await expect.poll(
    () => readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8'),
    { timeout: 10_000 },
  ).toContain('palette: forest')

  await page.reload({ waitUntil: 'load' })
  await expect.poll(() => paint(page)).toEqual({ palette: 'forest', dark: true, background: 'rgb(14, 21, 17)' })

  // A fixed Light palette forces the light base under the dark system preference.
  await openSettings(page, 'en')
  await palettes.getByRole('button', { name: 'Mist Light', exact: true }).click()
  await expect.poll(() => paint(page)).toEqual({ palette: 'mist', dark: false, background: 'rgb(240, 244, 250)' })
  expect(await page.evaluate(() => document.documentElement.dataset.dsThemeSource)).toBe('light')

  // Classic leaves the base token sheets unrebound and follows the preference again.
  await palettes.getByRole('button', { name: 'Classic', exact: true }).click()
  await expect.poll(() => paint(page)).toEqual({ palette: 'classic', dark: true, background: 'rgb(21, 21, 23)' })
  expect(tripwire.pageErrors).toEqual([])
})
