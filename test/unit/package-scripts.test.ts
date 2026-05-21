import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageJson {
  scripts?: Record<string, string>;
}

function readPackageJson(): PackageJson {
  const packageJsonPath = join(process.cwd(), "package.json");
  const raw = readFileSync(packageJsonPath, "utf8");
  return JSON.parse(raw) as PackageJson;
}

describe("package.json test scripts", () => {
  it("should run unit tests with aggressive parallelism", () => {
    const scripts = readPackageJson().scripts ?? {};

    expect(scripts["test:unit"]).toContain("--maxWorkers=100%");
  });

  it("should keep PTY integration tests conservative", () => {
    const scripts = readPackageJson().scripts ?? {};

    expect(scripts["test:int"]).toContain("--maxWorkers=1");
    expect(scripts["test:int"]).toContain("--no-file-parallelism");
    expect(scripts["test:smoke"]).toContain("--maxWorkers=1");
    expect(scripts["test:smoke"]).toContain("--no-file-parallelism");
  });

  it("should expose a dedicated dependency audit script", () => {
    const scripts = readPackageJson().scripts ?? {};

    expect(scripts["audit:deps"]).toBe("pnpm audit");
  });

  it("should expose benchmark scripts for payload, workflow, latency, and cost", () => {
    const scripts = readPackageJson().scripts ?? {};

    expect(scripts["bench:payload"]).toBe("node scripts/benchmark-payloads.mjs");
    expect(scripts["bench:workflow"]).toBe("node scripts/benchmark-workflows.mjs");
    expect(scripts["bench:latency"]).toBe("pnpm build && node scripts/benchmark-latency.mjs");
    expect(scripts["bench:cost"]).toBe("node scripts/estimate-provider-costs.mjs");
  });
});
