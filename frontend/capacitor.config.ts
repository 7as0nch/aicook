import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  server: {
    url: 'http://172.16.1.76:5173',
    cleartext: true,
  },
  appId: 'chat.aihelper.cook',
  appName: 'AIcook',
  webDir: 'dist'
};

export default config;
