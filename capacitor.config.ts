import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eliteNotebook.app',
  appName: 'The Elite Notebook',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#E9EAF6',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
