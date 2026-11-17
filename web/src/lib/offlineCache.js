// The last data received from the server, kept on this device so the app can show the calendar
// immediately on start (e.g. while a sleeping free server wakes up) and refresh it in the background.

const KEY = 'wc_cache_v1';

export function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    return c && c.me && c.me.id ? c : null;
  } catch {
    return null;
  }
}

export function saveCache(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch { /* storage full or unavailable: the app still works without it */ }
}

export function clearCache() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
