import type { JSX } from 'preact'
import { createContext } from 'preact'
import { useContext, useState } from 'preact/hooks'
import { Link } from './Link'

function clsx(...classes: (string | undefined | boolean | JSX.SignalLike<string | undefined>)[]): string {
  return classes.filter(Boolean).join(' ')
}

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

export function Table({
  bleed = false,
  dense = false,
  grid = false,
  striped = false,
  class: className = '',
  children,
  ...props
}: {
  bleed?: boolean
  dense?: boolean
  grid?: boolean
  striped?: boolean
} & JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <TableContext.Provider value={{ bleed, dense, grid, striped }}>
      <div class="flow-root">
        <div {...props} class={clsx(className, '-mx-4 overflow-x-auto whitespace-nowrap')}>
          <div class={clsx('inline-block min-w-full align-middle', !bleed && 'sm:px-4')}>
            <table class="min-w-full text-left text-sm/6 text-gray-900 dark:text-white relative">{children}</table>
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

export function TableRow({
  href,
  target,
  title,
  class: className = '',
  ...props
}: {
  href?: string
  target?: string
  title?: string
} & JSX.HTMLAttributes<HTMLTableRowElement>) {
  const { striped } = useContext(TableContext)

  return (
    <TableRowContext.Provider value={{ href, target, title }}>
      <tr
        {...props}
        class={clsx(
          className,
          href &&
            'has-[[data-row-link][data-focus]]:outline-2 has-[[data-row-link][data-focus]]:-outline-offset-2 has-[[data-row-link][data-focus]]:outline-blue-500 dark:focus-within:bg-white/2.5',
          striped && 'even:bg-gray-100/50 dark:even:bg-white/5',
          href && striped && 'hover:bg-gray-100/70 dark:hover:bg-white/10',
          href && !striped && 'hover:bg-gray-100/50 dark:hover:bg-white/5',
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
        'border-b border-b-gray-200 px-4 py-2 font-medium text-gray-900 first:pl-4 last:pr-4 dark:border-b-gray-700',
        grid && 'border-l border-l-gray-200 first:border-l-0 dark:border-l-gray-700',
        !bleed && 'sm:first:pl-2 sm:last:pr-2',
      )}
    />
  )
}

export function TableCell({ class: className = '', children, ...props }: JSX.HTMLAttributes<HTMLTableCellElement>) {
  const { bleed, dense, grid, striped } = useContext(TableContext)
  const { href, target, title } = useContext(TableRowContext)
  const [cellRef, setCellRef] = useState<HTMLElement | null>(null)

  return (
    <td
      ref={href ? setCellRef : undefined}
      {...props}
      class={clsx(
        className,
        'relative px-4 first:pl-4 last:pr-4 text-gray-900',
        !striped && 'border-b border-gray-100 dark:border-gray-800',
        grid && 'border-l border-l-gray-200 first:border-l-0 dark:border-l-gray-700',
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
