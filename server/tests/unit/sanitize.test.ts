import { describe, expect, it } from 'vitest';
import { escapeRegex, sanitizeChat, trimToNull } from '../../src/lib/sanitize.js';

describe('sanitizeChat', () => {
  it('strips links', () => {
    expect(sanitizeChat('join me at https://evil.example/x now', 500)).toBe(
      'join me at [link removed] now',
    );
    expect(sanitizeChat('see www.evil.example', 500)).toBe('see [link removed]');
  });

  it('never exceeds the limit after link replacement', () => {
    // Replacing a short link with the longer placeholder must not push the
    // result back over the limit — the ordering bug the Flask version had.
    const message = `${'a'.repeat(495)} http://x.co`;
    const result = sanitizeChat(message, 500);
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('truncates plain overlong messages', () => {
    expect(sanitizeChat('b'.repeat(900), 500)).toHaveLength(500);
  });

  it('collapses excessive blank lines', () => {
    expect(sanitizeChat('a\n\n\n\n\nb', 500)).toBe('a\n\nb');
  });

  it('returns an empty string for non-string input', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(sanitizeChat(value, 500)).toBe('');
    }
  });

  it('can keep links when asked (direct messages)', () => {
    expect(sanitizeChat('https://ok.example', 2000, false)).toBe('https://ok.example');
  });
});

describe('trimToNull', () => {
  it('maps blank input to null', () => {
    expect(trimToNull('   ', 10)).toBeNull();
    expect(trimToNull('', 10)).toBeNull();
    expect(trimToNull(null, 10)).toBeNull();
  });

  it('trims and caps', () => {
    expect(trimToNull('  hi  ', 10)).toBe('hi');
    expect(trimToNull('abcdefghijk', 5)).toBe('abcde');
  });
});

describe('escapeRegex', () => {
  it('neutralises regex metacharacters', () => {
    expect(escapeRegex('a.*b')).toBe('a\\.\\*b');
    expect(new RegExp(escapeRegex('(a+)+$')).test('(a+)+$')).toBe(true);
  });
});
