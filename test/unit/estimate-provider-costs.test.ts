import { describe, expect, it } from "vitest";
import { buildProviderCostEstimates } from "../../scripts/estimate-provider-costs.mjs";

describe("provider cost estimates", () => {
  it("should estimate lower cost for compact payloads", () => {
    const rows = buildProviderCostEstimates();
    const screenshot = rows.find(
      (row) =>
        row.provider === "OpenAI" && row.model === "GPT-5.4" && row.tool === "terminal_screenshot",
    );

    expect(screenshot).toBeDefined();
    expect(screenshot.beforeCostUsd).toBeGreaterThan(screenshot.afterCostUsd);
    expect(screenshot.savedCostUsd).toBeGreaterThan(0);
  });

  it("should include all configured providers", () => {
    const rows = buildProviderCostEstimates();
    const providers = new Set(rows.map((row) => row.provider));

    expect(providers.has("OpenAI")).toBe(true);
    expect(providers.has("Anthropic")).toBe(true);
    expect(providers.has("Google")).toBe(true);
  });
});
