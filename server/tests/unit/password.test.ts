import { describe, expect, it } from 'bun:test';
import { hashPassword, prepareDummyHash, verifyAgainstNothing, verifyPassword } from '../../src/lib/password.js';

describe('password hashing', () => {
  it('produces standard bcrypt at the requested cost', async () => {
    const hash = await hashPassword('correct horse', 10);
    expect(hash).toMatch(/^\$2b\$10\$/);
    expect((await verifyPassword('correct horse', hash)).valid).toBe(true);
    expect((await verifyPassword('wrong horse', hash)).valid).toBe(false);
  });

  it('asks for a rehash when the cost is below policy', async () => {
    // The suite runs with BCRYPT_ROUNDS=10; a cost-11 hash is off-policy.
    const hash = await hashPassword('rehash me', 11);
    expect(await verifyPassword('rehash me', hash)).toEqual({ valid: true, needsRehash: true });
  });

  it('still accepts a long password hashed by bcryptjs before the move to Bun', async () => {
    // bcryptjs hashed only the first 72 bytes; hashing exactly those bytes
    // reproduces what it stored.
    const long = `${'k'.repeat(70)}ñ-and-more-than-72-bytes`;
    const legacy = await Bun.password.hash(new TextEncoder().encode(long).subarray(0, 72), {
      algorithm: 'bcrypt',
      cost: 10,
    });

    expect(await verifyPassword(long, legacy)).toEqual({ valid: true, needsRehash: true });
    expect((await verifyPassword(`${'k'.repeat(69)}x`, legacy)).valid).toBe(false);
  });

  it('treats a malformed stored hash as a failed check, not an error', async () => {
    expect((await verifyPassword('anything', 'not-a-hash')).valid).toBe(false);
    expect((await verifyPassword('anything', null)).valid).toBe(false);
  });

  it('spends real time checking against a missing account', async () => {
    expect(await verifyAgainstNothing('whatever')).toBe(false);
  });

  it('makes the stand-in hash once, at the configured cost, ahead of any check', async () => {
    const first = prepareDummyHash();
    expect(prepareDummyHash()).toBe(first);
    expect(await first).toMatch(/^\$2[aby]\$10\$/);
  });
});
