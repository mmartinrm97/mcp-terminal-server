/**
 * Terminal screen rendering — parses raw PTY output with ANSI escape codes
 * into a clean 2D screen model (rows × columns).
 *
 * Handles:
 * - Cursor positioning (CUP): \x1b[row;colH
 * - Cursor movement: \x1b[rowA, \x1b[rowB, \x1b[rowC, \x1b[rowD
 * - Line erase: \x1b[K (erase to EOL), \x1b[0K, \x1b[1K, \x1b[2K
 * - Display erase: \x1b[J, \x1b[0J, \x1b[1J, \x1b[2J
 * - Carriage return (\r) and line feed (\n)
 * - All SGR/color codes (stripped)
 * - Cursor hide/show: \x1b[?25l, \x1b[?25h
 * - Scroll up when cursor reaches bottom
 */

export interface ScreenState {
  /** Rows of clean text (no ANSI codes) */
  rows: string[];
  /** Current cursor position (1-indexed) */
  cursorRow: number;
  cursorCol: number;
  /** Terminal dimensions */
  cols: number;
  rowsCount: number;
  /** Full rendered text (rows joined by \n) */
  text: string;
}

/**
 * Parse raw terminal output and render it into a screen model.
 *
 * @param raw - Raw PTY output buffer (full history)
 * @param terminalCols - Terminal width in columns (default: 80)
 * @param terminalRows - Terminal height in rows (default: 24)
 */
