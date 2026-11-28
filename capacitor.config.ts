import type { CapacitorConfig } from '@capacitor/cli';
import { OEM_CONFIG } from './src/config/oemConfig';

const config: CapacitorConfig = {
  appId: OEM_CONFIG.packageId,
  appName: OEM_CONFIG.appName,
  webDir: 'dist',
  backgroundColor: '#000000',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#000000',
  },
  plugins: {
    Media: {
      androidGalleryMode: true,
    },
  },
};

export default config;
