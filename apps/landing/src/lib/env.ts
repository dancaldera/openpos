export function requireEnv(name: string): string {
  const value = import.meta.env[name] ?? process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is not set`)
  }
  return value
}

export function getEnv(name: string): string | undefined {
  return import.meta.env[name] ?? process.env[name]
}
