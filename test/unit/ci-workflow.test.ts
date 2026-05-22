import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readCiWorkflow(): string {
  const workflowPath = join(process.cwd(), ".github", "workflows", "ci.yml");
  return readFileSync(workflowPath, "utf8");
}

describe("CI dependency hygiene", () => {
  it("should declare least-privilege workflow permissions", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
  });

  it("should run frozen installs in CI", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain("pnpm install --frozen-lockfile");
  });

  it("should run dependency audit in CI", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain("pnpm audit:deps");
  });

  it("should pin core GitHub actions by commit SHA", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain("actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683");
    expect(workflow).toContain("pnpm/action-setup@9fd676a19091d4595eefd76e4bd31c97133911f1");
    expect(workflow).toContain("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020");
  });
});
