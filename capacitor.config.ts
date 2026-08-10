import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.gastoclaro.app',
  appName: 'Lunumia',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
