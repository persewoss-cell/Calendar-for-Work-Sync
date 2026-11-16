import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api.js';
import { mergeSettings } from './settings.js';

/** Loads the signed-in user's data and keeps it live across devices via socket.io. */
export function useData(range) {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const [settings, setSettings] = useState(mergeSettings());
  const [events, setEvents] = useState([]);
  const [days, setDays] = useState({}); // date → cell background color
  const [notes, setNotes] = useState([]);
  const [countdowns, setCountdowns] = useState([]);
  const [online, setOnline] = useState(true);
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
      setDays(Object.fromEntries(list.map((d) => [d.date, d.bg])));
    } catch { /* ignore */ }
  }, []);
  const loadNotes = useCallback(() => api.notes().then(setNotes).catch(() => {}), []);
  const loadCountdowns = useCallback(() => api.countdowns().then(setCountdowns).catch(() => {}), []);
  const loadMe = useCallback(async () => {
    try {
      const m = await api.me();
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
  useEffect(() => { if (me) { loadEvents(); loadDays(); } }, [me, range.from, range.to, loadEvents, loadDays]);
  useEffect(() => { if (me) { loadNotes(); loadCountdowns(); } }, [me, loadNotes, loadCountdowns]);

  useEffect(() => {
    if (!me) return undefined;
    const socket = io({ path: '/socket.io', withCredentials: true });
    const timers = {};
    const debounce = (key, fn) => { clearTimeout(timers[key]); timers[key] = setTimeout(fn, 250); };
    socket.on('connect', () => { setOnline(true); loadEvents(); });
    socket.on('disconnect', () => setOnline(false));
    socket.on('changed', ({ kind }) => {
      if (kind === 'events') debounce('events', loadEvents);
      if (kind === 'days') debounce('days', loadDays);
      if (kind === 'notes') debounce('notes', loadNotes);
      if (kind === 'countdowns') debounce('countdowns', loadCountdowns);
      if (kind === 'settings') debounce('settings', loadMe);
    });
    const onFocus = () => loadEvents();
    window.addEventListener('focus', onFocus);
    return () => {
      socket.close();
      window.removeEventListener('focus', onFocus);
    };
  }, [me, loadEvents, loadDays, loadNotes, loadCountdowns, loadMe]);

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

  return {
    me, setMe, loadMe, settings, updateSettings, events, setEvents, loadEvents, days, setDays,
    notes, setNotes, loadNotes, countdowns, setCountdowns, loadCountdowns,
    online,
  };
}
