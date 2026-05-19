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
export type PromptCategory = "text" | "confirm" | "choice" | "secret" | "license" | "unknown";
export type AskUserReason =
  | "destructive_confirmation"
  | "secret_required"
  | "license_choice"
  | "ambiguous_choice"
  | "unknown_text_without_default";

/** Result of heuristic screen classification. */
export interface ScreenAnalysis {
  terminal_mode: TerminalMode;
  editor_mode?: EditorMode;
  status_line: string | null;
  content_rows: string[];
  prompt_detected: string | null;
  prompt_category: PromptCategory | null;
  is_interactive: boolean;
  should_ask_user: boolean;
  ask_user_reason: AskUserReason | null;
  can_accept_default: boolean;
  recommended_next_action: "input_required" | "inspect_screen" | "wait" | "read" | "ask_user";
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
    const result = processRawChar(raw, i, screen, terminalCols, terminalRows, row, col);
    i = result.i;
    row = result.row;
    col = result.col;
  }

  // Build clean output: trim trailing spaces from each row
  const rows: string[] = screen.map((r) => r.join("").trimEnd());

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

/** Process one character at a given position in the raw PTY output. Returns updated index, row, and col. */
function processRawChar(
  raw: string,
  i: number,
  screen: string[][],
  terminalCols: number,
  terminalRows: number,
  row: number,
  col: number,
): { i: number; row: number; col: number } {
  const ch = raw[i];

  if (ch === "\r") return { i: i + 1, row, col: 0 };
  if (ch === "\n") return processNewline(i, screen, terminalCols, terminalRows, row);
  if (ch === "\b") return processBackspace(i, row, col);
  if (ch === "\t") return processTab(i, terminalCols, col, row);
  if (ch === "\x1b") return processEscape(raw, i, screen, terminalCols, terminalRows, row, col);

  // Regular character
  return writeChar(ch, i, screen, terminalCols, terminalRows, row, col);
}

/** Handle a newline (\n): advance row, scroll if needed. */
function processNewline(
  i: number,
  screen: string[][],
  terminalCols: number,
  terminalRows: number,
  row: number,
): { i: number; row: number; col: number } {
  const newRow = row + 1;
  if (newRow >= terminalRows) {
    return { i: i + 1, row: scrollUp(screen, terminalCols, terminalRows), col: 0 };
  }
  return { i: i + 1, row: newRow, col: 0 };
}

/** Handle backspace (\b). */
function processBackspace(
  i: number,
  row: number,
  col: number,
): { i: number; row: number; col: number } {
  return { i: i + 1, row, col: col > 0 ? col - 1 : 0 };
}

/** Handle tab (\t): advance to next 8-column boundary. */
function processTab(
  i: number,
  terminalCols: number,
  col: number,
  row: number,
): { i: number; row: number; col: number } {
  let newCol = (col + 8) & ~7;
  if (newCol >= terminalCols) newCol = terminalCols - 1;
  return { i: i + 1, row, col: newCol };
}

/** Write a regular character to the screen, wrapping/scroll if needed. */
function writeChar(
  ch: string,
  i: number,
  screen: string[][],
  terminalCols: number,
  terminalRows: number,
  row: number,
  col: number,
): { i: number; row: number; col: number } {
  if (col < terminalCols && row < terminalRows) {
    screen[row][col] = ch;
  }
  let newCol = col + 1;
  let newRow = row;
  if (newCol >= terminalCols) {
    newCol = 0;
    newRow++;
    if (newRow >= terminalRows) {
      newRow = scrollUp(screen, terminalCols, terminalRows);
    }
  }
  return { i: i + 1, row: newRow, col: newCol };
}

/** Scroll screen up one row: shift all rows up, clear bottom row. Returns new cursor row. */
function scrollUp(screen: string[][], terminalCols: number, terminalRows: number): number {
  for (let r = 0; r < terminalRows - 1; r++) {
    screen[r] = [...screen[r + 1]];
  }
  screen[terminalRows - 1] = Array.from({ length: terminalCols }, () => " ");
  return terminalRows - 1;
}

