import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

function sha256OfFile(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

const inputDir = resolve(process.argv[2] ?? "artifacts");
const outputPath = resolve(process.argv[3] ?? `${inputDir}/SHASUMS256.txt`);

const files = readdirSync(inputDir)
  .map((name) => resolve(inputDir, name))
  .filter((filePath) => statSync(filePath).isFile())
  .filter((filePath) => filePath.endsWith(".tgz") || filePath.endsWith(".cdx.json"));

if (files.length === 0) {
  throw new Error(`No releasable artifacts found in ${inputDir}`);
}

const lines = files.map((filePath) => `${sha256OfFile(filePath)} *${basename(filePath)}`);
writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");

console.log(`Wrote SHA256 checksums for ${files.length} artifact(s) to ${outputPath}`);
