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

// ---------------------------------------------------------------------------
// Semantic screen analysis types
// ---------------------------------------------------------------------------

/** High-level classification of what application is running in the terminal. */
export type TerminalMode = "shell" | "vim" | "nano" | "htop" | "lazygit" | "less" | "unknown";

/** Vim-specific editor submode. Only present when terminal_mode is "vim". */
export type EditorMode = "normal" | "insert" | "visual" | "replace" | "unknown";

/** Result of heuristic screen classification. */
export interface ScreenAnalysis {
  terminal_mode: TerminalMode;
  editor_mode?: EditorMode;
  status_line: string | null;
  content_rows: string[];
}

// ---------------------------------------------------------------------------
// Raw screen rendering
// ---------------------------------------------------------------------------

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
    Array.from({ length: terminalCols }, () => " "),
  );
  let row = 0; // 1-indexed in ANSI, we use 0-indexed internally
  let col = 0;

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];

    if (ch === "\r") {
      // Carriage return: move cursor to column 0
      col = 0;
      i++;
      continue;
    }

    if (ch === "\n") {
      // Line feed: move cursor to next line, column 0
      col = 0;
      row++;
      if (row >= terminalRows) {
        // Scroll up: shift rows up, clear bottom row
        for (let r = 0; r < terminalRows - 1; r++) {
          screen[r] = [...screen[r + 1]];
        }
        screen[terminalRows - 1] = Array.from({ length: terminalCols }, () => " ");
        row = terminalRows - 1;
      }
      i++;
      continue;
    }

    if (ch === "\b") {
      // Backspace
      if (col > 0) col--;
      i++;
      continue;
    }

    if (ch === "\t") {
      // Tab: advance to next 8-column boundary
      col = (col + 8) & ~7;
      if (col >= terminalCols) col = terminalCols - 1;
      i++;
      continue;
    }

    if (ch === "\x1b") {
      // Escape sequence — parse it
      i++;
      if (i >= raw.length) break;

      if (raw[i] === "[") {
        // CSI sequence: ESC [ ...
        i++;
        const seqStart = i;
        // Collect parameter bytes and intermediate bytes
        while (i < raw.length && isCsiParam(raw[i])) i++;
        if (i >= raw.length) break;
        const params = raw.slice(seqStart, i);
        const finalByte = raw[i];
        i++;

        if (finalByte === "A") {
          // Cursor Up
          const n = parseInt(params, 10) || 1;
          row = Math.max(0, row - n);
        } else if (finalByte === "B") {
          // Cursor Down
          const n = parseInt(params, 10) || 1;
          row = Math.min(terminalRows - 1, row + n);
        } else if (finalByte === "C") {
          // Cursor Forward
          const n = parseInt(params, 10) || 1;
          col = Math.min(terminalCols - 1, col + n);
        } else if (finalByte === "D") {
          // Cursor Back
          const n = parseInt(params, 10) || 1;
          col = Math.max(0, col - n);
        } else if (finalByte === "G") {
          // Cursor Horizontal Absolute (CHA): column = param (1-indexed)
          const c = parseInt(params, 10) || 1;
          col = Math.max(0, Math.min(terminalCols - 1, c - 1));
        } else if (finalByte === "H" || finalByte === "f") {
          // Cursor Position / Horizontal Vertical Position
          const parts = params.split(";");
          const r = parseInt(parts[0], 10) || 1;
          const c = parseInt(parts[1], 10) || 1;
          row = Math.max(0, Math.min(terminalRows - 1, r - 1));
          col = Math.max(0, Math.min(terminalCols - 1, c - 1));
        } else if (finalByte === "J") {
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
              screen[r] = Array.from({ length: terminalCols }, () => " ");
            }
          }
        } else if (finalByte === "K") {
          // Erase in Line
          const mode = parseInt(params, 10) || 0;
          if (mode === 0) {
            // Erase from cursor to end of line
            for (let c = col; c < terminalCols; c++) screen[row][c] = " ";
          } else if (mode === 1) {
            // Erase from start of line to cursor
            for (let c = 0; c <= col; c++) screen[row][c] = " ";
          } else if (mode === 2) {
            // Erase entire line
            screen[row] = Array.from({ length: terminalCols }, () => " ");
          }
        }
        // Other CSI sequences (colors, cursor style, etc.) — ignored
      } else if (raw[i] === "]") {
        // OSC sequence: ESC ] ... ST (BEL \x07 or ESC \)
        i++;
        while (i < raw.length && raw[i] !== "\x07" && !(raw[i] === "\x1b" && raw[i + 1] === "\\")) {
          i++;
        }
        if (i < raw.length && raw[i] === "\x07") i++;
        else if (i < raw.length && raw[i] === "\x1b") i += 2; // skip ESC + \
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
        screen[terminalRows - 1] = Array.from({ length: terminalCols }, () => " ");
        row = terminalRows - 1;
      }
    }
    i++;
  }

  // Build clean output: trim trailing spaces from each row
  const rows: string[] = screen.map((r) => r.join("").replace(/\s+$/, ""));

  // Trim trailing empty rows from text
  let lastNonEmpty = rows.length - 1;
  while (lastNonEmpty > 0 && rows[lastNonEmpty] === "") {
    lastNonEmpty--;
  }
  const text = rows.slice(0, lastNonEmpty + 1).join("\n");

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
  for (let c = startCol; c < cols; c++) screen[startRow][c] = " ";
  for (let r = startRow + 1; r < rows; r++) {
    screen[r] = Array.from({ length: cols }, () => " ");
  }
}