/**
 * Process an escape sequence starting after the initial ESC byte.
 * Returns updated index, row, and col.
 */
function processEscape(
  raw: string,
  startI: number,
  screen: string[][],
  terminalCols: number,
  terminalRows: number,
  row: number,
  col: number,
): { i: number; row: number; col: number } {
  let i = startI + 1; // Skip ESC
  if (i >= raw.length) return { i, row, col };

  if (raw[i] === "[") {
    return processCsi(raw, i, screen, terminalCols, terminalRows, row, col);
  }

  if (raw[i] === "]") {
    return processOsc(raw, i, row, col);
  }

  // Single-character escape — skip
  return { i: i + 1, row, col };
}

/** Process a CSI sequence (ESC [ params... finalByte). */
function processCsi(
  raw: string,
  startI: number,
  screen: string[][],
  terminalCols: number,
  terminalRows: number,
  row: number,
  col: number,
): { i: number; row: number; col: number } {
  let i = startI + 1; // Skip '['
  const seqStart = i;
  while (i < raw.length && isCsiParam(raw[i])) i++;
  if (i >= raw.length) return { i: startI, row, col };
  const params = raw.slice(seqStart, i);
  const finalByte = raw[i];
  i++;

  // Cursor positioning commands (A, B, C, D, G, H, f)
  const cursorResult = applyCursorMovement(finalByte, params, row, col, terminalCols, terminalRows);
  if (cursorResult) {
    return { i, row: cursorResult.row, col: cursorResult.col };
  }

  // Erase commands (J, K)
  applyErase(finalByte, params, screen, row, col, terminalCols, terminalRows);

  return { i, row, col };
}

/** Apply cursor movement/positioning if finalByte is a cursor command. */
function applyCursorMovement(
  finalByte: string,
  params: string,
  row: number,
  col: number,
  terminalCols: number,
  terminalRows: number,
): { row: number; col: number } | null {
  const n = Number.parseInt(params, 10) || 1;

  switch (finalByte) {
    case "A":
      return { row: Math.max(0, row - n), col };
    case "B":
      return { row: Math.min(terminalRows - 1, row + n), col };
    case "C":
      return { row, col: Math.min(terminalCols - 1, col + n) };
    case "D":
      return { row, col: Math.max(0, col - n) };
    case "G": {
      const c = Math.max(0, Math.min(terminalCols - 1, n - 1));
      return { row, col: c };
    }
    case "H":
    case "f": {
      const parts = params.split(";");
      const r = Number.parseInt(parts[0], 10) || 1;
      const c = Number.parseInt(parts[1], 10) || 1;
      return {
        row: Math.max(0, Math.min(terminalRows - 1, r - 1)),
        col: Math.max(0, Math.min(terminalCols - 1, c - 1)),
      };
    }
    default:
      return null;
  }
}

/** Apply erase operation if finalByte is an erase command. */
function applyErase(
  finalByte: string,
  params: string,
  screen: string[][],
  row: number,
  col: number,
  terminalCols: number,
  terminalRows: number,
): void {
  if (finalByte === "J") {
    applyEraseDisplay(screen, params, row, col, terminalCols, terminalRows);
  } else if (finalByte === "K") {
    applyEraseLine(screen, params, row, col, terminalCols);
  }
}

/** Process an OSC sequence (ESC ] ... ST). Returns updated index preserving cursor. */
function processOsc(
  raw: string,
  startI: number,
  row: number,
  col: number,
): { i: number; row: number; col: number } {
  let i = startI + 1; // Skip ']'
  while (i < raw.length && raw[i] !== "\x07" && !(raw[i] === "\x1b" && raw[i + 1] === "\\")) {
    i++;
  }
  if (i < raw.length && raw[i] === "\x07") i++;
  else if (i < raw.length && raw[i] === "\x1b") i += 2; // skip ESC + \
  return { i, row, col };
}

