import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dmacchickencrunch.app',
  appName: "D'Mac Chicken Crunch",
  webDir: 'dist',
  server: {
    // Load from VPS server so app always has latest UI without APK rebuild
    url: 'http://72.61.214.92:8080',
    cleartext: true,  // Allow HTTP (non-HTTPS) connections
    allowNavigation: [
      'app.sandbox.midtrans.com',
      'app.midtrans.com',
      '72.61.214.92',
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#f97316',
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
