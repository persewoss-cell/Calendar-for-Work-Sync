import { Router } from 'express';
import mongoose from 'mongoose';
import { notify } from '../lib/realtime.js';

/** Small per-user CRUD router for notes and countdown cards. */
export function crudRouter(Model, kind, fields) {
  const router = Router();
  const pick = (body) => Object.fromEntries(fields.filter((f) => f in body).map((f) => [f, body[f]]));
  const find = (req) => mongoose.isValidObjectId(req.params.id)
    ? Model.findOne({ _id: req.params.id, userId: req.user._id })
    : null;

  router.get('/', async (req, res) => {
    res.json(await Model.find({ userId: req.user._id }).sort({ order: 1, createdAt: 1 }).lean());
  });
  router.post('/', async (req, res) => {
    const doc = await Model.create({ ...pick(req.body), userId: req.user._id });
    notify(req.user._id, kind);
    res.status(201).json(doc);
  });
  router.patch('/:id', async (req, res) => {
    const doc = await find(req);
    if (!doc) return res.status(404).json({ error: 'not found' });
    Object.assign(doc, pick(req.body));
    await doc.save();
    notify(req.user._id, kind);
    res.json(doc);
  });
  router.delete('/:id', async (req, res) => {
    const doc = await find(req);
    if (!doc) return res.status(404).json({ error: 'not found' });
    await doc.deleteOne();
    notify(req.user._id, kind);
    res.json({ ok: true });
  });
  return router;
}
