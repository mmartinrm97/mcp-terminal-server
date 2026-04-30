import { randomUUID } from 'node:crypto';

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
