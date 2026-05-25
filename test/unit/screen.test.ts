import { describe, it, expect } from "vitest";
import { renderScreen, analyzeScreen } from "../../src/core/screen.js";

describe("renderScreen", () => {
  it("should render plain text", () => {
    const result = renderScreen("hello world", 80, 24);
    expect(result.rows[0]).toBe("hello world");
    expect(result.text).toBe("hello world");
  });

  it("should handle newlines", () => {
    const result = renderScreen("line1\nline2\nline3", 80, 24);
    expect(result.rows[0]).toBe("line1");
    expect(result.rows[1]).toBe("line2");
    expect(result.rows[2]).toBe("line3");
    expect(result.cursorRow).toBe(3);
  });

  it("should handle carriage returns", () => {
    const result = renderScreen("hello\rworld", 80, 24);
    // \r moves cursor to column 0, then 'world' overwrites
    expect(result.rows[0]).toBe("world");
  });

  it("should strip ANSI color codes", () => {
    const result = renderScreen("\x1b[31mred\x1b[0m", 80, 24);
    expect(result.rows[0]).toBe("red");
  });

  it("should handle CUP (cursor position)", () => {
    // Write "A", then move to row 1 col 0 and write "B"
    const result = renderScreen("A\x1b[2;1HB", 80, 24);
    expect(result.rows[0]).toBe("A");
    expect(result.rows[1]).toBe("B");
  });

  it("should handle cursor up/down/forward/back", () => {
    // Write "AB", back one (\x1b[D), write "C" → overwrites B → "AC"
    const result = renderScreen("AB\x1b[DC", 80, 24);
    expect(result.rows[0]).toBe("AC");
  });

  it("should restore cursor position with DEC save/restore", () => {
    const result = renderScreen("abc\x1b7\x1b[2;1HXYZ\x1b8!", 80, 24);
    expect(result.rows[0]).toBe("abc!");
    expect(result.rows[1]).toBe("XYZ");
    expect(result.cursorCol).toBe(5);
  });

  it("should restore cursor position with CSI save/restore", () => {
    const result = renderScreen("hello\x1b[s\x1b[2;1Hworld\x1b[u!", 80, 24);
    expect(result.rows[0]).toBe("hello!");
    expect(result.rows[1]).toBe("world");
    expect(result.cursorRow).toBe(1);
    expect(result.cursorCol).toBe(7);
  });

  it("should handle erase in line (K)", () => {
    // Write "hello", move to col 0, erase to end, write "hi"
    const result = renderScreen("hello\x1b[0G\x1b[Khi", 80, 24);
    expect(result.rows[0]).toBe("hi");
  });

  it("should handle erase in display (J)", () => {
    // Write two lines, then move to top and erase to end
    const screen = renderScreen("line1\nline2\x1b[H\x1b[J", 80, 24);
    expect(screen.rows[0]).toBe("");
    expect(screen.rows[1]).toBe("");
  });

  it("should handle tabs", () => {
    const result = renderScreen("a\tb", 80, 24);
    expect(result.rows[0]).toBe("a       b");
  });

  it("should handle scrolling when reaching bottom", () => {
    // Write 24 full-screen lines + 1 extra (0-24) to a 24-row terminal.
    // Each line ends with \n.
    // Lines 0-23 fill rows 0-23, line23's \n triggers scroll 1.
    // After scroll 1: row 0 = line1, row 23 = cleared.
    // Line24 written to row 23, line24's \n triggers scroll 2.
    // After scroll 2: row 0 = line2, row 23 = cleared.
    const input = Array.from({ length: 25 }, (_, i) => `line${i}\n`).join("");
    const result = renderScreen(input, 80, 24);
    expect(result.rows[0]).toBe("line2");
    expect(result.rows[23]).toBe("");
  });

  it("should handle OSC sequences (window title)", () => {
    const result = renderScreen("hello\x1b]0;title\x07world", 80, 24);
    expect(result.rows[0]).toBe("helloworld");
  });

  it("should track cursor position", () => {
    const result = renderScreen("abc", 80, 24);
    expect(result.cursorCol).toBe(4); // after writing 3 chars, col is at position 4 (1-indexed)
    expect(result.cursorRow).toBe(1);
  });

  it("should handle bold/reverse video ANSI codes", () => {
    const result = renderScreen("\x1b[1mbold\x1b[0m \x1b[7mreverse\x1b[0m", 80, 24);
    expect(result.rows[0]).toBe("bold reverse");
  });

  it("should render a simulated TUI menu", () => {
    const raw = [
      "\x1b[2J", // clear screen
      "\x1b[1;1HSelect a framework:", // header at row 1
      "\x1b[3;1H  ○ Vanilla", // option at row 3
      "\x1b[4;1H  ○ Vue", // option at row 4
      "\x1b[5;1H  ● React", // selected at row 5
      "\x1b[6;1H  ○ Preact", // option at row 6
    ].join("");
    const result = renderScreen(raw, 80, 24);
    expect(result.rows[0]).toContain("Select a framework:");
    expect(result.rows[4]).toContain("● React");
    expect(result.rows[2]).toContain("○ Vanilla");
  });

  it("should handle real-world ANSI from create-vite menu", () => {
    // Simulated output from create-vite's framework selection
    const raw =
      "\x1b[36m\x1b[14;1H│  \x1b[m\x1b[2m○\x1b[22m \x1b[33m\x1b[2mVanilla\x1b[m\x1b[K\x1b[36m\r\n│  \x1b[m\x1b[2m○\x1b[22m \x1b[32m\x1b[2mVue\x1b[m\x1b[K\x1b[36m\r\n│  \x1b[32m● \x1b[36mReact\x1b[K";
    const result = renderScreen(raw, 100, 30);
    // Find the row containing React
    const reactRow = result.rows.find((r) => r.includes("React"));
    expect(reactRow).toBeDefined();
    expect(reactRow).toContain("●");
    expect(reactRow).not.toContain("\x1b");
  });
});

