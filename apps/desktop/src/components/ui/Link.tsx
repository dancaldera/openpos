import type { JSX } from 'preact'
import { forwardRef } from 'preact/compat'

interface LinkProps extends JSX.HTMLAttributes<HTMLAnchorElement> {
  href: string
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  const { href, children, ...rest } = props

  return (
    <a href={href} ref={ref} {...rest}>
      {children}
    </a>
  )
})
