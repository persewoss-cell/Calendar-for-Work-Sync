import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { addDays, nowTimeIn, todayIn } from './date.js';
import { expandEvents } from './recurrence.js';
import { playSound } from './sound.js';
import { reminderDue } from './reminders.js';

const firedKey = 'firedReminders';
// Reminders can be set days ahead ("일주일 전", or any date), so look this far into the future.
const LOOKAHEAD_DAYS = 366;
const loadFired = () => { try { return JSON.parse(localStorage.getItem(firedKey) || '{}'); } catch { return {}; } };
const saveFired = (v) => { try { localStorage.setItem(firedKey, JSON.stringify(v)); } catch { /* ignore */ } };
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Shows a notification (and plays the 리마인드 알람) when an event's reminder time arrives. */
export function useReminders(enabled, s, version) {
  const [toasts, setToasts] = useState([]);
  const eventsRef = useRef([]);

  useEffect(() => {
    if (!enabled) return undefined;
    const today = todayIn(s.timezone);
    const load = () => api.events(today, addDays(today, LOOKAHEAD_DAYS))
      .then((ev) => { eventsRef.current = ev.filter((e) => e.reminder != null); })
      .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [enabled, s.timezone, version]);

  useEffect(() => {
    if (!enabled) return undefined;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    const check = () => {
      const today = todayIn(s.timezone);
      const nowAbs = toMin(nowTimeIn(s.timezone));
      const fired = loadFired();
      const days = expandEvents(eventsRef.current, today, addDays(today, LOOKAHEAD_DAYS));
      for (const [day, items] of days) {
        for (const it of items) {
          if (it.part && it.part[0] !== 1) continue;
          if (it.done) continue;
          const due = reminderDue(it, day, today);
          const key = `${it._id}:${day}:${it.reminder}`;
          if (nowAbs >= due && nowAbs - due < 15 && !fired[key]) {
            fired[key] = Date.now();
            const body = `${day === today ? '오늘' : day} ${it.startTime || ''} ${it.title}`.trim();
            if ('Notification' in window && Notification.permission === 'granted') {
              try { new Notification('일정 알림', { body, tag: key, icon: '/icon-192.png' }); } catch { /* mobile requires SW */ }
            }
            setToasts((t) => [...t, { key, body }]);
            playSound(s.reminderSound);
          }
        }
      }
      for (const [k, v] of Object.entries(fired)) if (Date.now() - v > 3 * 864e5) delete fired[k];
      saveFired(fired);
    };
    check();
    const t = setInterval(check, 20 * 1000);
    return () => clearInterval(t);
  }, [enabled, s.timezone, s.reminderSound]);

  return [toasts, (key) => setToasts((t) => t.filter((x) => x.key !== key))];
}
