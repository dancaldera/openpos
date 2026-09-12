interface AppLogoProps {
  class?: string
}

export function AppLogo({ class: className = 'h-8 w-8' }: AppLogoProps) {
  return <img src="/icon.png" alt="" class={className} aria-hidden="true" />
}
