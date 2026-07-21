import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dmacchickencrunch.app',
  appName: "D'Mac Chicken Crunch",
  webDir: 'dist',
  server: {
    // Allow navigation to Midtrans payment pages
    allowNavigation: [
      'app.sandbox.midtrans.com',
      'app.midtrans.com',
      '72.61.214.92',
    ],
    // Allow HTTP (non-HTTPS) for API calls to VPS
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      showSpinner: true,
      spinnerColor: '#f97316',
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
