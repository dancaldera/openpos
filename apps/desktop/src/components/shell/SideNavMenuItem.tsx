import { DropdownMenu, type DropdownMenuOption, type DropdownMenuTriggerProps } from '@astryxdesign/core/DropdownMenu'
import { SideNavItem, type SideNavItemProps } from '@astryxdesign/core/SideNav'
import { type ReactNode, useCallback, useLayoutEffect, useRef } from 'react'

interface SideNavMenuItemProps {
  label: string
  icon: SideNavItemProps['icon']
  /** Passive trailing content: a status dot, a version, a chevron. */
  endContent?: ReactNode
  items: DropdownMenuOption[]
}

/**
 * A side nav row whose whole surface opens a menu, instead of an inert row
 * with a small options button at its end.
 */
export function SideNavMenuItem({ label, icon, endContent, items }: SideNavMenuItemProps) {
  return (
    <DropdownMenu
      items={items}
      placement="above"
      renderTrigger={(trigger) => <MenuRow label={label} icon={icon} endContent={endContent} trigger={trigger} />}
    />
  )
}

function MenuRow({
  label,
  icon,
  endContent,
  trigger,
}: Omit<SideNavMenuItemProps, 'items'> & { trigger: DropdownMenuTriggerProps }) {
  const { ref: triggerRef, onClick, onClickCapture, ...rest } = trigger
  const element = useRef<HTMLElement | null>(null)
  const ref = useCallback(
    (node: HTMLElement | null) => {
      element.current = node
      triggerRef(node)
    },
    [triggerRef],
  )

  // SideNavItem owns aria-expanded/aria-controls (for nested rows) and clears
  // them, so the menu state is written to the element directly.
  useLayoutEffect(() => {
    element.current?.setAttribute('aria-expanded', String(rest['aria-expanded']))
    element.current?.setAttribute('aria-controls', rest['aria-controls'])
  }, [rest['aria-expanded'], rest['aria-controls']])

  return (
    <SideNavItem
      label={label}
      icon={icon}
      endContent={endContent}
      {...rest}
      ref={ref}
      // Not SideNavItem's onClick: in the mobile drawer it closes the drawer
      // after onClick, which would hide the row the menu is anchored to.
      onClickCapture={(event) => {
        onClickCapture(event)
        onClick(event)
      }}
    />
  )
}
