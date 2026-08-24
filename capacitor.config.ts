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
    // 'body' resizes the document body to the visible (non-keyboard) area
    // on both platforms, so the existing 100vh/100dvh-based flex layout
    // just recalculates against the shrunk viewport instead of the
    // keyboard silently covering whatever sits at the bottom of the page.
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