/** Erase from beginning to cursor */
function eraseTo(screen: string[][], endRow: number, endCol: number): void {
  for (let r = 0; r < endRow; r++) {
    for (let c = 0; c < screen[r].length; c++) screen[r][c] = " ";
  }
  for (let c = 0; c <= endCol; c++) screen[endRow][c] = " ";
}

// ---------------------------------------------------------------------------
// Semantic screen analysis — post-process rendered rows to classify the
// foreground application and decompose screen into content + status line.
// ---------------------------------------------------------------------------

/**
 * Analyze rendered screen rows to detect the foreground terminal application,
 * extract the status line, and separate content rows.
 *
 * Every mode detection requires ≥2 independent signals to avoid false positives.
 *
 * @param rows - Clean text rows from `renderScreen()` (no ANSI codes)
 * @returns Semantic classification of the screen contents
 */
export function analyzeScreen(rows: string[]): ScreenAnalysis {
  // Find the last non-empty row (candidate status line)
  let statusIdx = -1;
  let nonEmptyCount = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].trim() !== "") {
      if (statusIdx === -1) statusIdx = i;
      nonEmptyCount++;
    }
  }

  const statusLine: string | null = nonEmptyCount >= 2 && statusIdx >= 0 ? rows[statusIdx] : null;

  // Build content rows: all rows except the status line (if present)
  const contentRows: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (statusIdx === i) continue;
    contentRows.push(rows[i]);
  }

  // If no non-empty rows → unknown
  if (nonEmptyCount === 0) {
    return { terminal_mode: "unknown", status_line: null, content_rows: [] };
  }

  // ----- Vim detection (≥2 signals) -----
  const vimResult = detectVim(rows, statusLine);
  if (vimResult) {
    return {
      terminal_mode: "vim",
      editor_mode: vimResult.editorMode,
      status_line: statusLine,
      content_rows: contentRows,
    };
  }

  // ----- Nano detection (≥2 signals) -----
  if (detectNano(rows)) {
    return { terminal_mode: "nano", status_line: statusLine, content_rows: contentRows };
  }

  // ----- Htop detection (≥2 signals) -----
  if (detectHtop(rows)) {
    return { terminal_mode: "htop", status_line: statusLine, content_rows: contentRows };
  }

  // ----- Lazygit detection (≥2 signals) -----
  if (detectLazygit(rows)) {
    return { terminal_mode: "lazygit", status_line: statusLine, content_rows: contentRows };
  }

  // ----- Less detection (≥2 signals, but NOT if vim/nano matched) -----
  if (detectLess(rows, statusLine)) {
    return { terminal_mode: "less", status_line: statusLine, content_rows: contentRows };
  }

  // Default: shell
  return { terminal_mode: "shell", status_line: statusLine, content_rows: contentRows };
}

/** Signal checkers — each requires ≥2 independent signals to return true. */

function detectVim(rows: string[], statusLine: string | null): { editorMode: EditorMode } | null {
  // Signal A: ≥2 rows starting with "~" in column 0 (tildes for vim empty lines)
  let tildeCount = 0;
  for (const row of rows) {
    if (row.startsWith("~")) tildeCount++;
  }
  const hasTildes = tildeCount >= 2;

  // Signal B: Status line matches vim patterns
  if (!statusLine) return null;
  const hasVimStatus = isVimStatusLine(statusLine);

  if (!hasTildes || !hasVimStatus) return null;

  // Determine editor mode from status line
  const status = statusLine.toUpperCase();
  let editorMode: EditorMode = "normal";
  if (status.includes("-- INSERT --")) {
    editorMode = "insert";
  } else if (status.includes("-- REPLACE --")) {
    editorMode = "replace";
  } else if (status.includes("-- VISUAL")) {
    // Matches both "-- VISUAL --" and "-- VISUAL LINE --"
    editorMode = "visual";
  }

  return { editorMode };
}

