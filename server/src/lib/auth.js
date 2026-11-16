import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';
import { config } from '../config.js';
import { User } from '../models/User.js';

export const COOKIE = 'wc_token';
const MAX_AGE_DAYS = 180;

export function setAuthCookie(res, userId) {
  const token = jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: `${MAX_AGE_DAYS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicUrl.startsWith('https://'),
    maxAge: MAX_AGE_DAYS * 24 * 3600 * 1000,
    path: '/',
  });
}

export function tokenFromRequest(req) {
  if (req.cookies?.[COOKIE]) return req.cookies[COOKIE];
  return parseCookie(req.headers.cookie || '')[COOKIE];
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
  const user = id ? await User.findById(id) : null;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

// Brute-force guard: at most 10 failed logins per username+IP every 15 minutes.
const failures = new Map();
const WINDOW = 15 * 60 * 1000;

export function loginBlocked(key) {
  const f = failures.get(key);
  return Boolean(f && Date.now() - f.first < WINDOW && f.count >= 10);
}

export function recordFailure(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW) failures.set(key, { first: Date.now(), count: 1 });
  else f.count++;
}

export const clearFailures = (key) => failures.delete(key);
