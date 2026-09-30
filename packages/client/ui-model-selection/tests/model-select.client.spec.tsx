// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentProps } from 'react'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import { ModelSelect } from '../src/client/ModelSelect.tsx'
import { en, zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

// The seat's key domain is model ∪ common; the stub mirrors the real lookup
// chain: package dictionary, then common vocabulary, then the key.
const t: ComponentProps<typeof ModelSelect>['t'] = (key, params) => {
  const template = (zh as Record<string, string>)[key]
    ?? (commonZh as Record<string, string>)[key]
    ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

const reasoning = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max', description: 'Largest budget' },
  ],
  defaultEffort: 'high',
}

function state(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
        description: 'Fast catalog description',
        reasoning,
      }],
    }],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
    ...overrides,
  }
}

function modelGroups(count: number): ModelDirectoryState['groups'] {
  const group = state().groups[0]!
  return [{ ...group, models: [
    ...group.models,
    ...Array.from({ length: Math.max(0, count - 1) }, (_, index) => ({
      id: `model-${index + 2}`, name: `Model ${index + 2}`,
    })),
  ].slice(0, count) }]
}

const scrollIntoView = vi.fn()
beforeEach(() => {
  scrollIntoView.mockClear()
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView })
  onTestFinished(() => {
    if (descriptor === undefined) Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    else Object.defineProperty(Element.prototype, 'scrollIntoView', descriptor)
  })
})

afterEach(cleanup)

/** The effort segments of the open menu. */
const efforts = () => within(screen.getByRole('menu', { name: '推理等级' })).getAllByRole('menuitemradio')

/** The open menu card. */
const card = () => screen.getByRole('group', { name: zh['menu.aria'] })

/** The open menu card, or null once it closed. */
const queryCard = () => screen.queryByRole('group', { name: zh['menu.aria'] })

/** The model rows of the open menu, without the effort segments. */
const modelRows = () => screen.queryAllByRole('menuitemradio').filter(row => !row.hasAttribute('data-effort-segment'))

