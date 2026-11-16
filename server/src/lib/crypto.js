import crypto from 'node:crypto';
import { config } from '../config.js';

// Refresh tokens are stored encrypted (AES-256-GCM) so a DB leak alone doesn't expose Google access.
const key = crypto.createHash('sha256').update(`token-enc:${config.jwtSecret}`).digest();

export function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  if (!payload) return '';
  try {
    const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
