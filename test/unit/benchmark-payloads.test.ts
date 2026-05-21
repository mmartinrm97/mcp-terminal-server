import { describe, expect, it } from "vitest";
import {
  buildPayloadBenchmarks,
  formatBenchmarkTable,
  measureJsonBytes,
} from "../../scripts/benchmark-payloads.mjs";

describe("payload benchmarks", () => {
  it("should measure serialized json bytes", () => {
    expect(measureJsonBytes({ ok: true })).toBeGreaterThan(0);
  });

  it("should report savings for every benchmark row", () => {
    const rows = buildPayloadBenchmarks();

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.beforeBytes).toBeGreaterThan(row.afterBytes);
      expect(row.savedBytes).toBe(row.beforeBytes - row.afterBytes);
      expect(row.savedPercent).toBeGreaterThan(0);
    }
  });

  it("should format a readable benchmark table", () => {
    const table = formatBenchmarkTable(buildPayloadBenchmarks());

    expect(table).toContain("terminal_read_until");
    expect(table).toContain("terminal_screenshot");
    expect(table).toContain("terminal_list_sessions");
  });
});
