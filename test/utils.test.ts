import { describe, it, expect } from 'vitest';
import {
  generateSessionId,
  validateRegex,
  sleep,
  createTimeout,
  timestamp,
  normalizeEscapeSequences,
} from '../src/utils.js';

describe('generateSessionId', () => {
  it('should return a non-empty string', () => {
    const id = generateSessionId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should return unique IDs on consecutive calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSessionId());
    }
    expect(ids.size).toBe(100);
  });

  it('should return a UUID v4 format string', () => {
    const id = generateSessionId();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });
});

describe('validateRegex', () => {
  it('should return true for a valid regex pattern', () => {
    const [isValid, error] = validateRegex('hello');
    expect(isValid).toBe(true);
    expect(error).toBeNull();
  });

  it('should return true for a pattern with regex special characters', () => {
    const [isValid, error] = validateRegex('\\$ |# ');
    expect(isValid).toBe(true);
    expect(error).toBeNull();
  });

  it('should return false for an invalid regex pattern', () => {
    const [isValid, error] = validateRegex('[');
    expect(isValid).toBe(false);
    expect(error).toBeTruthy();
    expect(typeof error).toBe('string');
  });

  it('should return false for an unbalanced parenthesis', () => {
    const [isValid, error] = validateRegex('(unclosed');
    expect(isValid).toBe(false);
    expect(error).toBeTruthy();
  });
});

describe('sleep', () => {
  it('should resolve after the specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    // Allow some tolerance for timing
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('should return a Promise', () => {
    const result = sleep(10);
    expect(result).toBeInstanceOf(Promise);
    return result; // ensure it resolves
  });
});

describe('createTimeout', () => {
  it('should reject after the specified timeout', async () => {
    const start = Date.now();
    try {
      await createTimeout(50);
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Timed out');
    }
  });

  it('should include custom message in the error', async () => {
    try {
      await createTimeout(10, 'Custom timeout message');
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toBe('Custom timeout message');
    }
  });
});

describe('timestamp', () => {
  it('should return an ISO 8601 string', () => {
    const ts = timestamp();
    expect(typeof ts).toBe('string');
    // ISO 8601 format: 2026-04-30T20:00:00.000Z
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should return a valid Date when parsed', () => {
    const ts = timestamp();
    const parsed = new Date(ts);
    expect(parsed.getTime()).not.toBeNaN();
    // Should be close to now
    const diff = Math.abs(Date.now() - parsed.getTime());
    expect(diff).toBeLessThan(1000);
  });

  it('should produce different values on consecutive calls (monotonic)', () => {
    const ts1 = timestamp();
    const ts2 = timestamp();
    // After a tiny delay, ts2 should be >= ts1
    const d1 = new Date(ts1).getTime();
    const d2 = new Date(ts2).getTime();
    expect(d2).toBeGreaterThanOrEqual(d1);
  });
});

describe('normalizeEscapeSequences', () => {
  it('should convert literal \\n to newline', () => {
    const result = normalizeEscapeSequences('line1\\nline2');
    expect(result).toBe('line1\nline2');
    expect(result.includes('\n')).toBe(true);
    expect(result.includes('\\n')).toBe(false);
  });

  it('should convert literal \\r to CR', () => {
    expect(normalizeEscapeSequences('text\\rmore')).toBe('text\rmore');
  });

  it('should convert literal \\t to tab', () => {
    expect(normalizeEscapeSequences('a\\tb')).toBe('a\tb');
  });

  it('should convert literal \\x03 to Ctrl+C', () => {
    const result = normalizeEscapeSequences('\\x03');
    expect(result).toBe('\x03');
    expect(result.charCodeAt(0)).toBe(3);
  });

  it('should convert literal \\x1b to Escape', () => {
    const result = normalizeEscapeSequences('\\x1b');
    expect(result).toBe('\x1b');
    expect(result.charCodeAt(0)).toBe(27);
  });

  it('should handle mixed escape sequences', () => {
    const result = normalizeEscapeSequences('echo hello\\n');
    expect(result).toBe('echo hello\n');
  });

  it('should preserve real newlines (already correct)', () => {
    const result = normalizeEscapeSequences('line1\nline2');
    expect(result).toBe('line1\nline2');
  });

  it('should handle empty string', () => {
    expect(normalizeEscapeSequences('')).toBe('');
  });

  it('should handle string with no escapes', () => {
    expect(normalizeEscapeSequences('plain text')).toBe('plain text');
  });

  it('should handle npm init command pattern', () => {
    // This is the exact pattern from the bug report
    const result = normalizeEscapeSequences('npm init\\n');
    expect(result).toBe('npm init\n');
    expect(result.endsWith('\n')).toBe(true);
  });

  it('should convert literal \\\\ to single backslash', () => {
    expect(normalizeEscapeSequences('a\\\\b')).toBe('a\\b');
  });

  it('should handle \\x1b[ (CSI escape)', () => {
    const result = normalizeEscapeSequences('\\x1b[31mred\\x1b[0m');
    expect(result).toBe('\x1b[31mred\x1b[0m');
  });
});
