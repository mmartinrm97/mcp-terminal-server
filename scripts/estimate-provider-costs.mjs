import { buildPayloadBenchmarks } from "./benchmark-payloads.mjs";

const APPROX_BYTES_PER_TOKEN = 4;
const CALLS_PER_SCENARIO = 1000;

export const pricingSnapshot = {
  asOf: "2026-05-21",
  models: [
    {
      provider: "OpenAI",
      model: "GPT-5.4",
      inputUsdPerMillionTokens: 2.5,
      source: "https://openai.com/api/pricing/",
      note: "Uses input-token pricing only because MCP tool output becomes the model's next input.",
    },
    {
      provider: "Anthropic",
      model: "Claude Sonnet 4",
      inputUsdPerMillionTokens: 3,
      source: "https://docs.anthropic.com/en/docs/about-claude/pricing",
      note: "Base input pricing; long-context premium not applied here.",
    },
    {
      provider: "Google",
      model: "Gemini 2.5 Pro",
      inputUsdPerMillionTokens: 1.25,
      source: "https://ai.google.dev/gemini-api/docs/pricing?hl=es-419",
      note: "Assumes prompts <= 200K tokens, standard pricing tier.",
    },
  ],
};

function estimateTokensFromBytes(bytes) {
  return Math.ceil(bytes / APPROX_BYTES_PER_TOKEN);
}

function estimateCostUsd(tokens, inputUsdPerMillionTokens) {
  return (tokens / 1_000_000) * inputUsdPerMillionTokens;
}

export function buildProviderCostEstimates() {
  const payloadRows = buildPayloadBenchmarks();

  return pricingSnapshot.models.flatMap((model) =>
    payloadRows.map((payload) => {
      const beforeTokens = estimateTokensFromBytes(payload.beforeBytes) * CALLS_PER_SCENARIO;
      const afterTokens = estimateTokensFromBytes(payload.afterBytes) * CALLS_PER_SCENARIO;
      const beforeCostUsd = estimateCostUsd(beforeTokens, model.inputUsdPerMillionTokens);
      const afterCostUsd = estimateCostUsd(afterTokens, model.inputUsdPerMillionTokens);
      const savedCostUsd = beforeCostUsd - afterCostUsd;

      return {
        provider: model.provider,
        model: model.model,
        tool: payload.tool,
        scenario: payload.scenario,
        beforeTokens,
        afterTokens,
        beforeCostUsd: Number(beforeCostUsd.toFixed(6)),
        afterCostUsd: Number(afterCostUsd.toFixed(6)),
        savedCostUsd: Number(savedCostUsd.toFixed(6)),
        calls: CALLS_PER_SCENARIO,
        source: model.source,
        note: model.note,
      };
    }),
  );
}

export function formatProviderCostTable(rows) {
  const headers = ["Provider", "Model", "Tool", "Saved / 1k calls"];
  const data = rows.map((row) => [
    row.provider,
    row.model,
    row.tool,
    `$${row.savedCostUsd.toFixed(6)}`,
  ]);
  const widths = headers.map((header, columnIndex) =>
    Math.max(header.length, ...data.map((row) => row[columnIndex].length)),
  );
  const formatRow = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index], " ")).join("  ");

  return [
    formatRow(headers),
    formatRow(widths.map((width) => "-".repeat(width))),
    ...data.map(formatRow),
  ].join("\n");
}

function main() {
  const rows = buildProviderCostEstimates();
  console.log("terminalize cost estimate benchmark (approximate model input cost)");
  console.log(`Pricing snapshot as of ${pricingSnapshot.asOf}`);
  console.log(formatProviderCostTable(rows));
  console.log("\nAssumptions:");
  console.log(`- ~${APPROX_BYTES_PER_TOKEN} UTF-8 bytes per token approximation`);
  console.log(`- ${CALLS_PER_SCENARIO} tool responses per scenario`);
  console.log("- estimates use input-token pricing only");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main();
}
