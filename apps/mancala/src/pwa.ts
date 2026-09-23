/** Install prompt, full-screen and connectivity helpers for the PWA. */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  // Keep the browser's prompt for our own "Install app" menu item.
  e.preventDefault();
  installEvent = e as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  notify();
});
window.addEventListener('online', notify);
window.addEventListener('offline', notify);
document.addEventListener('fullscreenchange', notify);

/** Call when install / fullscreen / connectivity state changes. */
export function onPwaChange(fn: () => void) {
  listeners.add(fn);
}

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function canInstall(): boolean {
  return installEvent !== null && !isStandalone();
}

export async function install() {
  if (!installEvent) return;
  await installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  notify();
}

/** Full screen is offered when running in a browser tab (an installed app already has the whole window). */
export function canFullscreen(): boolean {
  return document.fullscreenEnabled && !isStandalone();
}

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

export async function toggleFullscreen() {
  if (isFullscreen()) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

export function isOnline(): boolean {
  return navigator.onLine;
}
