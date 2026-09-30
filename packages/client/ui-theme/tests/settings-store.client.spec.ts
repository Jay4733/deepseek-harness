/** Appearance and font-size row stores: snapshot-mirror actions and the revision guards. */
import { describe, expect, it } from 'vitest'
import { createAppearanceRowStore, createFontSizeRowStore } from '../src/client/settings-store.ts'

describe('createAppearanceRowStore', () => {
  it('init shape: system preference and the default palette with revision at -1', () => {
    const store = createAppearanceRowStore().create()
    expect(store.getSnapshot()).toEqual({ preference: 'system', palette: 'neutral', revision: -1 })
  })

  it('sync mirrors the preference and palette and advances the revision', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync('dark', 'ocean', 0)
    expect(store.getSnapshot()).toEqual({ preference: 'dark', palette: 'ocean', revision: 0 })
    store.actions.sync('light', 'paper', 2)
    expect(store.getSnapshot().preference).toBe('light')
    expect(store.getSnapshot().palette).toBe('paper')
    expect(store.getSnapshot().revision).toBe(2)
  })

  it('revision guard drops stale and duplicate writes', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync('dark', 'forest', 3)
    store.actions.sync('system', 'classic', 2)
    store.actions.sync('system', 'classic', 3)
    expect(store.getSnapshot().preference).toBe('dark')
    expect(store.getSnapshot().palette).toBe('forest')
    expect(store.getSnapshot().revision).toBe(3)
  })
})

describe('createFontSizeRowStore', () => {
  it('init shape: default size with revision at -1', () => {
    const store = createFontSizeRowStore().create()
    expect(store.getSnapshot()).toEqual({ fontSize: 14, revision: -1 })
  })

  it('sync mirrors the size; the revision guard drops stale and duplicate writes', () => {
    const store = createFontSizeRowStore().create()
    store.actions.sync(16, 3)
    expect(store.getSnapshot()).toEqual({ fontSize: 16, revision: 3 })
    store.actions.sync(12, 2)
    store.actions.sync(12, 3)
    expect(store.getSnapshot().fontSize).toBe(16)
    expect(store.getSnapshot().revision).toBe(3)
  })
})
