// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(cleanup)

/** The effort segments of the open menu. */
const efforts = () => within(screen.getByRole('group', { name: '推理等级' })).getAllByRole('menuitemradio')

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
      expect(screen.getByRole('menu')).toBeTruthy()
      expect(document.activeElement).toBe(efforts()[2])
    })
  })

  it('leaves the menu open when the effort in use is chosen again', () => {
    const select = vi.fn()
    render(<ModelSelect locked={false} available directory={createSnapshotStore(state())} load={vi.fn()} select={select} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    fireEvent.click(efforts()[1]!)
    expect(select).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeTruthy()
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
    expect(screen.queryByRole('group', { name: '推理等级' })).toBeNull()
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
      const menu = screen.getByRole('menu')
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
      expect(screen.getByRole('menu')).toBeTruthy()
      fireEvent.mouseDown(document.body)
      expect(screen.queryByRole('menu')).toBeNull()
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
      fireEvent.mouseUp(screen.getByRole('menu'))
    }
    expect(select).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeTruthy()
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
    expect(screen.getByRole('menu')).toBeTruthy()
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
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull() })
  })

  it('Tab on the effort in use closes without a selection', () => {
    const select = mountOpen()
    const high = efforts()[1]!
    high.focus()
    expect(fireEvent.keyDown(high, { key: 'Tab' })).toBe(false)
    expect(select).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Shift+Tab and Escape close back to the trigger from any row', () => {
    mountOpen()
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    const segment = efforts()[0]!
    segment.focus()
    expect(fireEvent.keyDown(segment, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(trigger)
    const model = screen.getAllByRole('menuitemradio')[0]!
    model.focus()
    fireEvent.keyDown(model, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Tab with the keyboard still on the trigger enters the menu at the model in use', () => {
    mountOpen()
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    expect(fireEvent.keyDown(trigger, { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' }))
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('a backward step from outside the list enters at the last row, and a closed menu leaves Tab native', () => {
    mountOpen()
    const trigger = screen.getByRole('button', { name: /选择模型/ })
    expect(fireEvent.keyDown(trigger, { key: 'ArrowUp' })).toBe(false)
    expect(document.activeElement).toBe(efforts()[2])
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
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
    expect(screen.queryByRole('group', { name: '推理等级' })).toBeNull()

    const retry = screen.getByRole('button', { name: '重试' })
    expect(fireEvent.mouseDown(retry)).toBe(false)
    fireEvent.click(retry)
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('menu')).toBeTruthy()
    retry.focus()
    // A control that is not a row keeps the browser's traversal.
    expect(fireEvent.keyDown(retry, { key: 'Tab' })).toBe(true)
    fireEvent.keyDown(retry, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
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
  expect(screen.queryByRole('menu')).toBeNull()
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
