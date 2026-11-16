import { Event } from '../models/Event.js';
import { User } from '../models/User.js';
import { calendarApi } from './googleClient.js';
import { notify } from './realtime.js';
import { addDays, addMinutes, compact, DEFAULT_TZ, tzParts } from './time.js';
import { googleConfigured } from '../config.js';

const tzOf = (user) => user.settings?.timezone || DEFAULT_TZ;

export function canSync(user) {
  return googleConfigured() && Boolean(user.google?.enabled && user.google?.refreshToken);
}

// ---------- mapping ----------

export function toGoogle(ev, tz) {
  const body = {
    summary: ev.title || '(제목 없음)',
    description: ev.memo || '',
    extendedProperties: {
      private: { workcalId: String(ev._id), color: ev.color || '', done: ev.done ? '1' : '0' },
    },
  };
  const endDate = ev.endDate || ev.date;
  if (!ev.startTime) {
    body.start = { date: ev.date, dateTime: null };
    body.end = { date: addDays(endDate, 1), dateTime: null };
  } else {
    let end;
    if (ev.endTime && (endDate > ev.date || ev.endTime > ev.startTime)) end = { date: endDate, time: ev.endTime };
    else end = addMinutes(ev.date, ev.startTime, 60);
    body.start = { dateTime: `${ev.date}T${ev.startTime}:00`, timeZone: tz, date: null };
    body.end = { dateTime: `${end.date}T${end.time}:00`, timeZone: tz, date: null };
  }
  if (ev.rrule) {
    body.recurrence = [`RRULE:${ev.rrule.replace(/^RRULE:/, '')}`];
    for (const d of ev.exdates || []) {
      body.recurrence.push(
        ev.startTime ? `EXDATE;TZID=${tz}:${compact(d)}T${ev.startTime.replace(':', '')}00` : `EXDATE;VALUE=DATE:${compact(d)}`,
      );
    }
  } else {
    body.recurrence = [];
  }
  body.reminders = ev.reminder == null
    ? { useDefault: true }
    : { useDefault: false, overrides: [{ method: 'popup', minutes: ev.reminder }] };
  return body;
}

function parseRecurrence(lines = [], tz) {
  let rrule = '';
  const exdates = [];
  for (const line of lines) {
    if (line.startsWith('RRULE:')) rrule = line.slice(6);
    else if (line.startsWith('EXDATE')) {
      const values = line.slice(line.indexOf(':') + 1).split(',');
      for (const v of values) {
        if (/Z$/.test(v)) {
          const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:00Z`;
          exdates.push(tzParts(new Date(iso), tz).date);
        } else {
          exdates.push(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`);
        }
      }
    }
  }
  return { rrule, exdates };
}

export function fromGoogle(item, tz) {
  const priv = item.extendedProperties?.private || {};
  const out = {
    title: item.summary || '(제목 없음)',
    memo: item.description || '',
    color: priv.color || '',
    done: priv.done === '1',
    reminder: item.reminders?.useDefault === false && item.reminders.overrides?.length
      ? item.reminders.overrides[0].minutes
      : null,
    ...parseRecurrence(item.recurrence, tz),
  };
  if (item.start?.date) {
    out.date = item.start.date;
    out.endDate = item.end?.date ? addDays(item.end.date, -1) : item.start.date;
    out.startTime = null;
    out.endTime = null;
  } else {
    const s = tzParts(new Date(item.start.dateTime), tz);
    const e = tzParts(new Date(item.end?.dateTime || item.start.dateTime), tz);
    out.date = s.date;
    out.startTime = s.time;
    out.endDate = e.date < s.date ? s.date : e.date;
    out.endTime = e.time;
    if (e.time === '00:00' && e.date > s.date) {
      out.endDate = addDays(e.date, -1);
      out.endTime = '23:59';
    }
  }
  if (out.endDate < out.date) out.endDate = out.date;
  return out;
}

function originalDate(item, tz) {
  const o = item.originalStartTime;
  if (!o) return null;
  return o.date || tzParts(new Date(o.dateTime), tz).date;
}

const isGone = (err) => [404, 410].includes(err?.code || err?.response?.status);

// ---------- push (app -> Google) ----------

export async function pushEvent(user, ev) {
  if (!canSync(user)) {
    if (ev.googleSync && ev.syncState !== 'pending') {
      ev.syncState = 'pending';
      await ev.save();
    }
    return ev;
  }
  const cal = calendarApi(user);
  const tz = tzOf(user);
  const calendarId = ev.googleCalendarId || user.google.calendarId || 'primary';
  try {
    if (ev.googleSync && !ev.deleted) {
      const body = toGoogle(ev, tz);
      let res;
      if (ev.googleEventId) {
        try {
          res = await cal.events.patch({ calendarId, eventId: ev.googleEventId, requestBody: body });
        } catch (err) {
          if (!isGone(err)) throw err;
          res = null;
        }
      }
      if (!res) {
        if (!ev.rrule) delete body.recurrence;
        res = await cal.events.insert({ calendarId, requestBody: body });
      }
      ev.googleEventId = res.data.id;
      ev.googleEtag = res.data.etag;
      ev.googleCalendarId = calendarId;
      ev.syncState = 'synced';
      ev.syncError = '';
    } else if (ev.googleEventId) {
      // 반영 끄기 or 삭제: remove it from Google, keep (or soft-delete) locally.
      try {
        await cal.events.delete({ calendarId, eventId: ev.googleEventId });
      } catch (err) {
        if (!isGone(err)) throw err;
      }
      ev.googleEventId = undefined;
      ev.googleEtag = undefined;
      ev.syncState = 'none';
      ev.syncError = '';
    } else {
      ev.syncState = 'none';
    }
  } catch (err) {
    ev.syncState = 'error';
    ev.syncError = err?.errors?.[0]?.message || err.message;
    console.warn('[google] push failed', ev._id.toString(), ev.syncError);
  }
  await ev.save();
  return ev;
}

