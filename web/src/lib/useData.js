import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api.js';
import { mergeSettings, migrateSettings } from './settings.js';

/** Loads the signed-in user's data and keeps it live across devices via socket.io. */
export function useData(range) {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const [settings, setSettings] = useState(mergeSettings());
  const [events, setEvents] = useState([]);
  const [days, setDays] = useState({}); // date → { bg, list } (cell color, list style)
  const [countdowns, setCountdowns] = useState([]);
  const [online, setOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const saveTimer = useRef(null);
  const pendingSettings = useRef({});

  const loadEvents = useCallback(async () => {
    const { from, to } = rangeRef.current;
    try {
      setEvents(await api.events(from, to));
    } catch (e) {
      if (e.status === 401) setMe(null);
    }
  }, []);
  const loadDays = useCallback(async () => {
    const { from, to } = rangeRef.current;
    try {
      const list = await api.days(from, to);
      setDays(Object.fromEntries(list.map((d) => [d.date, { bg: d.bg || '', list: d.list || '' }])));
    } catch { /* ignore */ }
  }, []);
  const loadCountdowns = useCallback(() => api.countdowns().then(setCountdowns).catch(() => {}), []);
  const loadMe = useCallback(async () => {
    try {
      const m = await api.me();
      const patch = migrateSettings(m.settings);
      if (patch) {
        m.settings = { ...m.settings, ...patch };
        api.saveSettings(patch).catch(() => {});
      }
      setMe(m);
      setSettings(mergeSettings({ ...m.settings, ...pendingSettings.current }));
      return m;
    } catch (e) {
      if (e.status === 401) setMe(null);
      else setOnline(false);
      return null;
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);
  const signedIn = me?.id;
  useEffect(() => { if (signedIn) { loadEvents(); loadDays(); } }, [signedIn, range.from, range.to, loadEvents, loadDays]);
  useEffect(() => { if (signedIn) loadCountdowns(); }, [signedIn, loadCountdowns]);

  // One socket per signed-in user. Depend on the id only: reloading the account (e.g. after a
  // settings change or a reconnect) creates a new `me` object and must not reconnect the socket.
  const userId = me?.id;
  useEffect(() => {
    if (!userId) return undefined;
    const socket = io({ path: '/socket.io', withCredentials: true });
    const timers = {};
    const debounce = (key, fn) => { clearTimeout(timers[key]); timers[key] = setTimeout(fn, 250); };
    // (Re)connected: reload everything, since changes may have been missed while away.
    socket.on('connect', () => { setOnline(true); loadMe(); loadEvents(); loadDays(); loadCountdowns(); });
    socket.on('disconnect', () => setOnline(false));
    socket.on('connect_error', () => setOnline(false)); // e.g. the server is still waking up
    socket.on('changed', ({ kind }) => {
      if (kind === 'events') debounce('events', loadEvents);
      if (kind === 'days') debounce('days', loadDays);
      if (kind === 'countdowns') debounce('countdowns', loadCountdowns);
      if (kind === 'settings') debounce('settings', loadMe);
    });
    const onFocus = () => loadEvents();
    window.addEventListener('focus', onFocus);
    return () => {
      socket.close();
      window.removeEventListener('focus', onFocus);
    };
  }, [userId, loadEvents, loadDays, loadCountdowns, loadMe]);

  const updateSettings = useCallback((patch) => {
    setSettings((cur) => mergeSettings({ ...cur, ...patch }));
    pendingSettings.current = { ...pendingSettings.current, ...patch };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const body = pendingSettings.current;
      pendingSettings.current = {};
      api.saveSettings(body).catch(() => {});
    }, 400);
  }, []);

  /** Reload everything from the server. Resolves true when the server answered. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    const started = Date.now();
    let ok = false;
    try {
      const m = await loadMe();
      if (m) {
        await Promise.all([loadEvents(), loadDays(), loadCountdowns()]);
        ok = true;
        setOnline(true);
      }
    } finally {
      // Spin long enough to be seen.
      const left = 700 - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      setRefreshing(false);
    }
    return ok;
  }, [loadMe, loadEvents, loadDays, loadCountdowns]);

  // Apply settings sent from the desktop settings window (it saves them itself).
  const previewSettings = useCallback((patch) => setSettings((cur) => mergeSettings({ ...cur, ...patch })), []);

  return {
    me, setMe, loadMe, settings, updateSettings, previewSettings, events, setEvents, loadEvents, days, setDays,
    countdowns, setCountdowns, loadCountdowns,
    online, refreshing, refresh,
    syncing: refreshing || !online,
  };
}
