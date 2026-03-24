import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'nl.buurtcheck.app.ios',
  appName: 'Buurt Check',
  webDir: 'frontend/dist',
  bundledWebRuntime: false,
  ios: {
    path: 'ios',
  },
};

export default config;
