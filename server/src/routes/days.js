import { Router } from 'express';
import { DayStyle } from '../models/DayStyle.js';
import { notify } from '../lib/realtime.js';

export const daysRouter = Router();

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

daysRouter.get('/', async (req, res) => {
  const { from, to } = req.query;
  const q = { userId: req.user._id };
  if (DATE.test(from) && DATE.test(to)) q.date = { $gte: from, $lte: to };
  res.json(await DayStyle.find(q, 'date bg').lean());
});

// PUT /api/days/2026-11-18 { bg: "#26c6da" } — an empty bg removes the color.
daysRouter.put('/:date', async (req, res) => {
  const { date } = req.params;
  const bg = String(req.body?.bg || '');
  if (!DATE.test(date) || (bg && !COLOR.test(bg))) return res.status(400).json({ error: 'bad request' });
  if (bg) await DayStyle.updateOne({ userId: req.user._id, date }, { bg }, { upsert: true });
  else await DayStyle.deleteOne({ userId: req.user._id, date });
  notify(req.user._id, 'days');
  res.json({ date, bg });
});
