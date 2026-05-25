import { performance } from "node:perf_hooks";

const KIB = 1024;
const MIB = 1024 * 1024;

export function buildBufferProfileScenarios() {
  return [
    {
      name: "default cap",
      maxSize: MIB,
      totalBytes: 8 * MIB,
      chunkBytes: 4096,
      compactEvery: null,
    },
    {
      name: "periodic compact",
      maxSize: MIB,
      totalBytes: 8 * MIB,
      chunkBytes: 4096,
      compactEvery: 64,
    },
  ];
}

export function summarizeBufferProfileRows(rows) {
  const baseline = rows[0];
  const optimized = rows[1];
  const savedBytes = baseline.retainedBytes - optimized.retainedBytes;
  const savedPercent =
    baseline.retainedBytes === 0
      ? 0
      : Number(((savedBytes / baseline.retainedBytes) * 100).toFixed(1));
  return { savedBytes, savedPercent };
}

export function formatBufferProfileTable(rows) {
  const headers = ["Scenario", "Written", "Retained", "Retained %", "RSS Δ", "Duration"];
  const data = rows.map((row) => [
    row.name,
    formatBytes(row.totalBytes),
    formatBytes(row.retainedBytes),
    `${row.retainedPercent.toFixed(1)}%`,
    `${row.rssDeltaKiB} KiB`,
    `${row.durationMs.toFixed(3)} ms`,
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

export async function runBufferProfiles() {
  const { OutputBuffer } = await import("../dist/core/output-buffer.js");
  const rows = [];

  for (const scenario of buildBufferProfileScenarios()) {
    const buffer = new OutputBuffer(scenario.maxSize);
    const chunk = "X".repeat(scenario.chunkBytes - 1) + "\n";
    const iterations = Math.floor(scenario.totalBytes / scenario.chunkBytes);
    const heapBefore = process.memoryUsage().rss;
    const start = performance.now();

    for (let index = 0; index < iterations; index++) {
      buffer.append(chunk);

      if (scenario.compactEvery !== null && (index + 1) % scenario.compactEvery === 0) {
        buffer.readAll();
        buffer.compact();
      }
    }

    const durationMs = performance.now() - start;
    const heapAfter = process.memoryUsage().rss;
    rows.push({
      name: scenario.name,
      totalBytes: buffer.position,
      retainedBytes: buffer.size,
      retainedPercent: Number(((buffer.size / buffer.position) * 100).toFixed(1)),
      durationMs,
      rssDeltaKiB: Math.max(0, Math.round((heapAfter - heapBefore) / KIB)),
    });
  }

  return {
    rows,
    summary: summarizeBufferProfileRows(rows),
  };
}

function formatBytes(bytes) {
  if (bytes >= MIB) {
    return `${(bytes / MIB).toFixed(2)} MiB`;
  }
  return `${Math.round(bytes / KIB)} KiB`;
}

async function main() {
  const profile = await runBufferProfiles();
  console.log("terminalize output-buffer profile (sustained session simulation)");
  console.log(formatBufferProfileTable(profile.rows));
  console.log("\nRetention savings:");
  console.log(`- ${formatBytes(profile.summary.savedBytes)} less retained output`);
  console.log(`- ${profile.summary.savedPercent}% lower retained buffer footprint`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  await main();
}
