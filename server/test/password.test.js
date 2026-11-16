import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { clearFailures, loginBlocked, recordFailure } from '../src/lib/auth.js';

test('passwords are salted and verify correctly', async () => {
  const a = await hashPassword('correct horse');
  const b = await hashPassword('correct horse');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('scrypt$'));
  assert.equal(await verifyPassword('correct horse', a), true);
  assert.equal(await verifyPassword('wrong', a), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

test('login is blocked after 10 failures', () => {
  const key = 'kim|1.2.3.4';
  for (let i = 0; i < 9; i++) recordFailure(key);
  assert.equal(loginBlocked(key), false);
  recordFailure(key);
  assert.equal(loginBlocked(key), true);
  clearFailures(key);
  assert.equal(loginBlocked(key), false);
});