// ---------------------------------------------------------------------------
// analyzeScreen tests
// ---------------------------------------------------------------------------

describe("analyzeScreen", () => {
  // --- Shell (default) ---

  it("should detect shell prompt as shell mode", () => {
    const rows = [
      "martin@terminalize:~$ ls",
      "src/",
      "package.json",
      "tsconfig.json",
      "",
      "martin@terminalize:~$ ",
    ];
    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("shell");
    expect(result.editor_mode).toBeUndefined();
    expect(result.status_line).toBe("martin@terminalize:~$ ");
    expect(result.prompt_detected).toBeNull();
    expect(result.is_interactive).toBe(false);
    expect(result.content_rows).toEqual([
      "martin@terminalize:~$ ls",
      "src/",
      "package.json",
      "tsconfig.json",
      "",
    ]);
  });

  it("should detect shell with short output as shell mode", () => {
    const rows = ["$ echo hello", "hello", "$ "];
    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("shell");
    expect(result.editor_mode).toBeUndefined();
  });

  it("should detect generic field prompt as interactive shell state", () => {
    const rows = [
      "This utility will walk you through creating a package.json file.",
      "Press ^C at any time to quit.",
      "package name: (demo-app)",
    ];
    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("shell");
    expect(result.prompt_detected).toBe("package name: (demo-app)");
    expect(result.is_interactive).toBe(true);
    expect(result.recommended_next_action).toBe("input_required");
    expect(result.prompt_category).toBe("text");
    expect(result.should_ask_user).toBe(false);
    expect(result.can_accept_default).toBe(true);
  });

  it("should ask the user for destructive confirmations", () => {
    const rows = ["Database will be reset.", "Are you sure you want to drop all tables? [y/N]"];
    const result = analyzeScreen(rows);
    expect(result.prompt_detected).toBe("Are you sure you want to drop all tables? [y/N]");
    expect(result.prompt_category).toBe("confirm");
    expect(result.should_ask_user).toBe(true);
    expect(result.ask_user_reason).toBe("destructive_confirmation");
    expect(result.recommended_next_action).toBe("ask_user");
  });

  it("should ask the user for secret prompts", () => {
    const rows = ["GitHub authentication", "Password:"];
    const result = analyzeScreen(rows);
    expect(result.prompt_detected).toBe("Password:");
    expect(result.prompt_category).toBe("secret");
    expect(result.should_ask_user).toBe(true);
    expect(result.ask_user_reason).toBe("secret_required");
    expect(result.recommended_next_action).toBe("ask_user");
  });

  it("should ask the user for license selection prompts", () => {
    const rows = ["package name: (demo-app)", "license: (ISC)"];
    const result = analyzeScreen(rows);
    expect(result.prompt_detected).toBe("license: (ISC)");
    expect(result.prompt_category).toBe("license");
    expect(result.should_ask_user).toBe(true);
    expect(result.ask_user_reason).toBe("license_choice");
    expect(result.recommended_next_action).toBe("ask_user");
  });

  it("should ask the user for ambiguous selection prompts", () => {
    const rows = ["Select an option:", "  1) React", "  2) Vue"];
    const result = analyzeScreen(rows);
    expect(result.prompt_detected).toBe("Select an option:");
    expect(result.prompt_category).toBe("choice");
    expect(result.should_ask_user).toBe(true);
    expect(result.ask_user_reason).toBe("ambiguous_choice");
    expect(result.recommended_next_action).toBe("ask_user");
  });

  it("should detect numbered choice menus without explicit select wording", () => {
    const rows = [
      "Pick a package manager",
      "  1) pnpm",
      "  2) npm",
      "  3) yarn",
      "Enter choice [1-3]:",
    ];
    const result = analyzeScreen(rows);
    expect(result.prompt_detected).toBe("Enter choice [1-3]:");
    expect(result.prompt_category).toBe("choice");
    expect(result.should_ask_user).toBe(true);
    expect(result.ask_user_reason).toBe("ambiguous_choice");
    expect(result.recommended_next_action).toBe("ask_user");
  });

  // --- Vim INSERT ---

  it("should detect vim INSERT mode", () => {
    const rows: string[] = [];
    // 22 blank/space rows + tilde rows + status
    for (let i = 0; i < 10; i++) rows.push("function hello() {");
    rows.push("  console.log('hi');");
    rows.push("}");
    for (let i = 0; i < 10; i++) rows.push("~");
    rows.push("-- INSERT --");
    rows.push("");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("vim");
    expect(result.editor_mode).toBe("insert");
    expect(result.status_line).toBe("-- INSERT --");
    expect(result.content_rows).toHaveLength(23);
    expect(result.content_rows[23]).toBeUndefined(); // status line excluded
  });

  // --- Vim NORMAL ---

  it("should detect vim NORMAL mode", () => {
    const rows: string[] = [];
    for (let i = 0; i < 5; i++) rows.push("import { foo } from './bar';");
    for (let i = 0; i < 17; i++) rows.push("~");
    rows.push('"app.ts" 5L, 120B');

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("vim");
    expect(result.editor_mode).toBe("normal");
    expect(result.status_line).toBe('"app.ts" 5L, 120B');
  });

  // --- Vim VISUAL ---

  it("should detect vim VISUAL mode", () => {
    const rows: string[] = [];
    for (let i = 0; i < 8; i++) rows.push("const x = 1;");
    for (let i = 0; i < 14; i++) rows.push("~");
    rows.push("-- VISUAL --");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("vim");
    expect(result.editor_mode).toBe("visual");
  });

  it("should detect vim VISUAL LINE mode", () => {
    const rows: string[] = [];
    for (let i = 0; i < 8; i++) rows.push("const x = 1;");
    for (let i = 0; i < 14; i++) rows.push("~");
    rows.push("-- VISUAL LINE --");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("vim");
    expect(result.editor_mode).toBe("visual");
  });

  // --- Vim REPLACE ---

  it("should detect vim REPLACE mode", () => {
    const rows: string[] = [];
    for (let i = 0; i < 8; i++) rows.push("const x = 1;");
    for (let i = 0; i < 14; i++) rows.push("~");
    rows.push("-- REPLACE --");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("vim");
    expect(result.editor_mode).toBe("replace");
  });

  // --- Nano ---

  it("should detect nano editor", () => {
    const rows: string[] = [];
    rows.push("  GNU nano 7.2                    app.ts");
    rows.push("");
    for (let i = 0; i < 20; i++) rows.push("some code line");
    rows.push("                              [ Modified ]");
    rows.push("^G Help      ^O Write Out ^W Where Is  ^K Cut       ^T Execute");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("nano");
    expect(result.editor_mode).toBeUndefined();
  });

  it("should detect nano with Read Only indicator", () => {
    const rows: string[] = [];
    rows.push("  GNU nano 7.2                    README.md");
    rows.push("");
    for (let i = 0; i < 20; i++) rows.push("text");
    rows.push("                              [ Read Only ]");
    rows.push("^G Help      ^O Write Out ^W Where Is  ^K Cut       ^T Execute");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("nano");
  });

  // --- Htop ---

  it("should detect htop process viewer", () => {
    const rows: string[] = [];
    rows.push("  1  [|||||||||||||                     34.2%]   Tasks: 142, 342 thr; 1 running");
    rows.push("  2  [|||||||                            15.1%]   Load average: 1.23 0.89 0.67");
    rows.push("  Mem[|||||||||||||||||||||||||||||||  7.84G/16.0G]   Uptime: 3 days, 12:34:56");
    rows.push("  Swp[                                    0K/0K]");
    rows.push("");
    rows.push("  PID USER      PRI  NI  VIRT   RES   SHR S  CPU%  MEM%   TIME+  Command");
    for (let i = 0; i < 17; i++)
      rows.push(
        `  ${1000 + i}  martin    20   0  ${100 + i}M  ${50 + i}M  ${10 + i}M S  0.0  0.${i}  0:00.00 some-process`,
      );

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("htop");
    expect(result.editor_mode).toBeUndefined();
  });

  it("should detect htop from top command variant", () => {
    const rows = [
      "top - 18:30:15 up 3 days, 12:35,  2 users,  load average: 1.23, 0.89, 0.67",
      "Tasks: 142 total,   1 running, 141 sleeping,   0 stopped,   0 zombie",
      "%Cpu(s):  8.4 us,  3.2 sy,  0.0 ni, 88.0 id,  0.3 wa,  0.0 hi,  0.1 si,  0.0 st",
      "MiB Mem :  16000.0 total,   2000.0 free,   8000.0 used,   6000.0 buff/cache",
      "MiB Swap:      0.0 total,      0.0 free,      0.0 used.   7000.0 avail Mem ",
      "",
      "  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND",
    ];

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("htop");
  });

  // --- Less ---

  it("should detect less pager with (END)", () => {
    const rows: string[] = [];
    for (let i = 0; i < 22; i++) rows.push(`line ${i + 1}: some content here for the pager`);
    rows.push("(END)");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("less");
    expect(result.editor_mode).toBeUndefined();
  });

  it("should detect less pager with colon prompt", () => {
    const rows: string[] = [];
    for (let i = 0; i < 22; i++) rows.push(`line ${i + 1}: some content`);
    rows.push(":");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("less");
  });

  it("should detect less with lines indicator", () => {
    const rows: string[] = [];
    rows.push("lines 1-23/45");
    for (let i = 0; i < 20; i++) rows.push(`line ${i + 1}`);
    rows.push(":");
    rows.push("");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("less");
  });

  // --- Lazygit ---

  it("should detect lazygit", () => {
    const rows: string[] = [];
    rows.push("┌─Status──────────────────────────────────────────────────────┐");
    rows.push("│ Staged changes                                               │");
    rows.push("│  modified: src/core/screen.ts                               │");
    rows.push("│  new file: test/unit/screen.test.ts                          │");
    rows.push("│                                                              │");
    rows.push("│ Unstaged changes                                             │");
    rows.push("│  modified: package.json                                      │");
    rows.push("└──────────────────────────────────────────────────────────────┘");
    rows.push("┌─Files───────────────────────────────────────────────────────┐");
    rows.push("│  M src/core/screen.ts                                        │");
    rows.push("│ ?? test/unit/screen.test.ts                                  │");
    rows.push("│  M package.json                                               │");
    rows.push("└──────────────────────────────────────────────────────────────┘");
    rows.push("Press ? for help, q to quit");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("lazygit");
    expect(result.editor_mode).toBeUndefined();
  });

  it("should detect lazygit from panel headers without borders", () => {
    const rows: string[] = [];
    rows.push("Status                                  ");
    rows.push("Staged changes                           ");
    rows.push(" modified: src/core/screen.ts            ");
    rows.push("");
    rows.push("Files                                    ");
    rows.push(" M src/core/screen.ts                    ");
    rows.push(" ?? test/unit/screen.test.ts             ");
    rows.push("");
    rows.push("lazygit v0.40.2                          ");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("lazygit");
  });

  // --- Empty / Unknown ---

  it("should detect empty rows as unknown", () => {
    const rows: string[] = ["", "", "", ""];
    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("unknown");
    expect(result.status_line).toBeNull();
    expect(result.content_rows).toHaveLength(0);
  });

  it("should detect single blank row as unknown", () => {
    const rows = [""];
    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("unknown");
    expect(result.status_line).toBeNull();
  });

  // --- False positive avoidance ---

  it("should NOT detect vim when ~ appears in a path not at column 0", () => {
    const rows = ["$ ls ~/.config/terminalize/", "config.yaml", "state.db", "$ "];
    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("shell");
    expect(result.terminal_mode).not.toBe("vim");
  });

  it("should NOT detect vim with one tilde but no status bar", () => {
    const rows: string[] = [];
    rows.push("~");
    for (let i = 0; i < 21; i++) rows.push(`line ${i}`);
    rows.push("");
    rows.push("");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).not.toBe("vim");
  });

  it("should NOT detect vim with only status bar but no tildes at col 0", () => {
    const rows: string[] = [];
    for (let i = 0; i < 22; i++) rows.push(`line ${i}: some content`);
    rows.push('"file.txt" 45L, 1200B');

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).not.toBe("vim");
  });

  // --- status_line edge cases ---

  it("should return null status_line when fewer than 2 non-empty rows", () => {
    const rows = ["$ "];
    const result = analyzeScreen(rows);
    expect(result.status_line).toBeNull();
    expect(result.content_rows).toEqual([]);
  });

  it("should return null status_line for all blank rows", () => {
    const rows = ["", "", "", ""];
    const result = analyzeScreen(rows);
    expect(result.status_line).toBeNull();
  });

  it("should return last non-empty row as status_line (shell)", () => {
    const rows = ["$ ls", "file1.txt", "file2.txt", "", "$ "];
    const result = analyzeScreen(rows);
    expect(result.status_line).toBe("$ ");
    expect(result.content_rows).toEqual(["$ ls", "file1.txt", "file2.txt", ""]);
  });

  // --- content_rows ---

  it("should exclude status line from content_rows", () => {
    const rows: string[] = [];
    for (let i = 0; i < 10; i++) rows.push(`line ${i}`);
    rows.push("-- INSERT --");

    const result = analyzeScreen(rows);
    expect(result.content_rows).toHaveLength(10);
    expect(result.content_rows).not.toContain("-- INSERT --");
    expect(result.status_line).toBe("-- INSERT --");
  });

  // --- Multi-signal verification per spec ---

  it("should require multi-signal: single vim signal does not trigger", () => {
    // Has tildes but no vim status line
    const rows: string[] = [];
    rows.push("~");
    rows.push("~");
    rows.push("~");
    for (let i = 0; i < 19; i++) rows.push("");

    const result = analyzeScreen(rows);
    // Should NOT be vim — missing the status bar signal
    expect(result.terminal_mode).not.toBe("vim");
  });

  it("should require multi-signal: single nano signal does not trigger", () => {
    // Has "^G" in last row but no header
    const rows: string[] = [];
    rows.push("some random text");
    rows.push("more text");
    rows.push("^G Help");
    rows.push("another line");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).not.toBe("nano");
  });

  it("should require multi-signal: single htop signal does not trigger", () => {
    // Has %CPU but no memory header
    const rows: string[] = [];
    rows.push("  PID USER      %CPU");
    rows.push("  1   root      0.0");
    rows.push("  2   root      0.0");

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).not.toBe("htop");
  });

  // --- Less should not be triggered when vim is present ---

  it("should prefer vim over less when both signals present", () => {
    const rows: string[] = [];
    for (let i = 0; i < 10; i++) rows.push("some vim content");
    for (let i = 0; i < 12; i++) rows.push("~");
    // Both vim signals + less-like colon at bottom
    rows.push('"file.txt" 10L, 300B');

    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("vim");
  });

  // --- editor_mode should only be present for vim ---

  it("should not set editor_mode for non-vim terminals", () => {
    const rows = ["$ ls", "file.txt", "$ "];
    const result = analyzeScreen(rows);
    expect(result.terminal_mode).toBe("shell");
    expect(result.editor_mode).toBeUndefined();
  });
});
