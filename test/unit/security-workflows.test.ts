import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readWorkflow(name: string): string {
  const workflowPath = join(process.cwd(), ".github", "workflows", name);
  return readFileSync(workflowPath, "utf8");
}

describe("security workflows", () => {
  it("should scan for leaked secrets in CI", () => {
    const workflow = readWorkflow("secret-scan.yml");

    expect(workflow).toContain("gitleaks/gitleaks-action@f586c14365d4643c6aa59d472ae6e984bf47bb34");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("contents: read");
  });

  it("should review dependency changes in pull requests", () => {
    const workflow = readWorkflow("dependency-review.yml");

    expect(workflow).toContain(
      "actions/dependency-review-action@56339e523c0409420f6c2c9a2f4292bbb3c07dd3",
    );
    expect(workflow).toContain("fail-on-severity: high");
    expect(workflow).toContain("pull_request:");
  });

  it("should publish with npm provenance in the release workflow", () => {
    const workflow = readWorkflow("release.yml");

    expect(workflow).toContain("pnpm publish --provenance --no-git-checks");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
  });
});
