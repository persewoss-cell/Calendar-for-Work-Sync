// Bridge to the Electron shell (undefined in the browser / PWA).
export const desktop = typeof window !== 'undefined' ? window.workcalDesktop : undefined;
export const isDesktop = Boolean(desktop);
