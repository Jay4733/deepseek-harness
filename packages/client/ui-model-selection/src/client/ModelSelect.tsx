/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 * One menu holds the whole selection: the provider-grouped model list over
 * the shared directory, then, when the current model advertises reasoning
 * metadata, a row of effort segments below it. The trigger (313:14108's
 * ToggleButton) shows both: model name + effort in the accent text tone.
 * Model catalogs above four entries show search, which takes focus on open
 * and retains it while ↑/↓ cycle the highlighted result; stepping past
 * either end of the results enters the effort row, and ↑/↓ from the effort
 * row return to search. Enter and Tab accept the highlighted result. Smaller
 * catalogs move focus across every row and segment with ↑/↓ (wrapping; a
 * step taken while the trigger still holds focus enters at the near end).
 * ←/→ move between effort segments, Tab settles the focused row or segment
 * and closes, and Escape and Shift+Tab close back to the trigger. Choosing a
 * model closes the menu once the selection settles; choosing an effort by
 * pointer or Enter keeps it open on the newly checked segment. Selecting
 * restores trigger focus without a ring until the trigger loses focus or the
 * menu reopens. Provider headings paint their background only while pinned
 * by scrolling. Model names match a case-insensitive ordered subsequence
 * within each provider group, ranked by prefix, alignment score, then catalog
 * order; clearing a query restores the full list and search focus. Data and
 * submission ride the same per-session ModelDirectory as the /model popup;
 * exact-model reasoning metadata and the selected effort come from the Host
 * rather than a client-owned vocabulary. A rejected selection announces
 * through the shared transient Toast anchored to the composer card; the
 * in-menu strip with Retry remains the catalog-load surface. While the
 * directory's pending selection is unsettled, the trigger shows a spinner in
 * place of its chevron, and each row or segment whose value that selection
 * carries shows one in place of its check mark.
 */
import { MenuGroup, MenuSurface, observeStickyMenuGroups } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties, type KeyboardEvent, type FocusEvent,
} from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { ModelReasoningEffort, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconCloseFillRegular,
  IconDataOutlineRegular, IconWarningOutlineRegular, Input, rankByName, StateDot, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from './slots.ts'
import css from './ModelSelect.module.css'
import { orderModelProviders } from './provider-order.ts'

/** One dynamic effort segment; undefined means preserve the provider default. */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
}

/** Attribute marking an effort segment among the menu's focusable rows. */
const EFFORT_SEGMENT = 'data-effort-segment'

/** Unplaced portal card: hidden but laid out at a fixed origin so offsetWidth/offsetHeight are real (Menu primitive's measure pass). */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

/**
 * Render the composer model seat.
 * @param props - owner share (locked) + injected face (shared directory
 * store/verbs) + the standard locale seat.
 * @returns the trigger and, while open, the model and effort menu.
 */
