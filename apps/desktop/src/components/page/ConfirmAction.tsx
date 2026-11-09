import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/Stack'
import { useState } from 'react'

interface ConfirmActionProps {
  /** Label of the button that starts the action. */
  label: string
  /** Question shown once the button is pressed. */
  title: string
  description?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void | Promise<void>
  variant?: 'destructive' | 'secondary'
  size?: 'sm' | 'md'
  isDisabled?: boolean
}

/**
 * Two-step confirmation that stays in the page instead of opening a dialog: the
 * button turns into a banner that asks for confirmation in place.
 */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  variant = 'destructive',
  size = 'md',
  isDisabled = false,
}: ConfirmActionProps) {
  const [isAsking, setIsAsking] = useState(false)

  if (!isAsking) {
    return (
      <Button label={label} variant={variant} size={size} isDisabled={isDisabled} onClick={() => setIsAsking(true)} />
    )
  }

  return (
    <Banner
      status={variant === 'destructive' ? 'error' : 'warning'}
      title={title}
      description={description}
      collapsible={false}
      endContent={
        <HStack gap={2}>
          <Button label={cancelLabel} variant="secondary" size="sm" onClick={() => setIsAsking(false)} />
          <Button
            label={confirmLabel}
            variant={variant === 'destructive' ? 'destructive' : 'primary'}
            size="sm"
            clickAction={async () => {
              await onConfirm()
              setIsAsking(false)
            }}
          />
        </HStack>
      }
    />
  )
}
