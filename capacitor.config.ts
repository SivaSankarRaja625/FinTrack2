import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.fintrack.app',
  appName: 'FinTrack',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
}

export default config
