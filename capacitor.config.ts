import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.pyobs.app',
  appName: 'pyobs',
  webDir: 'dist',
  // Capacitor's default ('debug') logs every bridge call and result in debug builds, which
  // includes SecureStorage reads, i.e. saved passwords in plain text in logcat. Release APKs are
  // debug builds (RELEASING.md), so this has to be off everywhere. JS console output still logs.
  loggingBehavior: 'none'
};

export default config;
