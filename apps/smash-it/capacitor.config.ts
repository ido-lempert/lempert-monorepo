import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // The store id can't change after the first upload: set the final one before publishing.
  appId: 'com.lempert.smashit',
  appName: 'Smash It!',
  webDir: 'dist',
  backgroundColor: '#ffb84d',
  ios: { contentInset: 'never', backgroundColor: '#ffb84d' },
  android: { backgroundColor: '#ffb84d' },
  server: { androidScheme: 'https' },
};

export default config;