/** Check if a row looks like a vim status line. */
function isVimStatusLine(row: string): boolean {
  const upper = row.toUpperCase();
  // Explicit mode indicators
  if (upper.includes("-- INSERT --")) return true;
  if (upper.includes("-- REPLACE --")) return true;
  if (upper.includes("-- VISUAL")) return true; // covers VISUAL LINE too
  // File info pattern: "filename" 45L, 1200B
  if (/"\S+"/.test(row)) return true;
  return false;
}

function detectNano(rows: string[]): boolean {
  // Signal A: Header row contains "GNU nano"
  let hasHeader = false;
  for (const row of rows) {
    if (row.includes("GNU nano")) {
      hasHeader = true;
      break;
    }
  }

  // Signal B: Bottom 2 rows contain nano help indicators
  let hasHelpBar = false;
  const lastTwo = rows.slice(-2);
  for (const row of lastTwo) {
    const upper = row.toUpperCase();
    if (upper.includes("^G") || upper.includes("[ MODIFIED ]") || upper.includes("[ READ ONLY ]")) {
      hasHelpBar = true;
      break;
    }
  }

  return hasHeader && hasHelpBar;
}

function detectHtop(rows: string[]): boolean {
  // Look at first 6 rows for htop/top header patterns
  const headerRows = rows.slice(0, Math.min(6, rows.length));
  const headerText = headerRows.join("\n").toUpperCase();

  // Signal A: Contains CPU or memory percentage info
  const hasCpuMem =
    headerText.includes("%CPU") ||
    headerText.includes("CPU%") ||
    headerText.includes("MEM%") ||
    /\[\s*\d+\.?\d*%\]/.test(rows.slice(0, 3).join(""));

  // Signal B: Contains "top -" or "htop" or memory/swap indicators
  const hasSystemInfo =
    headerText.includes("TOP -") ||
    headerText.includes("HTOP") ||
    headerText.includes("LOAD AVERAGE") ||
    headerText.includes("MEM[") ||
    headerText.includes("SWP[") ||
    headerText.includes("UPTIME:");

  return hasCpuMem && hasSystemInfo;
}

function detectLazygit(rows: string[]): boolean {
  // Signal A: Unicode box-drawing characters OR explicit lazygit text
  const boxChars = /[─│┌┐└┘├┤┬┴┼]/;
  let hasBoxChars = false;
  let hasLazygitText = false;
  for (const row of rows) {
    if (boxChars.test(row)) hasBoxChars = true;
    if (row.toLowerCase().includes("lazygit")) hasLazygitText = true;
  }
  const signalA = hasBoxChars || hasLazygitText;

  // Signal B: Recognizable lazygit panel headers or staged/unstaged content
  const hasLazygitHeader = rows.some(
    (row) =>
      /\bStatus\b/i.test(row) ||
      /\bFiles\b/i.test(row) ||
      /\bBranches\b/i.test(row) ||
      /\bStash\b/i.test(row) ||
      /\bCommits\b/i.test(row) ||
      /Staged changes/i.test(row) ||
      /Unstaged changes/i.test(row),
  );

  return signalA && hasLazygitHeader;
}

function detectLess(rows: string[], statusLine: string | null): boolean {
  const lastRow = rows[rows.length - 1] ?? "";
  const lastRowUpper = lastRow.toUpperCase().trim();
  const firstRow = rows[0] ?? "";

  // Signal A: Bottom row has less prompt indicators
  const hasBottomPrompt =
    lastRowUpper === "(END)" ||
    lastRowUpper === ":" ||
    /^lines\s+\d+-\d+\/\d+/.test(firstRow.trim()) ||
    /^lines\s+\d+-\d+/.test(firstRow.trim());

  // Signal B: Content rows exist (non-empty) AND no editor TUI signatures
  const nonEmptyRows = rows.filter((r) => r.trim() !== "");
  const hasContent = nonEmptyRows.length >= 2;

  // Must NOT match vim/nano patterns (less is a fallback)
  const hasEditorSignatures =
    rows.some((r) => r.startsWith("~")) ||
    rows.some((r) => r.includes("GNU nano")) ||
    (statusLine !== null && isVimStatusLine(statusLine));

  return hasBottomPrompt && hasContent && !hasEditorSignatures;
}