/** Apply Erase in Display (CSI J). */
function applyEraseDisplay(
  screen: string[][],
  params: string,
  row: number,
  col: number,
  terminalCols: number,
  terminalRows: number,
): void {
  const mode = Number.parseInt(params, 10) || 0;
  if (mode === 0) {
    eraseFrom(screen, row, col, terminalCols, terminalRows);
  } else if (mode === 1) {
    eraseTo(screen, row, col);
  } else if (mode === 2) {
    for (let r = 0; r < terminalRows; r++) {
      screen[r] = Array.from({ length: terminalCols }, () => " ");
    }
  }
}

/** Apply Erase in Line (CSI K). */
function applyEraseLine(
  screen: string[][],
  params: string,
  row: number,
  col: number,
  terminalCols: number,
): void {
  const mode = Number.parseInt(params, 10) || 0;
  if (mode === 0) {
    for (let c = col; c < terminalCols; c++) screen[row][c] = " ";
  } else if (mode === 1) {
    for (let c = 0; c <= col; c++) screen[row][c] = " ";
  } else if (mode === 2) {
    screen[row] = Array.from({ length: terminalCols }, () => " ");
  }
}

/** Check if a byte is a CSI parameter byte (0x30-0x3F) or intermediate byte (0x20-0x2F) */
function isCsiParam(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
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
  const { statusIdx, nonEmptyCount } = findStatusLine(rows);
  const statusLine: string | null = nonEmptyCount >= 2 && statusIdx >= 0 ? rows[statusIdx] : null;

  // Build content rows: all rows except the status line (if present)
  const contentRows: string[] = rows.filter((_, i) => i !== statusIdx);
  const promptDetected = detectPrompt(rows);
  const promptGuidance = classifyPrompt(promptDetected);

  // If no non-empty rows → unknown
  if (nonEmptyCount === 0) {
    return {
      terminal_mode: "unknown",
      status_line: null,
      content_rows: [],
      prompt_detected: null,
      prompt_category: null,
      is_interactive: false,
      should_ask_user: false,
      ask_user_reason: null,
      can_accept_default: false,
      recommended_next_action: "wait",
    };
  }

  // ----- Vim detection (≥2 signals) -----
  const vimResult = detectVim(rows, statusLine);
  if (vimResult) {
    return {
      terminal_mode: "vim",
      editor_mode: vimResult.editorMode,
      status_line: statusLine,
      content_rows: contentRows,
      prompt_detected: promptDetected,
      prompt_category: promptGuidance.category,
      is_interactive: true,
      should_ask_user: false,
      ask_user_reason: null,
      can_accept_default: false,
      recommended_next_action: "inspect_screen",
    };
  }

  // ----- Nano detection (≥2 signals) -----
  if (detectNano(rows)) {
    return {
      terminal_mode: "nano",
      status_line: statusLine,
      content_rows: contentRows,
      prompt_detected: promptDetected,
      prompt_category: promptGuidance.category,
      is_interactive: true,
      should_ask_user: false,
      ask_user_reason: null,
      can_accept_default: false,
      recommended_next_action: "inspect_screen",
    };
  }

  // ----- Htop detection (≥2 signals) -----
  if (detectHtop(rows)) {
    return {
      terminal_mode: "htop",
      status_line: statusLine,
      content_rows: contentRows,
      prompt_detected: promptDetected,
      prompt_category: promptGuidance.category,
      is_interactive: true,
      should_ask_user: false,
      ask_user_reason: null,
      can_accept_default: false,
      recommended_next_action: "inspect_screen",
    };
  }

  // ----- Lazygit detection (≥2 signals) -----
  if (detectLazygit(rows)) {
    return {
      terminal_mode: "lazygit",
      status_line: statusLine,
      content_rows: contentRows,
      prompt_detected: promptDetected,
      prompt_category: promptGuidance.category,
      is_interactive: true,
      should_ask_user: false,
      ask_user_reason: null,
      can_accept_default: false,
      recommended_next_action: "inspect_screen",
    };
  }

  // ----- Less detection (≥2 signals, but NOT if vim/nano matched) -----
  if (detectLess(rows, statusLine)) {
    return {
      terminal_mode: "less",
      status_line: statusLine,
      content_rows: contentRows,
      prompt_detected: promptDetected,
      prompt_category: promptGuidance.category,
      is_interactive: true,
      should_ask_user: false,
      ask_user_reason: null,
      can_accept_default: false,
      recommended_next_action: "inspect_screen",
    };
  }

  // Default: shell
  return {
    terminal_mode: "shell",
    status_line: statusLine,
    content_rows: contentRows,
    prompt_detected: promptDetected,
    prompt_category: promptGuidance.category,
    is_interactive: promptDetected !== null,
    should_ask_user: promptGuidance.shouldAskUser,
    ask_user_reason: promptGuidance.askUserReason,
    can_accept_default: promptGuidance.canAcceptDefault,
    recommended_next_action:
      promptDetected === null
        ? "read"
        : promptGuidance.shouldAskUser
          ? "ask_user"
          : "input_required",
  };
}

