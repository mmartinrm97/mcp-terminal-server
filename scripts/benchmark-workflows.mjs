export function buildWorkflowBenchmarks() {
  const scenarios = [
    {
      name: "prompt-by-prompt flow",
      description:
        "create session, start command, answer 4 prompts, wait for completion, close session",
      beforeCalls: 11,
      afterCalls: 7,
    },
    {
      name: "single confirmation flow",
      description: "run command, wait for one confirmation, submit answer, wait for completion",
      beforeCalls: 5,
      afterCalls: 4,
    },
  ];

  return scenarios.map((scenario) => {
    const savedCalls = scenario.beforeCalls - scenario.afterCalls;
    const savedPercent = Number(((savedCalls / scenario.beforeCalls) * 100).toFixed(1));
    return {
      ...scenario,
      savedCalls,
      savedPercent,
    };
  });
}

export function formatWorkflowBenchmarkTable(rows) {
  const headers = ["Scenario", "Before", "After", "Saved", "%"];
  const data = rows.map((row) => [
    row.name,
    String(row.beforeCalls),
    String(row.afterCalls),
    String(row.savedCalls),
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
  const rows = buildWorkflowBenchmarks();
  console.log("terminalize workflow benchmark (MCP round-trips)");
  console.log(formatWorkflowBenchmarkTable(rows));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main();
}
