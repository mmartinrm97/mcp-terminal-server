import { randomUUID } from "node:crypto";

/**
 * Generate a unique session ID.
 * Uses crypto.randomUUID() on Node 22+.
 */
export function generateSessionId(): string {
  return randomUUID();
}

/**
 * Validate that a string is a valid regex pattern.
 * Returns [isValid: boolean, error: string | null]
 */
export function validateRegex(pattern: string): [boolean, string | null] {
  try {
    new RegExp(pattern);
    return [true, null];
  } catch (e) {
    return [false, (e as Error).message];
  }
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a timeout promise that rejects after a given number of milliseconds.
 */
export function createTimeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message ?? `Timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Format a Date to ISO string for session metadata.
 */
export function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Normalize common escape sequences in a string to their actual control characters.
 *
 * When AI agents construct tool calls, escape sequences like `\n` may arrive as
 * literal two-character sequences (backslash + n) instead of actual newline
 * characters. This function converts those literal sequences to real control
 * characters.
 *
 * Conversions (single-pass, order-safe):
 * | Literal | Control | Description |
 * |---------|---------|-------------|
 * | `\n`    | 0x0A    | Line feed / Enter |
 * | `\r`    | 0x0D    | Carriage return |
 * | `\t`    | 0x09    | Tab |
 * | `\x03`  | 0x03    | Ctrl+C / SIGINT |
 * | `\x1b`  | 0x1B    | Escape |
 * | `\\`    | 0x5C    | Backslash (literal) |
 *
 * @param data - Raw string potentially containing literal escape sequences
 * @returns String with escape sequences converted to actual control characters
 */
export function normalizeEscapeSequences(data: string): string {
  return (
    data
      // Replace literal backslash sequences (in order: multi-char first, then single)
      .replace(/\\x03/g, "\x03")
      .replace(/\\x1b\[/g, "\x1b[")
      .replace(/\\x1b/g, "\x1b")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\")
  );
}
