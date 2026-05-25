import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ADVANCED_TOOL_NAMES,
  CORE_TOOL_NAMES,
  TOOL_DEFINITIONS,
} from "../../src/server/tool-definitions.js";

function readApiContract(): string {
  return readFileSync(join(process.cwd(), "docs", "API-CONTRACT.md"), "utf8");
}

describe("public tool contract", () => {
  it("should classify every public tool into exactly one support tier", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(14);
    expect(CORE_TOOL_NAMES).toHaveLength(11);
    expect(ADVANCED_TOOL_NAMES).toHaveLength(3);

    const allNames = TOOL_DEFINITIONS.map((tool) => tool.name);
    const uniqueNames = new Set(allNames);

    expect(uniqueNames.size).toBe(allNames.length);
    expect(new Set([...CORE_TOOL_NAMES, ...ADVANCED_TOOL_NAMES]).size).toBe(allNames.length);
  });

  it("should keep the diagnostics surface in the advanced tier", () => {
    expect(ADVANCED_TOOL_NAMES).toEqual([
      "terminal_ping",
      "terminal_session_diagnostics",
      "terminal_session_export",
    ]);
  });

  it("should publish the same stable tool contract in docs", () => {
    const contract = readApiContract();

    for (const toolName of CORE_TOOL_NAMES) {
      expect(contract).toContain(toolName);
    }

    for (const toolName of ADVANCED_TOOL_NAMES) {
      expect(contract).toContain(toolName);
    }

    expect(contract).toContain("major version");
    expect(contract).toContain("Core tools");
    expect(contract).toContain("Advanced tools");
  });
});