/** Find the last non-empty row index and count of non-empty rows. */
function findStatusLine(rows: string[]): { statusIdx: number; nonEmptyCount: number } {
  let statusIdx = -1;
  let nonEmptyCount = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].trim() !== "") {
      if (statusIdx === -1) statusIdx = i;
      nonEmptyCount++;
    }
  }
  return { statusIdx, nonEmptyCount };
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
  const lastRow = rows.at(-1) ?? "";
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

/**
 * Best-effort prompt detector for common interactive CLIs.
 *
 * The goal is NOT to hardcode one CLI, but to identify generic
 * "this terminal is asking for input" states from already-rendered text.
 */
function detectPrompt(rows: string[]): string | null {
  const promptPatterns = [
    /:\s*(\([^)]*\))?\s*$/,
    /\?\s*$/,
    /\[[YyNn]\/[YyNn]\]/,
    /\(([Yy]\/[Nn]|[Nn]\/[Yy])\)/,
    /press any key/i,
    /select .*:/i,
    /enter .*:/i,
    /password:/i,
  ];

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]?.trim();
    if (!row) continue;

    for (const pattern of promptPatterns) {
      if (pattern.test(row)) {
        return row;
      }
    }
  }

  return null;
}

function classifyPrompt(prompt: string | null): {
  category: PromptCategory | null;
  shouldAskUser: boolean;
  askUserReason: AskUserReason | null;
  canAcceptDefault: boolean;
} {
  if (prompt === null) {
    return {
      category: null,
      shouldAskUser: false,
      askUserReason: null,
      canAcceptDefault: false,
    };
  }

  const lower = prompt.toLowerCase();
  const hasDefault = /\([^)]*\)/.test(prompt) || /\[[^\]]*\]/.test(prompt);

  if (/(password|passphrase|token|api key|secret|otp|one-time code)/i.test(prompt)) {
    return {
      category: "secret",
      shouldAskUser: true,
      askUserReason: "secret_required",
      canAcceptDefault: false,
    };
  }

  if (/\blicen[sc]e\b/i.test(prompt)) {
    return {
      category: "license",
      shouldAskUser: true,
      askUserReason: "license_choice",
      canAcceptDefault: hasDefault,
    };
  }

  if (/(select|choose|pick|which|option)/i.test(prompt)) {
    return {
      category: "choice",
      shouldAskUser: true,
      askUserReason: "ambiguous_choice",
      canAcceptDefault: false,
    };
  }

  if (/\[[yn]\/[yn]\]|\([yn]\/[yn]\)|\?$/.test(lower)) {
    const isDestructive =
      /(delete|drop|destroy|reset|remove|prune|overwrite|truncate|wipe|kill|terminate|force)/i.test(
        prompt,
      );
    return {
      category: "confirm",
      shouldAskUser: isDestructive,
      askUserReason: isDestructive ? "destructive_confirmation" : null,
      canAcceptDefault: hasDefault,
    };
  }

  if (/:/.test(prompt)) {
    return {
      category: "text",
      shouldAskUser: !hasDefault,
      askUserReason: hasDefault ? null : "unknown_text_without_default",
      canAcceptDefault: hasDefault,
    };
  }

  return {
    category: "unknown",
    shouldAskUser: false,
    askUserReason: null,
    canAcceptDefault: false,
  };
}
