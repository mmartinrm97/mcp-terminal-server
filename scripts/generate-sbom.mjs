import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

function readOutputPath() {
  const outputFlagIndex = process.argv.indexOf("--output");
  if (outputFlagIndex >= 0) {
    const value = process.argv[outputFlagIndex + 1];
    if (!value) {
      throw new Error("Missing value for --output");
    }
    return resolve(value);
  }

  return resolve("artifacts/terminalize.cdx.json");
}

function scrubEnvironment() {
  const safeEnv = { ...process.env };
  delete safeEnv.NODE_PATH;

  for (const key of Object.keys(safeEnv)) {
    if (/(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY)$/i.test(key)) {
      delete safeEnv[key];
    }
  }

  return safeEnv;
}

const outputPath = readOutputPath();
mkdirSync(dirname(outputPath), { recursive: true });

const cdxgenCliPath = resolve("node_modules", "@cyclonedx", "cdxgen", "bin", "cdxgen.js");

execFileSync(
  process.execPath,
  [
    cdxgenCliPath,
    "--type",
    "npm",
    "--spec-version",
    "1.7",
    "--no-install-deps",
    "--no-babel",
    "--output",
    outputPath,
    ".",
  ],
  {
    cwd: process.cwd(),
    env: scrubEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  },
);

console.log(`Wrote CycloneDX SBOM to ${outputPath}`);
