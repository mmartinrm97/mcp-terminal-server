/**
 * Strip ANSI escape codes from terminal output.
 *
 * Handles:
 * - Colors and text styles (\x1b[...m)
 * - Cursor movements (\x1b[<row>;<col>H, \x1b[<N>A/B/C/D)
 * - Erase sequences (\x1b[J, \x1b[K)
 * - Other CSI sequences (\x1b[...)
 * - OSC sequences (\x1b]...\x07 or \x1b]...\x1b\\)
 */

// Build ANSI escape sequence pattern without control character literals in source.
// CSI: ESC [ + optional parameter bytes + optional intermediate bytes + final byte
// OSC: ESC ] + text + ST (ESC \\ or BEL \\x07)
const csi = String.raw`\x1b\[[\d;]*[A-Za-z]`;
const osc = String.raw`\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)`;
const ansiPattern = new RegExp(`(?:${csi})|(?:${osc})`, "g");

/**
 * Strip ANSI escape codes from a string of terminal output.
 *
 * @param data - Raw terminal output potentially containing ANSI codes
 * @returns Clean text with all ANSI escape sequences removed
 */
export function stripAnsi(data: string): string {
  return data.replaceAll(ansiPattern, "");
}