export function renderScreen(
  raw: string,
  terminalCols: number = 80,
  terminalRows: number = 24,
): ScreenState {
  // Initialize screen as a grid of spaces
  const screen: string[][] = Array.from({ length: terminalRows }, () =>
    Array.from({ length: terminalCols }, () => ' '),
  );
  let row = 0; // 1-indexed in ANSI, we use 0-indexed internally
  let col = 0;

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];

    if (ch === '\r') {
      // Carriage return: move cursor to column 0
      col = 0;
      i++;
      continue;
    }

    if (ch === '\n') {
      // Line feed: move cursor to next line, column 0
      col = 0;
      row++;
      if (row >= terminalRows) {
        // Scroll up: shift rows up, clear bottom row
        for (let r = 0; r < terminalRows - 1; r++) {
          screen[r] = [...screen[r + 1]];
        }
        screen[terminalRows - 1] = Array.from({ length: terminalCols }, () => ' ');
        row = terminalRows - 1;
      }
      i++;
      continue;
    }

    if (ch === '\b') {
      // Backspace
      if (col > 0) col--;
      i++;
      continue;
    }

    if (ch === '\t') {
      // Tab: advance to next 8-column boundary
      col = (col + 8) & ~7;
      if (col >= terminalCols) col = terminalCols - 1;
      i++;
      continue;
    }

    if (ch === '\x1b') {
      // Escape sequence — parse it
      i++;
      if (i >= raw.length) break;

      if (raw[i] === '[') {
        // CSI sequence: ESC [ ...
        i++;
        const seqStart = i;
        // Collect parameter bytes and intermediate bytes
        while (i < raw.length && isCsiParam(raw[i])) i++;
        if (i >= raw.length) break;
        const params = raw.slice(seqStart, i);
        const finalByte = raw[i];
        i++;

        if (finalByte === 'A') {
          // Cursor Up
          const n = parseInt(params, 10) || 1;
          row = Math.max(0, row - n);
        } else if (finalByte === 'B') {
          // Cursor Down
          const n = parseInt(params, 10) || 1;
          row = Math.min(terminalRows - 1, row + n);
        } else if (finalByte === 'C') {
          // Cursor Forward
          const n = parseInt(params, 10) || 1;
          col = Math.min(terminalCols - 1, col + n);
        } else if (finalByte === 'D') {
          // Cursor Back
          const n = parseInt(params, 10) || 1;
          col = Math.max(0, col - n);
        } else if (finalByte === 'G') {
          // Cursor Horizontal Absolute (CHA): column = param (1-indexed)
          const c = parseInt(params, 10) || 1;
          col = Math.max(0, Math.min(terminalCols - 1, c - 1));
        } else if (finalByte === 'H' || finalByte === 'f') {
          // Cursor Position / Horizontal Vertical Position
          const parts = params.split(';');
          const r = parseInt(parts[0], 10) || 1;
          const c = parseInt(parts[1], 10) || 1;
          row = Math.max(0, Math.min(terminalRows - 1, r - 1));
          col = Math.max(0, Math.min(terminalCols - 1, c - 1));
        } else if (finalByte === 'J') {
          // Erase in Display
          const mode = parseInt(params, 10) || 0;
          if (mode === 0) {
            // Erase from cursor to end of screen
            eraseFrom(screen, row, col, terminalCols, terminalRows);
          } else if (mode === 1) {
            // Erase from start to cursor
            eraseTo(screen, row, col);
          } else if (mode === 2) {
            // Erase entire screen
            for (let r = 0; r < terminalRows; r++) {
              screen[r] = Array.from({ length: terminalCols }, () => ' ');
            }
          }
        } else if (finalByte === 'K') {
          // Erase in Line
          const mode = parseInt(params, 10) || 0;
          if (mode === 0) {
            // Erase from cursor to end of line
            for (let c = col; c < terminalCols; c++) screen[row][c] = ' ';
          } else if (mode === 1) {
            // Erase from start of line to cursor
            for (let c = 0; c <= col; c++) screen[row][c] = ' ';
          } else if (mode === 2) {
            // Erase entire line
            screen[row] = Array.from({ length: terminalCols }, () => ' ');
          }
        }
        // Other CSI sequences (colors, cursor style, etc.) — ignored
      } else if (raw[i] === ']') {
        // OSC sequence: ESC ] ... ST (BEL \x07 or ESC \)
        i++;
        while (i < raw.length && raw[i] !== '\x07' && !(raw[i] === '\x1b' && raw[i + 1] === '\\')) {
          i++;
        }
        if (i < raw.length && raw[i] === '\x07') i++;
        else if (i < raw.length && raw[i] === '\x1b') i += 2; // skip ESC + \
      } else {
        // Single-character escape (e.g., \x1b7 save cursor, \x1b8 restore)
        // Just skip
        i++;
      }
      continue;
    }

    // Regular character: write to screen at cursor position
    if (col < terminalCols && row < terminalRows) {
      screen[row][col] = ch;
    }
    col++;
    if (col >= terminalCols) {
      col = 0;
      row++;
      if (row >= terminalRows) {
        // Scroll up: copy references, don't share
        for (let r = 0; r < terminalRows - 1; r++) {
          screen[r] = [...screen[r + 1]];
        }
        screen[terminalRows - 1] = Array.from({ length: terminalCols }, () => ' ');
        row = terminalRows - 1;
      }
    }
    i++;
  }

  // Build clean output: trim trailing spaces from each row
  const rows: string[] = screen.map((r) => r.join('').replace(/\s+$/, ''));

  // Trim trailing empty rows from text
  let lastNonEmpty = rows.length - 1;
  while (lastNonEmpty > 0 && rows[lastNonEmpty] === '') {
    lastNonEmpty--;
  }
  const text = rows.slice(0, lastNonEmpty + 1).join('\n');

  return {
    rows,
    cursorRow: row + 1,
    cursorCol: col + 1,
    cols: terminalCols,
    rowsCount: terminalRows,
    text,
  };
}

/** Check if a byte is a CSI parameter byte (0x30-0x3F) or intermediate byte (0x20-0x2F) */
function isCsiParam(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x30 && code <= 0x3f) || (code >= 0x20 && code <= 0x2f);
}

/** Erase from cursor to end of screen */
function eraseFrom(
  screen: string[][],
  startRow: number,
  startCol: number,
  cols: number,
  rows: number,
): void {
  for (let c = startCol; c < cols; c++) screen[startRow][c] = ' ';
  for (let r = startRow + 1; r < rows; r++) {
    screen[r] = Array.from({ length: cols }, () => ' ');
  }
}

/** Erase from beginning to cursor */
function eraseTo(screen: string[][], endRow: number, endCol: number): void {
  for (let r = 0; r < endRow; r++) {
    for (let c = 0; c < screen[r].length; c++) screen[r][c] = ' ';
  }
  for (let c = 0; c <= endCol; c++) screen[endRow][c] = ' ';
}
