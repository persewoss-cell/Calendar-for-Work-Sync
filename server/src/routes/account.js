import { Router } from 'express';
import { notify } from '../lib/realtime.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

export const accountRouter = Router();

accountRouter.get('/me', (req, res) => {
  const u = req.user;
  res.json({ id: u._id, username: u.username, name: u.name, settings: u.settings || {} });
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

// Change display name and/or password.
accountRouter.put('/account', async (req, res) => {
  const { name, currentPassword, newPassword } = req.body || {};
  if (typeof name === 'string' && name.trim()) req.user.name = name.trim().slice(0, 50);
  if (newPassword) {
    if (!(await verifyPassword(String(currentPassword || ''), req.user.passwordHash))) {
      return res.status(400).json({ error: '현재 비밀번호가 맞지 않습니다.' });
    }
    if (String(newPassword).length < 8) return res.status(400).json({ error: '새 비밀번호는 8자 이상이어야 합니다.' });
    req.user.passwordHash = await hashPassword(String(newPassword));
  }
  await req.user.save();
  res.json({ ok: true, name: req.user.name });
});