describe('ModelSelect reasoning effort', () => {
  it('renders effort segments under the model list and submits the effort as part of the session selection', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ current: selection }))
      return { ok: true as const, value: undefined }
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', {
      name: '选择模型，当前 DeepSeek-V4-Flash，推理等级 High',
    })
    fireEvent.click(trigger)
    // One menu: no drill-in cells, the model rows first and the effort segments after.
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(screen.getAllByRole('menuitemradio').map(item => item.textContent))
      .toEqual(['DeepSeek-V4-Flash', 'Off', 'High', 'Max'])
    expect(efforts().map(item => item.textContent)).toEqual(['Off', 'High', 'Max'])
    expect(efforts().map(item => item.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(screen.queryByText('Largest budget')).toBeNull()

    fireEvent.click(efforts()[2]!)
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'max',
      })
      expect(trigger.getAttribute('aria-label')).toBe('选择模型，当前 DeepSeek-V4-Flash，推理等级 Max')
      // An effort choice keeps the menu open on the segment now checked.
      expect(card()).toBeTruthy()
      expect(document.activeElement).toBe(efforts()[2])
    })
  })

  it('leaves the menu open when the effort in use is chosen again', () => {
    const select = vi.fn()
    render(<ModelSelect locked={false} available directory={createSnapshotStore(state())} load={vi.fn()} select={select} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    fireEvent.click(efforts()[1]!)
    expect(select).not.toHaveBeenCalled()
    expect(card()).toBeTruthy()
  })

  it('offers provider default only when the adapter does not configure a model default', () => {
    const directory = createSnapshotStore(state({
      groups: [{
        id: 'provider',
        name: 'Provider',
        models: [{
          id: 'model',
          name: 'Model',
          reasoning: { efforts: [{ id: 'standard', name: 'Standard' }] },
        }],
      }],
      current: { provider: 'provider', model: 'model' },
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue({ ok: true, value: undefined })}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', {
      name: '选择模型，当前 Model，推理等级 Default',
    }))
    expect(efforts().map(item => item.textContent)).toEqual(['Default', 'Standard'])
  })

  it('shows the durable model id when the catalog has no matching display name', () => {
    const directory = createSnapshotStore(state({
      current: { provider: 'deepseek-official', model: 'removed-model' },
    }))
    const select = vi.fn().mockResolvedValue({ ok: true, value: undefined })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', { name: '选择模型，当前 deepseek-official/removed-model' })
    expect(trigger.textContent).toContain('deepseek-official/removed-model')
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu', { name: '推理等级' })).toBeNull()
    expect(screen.queryByRole('menuitemradio', { name: 'removed-model' })).toBeNull()
    expect(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' })).toBeTruthy()
    expect(screen.queryByText('Fast catalog description')).toBeNull()
  })

  it.each(['model', 'provider'])('keeps the saved id and effort when the selected %s disappears', (removed) => {
    const directory = createSnapshotStore(state({ retainedEffort: 'High' }))
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
    expect(screen.getByRole('button', { name: /选择模型，当前/ }).textContent).toContain('DeepSeek-V4-Flash')
    act(() => { directory.update((snapshot) => {
      snapshot.groups = removed === 'provider' ? [] : snapshot.groups.map(group => ({ ...group, models: [] }))
      snapshot.routable = false
    }) })
    expect(screen.getByRole('button', { name: /选择模型，当前/ }).textContent)
      .toMatchInlineSnapshot('"deepseek-official/deepseek-v4-flashHigh"')
    expect(directory.getSnapshot().current).toEqual(state().current)
  })

  it('shows loading until the catalog and Session projection are both ready', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: null,
      routable: null,
      groups: [],
      status: 'loading',
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue({ ok: true, value: undefined })}
      t={t}
    />)

    expect(screen.getByRole('button', { name: '正在加载模型…' }).textContent)
      .toContain('正在加载模型…')
    directory.set(state())
    await waitFor(() => {
      expect(screen.getByRole('button', {
        name: '选择模型，当前 DeepSeek-V4-Flash，推理等级 High',
      })).toBeTruthy()
    })
  })

  it.each([false, true])('announces rejected selections with ownership guidance only for held writers (%s)', async (sessionInUse) => {
    const groups = [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    }]
    const directory = createSnapshotStore<ModelDirectoryState>(state({ groups }))
    const select = vi.fn(async () => {
      const error = sessionInUse
        ? new RemoteError('session/writer-held', 'writer held', { sessionId: SessionId('owned') })
        : new RemoteError('session/model-unavailable', 'session already contains images', { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
      directory.set(state({ groups, status: 'error', error: 'unrelated catalog refresh' }))
      return { ok: false as const, error }
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', { name: /选择模型|当前/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ }))
    const toast = await screen.findByRole('alert')
    expect(document.activeElement).toBe(trigger)
    expect(toast.textContent).toBe(sessionInUse
      ? zh['error.sessionInUse']
      : '模型操作失败：session/model-unavailable: session already contains images')
    // The selection failure does not render the in-menu load strip (no Retry).
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('spins on the trigger and the chosen model row until the selection settles, after the menu closes', async () => {
    const groups = [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    }]
    const directory = createSnapshotStore<ModelDirectoryState>(state({ groups }))
    let settle!: () => void
    const select = vi.fn((selection: ModelSelection) => {
      directory.set(state({ groups, status: 'selecting', pending: selection }))
      return new Promise<{ ok: true; value: undefined }>((resolve) => {
        settle = () => {
          directory.set(state({ groups, current: selection }))
          resolve({ ok: true, value: undefined })
        }
      })
    })
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)
    const spinners = () => document.querySelectorAll('[data-state="ongoing"]')

    const trigger = screen.getByRole('button', { name: /选择模型|当前/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ }))
    expect(spinners()).toHaveLength(2)
    expect(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ }).querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(trigger.querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(trigger.getAttribute('aria-busy')).toBe('true')

    // Closing the menu unmounts the row; the trigger keeps the feedback.
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('menuitemradio')).toBeNull()
    expect(spinners()).toHaveLength(1)
    expect(trigger.querySelector('[data-state="ongoing"]')).not.toBeNull()

    await act(async () => { settle() })
    expect(spinners()).toHaveLength(0)
    expect(trigger.getAttribute('aria-busy')).toBe('false')
  })

  it('spins on the chosen effort segment only', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state())
    const select = vi.fn((selection: ModelSelection) => {
      directory.set(state({ status: 'selecting', pending: selection }))
      return new Promise<undefined>(() => {})
    })
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(efforts()[2]!)
    expect(screen.getAllByRole('menuitemradio')
      .filter(row => row.querySelector('[data-state="ongoing"]') !== null)
      .map(row => row.textContent)).toEqual(['Max'])
  })

  it('portals the placed menu card to body and closes only on truly-outside mousedown', () => {
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!
    const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 300 })
    try {
      const { container } = render(<ModelSelect
        locked={false}
        available
        directory={createSnapshotStore(state())}
        load={vi.fn()}
        select={vi.fn().mockResolvedValue({ ok: true, value: undefined })}
        t={t}
      />)
      const trigger = screen.getByRole('button', { name: /选择模型/ })
      fireEvent.click(trigger)
      const menu = card()
      // Outside the composer subtree — column overflow clips cannot crop it.
      expect(container.contains(menu)).toBe(false)
      expect(menu.parentElement).toBe(document.body)
      // jsdom anchor rects are all zero, so the measured 200x300 card clamps
      // to the 12px viewport margin on both axes.
      expect(menu.style.left).toBe('12px')
      expect(menu.style.top).toBe('12px')
      // Interactions inside the trigger subtree or the portaled card stay open.
      expect(fireEvent.mouseDown(menu)).toBe(true)
      expect(fireEvent.mouseDown(trigger)).toBe(false)
      fireEvent.blur(trigger, { relatedTarget: menu })
      expect(card()).toBeTruthy()
      fireEvent.mouseDown(document.body)
      expect(queryCard()).toBeNull()
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth)
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight)
    }
  })

  it('renders no Agent-bound control for an addressed subagent session', () => {
    const load = vi.fn()
    render(<ModelSelect
      locked={false}
      available={false}
      directory={createSnapshotStore(state())}
      load={load}
      select={vi.fn().mockResolvedValue(undefined)}
      t={t}
    />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })
})

