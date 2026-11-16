import { Router } from 'express';
import { googleConfigured } from '../config.js';
import { calendarApi } from '../lib/googleClient.js';
import { canSync, syncUser } from '../lib/googleSync.js';
import { notify } from '../lib/realtime.js';
import { Event } from '../models/Event.js';

export const accountRouter = Router();

function googleStatus(user) {
  const g = user.google || {};
  return {
    available: googleConfigured(),
    connected: Boolean(g.refreshToken),
    enabled: Boolean(g.enabled),
    calendarId: g.calendarId || 'primary',
    calendarName: g.calendarName || '',
    defaultOn: g.defaultOn !== false,
    importFromGoogle: g.importFromGoogle !== false,
    lastSyncAt: g.lastSyncAt || null,
    lastError: g.lastError || '',
  };
}

accountRouter.get('/me', (req, res) => {
  const u = req.user;
  res.json({
    id: u._id, email: u.email, name: u.name, picture: u.picture,
    settings: u.settings || {}, google: googleStatus(u),
  });
});

accountRouter.put('/settings', async (req, res) => {
  const incoming = req.body && typeof req.body === 'object' ? req.body : {};
  if (JSON.stringify(incoming).length > 100_000) return res.status(413).json({ error: 'too large' });
  req.user.settings = { ...(req.user.settings || {}), ...incoming };
  req.user.markModified('settings');
  await req.user.save();
  notify(req.user._id, 'settings');
  res.json(req.user.settings);
});

accountRouter.get('/google/status', async (req, res) => {
  const counts = await Event.aggregate([
    { $match: { userId: req.user._id, deleted: false } },
    { $group: { _id: { sync: '$googleSync', state: '$syncState' }, n: { $sum: 1 } } },
  ]);
  res.json({ ...googleStatus(req.user), counts });
});

accountRouter.get('/google/calendars', async (req, res) => {
  if (!req.user.google?.refreshToken) return res.status(400).json({ error: 'not connected' });
  try {
    const { data } = await calendarApi(req.user).calendarList.list({ minAccessRole: 'writer' });
    res.json((data.items || []).map((c) => ({ id: c.id, name: c.summaryOverride || c.summary, primary: Boolean(c.primary), color: c.backgroundColor })));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

accountRouter.put('/google/config', async (req, res) => {
  const g = req.user.google;
  const { enabled, calendarId, calendarName, defaultOn, importFromGoogle } = req.body || {};
  const wasEnabled = g.enabled;
  if (typeof enabled === 'boolean') {
    if (enabled && !g.refreshToken) return res.status(400).json({ error: '구글 계정 권한이 필요합니다. 다시 로그인해 주세요.' });
    g.enabled = enabled;
  }
  if (typeof calendarId === 'string' && calendarId && calendarId !== g.calendarId) {
    g.calendarId = calendarId;
    g.syncToken = undefined;
    // Events linked to the old calendar are re-created in the new one on next sync.
    await Event.updateMany(
      { userId: req.user._id, googleSync: true, deleted: false },
      { $set: { syncState: 'pending' }, $unset: { googleEventId: 1, googleEtag: 1, googleCalendarId: 1 } },
    );
  }
  if (typeof calendarName === 'string') g.calendarName = calendarName;
  if (typeof defaultOn === 'boolean') g.defaultOn = defaultOn;
  if (typeof importFromGoogle === 'boolean') g.importFromGoogle = importFromGoogle;
  await req.user.save();
  if (g.enabled && !wasEnabled) {
    await Event.updateMany({ userId: req.user._id, googleSync: true, googleEventId: null, deleted: false }, { syncState: 'pending' });
  }
  notify(req.user._id, 'google');
  if (g.enabled) syncUser(req.user._id);
  res.json(googleStatus(req.user));
});

// Turn 구글 반영 on/off for many events at once (e.g. a whole month).
accountRouter.post('/google/bulk-toggle', async (req, res) => {
  const { ids, googleSync } = req.body || {};
  if (!Array.isArray(ids) || typeof googleSync !== 'boolean') return res.status(400).end();
  await Event.updateMany(
    { _id: { $in: ids }, userId: req.user._id, deleted: false },
    { googleSync, syncState: 'pending' },
  );
  notify(req.user._id, 'events');
  if (canSync(req.user)) syncUser(req.user._id);
  res.json({ ok: true });
});

accountRouter.post('/google/sync', async (req, res) => {
  if (!canSync(req.user)) return res.status(400).json({ error: '구글 캘린더 동기화가 꺼져 있습니다.' });
  res.json(await syncUser(req.user._id));
});
