// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { AppearanceRow } from '../src/client/AppearanceRow.tsx'
import type { AppearanceRowComponentProps } from '../src/client/AppearanceRow.tsx'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
import type { ThemePalette, ThemePreference } from '../src/client/index.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

const COPY: Record<string, string> = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'appearance.palette': 'Color palette',
  'palette.neutral': 'Neutral',
  'palette.warm': 'Warm',
  'palette.ocean': 'Ocean',
  'palette.graphite': 'Graphite',
  'palette.forest': 'Forest',
  'palette.violet': 'Violet',
  'palette.paper': 'Paper',
  'palette.classic': 'Classic',
  'palette.midnight': 'Midnight',
  'palette.phosphor': 'Phosphor',
  'palette.arctic': 'Arctic',
  'palette.dusk': 'Dusk',
  'palette.wine': 'Wine',
  'palette.ember': 'Ember',
  'palette.twilight': 'Twilight',
  'palette.oled': 'OLED Black',
  'palette.sand': 'Sand',
  'palette.mist': 'Mist',
  'palette.rose': 'Rose',
  'palette.lilac': 'Lilac',
  'palette.mint': 'Mint',
  'palette.sunlit': 'Sunlit',
  'palette.storm': 'Storm',
  'palette.tag.light': 'Light',
  'palette.tag.dark': 'Dark',
  'appearance.paletteHint': 'Tagged palettes set their own base.',
}

function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<AppearanceRowComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: AppearanceRowComponentProps['useSessionStatus'] = selector => selector(noAttention)

function mount(preference: ThemePreference = 'system', palette: ThemePalette = 'neutral') {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createAppearanceRowStore().create()
  store.actions.sync(preference, palette, 0)
  const setTheme = vi.fn()
  const setPalette = vi.fn()
  const props: AppearanceRowComponentProps = {
    useSessions: emptySessions(),
    useSessionStatus,
    usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setTheme,
    setPalette,
  }
  render(<AppearanceRow {...props} />)
  return { store, setTheme, setPalette }
}

const pressed = (name: RegExp): string | null =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('AppearanceRow', () => {
  it('renders the title and three cubes with the preference cube selected', () => {
    mount('dark')
    expect(screen.getByText('Appearance')).toBeDefined()
    expect(pressed(/^Dark$/)).toBe('true')
    expect(pressed(/^Light$/)).toBe('false')
    expect(pressed(/^System$/)).toBe('false')
  })

  it('click drives setTheme; selection follows the store mirror, not the click echo', () => {
    const b = mount('dark')
    fireEvent.click(screen.getByRole('button', { name: /^Light$/ }))
    expect(b.setTheme).toHaveBeenCalledWith('light')
    // No store write yet: selection is unchanged.
    expect(pressed(/^Dark$/)).toBe('true')
    act(() => { b.store.actions.sync('light', 'neutral', 1) })
    expect(pressed(/^Light$/)).toBe('true')
    expect(pressed(/^Dark$/)).toBe('false')
  })

  it('renders every palette card in picker order under a labelled group with the stored palette pressed', () => {
    mount('dark', 'violet')
    const group = screen.getByRole('group', { name: 'Color palette' })
    const cards = [...group.querySelectorAll('button')]
    expect(cards.map(card => card.textContent)).toEqual([
      'Neutral', 'Warm', 'Ocean', 'Graphite', 'Forest', 'Violet', 'Paper', 'Classic',
      'Midnight Dark', 'Phosphor Dark', 'Arctic Dark', 'Dusk Dark', 'Wine Dark', 'Ember Dark', 'Twilight Dark',
      'OLED Black Dark', 'Sand Light', 'Mist Light', 'Rose Light', 'Lilac Light', 'Mint Light', 'Sunlit Light',
      'Storm Light',
    ])
    expect(screen.getByText('Tagged palettes set their own base.')).toBeDefined()
    expect(cards.filter(card => card.getAttribute('aria-pressed') === 'true').map(card => card.textContent))
      .toEqual(['Violet'])
  })

  it('passes both color-scheme previews to each card as local custom properties', () => {
    mount()
    const card = screen.getByRole('button', { name: 'Warm' })
    expect(card.style.getPropertyValue('--palette-dark-bg')).toBe('#15120f')
    expect(card.style.getPropertyValue('--palette-dark-accent')).toBe('#e27b41')
    expect(card.style.getPropertyValue('--palette-light-bg')).toBe('#fbf8f4')
    expect(card.style.getPropertyValue('--palette-light-accent')).toBe('#bd5720')
  })

  it('previews a fixed palette with its own scheme in both preview sets', () => {
    mount()
    const card = screen.getByRole('button', { name: 'Midnight Dark' })
    expect(card.style.getPropertyValue('--palette-light-bg')).toBe('#0c1528')
    expect(card.style.getPropertyValue('--palette-dark-bg')).toBe('#0c1528')
    expect(card.style.getPropertyValue('--palette-light-accent')).toBe('#5b9bff')
  })

  it('palette click drives setPalette; selection follows the store mirror', () => {
    const b = mount('dark', 'neutral')
    fireEvent.click(screen.getByRole('button', { name: 'Forest' }))
    expect(b.setPalette).toHaveBeenCalledWith('forest')
    expect(pressed(/Neutral/)).toBe('true')
    act(() => { b.store.actions.sync('dark', 'forest', 1) })
    expect(pressed(/Forest/)).toBe('true')
    expect(pressed(/Neutral/)).toBe('false')
  })
})
