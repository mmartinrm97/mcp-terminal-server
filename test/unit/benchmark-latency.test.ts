import { describe, expect, it } from "vitest";
import {
  formatLatencyBenchmarkTable,
  summarizeLatencyRows,
} from "../../scripts/benchmark-latency.mjs";

describe("latency benchmarks", () => {
  it("should compute latency savings summary", () => {
    const rows = summarizeLatencyRows([
      { name: "legacy", durationMs: 1200 },
      { name: "execute", durationMs: 900 },
    ]);

    expect(rows.savedMs).toBe(300);
    expect(rows.savedPercent).toBe(25);
  });

  it("should format a readable latency table", () => {
    const table = formatLatencyBenchmarkTable([
      { name: "legacy", durationMs: 1200 },
      { name: "execute", durationMs: 900 },
    ]);

    expect(table).toContain("legacy");
    expect(table).toContain("execute");
    expect(table).toContain("Duration");
  });
});
