import { sleep } from './utils.js';
import { ReadTimeoutError } from './types.js';
import { stripAnsi } from './ansi-stripper.js';

/**
 * Circular buffer that accumulates PTY output and supports regex pattern matching.
 *
 * Key behaviors:
 * - append(chunk): add data to the buffer
 * - readUntil(pattern): wait (async via polling) until the buffer matches a regex
 * - readAll(): return all buffered data since last read
 * - clear(): clear the buffer entirely
 * - getFullBuffer(): peek at the full buffer without clearing
 * - size: current buffer size in bytes
 *
 * Buffer semantics:
 * - append() always adds to the end
 * - readAll() returns everything since last read and advances the read offset
 * - readUntil() uses internal offset tracking — only returns NEW data since last read
 * - If buffer exceeds maxSize, oldest data is trimmed (FIFO)
 */
export class OutputBuffer {
  private _buffer = '';
  private _readOffset = 0;
  private readonly _maxSize: number;

  constructor(maxSize?: number) {
    // Default 1MB
    this._maxSize = maxSize ?? 1024 * 1024;
  }

  /**
   * Append a chunk of data to the buffer.
   * If the buffer exceeds maxSize, oldest data is trimmed (FIFO).
   */
  append(chunk: string): void {
    this._buffer += chunk;

    // FIFO trimming: remove oldest data if we exceed maxSize
    const overflow = Buffer.byteLength(this._buffer) - this._maxSize;
    if (overflow > 0) {
      // Trim from the start — we need to find the character boundary
      let trimBytes = 0;
      for (let i = 0; i < this._buffer.length && trimBytes < overflow; i++) {
        const charBytes = Buffer.byteLength(this._buffer[i]);
        trimBytes += charBytes;
      }
      // Find how many characters correspond to `trimBytes` bytes approximately
      let trimmed = 0;
      let bytesSoFar = 0;
      for (let i = 0; i < this._buffer.length && bytesSoFar < overflow; i++) {
        bytesSoFar += Buffer.byteLength(this._buffer[i]);
        trimmed++;
      }

      this._buffer = this._buffer.slice(trimmed);
      this._readOffset = Math.max(0, this._readOffset - trimmed);
    }
  }

  /**
   * Read all buffered content since last read.
   * Returns the data and advances the read offset (clears the read portion).
   */
  readAll(): string {
    const data = this._buffer.slice(this._readOffset);
    this._readOffset = this._buffer.length;
    return data;
  }

  /**
   * Read the buffer until the pattern matches.
   * Throws ReadTimeoutError on timeout.
   * Returns the new data since last read that includes the match.
   *
   * @param pattern - The regex pattern to match
   * @param timeoutMs - Maximum time to wait (default: 30000ms)
   * @param stripAnsiColors - If true, strip ANSI codes from returned data
   * @returns Object containing matched data, full output, and the matched portion
   */
  async readUntil(
    pattern: string,
    timeoutMs: number = 30000,
    stripAnsiColors: boolean = false
  ): Promise<{
    data: string;
    fullOutput: string;
    matched: string;
  }> {
    const regex = new RegExp(pattern, 'g');
    const startTime = Date.now();
    const pollInterval = 50;

    while (true) {
      // Check the buffer from read offset to end
      const searchText = this._buffer.slice(this._readOffset);
      regex.lastIndex = 0;
      const match = regex.exec(searchText);

      if (match) {
        // Found match — return data up to and including the match
        const matchEnd = match.index + match[0].length;
        const data = searchText.slice(0, matchEnd);
        const fullOutput = this._buffer.slice(0, this._readOffset + matchEnd);
        const matched = match[0];

        // Advance read offset past the matched portion
        this._readOffset += matchEnd;

        const output = stripAnsiColors ? stripAnsi(data) : data;

        return {
          data: output,
          fullOutput: stripAnsiColors ? stripAnsi(fullOutput) : fullOutput,
          matched,
        };
      }

      // Check timeout
      if (Date.now() - startTime >= timeoutMs) {
        const partial = searchText;
        throw new ReadTimeoutError(
          `Pattern "${pattern}" not matched within ${timeoutMs}ms`,
          partial
        );
      }

      // Wait before polling again
      await sleep(pollInterval);
    }
  }

  /**
   * Peek at the full buffer without clearing or advancing the read offset.
   */
  getFullBuffer(): string {
    return this._buffer;
  }

  /**
   * Clear the entire buffer and reset the read offset.
   */
  clear(): void {
    this._buffer = '';
    this._readOffset = 0;
  }

  /**
   * Get the current buffer size in bytes.
   */
  get size(): number {
    return Buffer.byteLength(this._buffer);
  }
}
