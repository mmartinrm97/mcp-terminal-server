import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseChecksumLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const match = /^([a-fA-F0-9]{64}) [ *](.+)$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid checksum line: ${line}`);
  }

  return {
    expectedHash: match[1].toLowerCase(),
    filePath: match[2],
  };
}

function sha256OfFile(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

const checksumsPath = resolve(process.argv[2] ?? "artifacts/SHASUMS256.txt");
if (!existsSync(checksumsPath)) {
  throw new Error(`Checksums file not found: ${checksumsPath}`);
}

const baseDir = dirname(checksumsPath);
const lines = readFileSync(checksumsPath, "utf8").split(/\r?\n/);
const entries = lines.map(parseChecksumLine).filter(Boolean);

if (entries.length === 0) {
  throw new Error(`No checksum entries found in ${checksumsPath}`);
}

for (const entry of entries) {
  const artifactPath = resolve(baseDir, entry.filePath);

  if (!existsSync(artifactPath)) {
    throw new Error(`Artifact missing: ${artifactPath}`);
  }

  const actualHash = sha256OfFile(artifactPath);
  if (actualHash !== entry.expectedHash) {
    throw new Error(
      `Checksum mismatch for ${artifactPath}: expected ${entry.expectedHash}, got ${actualHash}`,
    );
  }
}

console.log(`Verified ${entries.length} artifact checksum(s) from ${checksumsPath}`);
