import { Router } from 'express';
import mongoose from 'mongoose';
import { EDITABLE_EVENT_FIELDS, Event } from '../models/Event.js';
import { notify } from '../lib/realtime.js';
import { htmlToText, sanitizeHtml } from '../../../shared/sanitize.js';

export const eventsRouter = Router();

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function pick(body) {
  const out = {};
  for (const k of EDITABLE_EVENT_FIELDS) if (k in body) out[k] = body[k];
  if ('html' in out) {
    out.html = sanitizeHtml(out.html, 5000);
    if (!('title' in out)) out.title = htmlToText(out.html);
  }
  if ('title' in out) out.title = String(out.title).slice(0, 500);
  if ('memo' in out) out.memo = String(out.memo).slice(0, 10000);
  return out;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validId = (id) => mongoose.isValidObjectId(id);

// Events overlapping [from, to] plus every repeating event (expanded on the client).
eventsRouter.get('/', async (req, res) => {
  const { from, to } = req.query;
  const q = { userId: req.user._id, deleted: false };
  if (DATE.test(from) && DATE.test(to)) {
    q.$or = [{ date: { $lte: to }, endDate: { $gte: from } }, { rrule: { $ne: '' }, date: { $lte: to } }];
  }
  res.json(await Event.find(q).sort({ date: 1, order: 1, startTime: 1 }).lean());
});

eventsRouter.get('/search', async (req, res) => {
  const text = String(req.query.q || '').trim();
  if (!text) return res.json([]);
  const re = new RegExp(escapeRegex(text), 'i');
  const items = await Event.find({ userId: req.user._id, deleted: false, $or: [{ title: re }, { memo: re }] })
    .sort({ date: -1 }).limit(200).lean();
  res.json(items);
});

eventsRouter.get('/export', async (req, res) => {
  res.json(await Event.find({ userId: req.user._id, deleted: false }).sort({ date: 1, order: 1 }).lean());
});

eventsRouter.post('/', async (req, res) => {
  const data = pick(req.body);
  if (!DATE.test(data.date || '')) return res.status(400).json({ error: 'date required' });
  if (!('order' in data)) {
    const last = await Event.findOne({ userId: req.user._id, date: data.date, deleted: false }).sort({ order: -1 });
    data.order = last ? last.order + 1 : 0;
  }
  const ev = new Event({ ...data, userId: req.user._id });
  await ev.save();
  notify(req.user._id, 'events');
  res.status(201).json(ev);
});

// Bulk create for "불러오기" (import).
eventsRouter.post('/bulk', async (req, res) => {
  const list = Array.isArray(req.body?.events) ? req.body.events.slice(0, 5000) : [];
  const docs = list
    .map(pick)
    .filter((d) => DATE.test(d.date || ''))
    .map((d) => ({ ...d, userId: req.user._id, source: 'import' }));
  const created = await Event.insertMany(docs);
  notify(req.user._id, 'events');
  res.json({ created: created.length });
});

eventsRouter.post('/reorder', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(validId) : [];
  await Promise.all(ids.map((id, i) => Event.updateOne({ _id: id, userId: req.user._id }, { order: i })));
  notify(req.user._id, 'events');
  res.json({ ok: true });
});

// 미완료 작업 자동 연기: move unfinished one-off events from the last 30 days to today.
eventsRouter.post('/rollover', async (req, res) => {
  const today = String(req.body?.today || '');
  if (!DATE.test(today)) return res.status(400).json({ error: 'today required' });
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 30);
  const from = d.toISOString().slice(0, 10);
  const stale = await Event.find({
    userId: req.user._id, deleted: false, done: false, rrule: '',
    endDate: { $lt: today, $gte: from },
  });
  for (const ev of stale) {
    ev.date = today;
    ev.endDate = today;
    await ev.save();
  }
  if (stale.length) notify(req.user._id, 'events');
  res.json({ moved: stale.length });
});

eventsRouter.patch('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).end();
  const ev = await Event.findOne({ _id: req.params.id, userId: req.user._id, deleted: false });
  if (!ev) return res.status(404).json({ error: 'not found' });
  const data = pick(req.body);
  if (data.date && !DATE.test(data.date)) return res.status(400).json({ error: 'bad date' });
  Object.assign(ev, data);
  if ('date' in data && !('endDate' in data) && ev.endDate < ev.date) ev.endDate = ev.date;
  await ev.save();
  notify(req.user._id, 'events');
  res.json(ev);
});

eventsRouter.delete('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).end();
  const ev = await Event.findOne({ _id: req.params.id, userId: req.user._id, deleted: false });
  if (!ev) return res.status(404).json({ error: 'not found' });
  ev.deleted = true;
  ev.deletedAt = new Date();
  await ev.save();
  notify(req.user._id, 'events');
  res.json({ ok: true });
});
