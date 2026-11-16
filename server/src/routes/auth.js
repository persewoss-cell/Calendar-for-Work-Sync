import { Router } from 'express';
import { config } from '../config.js';
import { clearFailures, COOKIE, loginBlocked, recordFailure, setAuthCookie } from '../lib/auth.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { User } from '../models/User.js';

export const authRouter = Router();

const USERNAME = /^[a-z0-9._-]{3,30}$/;

authRouter.get('/config', (req, res) => {
  res.json({ allowSignup: config.allowSignup });
});

authRouter.post('/register', async (req, res) => {
  if (!config.allowSignup) return res.status(403).json({ error: '새 가입이 막혀 있습니다.' });
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim().slice(0, 50);
  if (!USERNAME.test(username)) return res.status(400).json({ error: '아이디는 영문 소문자·숫자·._- 로 3~30자입니다.' });
  if (password.length < 8) return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  if (await User.exists({ username })) return res.status(409).json({ error: '이미 있는 아이디입니다.' });
  const user = await User.create({ username, name: name || username, passwordHash: await hashPassword(password) });
  setAuthCookie(res, user._id);
  res.status(201).json({ ok: true });
});

authRouter.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const key = `${username}|${req.ip}`;
  if (loginBlocked(key)) return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 15분 뒤에 다시 해 주세요.' });
  const user = await User.findOne({ username });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordFailure(key);
    return res.status(401).json({ error: '아이디 또는 비밀번호가 맞지 않습니다.' });
  }
  clearFailures(key);
  setAuthCookie(res, user._id);
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});