export function ModelSelect(
  { locked, available, directory, load, select, t }:
  ModelSelectInjected & { locked: boolean } & PropsLocale<'model'>,
) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const [selectionFocus, setSelectionFocus] = useState(false)
  // The in-menu error strip serves catalog loads (its Retry re-runs the
  // load); a rejected SELECTION announces through the transient toast
  // instead, so the strip renders only while the latest failure-capable
  // action was a load.
  const lastActionRef = useRef<'load' | 'select'>('load')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const groupsRef = useRef<HTMLDivElement | null>(null)
  const [menuPos, setMenuPos] = useState<CSSProperties | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  // Set by Tab just before it activates a segment, so that one effort choice
  // closes the menu like every other Tab settle.
  const tabSettle = useRef(false)
  const id = useId()

  const groups = useMemo(() => orderModelProviders(state.groups), [state.groups])
  const choices = useMemo(() => groups.flatMap(group =>
    group.models.map(model => ({
      group,
      model,
      selection: {
        provider: group.id,
        model: model.id,
        ...model.reasoning?.defaultEffort === undefined
          ? {}
          : { reasoningEffort: model.reasoning.defaultEffort },
      } satisfies ModelSelection,
    }))), [groups])
  const showSearch = choices.length > 4
  const filteredGroups = useMemo(() => groups.map(group => ({
    ...group, models: rankByName(group.models, showSearch ? query.trim() : ''),
  })).filter(group => group.models.length > 0), [groups, query, showSearch])
  const visibleModels = useMemo(() => filteredGroups.flatMap(group => group.models.map(model => ({
    provider: group.id, model: model.id,
  }))), [filteredGroups])
  const currentVisibleIndex = visibleModels.findIndex(model =>
    model.provider === state.current?.provider && model.model === state.current.model)
  const activeModelIndex = Math.min(highlightedIndex ?? Math.max(0, currentVisibleIndex), visibleModels.length - 1)
  const selectedIndex = state.current === null
    ? -1
    : choices.findIndex(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
  const currentChoice = choices[selectedIndex]
  const reasoning = currentChoice?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? state.retainedEffort
    : effectiveEffort === undefined
      ? t('effort.providerDefault')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo<readonly EffortChoice[]>(() => reasoning === undefined
    ? []
    : [
      ...reasoning.defaultEffort === undefined
        ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
        : [],
      ...reasoning.efforts.map((effort: ModelReasoningEffort) => ({
        key: `effort:${effort.id}`,
        effort: effort.id,
        label: effort.name,
      })),
    ], [reasoning, t])
  const { pending } = state
  const busy = pending !== null
  // A pending selection on the current model only changes its effort, so only
  // the effort segment spins; a model row spins when the selection switches to it.
  const pendingModel = pending !== null
    && (pending.provider !== state.current?.provider || pending.model !== state.current.model)
    ? pending
    : null

  const reload = (): void => {
    lastActionRef.current = 'load'
    load()
  }

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      // The portaled card is outside the trigger subtree; check both.
      if (rootRef.current?.contains(event.target as Node) === true) return
      if (menuRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  useLayoutEffect(() => {
    if (!showSearch) {
      setQuery('')
      setHighlightedIndex(null)
    }
  }, [showSearch])

  // Opening lands the keyboard on model search when shown, otherwise, for an
  // unselected trigger, on the checked row or the first one; with a current
  // model and no search the trigger keeps focus until the first ↑/↓ or Tab.
  // Search appearing or disappearing while open moves focus the same way. The
  // move waits for placement: the measuring pass keeps the card hidden, and a
  // hidden control cannot take focus.
  const openFocus = useRef(false)
  const previousShowSearch = useRef(showSearch)
  const placed = menuPos !== null
  useEffect(() => {
    if (previousShowSearch.current !== showSearch) {
      previousShowSearch.current = showSearch
      if (open) openFocus.current = true
    }
    if (!open || !placed || !openFocus.current) return
    openFocus.current = false
    if (showSearch) {
      searchRef.current?.focus()
      return
    }
    const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled])')
    const target = checked ?? itemRefs.current.find(item => item !== null && !item.disabled)
    // Rows a selection in flight disabled cannot take the keyboard; the
    // trigger does, so the card's keys still reach the menu.
    ;(target ?? triggerRef.current)?.focus()
  }, [open, showSearch, placed])

  useEffect(() => {
    const viewport = groupsRef.current
    if (viewport === null) return
    return observeStickyMenuGroups(viewport)
  }, [available, open, filteredGroups])

  useLayoutEffect(() => {
    if (open && activeModelIndex >= 0) {
      itemRefs.current[activeModelIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, activeModelIndex, visibleModels])

  // Portaled placement (the Menu primitive's portal rules: fixed from the
  // anchor rect, measured before paint, clamped inside the viewport): above
  // the trigger, right edges aligned. Depends on directory state and the
  // query because async catalog loads, effort availability, and filtering
  // resize the card.
  /* jscpd:ignore-start -- deliberate mirror of ui-primitives useAnchoredPosition:
     that hook only places from the anchor's LEFT edge, while this card aligns
     right edges (x = rect.right - width), so the measure-and-clamp plumbing repeats. */
  useLayoutEffect(() => {
    if (!open) { setMenuPos(null); return }
    const place = (): void => {
      /* v8 ignore next 2 -- the trigger ref is attached whenever the menu is open. */
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      const MARGIN = 12
      const lw = menuRef.current?.offsetWidth ?? 0
      const lh = menuRef.current?.offsetHeight ?? 0
      let x = rect.right - lw
      let y = rect.top - 8 - lh
      if (lw > 0) x = Math.min(Math.max(x, MARGIN), window.innerWidth - lw - MARGIN)
      if (lh > 0) y = Math.min(Math.max(y, MARGIN), window.innerHeight - lh - MARGIN)
      setMenuPos({ left: x, top: y })
    }
    // First run measures the hidden pre-render (same commit as `open`), so
    // the card lands placed before anything paints.
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, state, query])
  /* jscpd:ignore-end */

  if (!available) return null

  const show = (): void => {
    setSelectionFocus(false)
    triggerRef.current?.focus()
    setQuery('')
    setHighlightedIndex(null)
    openFocus.current = showSearch || state.current === null
    setOpen(true)
    reload()
  }

  const changeQuery = (next: string): void => {
    setQuery(next)
    setHighlightedIndex(0)
  }

  const close = (restoreFocus = false): void => {
    setOpen(false)
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const closeAfterSelection = (): void => {
    setSelectionFocus(true)
    close(true)
  }

  const moveFocus = (offset: number): void => {
    const items = itemRefs.current.filter(item => item !== null)
    if (items.length === 0) return
    const active = items.findIndex(item => item === document.activeElement)
    // Focus outside the rows (the trigger, which keeps it while the menu
    // opens) enters at the end the step comes from: the first row forward,
    // the last row backward.
    const next = active === -1
      ? (offset > 0 ? 0 : items.length - 1)
      : (active + offset + items.length) % items.length
    items[next]?.focus()
  }

  /** Effort segments currently mounted, in visual order. */
  const segments = (): HTMLButtonElement[] => itemRefs.current.filter(
    (item): item is HTMLButtonElement => item !== null && item.hasAttribute(EFFORT_SEGMENT))

  /** Step between effort segments, wrapping, when one holds focus. */
  const moveSegment = (offset: number): boolean => {
    const focused = document.activeElement
    if (!(focused instanceof HTMLElement) || !focused.hasAttribute(EFFORT_SEGMENT)) return false
    const row = segments()
    const at = row.findIndex(segment => segment === focused)
    row[(at + offset + row.length) % row.length]?.focus()
    return true
  }

  /** Focus the checked effort segment, or the first enabled one; false when none can take focus. */
  const focusEffortRow = (): boolean => {
    const row = segments().filter(segment => !segment.disabled)
    const target = row.find(segment => segment.getAttribute('aria-checked') === 'true') ?? row[0]
    if (target === undefined) return false
    target.focus()
    return true
  }

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close(true)
      return
    }
    if (!open) return
    if (showSearch && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      if (busy) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const onSegment = document.activeElement instanceof HTMLElement
        && document.activeElement.hasAttribute(EFFORT_SEGMENT)
      // The effort row sits past both ends of the result cycle: stepping out
      // of the results enters it, and stepping out of it returns to search.
      if (onSegment) {
        setHighlightedIndex(visibleModels.length === 0 ? null : direction > 0 ? 0 : visibleModels.length - 1)
        searchRef.current?.focus()
        return
      }
      const next = activeModelIndex + direction
      if ((next < 0 || next >= visibleModels.length) && focusEffortRow()) return
      if (visibleModels.length > 0) {
        setHighlightedIndex((next + visibleModels.length) % visibleModels.length)
        searchRef.current?.focus()
      }
      return
    }
    if (showSearch && event.target instanceof HTMLInputElement
      && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
      if (event.key === 'Tab' && visibleModels.length === 0) return
      event.preventDefault()
      const highlighted = visibleModels[activeModelIndex]
      if (!busy && highlighted !== undefined) choose(highlighted)
      return
    }
    // Tab settles like Enter and Shift+Tab leaves like Escape, so the menu's
    // keys mean what they mean in the composer. Both are consumed: the card
    // keeps the browser's focus traversal out while it is open.
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        event.preventDefault()
        close(true)
        return
      }
      // Settling activates the row the keyboard is on; with focus still on the
      // trigger, Tab enters the menu at the value in use instead. Any other
      // control inside the card (a retry button) keeps the browser's traversal,
      // so the keystroke stays unconsumed there.
      const focused = document.activeElement
      const rows = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null)
      if (focused instanceof HTMLButtonElement && rows.includes(focused)) {
        event.preventDefault()
        tabSettle.current = focused.hasAttribute(EFFORT_SEGMENT)
        focused.click()
        return
      }
      if (focused !== triggerRef.current) return
      event.preventDefault()
      if (showSearch) {
        setHighlightedIndex(null)
        searchRef.current?.focus()
        return
      }
      const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled])')
      ;(checked ?? rows.find(item => !item.disabled))?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      && moveSegment(event.key === 'ArrowRight' ? 1 : -1)) {
      event.preventDefault()
    }
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && (
      rootRef.current?.contains(event.relatedTarget) === true
      || menuRef.current?.contains(event.relatedTarget) === true
    )) return
    close()
  }

  const settleSelection = (
    result: Awaited<ReturnType<ModelSelectInjected['select']>>,
    closeOnSuccess: boolean,
  ): void => {
    if (result === undefined) return
    if (result.ok) {
      if (rootRef.current === null) return
      if (closeOnSuccess) {
        closeAfterSelection()
        return
      }
      // The menu stays open: the keyboard returns to the segment now checked.
      queueMicrotask(() => {
        menuRef.current?.querySelector<HTMLElement>(`[${EFFORT_SEGMENT}][aria-checked="true"]`)?.focus()
      })
      return
    }
    const { error } = result
    toastSeq.current += 1
    setToast({
      seq: toastSeq.current,
      text: error.code === 'session/writer-held'
        ? t('error.sessionInUse')
        : t('error.action', { message: `${error.code}: ${error.message}` }),
    })
  }

  const submit = (selection: ModelSelection, closeOnSuccess: boolean): void => {
    lastActionRef.current = 'select'
    // Disabled option rows cannot retain focus while a selection is pending.
    setSelectionFocus(true)
    triggerRef.current?.focus()
    void select(selection).then((result) => { settleSelection(result, closeOnSuccess) })
  }

  const choose = (selection: ModelSelection): void => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      closeAfterSelection()
      return
    }
    submit(selection, true)
  }

  const chooseEffort = (effort: string | undefined): void => {
    const settle = tabSettle.current
    tabSettle.current = false
    if (state.current === null) return
    if (effectiveEffort === effort) {
      if (settle) closeAfterSelection()
      return
    }
    const selection: ModelSelection = {
      provider: state.current.provider,
      model: state.current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    }
    submit(selection, settle)
  }

  const waiting = state.current === null && state.status === 'loading'
  const modelLabel = waiting
    ? t('trigger.loading')
    : currentChoice?.model.name
      ?? (state.current === null ? t('trigger.fallback') : `${state.current.provider}/${state.current.model}`)
  const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`
  const triggerAria = waiting
    ? t('trigger.loading')
    : state.current === null
      ? t('trigger.selectAria')
      : effortLabel === undefined
        ? t('trigger.aria', { model: modelLabel })
        : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })
  // Each committed render re-attaches every row at its index and detaches
  // unmounted rows to null; the array is never reset here, because React can
  // discard a render (a same-state bailout) without committing its refs.
  let itemIndex = 0
  let modelIndex = 0
  const itemRef = () => {
    const at = itemIndex++
    return (node: HTMLButtonElement | null) => { itemRefs.current[at] = node }
  }

  return (
    <div
      ref={rootRef}
      className={css.root}
      onKeyDown={onRootKeyDown}
      onBlur={onBlur}
      onMouseDown={(event) => {
        // WebKit blurs a focused row before click unless the button's mousedown keeps focus.
        if (event.target instanceof Element && event.target.closest('button') !== null) event.preventDefault()
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-label={triggerAria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={triggerLabel}
        aria-busy={busy}
        data-selection-focus={selectionFocus ? '' : undefined}
        onBlur={() => { setSelectionFocus(false) }}
        disabled={locked}
        onClick={() => {
          if (open) {
            close(true)
          } else {
            show()
          }
        }}
      >
        <IconDataOutlineRegular className={css.triggerIcon} size={16} />
        <span className={css.triggerLabel}>{modelLabel}</span>
        {effortLabel !== undefined && <span className={css.triggerEffort}>{effortLabel}</span>}
        {busy
          ? <StateDot state="ongoing" />
          : <IconChevronDownOutlineRegular className={clsx(css.chevron, open && css.chevronOpen)} />}
      </button>

      {/* Portaled to body (Menu primitive's portal mode) so the sidebar and
          column overflow clips cannot crop the card; synthetic events still
          bubble through this React subtree, keeping onKeyDown/onBlur live. */}
      {open && createPortal(
        <MenuSurface
          ref={menuRef}
          id={`${id}-menu`}
          className={css.menu}
          style={menuPos ?? MEASURE_STYLE}
          role="group"
          aria-label={t('menu.aria')}
          aria-busy={state.status === 'loading' || busy}
        >
          {showSearch && <div className={css.searchRow}>
            <Input
              ref={searchRef}
              className={clsx(css.search, query !== '' && css.searchWithQuery)}
              type="text"
              role="searchbox"
              aria-label={t('search.placeholder')}
              aria-controls={`${id}-models`}
              aria-activedescendant={activeModelIndex < 0 ? undefined : `${id}-model-${activeModelIndex}`}
              placeholder={t('search.placeholder')}
              value={query}
              readOnly={busy}
              onChange={(event) => { changeQuery(event.target.value) }}
            />
            {query !== '' && (
              <button
                type="button"
                className={css.searchClear}
                aria-label={t('search.clear')}
                disabled={busy}
                onClick={() => {
                  changeQuery('')
                  searchRef.current?.focus()
                }}
              >
                <IconCloseFillRegular />
              </button>
            )}
          </div>}
          {state.status === 'loading' && (
            <div className={css.status}>{t('status.loading')}</div>
          )}
          {state.error !== null && lastActionRef.current === 'load' && (
            <div className={css.error}>
              <span>{t('error.action', { message: state.error })}</span>
              <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
            </div>
          )}
          {state.failures.map(failure => (
            <div className={css.warning} key={failure.id}>
              <span>{t('warning.groupLoad', { name: failure.id === 'deepseek-account' ? t('provider.account') : failure.name, message: failure.message })}</span>
              <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
            </div>
          ))}
          <div
            ref={groupsRef}
            id={`${id}-models`}
            className={clsx(css.groups, 'scrollable')}
            role="menu"
            aria-label={t('menu.model')}
            hidden={filteredGroups.length === 0}
          >
            {filteredGroups.map(group => (
              <MenuGroup key={group.id} label={group.id === 'deepseek-account' ? t('provider.account') : group.name}>
                {group.models.map((model) => {
                  const index = modelIndex++
                  const selected = state.current?.provider === group.id && state.current.model === model.id
                  return (
                    <button
                      ref={itemRef()}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      id={`${id}-model-${index}`}
                      tabIndex={showSearch ? -1 : 0}
                      onFocus={() => { setHighlightedIndex(index) }}
                      data-highlighted={index === activeModelIndex ? '' : undefined}
                      className={clsx(
                        css.option, css.modelOption, selected && css.selected, index === activeModelIndex && css.optionActive,
                      )}
                      onMouseMove={busy || index === activeModelIndex ? undefined : () => {
                        if (showSearch) setHighlightedIndex(index)
                        else itemRefs.current[index]?.focus()
                      }}
                      key={model.id}
                      title={model.name}
                      disabled={busy}
                      onClick={() => { choose({ provider: group.id, model: model.id }) }}
                    >
                      <span className={css.optionCopy}>
                        <span className={css.modelName}>{model.name}</span>
                      </span>
                      <span className={css.check}>
                        {pendingModel?.provider === group.id && pendingModel.model === model.id
                          ? <StateDot state="ongoing" />
                          : selected ? <IconCheckOutlineRegular /> : null}
                      </span>
                    </button>
                  )
                })}
              </MenuGroup>
            ))}
          </div>
          {state.status === 'ready' && filteredGroups.length === 0 && (
            <div className={css.empty} role="status">{t(choices.length === 0 ? 'empty.models' : 'search.empty')}</div>
          )}

          {reasoning !== undefined && (
            <div className={css.effort}>
              <div className={css.effortTitle} id={`${id}-effort`}>{t('menu.effort')}</div>
              {effortChoices.length === 0
                ? <div className={css.empty}>{t('empty.efforts')}</div>
                : (
                  <div className={css.segments} role="menu" aria-orientation="horizontal" aria-labelledby={`${id}-effort`}>
                    {effortChoices.map((level) => {
                      const checked = effectiveEffort === level.effort
                      return (
                        <button
                          ref={itemRef()}
                          type="button"
                          role="menuitemradio"
                          aria-checked={checked}
                          {...{ [EFFORT_SEGMENT]: '' }}
                          className={clsx(css.segment, checked && css.segmentChecked)}
                          key={level.key}
                          disabled={busy}
                          onClick={() => { chooseEffort(level.effort) }}
                        >
                          {pending !== null && pending.provider === state.current?.provider
                            && pending.model === state.current.model && pending.reasoningEffort === level.effort
                            && <StateDot state="ongoing" />}
                          <span className={css.segmentLabel}>{level.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
            </div>
          )}
        </MenuSurface>,
        document.body,
      )}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutlineRegular />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
