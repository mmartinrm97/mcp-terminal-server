import { describe, expect, it } from "vitest";
import { buildWorkflowBenchmarks } from "../../scripts/benchmark-workflows.mjs";

describe("workflow benchmarks", () => {
  it("should show fewer MCP calls for execute-based flows", () => {
    const rows = buildWorkflowBenchmarks();
    const promptFlow = rows.find((row) => row.name === "prompt-by-prompt flow");

    expect(promptFlow).toBeDefined();
    expect(promptFlow.beforeCalls).toBeGreaterThan(promptFlow.afterCalls);
    expect(promptFlow.savedCalls).toBe(promptFlow.beforeCalls - promptFlow.afterCalls);
  });

  it("should report percentage savings", () => {
    const rows = buildWorkflowBenchmarks();

    for (const row of rows) {
      expect(row.savedPercent).toBeGreaterThan(0);
    }
  });
});
