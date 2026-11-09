import { Avatar } from '@astryxdesign/core/Avatar'

interface ProductThumbProps {
  name: string
  imageUrl?: string
  size?: 'xsm' | 'sm' | 'md' | 'lg'
}

/** Product image, or the product's initials on a neutral tile when it has none. */
export function ProductThumb({ name, imageUrl, size = 'md' }: ProductThumbProps) {
  return <Avatar name={name} src={imageUrl} size={size} shape="rounded" tooltip={false} />
}
