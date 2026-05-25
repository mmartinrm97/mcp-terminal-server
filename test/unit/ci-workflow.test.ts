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

    expect(workflow).toContain("actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd");
    expect(workflow).toContain("actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444");
    expect(workflow).toContain("corepack prepare pnpm@10.33.2 --activate");
  });
});
