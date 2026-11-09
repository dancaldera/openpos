import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

/** Centered, window-filling loader used while the app boots. */
export function FullPageLoader({ message }: { message?: string }) {
  return (
    <div className="drag-region flex min-h-screen items-center justify-center">
      <Spinner size="xl" label={message} />
    </div>
  )
}

/** Centered, window-filling error with a single recovery action. */
export function FullPageError({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string
  message: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="drag-region flex min-h-screen items-center justify-center p-6">
      <div className="no-drag max-w-md">
        <VStack gap={3} hAlign="center">
          <Heading level={1}>{title}</Heading>
          <Text type="supporting" justify="center">
            {message}
          </Text>
          <Button label={actionLabel} variant="primary" onClick={onAction} />
        </VStack>
      </div>
    </div>
  )
}