// ---------- pull (Google -> app) ----------

async function listChanges(user, cal) {
  const calendarId = user.google.calendarId || 'primary';
  const items = [];
  let pageToken;
  let nextSyncToken;
  const base = { calendarId, showDeleted: true, singleEvents: false, maxResults: 250 };
  if (user.google.syncToken) base.syncToken = user.google.syncToken;
  else base.timeMin = new Date(Date.now() - 180 * 864e5).toISOString();
  do {
    const { data } = await cal.events.list({ ...base, pageToken });
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken || nextSyncToken;
  } while (pageToken);
  return { items, nextSyncToken };
}

async function addExdate(userId, googleEventId, date) {
  if (!date) return false;
  const master = await Event.findOne({ userId, googleEventId });
  if (!master || master.exdates.includes(date)) return false;
  master.exdates.push(date);
  await master.save();
  return true;
}

export async function pullChanges(user) {
  const cal = calendarApi(user);
  const tz = tzOf(user);
  let result;
  try {
    result = await listChanges(user, cal);
  } catch (err) {
    if ((err?.code || err?.response?.status) !== 410) throw err;
    user.google.syncToken = undefined; // token expired → full resync
    result = await listChanges(user, cal);
  }

  let changed = 0;
  const userId = user._id;
  for (const item of result.items) {
    const local = await Event.findOne({ userId, googleEventId: item.id });

    if (item.status === 'cancelled') {
      if (item.recurringEventId) {
        if (await addExdate(userId, item.recurringEventId, originalDate(item, tz))) changed++;
      }
      if (local && !local.deleted) {
        local.deleted = true;
        local.deletedAt = new Date();
        local.googleEventId = undefined;
        local.syncState = 'none';
        await local.save();
        changed++;
      }
      continue;
    }

    if (local && local.googleEtag === item.etag) continue;
    // Local edits not yet pushed win over older Google versions.
    if (local && ['pending', 'error'].includes(local.syncState) && local.updatedAt > new Date(item.updated)) continue;

    if (item.recurringEventId) {
      if (await addExdate(userId, item.recurringEventId, originalDate(item, tz))) changed++;
    }

    const fields = fromGoogle(item, tz);
    const syncFields = {
      googleSync: true,
      googleEventId: item.id,
      googleEtag: item.etag,
      googleCalendarId: user.google.calendarId || 'primary',
      syncState: 'synced',
      syncError: '',
      deleted: false,
    };
    if (local) {
      Object.assign(local, fields, syncFields);
      await local.save();
      changed++;
      continue;
    }
    // Our own event whose id we failed to record — relink instead of duplicating.
    const ownId = item.extendedProperties?.private?.workcalId;
    const own = ownId && /^[a-f0-9]{24}$/.test(ownId) ? await Event.findOne({ _id: ownId, userId }) : null;
    if (own) {
      Object.assign(own, fields, syncFields);
      await own.save();
      changed++;
    } else if (user.google.importFromGoogle) {
      await Event.create({ userId, ...fields, ...syncFields, source: 'google', order: 1000 });
      changed++;
    }
  }

  user.google.syncToken = result.nextSyncToken;
  return changed;
}

// ---------- full sync ----------

const running = new Set();

export async function syncUser(userOrId) {
  const user = typeof userOrId === 'object' ? userOrId : await User.findById(userOrId);
  if (!user || !canSync(user)) return { skipped: true };
  const key = String(user._id);
  if (running.has(key)) return { skipped: true, reason: 'running' };
  running.add(key);
  try {
    const pending = await Event.find({ userId: user._id, syncState: { $in: ['pending', 'error'] } });
    for (const ev of pending) await pushEvent(user, ev);
    const pulled = await pullChanges(user);
    user.google.lastSyncAt = new Date();
    user.google.lastError = '';
    await user.save();
    if (pending.length || pulled) notify(user._id, 'events');
    notify(user._id, 'google');
    return { pushed: pending.length, pulled };
  } catch (err) {
    user.google.lastError = err?.errors?.[0]?.message || err.message;
    if (/invalid_grant/.test(user.google.lastError)) user.google.enabled = false; // revoked access
    await user.save();
    notify(user._id, 'google');
    console.warn('[google] sync failed', key, user.google.lastError);
    return { error: user.google.lastError };
  } finally {
    running.delete(key);
  }
}

export function startScheduler(intervalMin) {
  if (!googleConfigured() || intervalMin <= 0) return;
  setInterval(async () => {
    const users = await User.find({ 'google.enabled': true }, '_id');
    for (const u of users) await syncUser(u._id);
  }, intervalMin * 60 * 1000).unref();
}

/** Push one event in the background and tell the user's devices when done. */
export function pushInBackground(user, ev) {
  if (!ev.googleSync && !ev.googleEventId) return;
  pushEvent(user, ev)
    .then(() => notify(user._id, 'events'))
    .catch((err) => console.warn('[google] background push', err.message));
}
