import { Buffer } from "node:buffer";
import { pathToFileURL } from "node:url";

const ansiChunk = "\u001b[?25l\r\n\u001b[225l\r\n";
const visibleText = [
  "npm init",
  "This utility will walk you through creating a package.json file.",
  "package name: (terminalize-proof)",
  "version: (1.0.0)",
  "description:",
].join("\n");

const readUntilData = `${ansiChunk}${visibleText}\n`;
const readUntilFullOutput = `${ansiChunk.repeat(3)}${visibleText}\nAbout to write to package.json\n`;
const strippedReadUntilData = visibleText + "\n";

const screenshotRows = [
  "marti ▸ mcp-terminal-server ▸ main",
  "npm init",
  "This utility will walk you through creating a package.json file.",
  "package name: (terminalize-proof)",
  "version: (1.0.0)",
  "description:",
  "",
  "",
];

const sessionInfoVerbose = {
  id: "session-123",
  label: null,
  shell: "pwsh",
  cwd: "D:/CURSOS/Proyectos/mcp-terminal-server",
  cols: 100,
  rows: 30,
  created_at: "2026-05-21T20:00:00.000Z",
  last_activity: "2026-05-21T20:00:04.250Z",
  last_output_at: "2026-05-21T20:00:04.200Z",
  idle_ms: 1250,
  output_bytes: 18314,
  alive: true,
};

const sessionInfoCompact = {
  id: sessionInfoVerbose.id,
  label: sessionInfoVerbose.label,
  shell: sessionInfoVerbose.shell,
  cwd: sessionInfoVerbose.cwd,
  cols: sessionInfoVerbose.cols,
  rows: sessionInfoVerbose.rows,
  alive: sessionInfoVerbose.alive,
};

export function measureJsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function buildPayloadBenchmarks() {
  const legacyReadUntil = {
    data: readUntilData,
    full_output: readUntilFullOutput,
    matched: null,
    ended: false,
    exit_code: null,
    timed_out: true,
    debug: {
      session_id: "session-123",
      pattern: "package name:",
      timeout_ms: 30000,
      idle_ms: 1323,
      last_output_at: "2026-05-21T20:00:04.200Z",
      output_bytes: 18314,
    },
  };

  const compactReadUntil = {
    data: strippedReadUntilData,
    matched: null,
    ended: false,
    exit_code: null,
    timed_out: true,
    detected_prompt: "package name: (terminalize-proof)",
    prompt_category: "text",
    should_ask_user: false,
    ask_user_reason: null,
    can_accept_default: true,
    recommended_next_action: "input_required",
  };

  const legacyScreenshot = {
    rows: screenshotRows,
    cursorRow: 5,
    cursorCol: 14,
    cols: 100,
    rowsCount: 30,
    text: screenshotRows.join("\n"),
    outputBytes: 18314,
    lastOutputAt: "2026-05-21T20:00:04.200Z",
    idleMs: 1323,
    isInteractive: true,
    detectedPrompt: "package name: (terminalize-proof)",
    promptCategory: "text",
    shouldAskUser: false,
    askUserReason: null,
    canAcceptDefault: true,
    recommendedNextAction: "input_required",
    terminal_mode: "shell",
    editor_mode: undefined,
    status_line: null,
    content_rows: screenshotRows.filter(Boolean),
  };

  const compactScreenshot = {
    text: screenshotRows.join("\n"),
    isInteractive: true,
    detectedPrompt: "package name: (terminalize-proof)",
    recommendedNextAction: "input_required",
    terminal_mode: "shell",
    editor_mode: undefined,
  };

  const legacyListSessions = {
    sessions: Array.from({ length: 5 }, (_, index) => ({
      ...sessionInfoVerbose,
      id: `session-${index + 1}`,
    })),
  };

  const compactListSessions = {
    sessions: Array.from({ length: 5 }, (_, index) => ({
      ...sessionInfoCompact,
      id: `session-${index + 1}`,
    })),
  };

  return [
    {
      tool: "terminal_read_until",
      scenario: "legacy default -> compact default",
      beforeBytes: measureJsonBytes(legacyReadUntil),
      afterBytes: measureJsonBytes(compactReadUntil),
    },
    {
      tool: "terminal_screenshot",
      scenario: "legacy verbose -> minimal default",
      beforeBytes: measureJsonBytes(legacyScreenshot),
      afterBytes: measureJsonBytes(compactScreenshot),
    },
    {
      tool: "terminal_list_sessions",
      scenario: "verbose session list -> compact default",
      beforeBytes: measureJsonBytes(legacyListSessions),
      afterBytes: measureJsonBytes(compactListSessions),
    },
  ].map((row) => {
    const savedBytes = row.beforeBytes - row.afterBytes;
    const savedPercent =
      row.beforeBytes === 0 ? 0 : Number(((savedBytes / row.beforeBytes) * 100).toFixed(1));
    return {
      ...row,
      savedBytes,
      savedPercent,
    };
  });
}

export function formatBenchmarkTable(rows) {
  const headers = ["Tool", "Scenario", "Before", "After", "Saved", "%"];
  const data = rows.map((row) => [
    row.tool,
    row.scenario,
    `${row.beforeBytes} B`,
    `${row.afterBytes} B`,
    `${row.savedBytes} B`,
    `${row.savedPercent}%`,
  ]);
  const widths = headers.map((header, columnIndex) =>
    Math.max(header.length, ...data.map((row) => row[columnIndex].length)),
  );
  const formatRow = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index], " ")).join("  ");

  return [
    formatRow(headers),
    formatRow(widths.map((width) => "-".repeat(width))),
    ...data.map(formatRow),
  ].join("\n");
}

function main() {
  const rows = buildPayloadBenchmarks();
  console.log("terminalize payload benchmark (serialized JSON bytes)");
  console.log(formatBenchmarkTable(rows));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
