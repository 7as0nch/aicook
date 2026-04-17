import type { CapacitorConfig } from '@capacitor/cli'

const devServerUrl = process.env.VITE_CAPACITOR_SERVER_URL?.trim()

const config: CapacitorConfig = {
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          cleartext: true,
        },
      }
    : {}),
  appId: 'chat.aihelper.cook',
  appName: 'AIcook',
  webDir: 'dist',
}

export default config
