import { describe, expect, it } from "vitest";
import {
  buildBufferProfileScenarios,
  formatBufferProfileTable,
  summarizeBufferProfileRows,
} from "../../scripts/profile-output-buffer.mjs";

describe("buffer profiling", () => {
  it("should define a sustained-output baseline and a compacted profile", () => {
    const scenarios = buildBufferProfileScenarios();

    expect(scenarios).toHaveLength(2);
    expect(scenarios[0]?.name).toBe("default cap");
    expect(scenarios[1]?.name).toBe("periodic compact");
    expect(scenarios[0]?.totalBytes).toBe(scenarios[1]?.totalBytes);
  });

  it("should summarize retained-byte savings between scenarios", () => {
    const summary = summarizeBufferProfileRows([
      { name: "default cap", retainedBytes: 1024, retainedPercent: 25, durationMs: 10 },
      { name: "periodic compact", retainedBytes: 256, retainedPercent: 6.25, durationMs: 8 },
    ]);

    expect(summary.savedBytes).toBe(768);
    expect(summary.savedPercent).toBe(75);
  });

  it("should format a readable profile table", () => {
    const table = formatBufferProfileTable([
      {
        name: "default cap",
        totalBytes: 4096,
        retainedBytes: 1024,
        retainedPercent: 25,
        durationMs: 5.432,
        rssDeltaKiB: 12,
      },
    ]);

    expect(table).toContain("Scenario");
    expect(table).toContain("Retained");
    expect(table).toContain("default cap");
  });
});
