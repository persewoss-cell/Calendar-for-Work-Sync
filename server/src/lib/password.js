import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;

/** Stored as "scrypt$<salt>$<hash>" using Node's built-in scrypt. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
