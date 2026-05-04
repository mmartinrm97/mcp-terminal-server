// Wrapper for sonarqube-scanner that reads SONAR_TOKEN from .env
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

config({ path: resolve(rootDir, ".env") });

const token = process.env.SONAR_TOKEN;

if (!token) {
  console.error("❌ SONAR_TOKEN is not set in .env file.");
  console.error("   Generate one at http://localhost:9000/account/security");
  process.exit(1);
}

execSync(`npx sonarqube-scanner -Dsonar.token=${token}`, {
  stdio: "inherit",
  cwd: rootDir,
});
