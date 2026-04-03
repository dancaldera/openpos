import type { JSX } from 'preact'
import { createContext } from 'preact'
import { useContext, useState } from 'preact/hooks'
import { clsx } from '../../lib/utils'
import { Link } from './Link'

const TableContext = createContext<{
  bleed: boolean
  dense: boolean
  grid: boolean
  striped: boolean
}>({
  bleed: false,
  dense: false,
  grid: false,
  striped: false,
})

interface TableProps {
  bleed?: boolean
  dense?: boolean
  grid?: boolean
  striped?: boolean
  class?: string
  children?: preact.ComponentChildren
}

export function Table({
  bleed = false,
  dense = false,
  grid = false,
  striped = false,
  class: className = '',
  children,
  ...props
}: TableProps & JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <TableContext.Provider value={{ bleed, dense, grid, striped }}>
      <div class="flow-root">
        <div {...props} class={clsx(className, '-mx-4 overflow-x-auto whitespace-nowrap')}>
          <div class={clsx('inline-block min-w-full align-middle', !bleed && 'sm:px-4')}>
            <table class="min-w-full text-left text-sm/6 text-gray-900 dark:text-gray-100 relative">{children}</table>
          </div>
        </div>
      </div>
    </TableContext.Provider>
  )
}

export function TableHead({ class: className = '', ...props }: JSX.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} class={clsx(className, 'text-gray-500 dark:text-gray-400')} />
}

export function TableBody(props: JSX.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}

const TableRowContext = createContext<{
  href?: string
  target?: string
  title?: string
}>({
  href: undefined,
  target: undefined,
  title: undefined,
})

interface TableRowProps {
  href?: string
  target?: string
  title?: string
  class?: string
}

export function TableRow({
  href,
  target,
  title,
  class: className = '',
  ...props
}: TableRowProps & JSX.HTMLAttributes<HTMLTableRowElement>) {
  const { striped } = useContext(TableContext)

  return (
    <TableRowContext.Provider value={{ href, target, title }}>
      <tr
        {...props}
        class={clsx(
          className,
          href &&
            'has-[[data-row-link][data-focus]]:outline-2 has-[[data-row-link][data-focus]]:-outline-offset-2 has-[[data-row-link][data-focus]]:outline-blue-500',
          striped && 'even:bg-gray-50/80 dark:even:bg-gray-800/40',
          href && striped && 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
          href && !striped && 'hover:bg-gray-50/80 dark:hover:bg-gray-800/40',
        )}
      />
    </TableRowContext.Provider>
  )
}

export function TableHeader({ class: className = '', ...props }: JSX.HTMLAttributes<HTMLTableCellElement>) {
  const { bleed, grid } = useContext(TableContext)

  return (
    <th
      {...props}
      class={clsx(
        className,
        'border-b border-b-gray-200 dark:border-b-gray-700 px-4 py-2 font-medium text-gray-700 dark:text-gray-300 first:pl-4 last:pr-4',
        grid && 'border-l border-l-gray-200 dark:border-l-gray-700 first:border-l-0',
        !bleed && 'sm:first:pl-2 sm:last:pr-2',
      )}
    />
  )
}

export function TableCell({
  class: className = '',
  children,
  colSpan,
  ...props
}: JSX.HTMLAttributes<HTMLTableCellElement> & { colSpan?: number }) {
  const { bleed, dense, grid, striped } = useContext(TableContext)
  const { href, target, title } = useContext(TableRowContext)
  const [cellRef, setCellRef] = useState<HTMLElement | null>(null)

  return (
    <td
      ref={href ? setCellRef : undefined}
      colSpan={colSpan}
      {...props}
      class={clsx(
        className,
        'relative px-4 first:pl-4 last:pr-4 text-gray-900 dark:text-gray-100',
        !striped && 'border-b border-gray-100 dark:border-gray-800',
        grid && 'border-l border-l-gray-200 dark:border-l-gray-700 first:border-l-0',
        dense ? 'py-2.5' : 'py-3',
        !bleed && 'sm:first:pl-2 sm:last:pr-2',
      )}
    >
      {href && (
        <Link
          data-row-link
          href={href}
          aria-label={title}
          tabIndex={cellRef?.previousElementSibling === null ? 0 : -1}
          class="absolute inset-0 focus:outline-hidden"
          {...(target ? { target } : {})}
        />
      )}
      {children}
    </td>
  )
}
