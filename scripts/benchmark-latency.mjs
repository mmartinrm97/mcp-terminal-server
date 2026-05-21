import { performance } from "node:perf_hooks";

const iterationsDefault = 2000;

function createMockSession() {
  return {
    readUntil: async () => ({
      data: "PROMPT1:",
      fullOutput: "PROMPT1:",
      matched: "PROMPT1:",
      ended: false,
      exit_code: null,
      timed_out: false,
      detected_prompt: "PROMPT1:",
      prompt_category: "text",
      should_ask_user: false,
      ask_user_reason: null,
      can_accept_default: true,
      recommended_next_action: "input_required",
      debug: {
        session_id: "bench-session",
        pattern: "PROMPT1:",
        timeout_ms: 30000,
        idle_ms: 0,
        last_output_at: null,
        output_bytes: 8,
      },
    }),
    screenshot: () => ({
      text: "PROMPT1:",
      isInteractive: true,
      detectedPrompt: "PROMPT1:",
      promptCategory: "text",
      shouldAskUser: false,
      askUserReason: null,
      canAcceptDefault: true,
      recommendedNextAction: "input_required",
      terminal_mode: "shell",
      editor_mode: undefined,
    }),
  };
}

function createMockSessionManager() {
  const session = createMockSession();
  return {
    writeToSession: () => 9,
    getSession: () => session,
    activeCount: 1,
  };
}

export function summarizeLatencyRows(rows) {
  const legacy = rows[0];
  const execute = rows[1];
  const savedMs = Number((legacy.durationMs - execute.durationMs).toFixed(3));
  const savedPercent = Number(((savedMs / legacy.durationMs) * 100).toFixed(1));
  return { savedMs, savedPercent };
}

export function formatLatencyBenchmarkTable(rows) {
  const headers = ["Scenario", "Duration", "Calls"];
  const data = rows.map((row) => [
    row.name,
    `${row.durationMs.toFixed(3)} ms`,
    String(row.callCount),
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

async function runLegacyHandlerBenchmark(handleCallTool, iterations) {
  const sm = createMockSessionManager();
  const start = performance.now();
  for (let index = 0; index < iterations; index++) {
    await handleCallTool(sm, {
      name: "terminal_write",
      arguments: { id: "bench-session", data: "alpha\n" },
    });
    await handleCallTool(sm, {
      name: "terminal_read_until",
      arguments: { id: "bench-session", pattern: "PROMPT1:" },
    });
  }
  return {
    name: "legacy handler flow",
    durationMs: performance.now() - start,
    callCount: iterations * 2,
  };
}

async function runExecuteHandlerBenchmark(handleCallTool, iterations) {
  const sm = createMockSessionManager();
  const start = performance.now();
  for (let index = 0; index < iterations; index++) {
    await handleCallTool(sm, {
      name: "terminal_execute",
      arguments: { id: "bench-session", data: "alpha\n", await_pattern: "PROMPT1:" },
    });
  }
  return {
    name: "composite handler flow",
    durationMs: performance.now() - start,
    callCount: iterations,
  };
}

export async function runLatencyBenchmarks(iterations = iterationsDefault) {
  const { handleCallTool } = await import("../dist/server.js");
  const legacy = await runLegacyHandlerBenchmark(handleCallTool, iterations);
  const execute = await runExecuteHandlerBenchmark(handleCallTool, iterations);
  return {
    rows: [legacy, execute],
    summary: summarizeLatencyRows([legacy, execute]),
    iterations,
  };
}

async function main() {
  const benchmark = await runLatencyBenchmarks();
  console.log("terminalize latency benchmark (local MCP handler loop)");
  console.log(`Iterations per scenario: ${benchmark.iterations}`);
  console.log(formatLatencyBenchmarkTable(benchmark.rows));
  console.log("\nSavings:");
  console.log(`- ${benchmark.summary.savedMs.toFixed(3)} ms faster locally`);
  console.log(
    `- ${benchmark.summary.savedPercent}% lower local handler latency in this synthetic loop`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  await main();
}
