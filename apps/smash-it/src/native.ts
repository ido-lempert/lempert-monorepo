/** Whether the game runs inside the iOS / Android store app (a Capacitor shell around the same web build). */
export const isNative = (): boolean => (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
