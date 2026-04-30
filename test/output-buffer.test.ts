import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutputBuffer } from '../src/output-buffer.js';
import { ReadTimeoutError } from '../src/types.js';

describe('OutputBuffer', () => {
  let buffer: OutputBuffer;

  beforeEach(() => {
    buffer = new OutputBuffer();
  });

  describe('append and readAll', () => {
    it('should return appended data via readAll', () => {
      buffer.append('hello');
      expect(buffer.readAll()).toBe('hello');
    });

    it('should accumulate multiple appends', () => {
      buffer.append('hello');
      buffer.append(' ');
      buffer.append('world');
      expect(buffer.readAll()).toBe('hello world');
    });

    it('should clear after readAll', () => {
      buffer.append('data');
      buffer.readAll();
      expect(buffer.readAll()).toBe('');
    });

    it('should return empty string when buffer is empty', () => {
      expect(buffer.readAll()).toBe('');
    });
  });

  describe('buffer overflow (FIFO trimming)', () => {
    it('should trim oldest data when exceeding maxSize', () => {
      const smallBuffer = new OutputBuffer(10);
      // 13 ASCII chars = 13 bytes, max 10 → first 3 bytes trimmed
      smallBuffer.append('1234567890ABC');
      // '1','2','3' trimmed → "4567890ABC" (10 chars)
      expect(smallBuffer.readAll()).toBe('4567890ABC');
    });

    it('should maintain exact max size after overflow', () => {
      const size = 20;
      const b = new OutputBuffer(size);
      b.append('A'.repeat(30));
      expect(b.readAll().length).toBeLessThanOrEqual(size);
      // Since we keep only last `size` chars
      expect(b.readAll().length).toBe(0); // already read
      b.append('A'.repeat(30));
      expect(b.readAll().length).toBe(20);
    });
  });

  describe('getFullBuffer', () => {
    it('should return full buffer without clearing', () => {
      buffer.append('hello');
      expect(buffer.getFullBuffer()).toBe('hello');
      // Should still be there
      expect(buffer.getFullBuffer()).toBe('hello');
    });

    it('should reflect new appends after peek', () => {
      buffer.append('first');
      expect(buffer.getFullBuffer()).toBe('first');
      buffer.append(' second');
      expect(buffer.getFullBuffer()).toBe('first second');
    });
  });

  describe('size', () => {
    it('should report buffer size in bytes', () => {
      expect(buffer.size).toBe(0);
      buffer.append('abc');
      expect(buffer.size).toBe(3);
    });

    it('should maintain full buffer size after readAll (read offset advance only)', () => {
      buffer.append('hello');
      buffer.readAll();
      // readAll advances read offset but buffer still holds the data
      expect(buffer.size).toBe(5);
    });

    it('should update size to 0 after clear', () => {
      buffer.append('hello');
      buffer.clear();
      expect(buffer.size).toBe(0);
    });
  });

  describe('clear', () => {
    it('should empty the buffer', () => {
      buffer.append('data');
      buffer.clear();
      expect(buffer.getFullBuffer()).toBe('');
      expect(buffer.size).toBe(0);
    });
  });

  describe('readUntil', () => {
    it('should match a simple pattern in existing buffer', async () => {
      buffer.append('hello world');
      const result = await buffer.readUntil('world', 1000);
      expect(result.data).toBe('hello world');
      expect(result.fullOutput).toBe('hello world');
      expect(result.matched).toBe('world');
    });

    it('should wait for pattern to appear', async () => {
      const readPromise = buffer.readUntil('END', 5000);
      buffer.append('some data ');
      buffer.append('more data END');
      const result = await readPromise;
      expect(result.data).toBe('some data more data END');
      expect(result.matched).toBe('END');
    });

    it('should return only new data since last read', async () => {
      buffer.append('A'.repeat(100));
      // First readUntil matches first 'A' at position 0, readOffset becomes 1
      const r1 = await buffer.readUntil('A', 1000);
      expect(r1.matched).toBe('A');
      // Now append 50 B's (buffer has 99 A's remaining + 50 B's)
      buffer.append('B'.repeat(50));
      // readUntil('B') returns data from readOffset=1 to first B inclusive = 99 A's + 1 B
      const r2 = await buffer.readUntil('B', 1000);
      expect(r2.data).toBe('A'.repeat(99) + 'B');
      expect(r2.matched).toBe('B');
    });

    it('should timeout if pattern never appears', async () => {
      buffer.append('some data');
      try {
        await buffer.readUntil('NONEXISTENT', 200);
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(ReadTimeoutError);
      }
    }, 5000);

    it('should strip ANSI when stripAnsi=true', async () => {
      buffer.append('\x1b[31mRed text\x1b[0m END');
      const result = await buffer.readUntil('END', 1000, true);
      expect(result.data).toBe('Red text END');
      expect(result.matched).toBe('END');
    });
  });

  describe('carriage return handling', () => {
    it('should handle carriage returns in terminal output', () => {
      buffer.append('Loading...\rDone!');
      // \r without \n means line overwrite — the buffer should track position
      const data = buffer.readAll();
      // Should contain the full raw data for pattern matching
      expect(data).toContain('Loading...');
      expect(data).toContain('Done!');
    });
  });

  describe('concurrent reads', () => {
    it('should support sequential readUntil calls', async () => {
      buffer.append('Step 1 complete ');
      const r1 = await buffer.readUntil('complete', 1000);
      expect(r1.matched).toBe('complete');

      buffer.append('Step 2 done');
      const r2 = await buffer.readUntil('done', 1000);
      expect(r2.matched).toBe('done');
    });
  });
});
