// Web e2e scenario: a hand-declared model's `reasoningEfforts` reaches the
// composer's effort pane — the levels a settings profile declares are exactly
// what the picker offers, and picking one records it with the Agent default.
// Zero model calls: declaring, describing, and switching are settings/llm
// traffic only, so there is no fixture and a stray stream would fail loud.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page, Request } from 'playwright'
import { chromium, webkit } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, onTestFinished } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, connectFreshWorkspaceZh, saveFailureShot } from './support.ts'

/** Starts the shipped default on this scenario's declared reasoning model. */
const OVERLAY = fileURLToPath(new URL('./declared-reasoning.overlay.yml', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/declared-reasoning', import.meta.url))
const UI_EXPECTED = fileURLToPath(new URL('./expected/declared-reasoning/ui.expected.md', import.meta.url))
const POINTER_EXPECTED = fileURLToPath(new URL('./expected/declared-reasoning/pointer-menu.expected.md', import.meta.url))
const MODE = webSnapshotMode()

describe.skipIf(MODE === 'record').each([
  { name: 'Chromium', engine: chromium },
  { name: 'WebKit', engine: webkit },
])('web e2e: declared reasoning efforts reach the composer ($name)', ({ engine }) => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    // The whole reasoning offer is the profile: key = selectable level, value
    // = the wire spelling dispatch would send (`max: ultra` renames; the
    // valueless `off` means "supported, send nothing"). The route sets no
    // deployment default, so the pane leads with the provider-default entry.
    await scaffold.ctx.settings.update('llm-pi-ai', {
      providers: {
        'acme-gateway': {
          displayName: 'Acme Gateway',
          api: 'openai-completions',
          baseURL: 'https://gateway.acme.example/v1',
          models: [
            { id: 'acme-think', name: 'Acme Think' },
            { id: 'acme-swift', name: 'Acme Swift' },
            { id: 'acme-lite', name: 'Acme Lite' },
          ].map(model => ({
            ...model,
            reasoningEfforts: { off: null, high: 'high', max: 'ultra' },
          })),
        },
      },
    })
    browser = await engine.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    try {
      await browser?.close()
    } finally {
      await scaffold?.close()
    }
  })

  it('offers exactly the declared levels and records the picked one', async () => {
    onTestFailed(() => saveFailureShot(page, `web-e2e-declared-reasoning-${engine.name()}`))
    const trigger = page.getByRole('button', { name: /^选择模型/ })
    await trigger.waitFor({ timeout: 15_000 })
    await trigger.click()

    // Declared levels, nothing else, as segments under the model list: the
    // provider-default entry (the route configures no `reasoning`), then
    // Off/High/Max — minimal, low, medium, and xhigh were not declared and
    // must not be offered.
    const levels = page.getByRole('menu', { name: '推理等级' }).getByRole('menuitemradio')
    await expect.poll(async () => levels.allTextContents(), { timeout: 10_000 })
      .toEqual(['Default', 'Off', 'High', 'Max'])
    const snapshot = await captureStableAria(page, '[role="group"][aria-label="模型与推理等级"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)

    // Keyboard: search holds focus on open with the model in use highlighted;
    // ↓ past the last result enters the effort row on its checked segment,
    // ←/→ walk the segments, and Tab settles the focused one exactly as Enter
    // would, then closes the menu.
    const search = page.getByRole('searchbox', { name: '搜索模型…' })
    await expect.poll(() => search.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
    const results = page.getByRole('menu', { name: '模型', exact: true }).getByRole('menuitemradio')
    const highlighted = await search.getAttribute('aria-activedescendant')
    const at = await results.evaluateAll((rows, id) => rows.findIndex(row => row.id === id), highlighted)
    expect(at).toBeGreaterThanOrEqual(0)
    for (let step = at; step < await results.count(); step++) await page.keyboard.press('ArrowDown')
    await expect.poll(
      () => levels.nth(0).evaluate(element => element === document.activeElement),
      { timeout: 10_000 },
    ).toBe(true)
    await page.keyboard.press('ArrowLeft')
    await expect.poll(
      () => levels.nth(3).evaluate(element => element === document.activeElement),
      { timeout: 10_000 },
    ).toBe(true)
    await page.keyboard.press('ArrowLeft')
    await expect.poll(
      () => levels.nth(2).evaluate(element => element === document.activeElement),
      { timeout: 10_000 },
    ).toBe(true)

    // Settling with Tab is the same gesture that saves the default selection, so
    // the effort lands in the Agent default Settings section beside provider/model.
    await page.keyboard.press('Tab')
    await expect.poll(() => levels.count(), { timeout: 10_000 }).toBe(0)
    await expect.poll(
      async () => readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8'),
      { timeout: 10_000 },
    ).toContain('reasoningEffort: high')
    await expect.poll(() => trigger.getAttribute('aria-label'), { timeout: 10_000 })
      .toBe('选择模型，当前 Acme Think，推理等级 High')

    // Reopened, search takes the keyboard with the model in use highlighted,
    // and Shift+Tab closes like Escape.
    await trigger.click()
    const inUse = page.getByRole('menuitemradio', { name: 'Acme Think', exact: true })
    await expect.poll(() => search.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
    expect(await search.getAttribute('aria-activedescendant')).toBe(await inUse.getAttribute('id'))
    await page.keyboard.press('Shift+Tab')
    await expect.poll(() => page.getByRole('group', { name: '模型与推理等级', exact: true }).count(), { timeout: 10_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('opens from the pointer onto search and closes from the trigger with or without a focused segment', async () => {
    onTestFailed(() => saveFailureShot(page, `web-e2e-model-trigger-${engine.name()}`))
    const trigger = page.getByRole('button', { name: /^选择模型/ })
    const menu = page.getByRole('group', { name: '模型与推理等级', exact: true })
    const search = page.getByRole('searchbox', { name: '搜索模型…' })
    for (const focusSegment of [false, true]) {
      await page.locator('[data-composer-input][contenteditable="true"]').focus()
      await trigger.click()
      await expect.poll(() => search.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
      if (focusSegment) {
        const checked = page.locator('[data-effort-segment][aria-checked="true"]')
        await checked.focus()
        await expect.poll(() => checked.evaluate(element => element === document.activeElement)).toBe(true)
      }
      await trigger.click()
      await menu.waitFor({ state: 'detached' })
      await expect.poll(() => trigger.evaluate(element => element === document.activeElement)).toBe(true)
    }
    expect(tripwire.pageErrors).toEqual([])
  })

  it('selects model and effort by mouse and keeps keyboard control after cancelled or rejected clicks', async () => {
    onTestFailed(() => saveFailureShot(page, `web-e2e-model-pointer-${engine.name()}`))
    let selections = 0
    const countSelection = (request: Request): void => {
      if (new URL(request.url()).pathname.endsWith('/session/selectModel')) selections++
    }
    page.on('request', countSelection)
    onTestFinished(() => { page.off('request', countSelection) })
    const trigger = page.getByRole('button', { name: /^选择模型/ })
    const menu = page.getByRole('group', { name: '模型与推理等级', exact: true })
    await trigger.click()
    const current = page.getByRole('menuitemradio', { name: 'Acme Think', exact: true })
    const target = page.getByRole('menuitemradio', { name: 'Acme Swift', exact: true })
    const search = page.getByRole('searchbox', { name: '搜索模型…' })
    await expect.poll(() => search.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
    expect(await search.getAttribute('aria-activedescendant')).toBe(await current.getAttribute('id'))

    // Native mousedown must not blur search and unmount the menu before click in WebKit.
    await target.getByText('Acme Swift', { exact: true }).hover()
    await page.mouse.down()
    try {
      await expect.poll(() => menu.count()).toBe(1)
      await expect.poll(() => search.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
      await page.getByText('Acme Gateway', { exact: true }).hover()
    } finally {
      await page.mouse.up()
    }
    // Later selection counts also include any request from this cancelled press.
    expect(selections).toBe(0)
    await search.press('ArrowUp')
    expect(await search.getAttribute('aria-activedescendant')).toBe(await current.getAttribute('id'))
    await search.press('ArrowDown')
    expect(await search.getAttribute('aria-activedescendant')).toBe(await target.getAttribute('id'))
    await expect.poll(() => search.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })

    await trigger.click()
    await target.getByText('Acme Swift', { exact: true }).click()
    await menu.waitFor({ state: 'detached' })
    expect(selections).toBe(1)
    await expect.poll(() => scaffold.ctx.agentDefaultModel.currentSelection().model, { timeout: 10_000 })
      .toBe('acme-swift')

    // An effort click keeps the menu open on the newly checked segment.
    await trigger.click()
    const max = page.getByRole('menu', { name: '推理等级' }).getByRole('menuitemradio', { name: 'Max', exact: true })
    await max.click()
    await expect.poll(() => max.getAttribute('aria-checked'), { timeout: 10_000 }).toBe('true')
    expect(selections).toBe(2)
    await expect.poll(() => scaffold.ctx.agentDefaultModel.currentSelection().reasoningEffort, { timeout: 10_000 })
      .toBe('max')
    expect(await menu.count()).toBe(1)
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })

    await page.route('**/api/session/selectModel', async (route) => {
      const envelope = route.request().postDataJSON() as { rpcId: string }
      await route.fulfill({
        json: {
          type: 'server-response', rpcId: envelope.rpcId,
          result: {
            ok: false,
            error: { code: 'session/writer-held', message: 'writer held', details: { sessionId: 'held-session' } },
          },
        },
      })
    }, { times: 1 })
    await trigger.click()
    await expect.poll(() => search.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
    expect(await search.getAttribute('aria-activedescendant')).toBe(await target.getAttribute('id'))
    await current.click()
    await page.getByRole('alert').waitFor()
    expect(selections).toBe(3)
    await compareOrRefreshGolden(POINTER_EXPECTED,
      await captureStableAria(page, '[role="group"][aria-label="模型与推理等级"]', scaffold.workspaceCwd), MODE)
    await expect.poll(() => trigger.evaluate(element => element === document.activeElement)).toBe(true)
    await page.keyboard.press('Tab')
    await expect.poll(() => search.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
    expect(await search.getAttribute('aria-activedescendant')).toBe(await target.getAttribute('id'))
    await search.press('ArrowUp')
    expect(await search.getAttribute('aria-activedescendant')).toBe(await current.getAttribute('id'))
    expect(await search.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })

    await trigger.click()
    await page.locator('[data-composer-input][contenteditable="true"]').focus()
    await menu.waitFor({ state: 'detached' })
    await trigger.click()
    await page.mouse.click(0, 0)
    await menu.waitFor({ state: 'detached' })
    expect(tripwire.pageErrors).toEqual([])
  })

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['ui.expected.md', 'pointer-menu.expected.md'])
  })
})
