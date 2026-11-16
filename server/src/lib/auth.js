import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';
import { config } from '../config.js';
import { User } from '../models/User.js';

export const COOKIE = 'wc_token';
const MAX_AGE_DAYS = 180;

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: `${MAX_AGE_DAYS}d` });
}

export function setAuthCookie(res, userId) {
  res.cookie(COOKIE, signToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicUrl.startsWith('https://'),
    maxAge: MAX_AGE_DAYS * 24 * 3600 * 1000,
    path: '/',
  });
}

export function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies?.[COOKIE]) return req.cookies[COOKIE];
  const cookies = parseCookie(req.headers.cookie || '');
  return cookies[COOKIE];
}

export function userIdFromToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret).sub;
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const id = userIdFromToken(tokenFromRequest(req));
  if (!id) return res.status(401).json({ error: 'unauthorized' });
  const user = await User.findById(id);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

// Short-lived one-time codes hand a login from the system browser to the desktop app.
const oneTime = new Map();
export function issueOneTimeCode(userId) {
  const code = crypto.randomUUID();
  oneTime.set(code, { userId: String(userId), exp: Date.now() + 5 * 60 * 1000 });
  return code;
}
export function consumeOneTimeCode(code) {
  const entry = oneTime.get(code);
  oneTime.delete(code);
  if (!entry || entry.exp < Date.now()) return null;
  return entry.userId;
}
