import type { MouseEvent, ReactNode } from 'react'

/** Class for the control a table row stands for: its link or its main button. */
export const ROW_PRIMARY_CLASS = 'row-primary'

const INTERACTIVE =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="combobox"], [contenteditable="true"]'

/**
 * Forwards a click on a row's empty space to the row's primary control, so a
 * row that highlights on hover also responds everywhere it highlights. Clicks
 * on other controls, text selections and rows without a primary control are
 * left alone. Keyboard users keep tabbing to the primary control itself.
 */
export function forwardRowClick(event: MouseEvent<HTMLElement>): void {
  if (event.defaultPrevented || event.button !== 0) return
  const target = event.target
  if (!(target instanceof Element) || target.closest(INTERACTIVE)) return
  if (window.getSelection()?.toString()) return

  const row = target.closest('tr')
  if (!row || !event.currentTarget.contains(row)) return
  const primary = row.querySelector<HTMLElement>(`.${ROW_PRIMARY_CLASS}`)
  if (!primary || primary.matches(':disabled, [aria-disabled="true"]')) return

  primary.dispatchEvent(
    new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    }),
  )
}

/** Wraps a Table whose rows mark their primary control with `ROW_PRIMARY_CLASS`. */
export function ClickableRows({ children }: { children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer shortcut only; each row's primary control stays focusable and keyboard operable
    // biome-ignore lint/a11y/useKeyWithClickEvents: same as above, the keyboard path is the primary control itself
    <div className="clickable-rows" onClick={forwardRowClick}>
      {children}
    </div>
  )
}
