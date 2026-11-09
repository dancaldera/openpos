import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Delete } from 'lucide-react'

interface PinKeypadProps {
  onDigit: (digit: string) => void
  onBackspace: () => void
  onClear: () => void
  clearLabel: string
  backspaceLabel: string
  isDisabled?: boolean
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** On-screen number pad for entering a PIN on touch devices. */
export function PinKeypad({ onDigit, onBackspace, onClear, clearLabel, backspaceLabel, isDisabled }: PinKeypadProps) {
  return (
    <Grid columns={3} gap={2} maxWidth={280}>
      {DIGITS.map((digit) => (
        <Button
          key={digit}
          label={digit}
          size="lg"
          width="100%"
          isDisabled={isDisabled}
          onClick={() => onDigit(digit)}
        />
      ))}
      <Button label={clearLabel} size="lg" variant="ghost" width="100%" isDisabled={isDisabled} onClick={onClear} />
      <Button label="0" size="lg" width="100%" isDisabled={isDisabled} onClick={() => onDigit('0')} />
      <IconButton
        label={backspaceLabel}
        icon={<Delete size={18} />}
        size="lg"
        variant="ghost"
        isDisabled={isDisabled}
        onClick={onBackspace}
      />
    </Grid>
  )
}