describe('ModelSelect keyboard walk', () => {
  function mountOpen() {
    const select = vi.fn().mockResolvedValue({ ok: true, value: undefined })
    render(<ModelSelect
      locked={false}
      available
      directory={createSnapshotStore(state())}
      load={vi.fn()}
      select={select}
      t={t}
    />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    return select
  }

  it('prevents button mousedown defaults on model rows and effort segments without selecting', () => {
    const select = mountOpen()
    for (const row of screen.getAllByRole('menuitemradio')) {
      expect(fireEvent.mouseDown(row.firstElementChild ?? row)).toBe(false)
      fireEvent.mouseUp(card())
    }
    expect(select).not.toHaveBeenCalled()
    expect(card()).toBeTruthy()
  })

  it('↑↓ walk every row and segment, wrapping, and stay open', () => {
    mountOpen()
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    const rows = screen.getAllByRole('menuitemradio')
    expect(rows.map(row => row.textContent)).toEqual(['DeepSeek-V4-Flash', 'Off', 'High', 'Max'])
    // The trigger holds focus while the menu opens: the first forward step
    // enters at the first row instead of skipping it. false = preventDefault ran.
    expect(fireEvent.keyDown(trigger, { key: 'ArrowDown' })).toBe(false)
    expect(document.activeElement).toBe(rows[0])
    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[1]!, { key: 'ArrowUp' })
    fireEvent.keyDown(rows[0]!, { key: 'ArrowUp' }) // wraps to the bottom
    expect(document.activeElement).toBe(rows[3])
    fireEvent.keyDown(rows[3]!, { key: 'ArrowDown' }) // wraps to the top
    expect(document.activeElement).toBe(rows[0])
    expect(card()).toBeTruthy()
  })

  it('←→ move between effort segments, wrapping, and leave model rows alone', () => {
    mountOpen()
    const [model, off, high, max] = screen.getAllByRole('menuitemradio')
    high!.focus()
    expect(fireEvent.keyDown(high!, { key: 'ArrowRight' })).toBe(false)
    expect(document.activeElement).toBe(max)
    fireEvent.keyDown(max!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(off)
    fireEvent.keyDown(off!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(max)
    model!.focus()
    expect(fireEvent.keyDown(model!, { key: 'ArrowRight' })).toBe(true)
    expect(document.activeElement).toBe(model)
  })

  it('Tab settles the focused segment like Enter and closes the menu', async () => {
    const select = mountOpen()
    const segments = efforts()
    segments[1]!.focus()
    fireEvent.keyDown(segments[1]!, { key: 'ArrowRight' }) // High → Max
    expect(fireEvent.keyDown(segments[2]!, { key: 'Tab' })).toBe(false)
    expect(select).toHaveBeenCalledWith({
      provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'max',
    })
    await waitFor(() => { expect(queryCard()).toBeNull() })
  })

  it('Tab on the effort in use closes without a selection', () => {
    const select = mountOpen()
    const high = efforts()[1]!
    high.focus()
    expect(fireEvent.keyDown(high, { key: 'Tab' })).toBe(false)
    expect(select).not.toHaveBeenCalled()
    expect(queryCard()).toBeNull()
  })

  it('Shift+Tab and Escape close back to the trigger from any row', () => {
    mountOpen()
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    const segment = efforts()[0]!
    segment.focus()
    expect(fireEvent.keyDown(segment, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(queryCard()).toBeNull()
    fireEvent.click(trigger)
    const model = screen.getAllByRole('menuitemradio')[0]!
    model.focus()
    fireEvent.keyDown(model, { key: 'Escape' })
    expect(queryCard()).toBeNull()
  })

  it('Tab with the keyboard still on the trigger enters the menu at the model in use', () => {
    mountOpen()
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    expect(fireEvent.keyDown(trigger, { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' }))
    expect(card()).toBeTruthy()
  })

  it('a backward step from outside the list enters at the last row, and a closed menu leaves Tab native', () => {
    mountOpen()
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    expect(fireEvent.keyDown(trigger, { key: 'ArrowUp' })).toBe(false)
    expect(document.activeElement).toBe(efforts()[2])
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(queryCard()).toBeNull()
    expect(fireEvent.keyDown(trigger, { key: 'Tab' })).toBe(true)
  })

  it('keeps the card navigable when the menu has no rows, and leaves a retry its Tab', () => {
    const load = vi.fn()
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      groups: [], failures: [], status: 'error', error: 'catalog down',
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={load}
      select={vi.fn().mockResolvedValue({ ok: true, value: undefined })}
      t={t}
    />)
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    fireEvent.click(trigger)
    // No rows to hand the keyboard to: the trigger keeps it, so the card's
    // keys still reach the menu.
    expect(document.activeElement).toBe(trigger)
    expect(screen.queryByRole('menu', { name: '推理等级' })).toBeNull()

    const retry = screen.getByRole('button', { name: '重试' })
    expect(fireEvent.mouseDown(retry)).toBe(false)
    fireEvent.click(retry)
    expect(load).toHaveBeenCalledTimes(2)
    expect(card()).toBeTruthy()
    retry.focus()
    // A control that is not a row keeps the browser's traversal.
    expect(fireEvent.keyDown(retry, { key: 'Tab' })).toBe(true)
    fireEvent.keyDown(retry, { key: 'Escape' })
    expect(queryCard()).toBeNull()
  })

  it('with no checked row, Tab from the trigger enters at the first row', () => {
    // The session runs a model the catalog no longer lists: no row is checked
    // and no effort segments render.
    render(<ModelSelect
      locked={false}
      available
      directory={createSnapshotStore(state({ current: { provider: 'gone', model: 'gone' } }))}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue({ ok: true, value: undefined })}
      t={t}
    />)
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    fireEvent.click(trigger)
    const rows = screen.getAllByRole('menuitemradio')
    expect(rows.every(row => row.getAttribute('aria-checked') === 'false')).toBe(true)
    fireEvent.keyDown(trigger, { key: 'Tab' })
    expect(document.activeElement).toBe(rows[0])
  })
})

it('shows the unselected model control with the inherited effort', async () => {
  const directory = createSnapshotStore<ModelDirectoryState>(state({ current: null, routable: false, retainedEffort: 'High' }))
  render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
  const trigger = screen.getByRole('button', { name: '请选择模型' })
  expect(trigger.hasAttribute('disabled')).toBe(false)
  await expect(`${trigger.textContent}\n`).toMatchFileSnapshot('./expected/unselected-model.txt')
  expect(trigger.textContent).toContain('High')
  fireEvent.click(trigger)
  expect(screen.queryByRole('menuitem', { name: /模型/ })).toBeNull()
  const model = screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' })
  expect(document.activeElement).toBe(model)
  fireEvent.keyDown(model, { key: 'Escape' })
  expect(queryCard()).toBeNull()
})


it('places account and official models before third-party models', async () => {
  const groups = ['custom', 'deepseek-official', 'deepseek-account', 'another'].map(id => ({
    id, name: id, models: [1, 2].map(index => ({ id: `${id}-${index}`, name: `${id}-${index}` })),
  }))
  const directory = createSnapshotStore<ModelDirectoryState>(state({ current: null, groups }))
  render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: '请选择模型' }))
  const names = screen.getAllByRole('menuitemradio').map(row => row.textContent)
  expect(names).toEqual([
    'deepseek-account-1', 'deepseek-account-2', 'deepseek-official-1', 'deepseek-official-2',
    'custom-1', 'custom-2', 'another-1', 'another-2',
  ])
  expect(groups.map(group => group.id)).toEqual(['custom', 'deepseek-official', 'deepseek-account', 'another'])
  await expect(`${names.join('\n')}\n`).toMatchFileSnapshot('./expected/account-first.txt')
})

it.each([en, zh])('localizes the account group while preserving external names', (copy) => {
  const groups = ['deepseek-account', 'custom'].map(id => ({
    id, name: id === 'deepseek-account' ? 'DeepSeek Account' : 'My Gateway',
    models: [{ id: 'model', name: 'Model' }],
  }))
  render(<ModelSelect locked={false} available
    directory={createSnapshotStore(state({ current: null, groups }))}
    load={vi.fn()} select={vi.fn()} t={key => key in copy ? copy[key as keyof typeof copy] : key} />)
  fireEvent.click(screen.getByRole('button', { name: copy['trigger.selectAria'] }))
  expect(screen.getByRole('group', { name: copy['provider.account'] })).toBeTruthy()
  expect(screen.getByRole('group', { name: 'My Gateway' })).toBeTruthy()
})

it('restores the account model name after login without changing the saved route', () => {
  const groups = [{ id: 'deepseek-account', name: 'DeepSeek Account', models: [
    { id: 'deepseek-flash', name: 'DeepSeek Flash', reasoning },
  ] }]
  const selected = { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' }
  const directory = createSnapshotStore(state({ current: selected, groups, retainedEffort: 'High' }))
  render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
  expect(screen.getByRole('button', { name: /选择模型，当前/ }).textContent).toBe('DeepSeek FlashHigh')
  act(() => { directory.update((snapshot) => { snapshot.groups = []; snapshot.routable = false }) })
  expect(screen.getByRole('button', { name: /选择模型，当前/ }).textContent)
    .toMatchInlineSnapshot('"deepseek-account/deepseek-flashHigh"')
  act(() => { directory.update((snapshot) => { snapshot.groups = groups; snapshot.routable = true }) })
  expect(screen.getByRole('button', { name: /选择模型，当前/ }).textContent).toBe('DeepSeek FlashHigh')
  expect(directory.getSnapshot().current).toEqual(selected)
})

describe('ModelSelect catalog size', () => {
  it.each([0, 1, 4, 5])('shows search only above four models (%i models)', (count) => {
    const groups = modelGroups(count)
    const current = { provider: 'deepseek-official', model: count > 1 ? 'model-2' : 'deepseek-v4-flash' }
    render(<ModelSelect locked={false} available directory={createSnapshotStore(state({ groups, current }))}
      load={vi.fn()} select={vi.fn()} t={t} />)
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    fireEvent.click(trigger)
    const rows = modelRows()
    expect(rows).toHaveLength(count)
    if (count > 4) {
      const search = screen.getByRole('searchbox')
      expect(search).toBeInstanceOf(HTMLInputElement)
      expect(document.activeElement).toBe(search)
      expect(search.getAttribute('aria-activedescendant')).toBe(rows[1]!.id)
      expect(rows.every(row => row.tabIndex === -1)).toBe(true)
    } else {
      // Without search a selected trigger keeps focus until the first ↑/↓ or Tab.
      expect(screen.queryByRole('searchbox')).toBeNull()
      expect(document.activeElement).toBe(trigger)
      expect(rows.every(row => row.tabIndex === 0)).toBe(true)
    }
    if (count === 0) expect(screen.getByRole('status').textContent).toBe(zh['empty.models'])
  })

  it.each([0, 1, 4, 5])('opens an unselected %i-model catalog on search or its first row', (count) => {
    render(<ModelSelect locked={false} available
      directory={createSnapshotStore(state({ groups: modelGroups(count), current: null }))}
      load={vi.fn()} select={vi.fn()} t={t} />)
    const trigger = screen.getByRole('button', { name: '请选择模型' })
    fireEvent.click(trigger)
    const rows = screen.queryAllByRole('menuitemradio')
    expect(rows).toHaveLength(count)
    expect(rows.every(row => row.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(document.activeElement).toBe(count > 4 ? screen.getByRole('searchbox') : rows[0] ?? trigger)
    if (count <= 4) expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it.each([true, false])('clears search and restores focus across 5 → 4 → 5 models (checked: %s)', (checked) => {
    const current = { provider: 'deepseek-official', model: checked ? 'model-3' : 'removed' }
    const directory = createSnapshotStore(state({ groups: modelGroups(5), current }))
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'Model 5' } })
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(1)
    expect(screen.getByRole('searchbox')).toBe(search)
    expect(document.activeElement).toBe(search)

    act(() => { directory.set(state({ groups: modelGroups(4), current })) })
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '清除搜索' })).toBeNull()
    const rows = screen.getAllByRole('menuitemradio')
    expect(rows).toHaveLength(4)
    expect(document.activeElement).toBe(rows[checked ? 2 : 0])

    act(() => { directory.set(state({ groups: modelGroups(5), current })) })
    const restored = screen.getByRole('searchbox')
    expect(restored.getAttribute('value')).toBe('')
    expect(document.activeElement).toBe(restored)
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(5)
    expect(restored.getAttribute('aria-activedescendant'))
      .toBe(screen.getAllByRole('menuitemradio')[checked ? 2 : 0]!.id)
  })

  it('moves actual row focus with arrows, leaves Enter native, and selects with Tab in a small catalog', async () => {
    const select = vi.fn().mockResolvedValue({ ok: true, value: undefined })
    render(<ModelSelect locked={false} available
      directory={createSnapshotStore(state({ groups: modelGroups(4), current: { provider: 'deepseek-official', model: 'model-2' } }))}
      load={vi.fn()} select={select} t={t} />)
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'Tab' })
    const rows = screen.getAllByRole('menuitemradio')
    expect(document.activeElement).toBe(rows[1])
    expect(fireEvent.keyDown(rows[1]!, { key: 'ArrowDown' })).toBe(false)
    expect(document.activeElement).toBe(rows[2])
    fireEvent.keyDown(rows[2]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[3])
    fireEvent.keyDown(rows[3]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[0])
    fireEvent.keyDown(rows[0]!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(rows[3])
    fireEvent.keyDown(rows[3]!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(rows[2])
    expect(rows[2]!.hasAttribute('data-highlighted')).toBe(true)
    expect(fireEvent.keyDown(rows[2]!, { key: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(rows[2]!, { key: 'ArrowLeft' })).toBe(true)
    expect(document.activeElement).toBe(rows[2])
    expect(select).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(rows[2]!, { key: 'Tab' })).toBe(false)
    expect(select).toHaveBeenCalledWith({ provider: 'deepseek-official', model: 'model-3' })
    await waitFor(() => { expect(document.activeElement).toBe(trigger) })
    expect(queryCard()).toBeNull()
    expect(trigger.hasAttribute('data-selection-focus')).toBe(true)
  })

  it('keeps Tab selection available after hovering a small-catalog row', async () => {
    const select = vi.fn().mockResolvedValue({ ok: true, value: undefined })
    render(<ModelSelect locked={false} available directory={createSnapshotStore(state({ groups: modelGroups(4) }))}
      load={vi.fn()} select={select} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    const row = screen.getByRole('menuitemradio', { name: 'Model 3' })
    fireEvent.mouseMove(row)
    expect(document.activeElement).toBe(row)
    expect(row.hasAttribute('data-highlighted')).toBe(true)
    expect(fireEvent.keyDown(row, { key: 'Tab' })).toBe(false)
    expect(select).toHaveBeenCalledWith({ provider: 'deepseek-official', model: 'model-3' })
    await waitFor(() => { expect(queryCard()).toBeNull() })
  })
})

describe('ModelSelect search', () => {
  it('clears search when reopening an unselected large catalog', () => {
    render(<ModelSelect locked={false} available
      directory={createSnapshotStore(state({ groups: modelGroups(5), current: null }))}
      load={vi.fn()} select={vi.fn()} t={t} />)
    const trigger = screen.getByRole('button', { name: '请选择模型' })
    fireEvent.click(trigger)
    const search = screen.getByRole('searchbox')
    expect(document.activeElement).toBe(search)
    fireEvent.change(search, { target: { value: 'zzzz' } })
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(queryCard()).toBeNull()
    fireEvent.click(trigger)
    expect(screen.getByRole('searchbox').getAttribute('value')).toBe('')
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(5)
  })

  it('hides empty provider headings and announces an empty catalog', () => {
    const directory = createSnapshotStore(state({ groups: [
      ...state().groups, { id: 'empty', name: 'Empty Provider', models: [] },
    ] }))
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    expect(screen.queryByRole('group', { name: 'Empty Provider' })).toBeNull()
    act(() => { directory.set(state({ groups: [] })) })
    expect(screen.getByRole('status').textContent).toBe(zh['empty.models'])
    expect(screen.getByRole('status').closest('[role="menu"]')).toBeNull()
  })

  it.each(['Enter', 'Tab'])('returns focus silently after %s accepts the current model, without suppressing later focus', async (key) => {
    const select = vi.fn()
    render(<>
      <button type="button">Outside</button>
      <ModelSelect locked={false} available directory={createSnapshotStore(state({ groups: modelGroups(5) }))}
        load={vi.fn()} select={select} t={t} />
    </>)
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('searchbox'), { key })
    await waitFor(() => { expect(document.activeElement).toBe(trigger) })
    expect(trigger.hasAttribute('data-selection-focus')).toBe(true)
    expect(select).not.toHaveBeenCalled()
    act(() => { screen.getByRole('button', { name: 'Outside' }).focus() })
    expect(trigger.hasAttribute('data-selection-focus')).toBe(false)
    act(() => { trigger.focus() })
    expect(trigger.hasAttribute('data-selection-focus')).toBe(false)
  })

  it.each(['Enter', 'Tab'])('keeps typing focus while arrows wrap across groups and %s accepts the highlight', async (key) => {
    const select = vi.fn().mockResolvedValue({ ok: true, value: undefined })
    const directory = createSnapshotStore(state({
      current: { provider: 'deepseek-official', model: 'beta' },
      groups: [
        { id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }] },
        { id: 'other', name: 'Other', models: [
          { id: 'delta', name: 'Delta' }, { id: 'epsilon', name: 'Epsilon' }, { id: 'gamma', name: 'Gamma' },
        ] },
      ],
    }))
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    const search = screen.getByRole('searchbox')
    expect(search).toBeInstanceOf(HTMLInputElement)
    const [alpha, beta, delta, epsilon, gamma] = screen.getAllByRole('menuitemradio')
    expect(search.getAttribute('aria-activedescendant')).toBe(beta!.id)
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(search.getAttribute('aria-activedescendant')).toBe(delta!.id)
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(search.getAttribute('aria-activedescendant')).toBe(epsilon!.id)
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(search.getAttribute('aria-activedescendant')).toBe(gamma!.id)
    expect(document.activeElement).toBe(search)
    // Without an effort row the highlight wraps within the results.
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(search.getAttribute('aria-activedescendant')).toBe(alpha!.id)
    fireEvent.keyDown(search, { key: 'ArrowUp' })
    expect(search.getAttribute('aria-activedescendant')).toBe(gamma!.id)
    expect(gamma!.hasAttribute('data-highlighted')).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(scrollIntoView.mock.instances.at(-1)).toBe(gamma)
    expect(fireEvent.keyDown(search, { key: 'ArrowLeft' })).toBe(true)
    expect(fireEvent.keyDown(search, { key: 'ArrowRight' })).toBe(true)
    fireEvent.keyDown(search, { key: 'ArrowDown', isComposing: true })
    expect(search.getAttribute('aria-activedescendant')).toBe(gamma!.id)
    fireEvent.change(search, { target: { value: 'alp' } })
    expect(search.getAttribute('aria-activedescendant')).toBe(screen.getByRole('menuitemradio', { name: 'Alpha' }).id)
    fireEvent.change(search, { target: { value: 'zzzz' } })
    expect(search.hasAttribute('aria-activedescendant')).toBe(false)
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(select).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(search, { key: 'Tab' })).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    const restored = screen.getAllByRole('menuitemradio')
    expect(search.getAttribute('aria-activedescendant')).toBe(restored[0]!.id)
    fireEvent.mouseMove(restored[4]!)
    expect(search.getAttribute('aria-activedescendant')).toBe(restored[4]!.id)
    expect(document.activeElement).toBe(search)
    fireEvent.keyDown(search, { key })
    expect(select).toHaveBeenCalledWith({ provider: 'other', model: 'gamma' })
    await waitFor(() => { expect(queryCard()).toBeNull() })
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    await waitFor(() => { expect(document.activeElement).toBe(trigger) })
    expect(trigger.hasAttribute('data-selection-focus')).toBe(true)
  })

  it('walks the search results on into the effort row and back', async () => {
    const select = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const directory = createSnapshotStore(state({ groups: modelGroups(5) }))
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    const search = screen.getByRole('searchbox')
    const rows = modelRows()
    const [off, high, max] = efforts()
    expect(search.getAttribute('aria-activedescendant')).toBe(rows[0]!.id)
    // ↑ from the first result enters the effort row on the checked segment.
    expect(fireEvent.keyDown(search, { key: 'ArrowUp' })).toBe(false)
    expect(document.activeElement).toBe(high)
    fireEvent.keyDown(high!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(max)
    fireEvent.keyDown(max!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(off)
    // ↑ from the effort row returns to search on the last result, ↓ on the first.
    fireEvent.keyDown(off!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(search)
    expect(search.getAttribute('aria-activedescendant')).toBe(rows[4]!.id)
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(high)
    fireEvent.keyDown(high!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(search)
    expect(search.getAttribute('aria-activedescendant')).toBe(rows[0]!.id)
    // No results: ↓ enters the effort row, and ↑ from it returns to search.
    fireEvent.change(search, { target: { value: 'zzzz' } })
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(high)
    fireEvent.keyDown(high!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(search)
    expect(search.hasAttribute('aria-activedescendant')).toBe(false)
    // An effort chosen from the row keeps the menu open on the new segment.
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.click(max!)
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'max' })
    })
    expect(card()).toBeTruthy()
  })

  it('filters model names fuzzily, hides empty groups, clears on reopening, and selects a result', async () => {
    const directory = createSnapshotStore(state({ groups: [
      ...modelGroups(4),
      { id: 'other', name: 'Other', models: [{ id: 'gemini', name: 'Gemini Flash' }] },
    ] }))
    const select = vi.fn().mockResolvedValue({ ok: true, value: undefined })
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    fireEvent.click(trigger)
    const search = screen.getByRole('searchbox')
    expect(document.activeElement).toBe(search)
    expect(search.closest('[role="menu"]')).toBeNull()
    expect(fireEvent.keyDown(search, { key: 'ArrowDown', isComposing: true })).toBe(true)
    expect(document.activeElement).toBe(search)
    fireEvent.change(search, { target: { value: '  GMFL  ' } })
    expect(modelRows().map(row => row.textContent)).toEqual(['Gemini Flash'])
    expect(screen.getByRole('searchbox')).toBe(search)
    expect(document.activeElement).toBe(search)
    expect(screen.queryByRole('group', { name: 'DeepSeek' })).toBeNull()
    expect(trigger.textContent).toContain('DeepSeek-V4-Flash')
    fireEvent.change(search, { target: { value: 'zzzz' } })
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('没有匹配的模型。')
    expect(status.closest('[role="menu"]')).toBeNull()
    expect(screen.queryByRole('menu', { name: '模型' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    expect(search.getAttribute('value')).toBe('')
    expect(document.activeElement).toBe(search)
    expect(screen.queryByRole('button', { name: '清除搜索' })).toBeNull()
    expect(modelRows()).toHaveLength(5)
    fireEvent.change(search, { target: { value: 'gmfl' } })
    fireEvent.keyDown(search, { key: 'Escape' })
    fireEvent.click(trigger)
    expect(screen.getByRole('searchbox').getAttribute('value')).toBe('')
    const reopened = screen.getByRole('searchbox')
    fireEvent.change(reopened, { target: { value: 'gmfl' } })
    const row = screen.getByRole('menuitemradio', { name: 'Gemini Flash' })
    expect(screen.getByRole('menu', { name: '模型' }).contains(row)).toBe(true)
    expect(reopened.getAttribute('aria-activedescendant')).toBe(row.id)
    fireEvent.keyDown(reopened, { key: 'Tab' })
    await waitFor(() => { expect(queryCard()).toBeNull() })
    expect(select).toHaveBeenCalledWith({ provider: 'other', model: 'gemini' })
  })
})
