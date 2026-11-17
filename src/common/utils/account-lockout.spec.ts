import { HttpException } from '@nestjs/common';
import { AccountLockout } from './account-lockout';
import { generateRandomPassword } from './password.util';
import { matchesSignature } from 'src/modules/v2/common/v2-files.service';

describe('AccountLockout', () => {
  it('locks an account after the failure limit and unlocks after the lock time', () => {
    const lockout = new AccountLockout(3, 60_000, 120_000);
    const now = 1_000_000;

    lockout.recordFailure('Admin@Test', now);
    lockout.recordFailure('admin@test', now + 1);
    expect(() => lockout.assertNotLocked('admin@test', now + 2)).not.toThrow();

    lockout.recordFailure('admin@test', now + 3);
    expect(() => lockout.assertNotLocked('ADMIN@test', now + 4)).toThrow(
      HttpException,
    );
    expect(() =>
      lockout.assertNotLocked('admin@test', now + 3 + 120_001),
    ).not.toThrow();
  });

  it('resets the counter after a successful login', () => {
    const lockout = new AccountLockout(2, 60_000, 60_000);
    lockout.recordFailure('a', 0);
    lockout.recordSuccess('a');
    lockout.recordFailure('a', 1);
    expect(() => lockout.assertNotLocked('a', 2)).not.toThrow();
  });

  it('forgets failures outside the window', () => {
    const lockout = new AccountLockout(2, 1_000, 60_000);
    lockout.recordFailure('a', 0);
    lockout.recordFailure('a', 5_000);
    expect(() => lockout.assertNotLocked('a', 5_001)).not.toThrow();
  });
});

describe('generateRandomPassword', () => {
  it('produces passwords of the requested length without repeats', () => {
    const seen = new Set(
      Array.from({ length: 200 }, () => generateRandomPassword(16)),
    );
    expect(seen.size).toBe(200);
    for (const value of seen) expect(value).toHaveLength(16);
  });
});

describe('matchesSignature (upload magic bytes)', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const pdf = Buffer.from('%PDF-1.7\n...');
  const html = Buffer.from('<html><script>alert(1)</script></html>');

  it('accepts files whose content matches the declared type', () => {
    expect(matchesSignature(png, 'image/png')).toBe(true);
    expect(matchesSignature(pdf, 'application/pdf')).toBe(true);
    expect(matchesSignature(Buffer.from('salom dunyo'), 'text/plain')).toBe(
      true,
    );
  });

  it('rejects disguised HTML / script uploads', () => {
    expect(matchesSignature(html, 'image/png')).toBe(false);
    expect(matchesSignature(html, 'application/pdf')).toBe(false);
    expect(matchesSignature(html, 'text/plain')).toBe(false);
    expect(matchesSignature(png, 'application/pdf')).toBe(false);
    expect(matchesSignature(png, 'image/svg+xml')).toBe(false);
  });
});
