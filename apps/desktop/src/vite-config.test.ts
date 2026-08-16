import { describe, expect, it } from 'bun:test'
import type { ConfigEnv, UserConfig, UserConfigFnObject } from 'vite'
import desktopViteConfig from '../vite.config'

const buildEnv: ConfigEnv = {
  command: 'build',
  mode: 'production',
  isSsrBuild: false,
  isPreview: false,
}

async function resolveDesktopBuildConfig(): Promise<UserConfig> {
  if (typeof desktopViteConfig === 'function') {
    return await (desktopViteConfig as UserConfigFnObject)(buildEnv)
  }

  return desktopViteConfig
}

describe('desktop vite config', () => {
  it('uses relative asset paths for packaged production builds', async () => {
    const config = await resolveDesktopBuildConfig()

    expect(config.base).toBe('./')
  })
})
