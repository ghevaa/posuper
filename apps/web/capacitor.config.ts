import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dmacchickencrunch.app',
  appName: "D'Mac Chicken Crunch",
  webDir: 'dist',
  server: {
    // Load live UI from VPS so mobile UI updates automatically without reinstalling APK
    url: 'http://72.61.214.92:8080',
    // Allow navigation to Midtrans payment pages
    allowNavigation: [
      'app.sandbox.midtrans.com',
      'app.midtrans.com',
      '72.61.214.92',
    ],
    // Allow HTTP (non-HTTPS) for API calls to VPS
    cleartext: true,
    // Load app itself over http:// so it's not blocked as Mixed Content when calling http API
    androidScheme: 'http',
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
