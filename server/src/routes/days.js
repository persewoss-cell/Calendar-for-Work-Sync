import { Router } from 'express';
import { DayStyle } from '../models/DayStyle.js';
import { notify } from '../lib/realtime.js';

export const daysRouter = Router();

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const LISTS = ['', 'bullet', 'number', 'none'];

daysRouter.get('/', async (req, res) => {
  const { from, to } = req.query;
  const q = { userId: req.user._id };
  if (DATE.test(from) && DATE.test(to)) q.date = { $gte: from, $lte: to };
  res.json(await DayStyle.find(q, 'date bg list').lean());
});

// PUT /api/days/2026-11-18 { bg?: "#26c6da" | "", list?: "number" | "" } — empty values reset.
daysRouter.put('/:date', async (req, res) => {
  const { date } = req.params;
  if (!DATE.test(date)) return res.status(400).json({ error: 'bad date' });
  const update = {};
  if ('bg' in (req.body || {})) {
    const bg = String(req.body.bg || '');
    if (bg && !COLOR.test(bg)) return res.status(400).json({ error: 'bad color' });
    update.bg = bg;
  }
  if ('list' in (req.body || {})) {
    const list = String(req.body.list || '');
    if (!LISTS.includes(list)) return res.status(400).json({ error: 'bad list style' });
    update.list = list;
  }
  const doc = await DayStyle.findOneAndUpdate({ userId: req.user._id, date }, update, { upsert: true, new: true });
  if (!doc.bg && !doc.list) await doc.deleteOne();
  notify(req.user._id, 'days');
  res.json({ date, bg: doc.bg || '', list: doc.list || '' });
});
