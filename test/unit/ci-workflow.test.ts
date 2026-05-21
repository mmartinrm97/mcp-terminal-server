import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readCiWorkflow(): string {
  const workflowPath = join(process.cwd(), ".github", "workflows", "ci.yml");
  return readFileSync(workflowPath, "utf8");
}

describe("CI dependency hygiene", () => {
  it("should run frozen installs in CI", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain("pnpm install --frozen-lockfile");
  });

  it("should run dependency audit in CI", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain("pnpm audit:deps");
  });
});
