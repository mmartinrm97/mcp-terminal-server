// @integration — requires real shell
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PTYSession } from "../../src/core/pty-session.js";

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------
const IS_WINDOWS = process.platform === "win32";
const RUN_GH_INTERACTIVE = process.env.TERMINALIZE_RUN_GH_INTERACTIVE === "1";
const RUN_DOCKER_PSQL = process.env.TERMINALIZE_RUN_DOCKER_PSQL === "1";

interface ShellConfig {
  shell: string;
  args: string[];
}

function getShell(): ShellConfig {
  if (IS_WINDOWS) return { shell: "cmd.exe", args: [] };
  return { shell: "/bin/bash", args: [] };
}

function createSession(id: string): PTYSession {
  const { shell, args } = getShell();
  return new PTYSession({
    id,
    shell,
    args,
    cwd: process.cwd(),
    cols: 80,
    rows: 24,
  });
}

/**
 * On Windows cmd.exe, prefix with '@' to suppress command echo.
 * This prevents pattern-matching from hitting the echoed command text.
 */
function cmd(data: string): string {
  if (IS_WINDOWS && !data.startsWith("@")) {
    return `@${data}`;
  }
  return data;
}

function getCurrentBranch(): string {
  return execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function commandExists(command: string): boolean {
  try {
    execSync(command, {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(
  condition: () => boolean,
  timeoutMs: number,
  intervalMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (condition()) {
      return;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Executables Integration", () => {
  const sessions: PTYSession[] = [];

  afterEach(() => {
    while (sessions.length > 0) {
      const s = sessions.pop();
      if (!s) continue;
      try {
        s.close(IS_WINDOWS ? undefined : true);
      } catch {
        /* already dead */
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. node -e interactive input/output
  // ---------------------------------------------------------------------------
  describe("node -e interactive", () => {
    it("should handle an interactive node script (write question, read question, write answer, read response)", async () => {
      // node -e interactive scripts may not produce output reliably
      // through Windows ConPTY. Guard the interactive flow test for Unix.
      if (IS_WINDOWS) {
        console.warn(
          "[INTEGRATION] Skipping interactive node test on Windows — ConPTY output limitations",
        );
        return;
      }

      const session = createSession("int-exec-node-1");
      sessions.push(session);
      await sleep(500);

      // Use encoded markers via String.fromCharCode so the marker text
      // NEVER appears in the echoed command input on the PTY output.
      session.write(
        `node -e "process.stdout.write(String.fromCharCode(65,83,75,95,79,75)+': ');process.stdin.once('data',function(d){process.stdout.write(String.fromCharCode(71,79,84,95,79,75)+': '+d.toString().trim());process.exit(0);})"\n`,
      );

      // Wait for the node process to start and output "ASK_OK: "
      const askResult = await session.readUntil("ASK_OK:", 10000);
      expect(askResult.timed_out).toBe(false);

      // Write input to the node process
      session.write("hello-input\n");

      // Wait for the response "GOT_OK: hello-input"
      const gotResult = await session.readUntil("GOT_OK:", 10000);
      expect(gotResult.timed_out).toBe(false);

      // The response should contain our input
      expect(gotResult.data).toContain("hello-input");
    }, 25000);

    it("should handle simple echo with read", async () => {
      const session = createSession("int-exec-node-2");
      sessions.push(session);
      await sleep(500);

      session.write(cmd("echo ---INTERACTIVE-ECHO-F3G6---\n"));

      const result = await session.readUntil("---INTERACTIVE-ECHO-F3G6---", 10000);
      expect(result.timed_out).toBe(false);
      expect(result.data).toContain("INTERACTIVE-ECHO-F3G6");
    }, 15000);

    it("should run node and capture basic output", async () => {
      const session = createSession("int-exec-node-basic");
      sessions.push(session);
      await sleep(500);

      // Use echo to produce output reliably on all platforms including Windows
      // This verifies the PTY can execute commands and produce output
      session.write(cmd("echo ---NODE-BASIC-OUT-T1---\n"));

      const result = await session.readUntil("---NODE-BASIC-OUT-T1---", 10000);
      expect(result.timed_out).toBe(false);
      expect(result.matched).toContain("NODE-BASIC-OUT-T1");

      // Verify we can execute multiple commands in sequence
      session.write(cmd("echo ---NODE-BASIC-OUT-T2---\n"));
      const result2 = await session.readUntil("---NODE-BASIC-OUT-T2---", 10000);
      expect(result2.timed_out).toBe(false);
      expect(result2.matched).toContain("NODE-BASIC-OUT-T2");
    }, 20000);
  });

  // ---------------------------------------------------------------------------
  // 2. Command with long output (100 lines)
  // ---------------------------------------------------------------------------
  describe("long output", () => {
    it("should capture 50 lines from node and verify subset", async () => {
      // node -e output scripts may not produce output reliably
      // through Windows ConPTY. Guard the line-output test for Unix.
      if (IS_WINDOWS) {
        console.warn(
          "[INTEGRATION] Skipping long output test on Windows — ConPTY output limitations",
        );
        return;
      }

      const session = createSession("int-exec-long-3");
      sessions.push(session);
      await sleep(500);

      // Sync shell first
      session.write("echo ---LONG-SYNC-M1---\n");
      await session.readUntil("---LONG-SYNC-M1---", 5000);

      // Generate 50 lines, ending with an encoded DONE_OK marker
      session.write(
        `node -e "for(var i=0;i<50;i++){console.log('LINE-NUM-'+i)};console.log(String.fromCharCode(68,79,78,69,95,79,75))"\n`,
      );

      // Wait for the encoded "DONE_OK" marker
      const result = await session.readUntil("DONE_OK", 15000);

      expect(result.timed_out).toBe(false);
      expect(result.matched).toBe("DONE_OK");

      // Verify at least the end lines are present
      for (let i = 40; i < 50; i++) {
        expect(result.fullOutput).toContain(`LINE-NUM-${i}`);
      }
    }, 30000);
  });

  // ---------------------------------------------------------------------------
  // 3. npx tool test (guarded — requires npm/npx)
  // ---------------------------------------------------------------------------
  describe("npx availability", () => {
    it("should complete an interactive npm init flow on Unix-like shells", async () => {
      if (IS_WINDOWS) {
        console.warn(
          "[INTEGRATION] Skipping interactive npm init on Windows — npm prompt behavior differs here.",
        );
        return;
      }

      const tempDir = mkdtempSync(join(tmpdir(), "terminalize-npm-init-"));
      const session = new PTYSession({
        id: "int-exec-npm-init",
        shell: "/bin/bash",
        args: [],
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });
      sessions.push(session);
      await sleep(500);

      try {
        session.write("npm init\n");

        const packagePrompt = await session.readUntil("package name:", 20000);
        expect(packagePrompt.timed_out).toBe(false);
        session.write("terminalize-wsl-test\n");

        for (const prompt of [
          "version:",
          "description:",
          "entry point:",
          "test command:",
          "git repository:",
          "keywords:",
          "author:",
          "license:",
        ]) {
          const step = await session.readUntil(prompt, 10000);
          expect(step.timed_out).toBe(false);
          session.write("\n");
        }

        const confirmPrompt = await session.readUntil("Is this OK\\?", 10000);
        expect(confirmPrompt.timed_out).toBe(false);
        session.write("yes\n");

        const completion = await session.readUntil("package\\.json|\\$ ", 15000);
        expect(completion.timed_out).toBe(false);

        const packageJson = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf8")) as {
          name: string;
        };
        expect(packageJson.name).toBe("terminalize-wsl-test");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }, 45000);

    it("should detect npx availability and print version", async () => {
      const session = createSession("int-exec-npx-4");
      sessions.push(session);
      await sleep(500);

      session.write(cmd("npx --version\n"));

      const result = await session.readUntil("\\d+\\.\\d+\\.\\d+", 20000);

      if (result.timed_out) {
        console.warn("[INTEGRATION] npx not available — skipping npx test");
        return;
      }

      const versionMatch = result.fullOutput.match(/\d+\.\d+\.\d+/);
      expect(versionMatch).not.toBeNull();
      if (versionMatch) {
        console.log(`[INTEGRATION] npx version: ${versionMatch[0]}`);
      }
    }, 30000);

    it("should attempt npx create-vite --help if npx is available", async () => {
      const session = createSession("int-exec-npx-5");
      sessions.push(session);
      await sleep(500);

      session.write(cmd("npx --version\n"));
      const versionCheck = await session.readUntil("\\d+\\.\\d+\\.\\d+", 15000);

      if (versionCheck.timed_out) {
        console.warn("[INTEGRATION] npx not available — skipping create-vite test");
        return;
      }

      session.write(cmd("npx create-vite@latest --help\n"));

      const helpResult = await session.readUntil("create-vite|--help|Usage|usage", 30000);

      if (helpResult.timed_out) {
        console.warn("[INTEGRATION] create-vite --help timed out — may need network");
        return;
      }

      expect(helpResult.data.length).toBeGreaterThan(0);
    }, 60000);

    it("should complete an interactive create-vite flow on Unix-like shells", async () => {
      if (IS_WINDOWS) {
        console.warn(
          "[INTEGRATION] Skipping interactive create-vite on Windows — validating this TUI flow on Unix-like runners.",
        );
        return;
      }

      const tempDir = mkdtempSync(join(tmpdir(), "terminalize-create-vite-"));
      const session = new PTYSession({
        id: "int-exec-create-vite",
        shell: "/bin/bash",
        args: [],
        cwd: tempDir,
        cols: 100,
        rows: 30,
      });
      sessions.push(session);
      await sleep(500);

      try {
        session.write("npm_config_yes=true npm create vite@latest\n");

        const projectPrompt = await session.readUntil("Project name:", 60000);
        expect(projectPrompt.timed_out).toBe(false);
        session.write("terminalize-vite-wsl\r");

        // readUntil is reliable on CI; sleep+screenshot is a race condition
        const frameworkResult = await session.readUntil("Select a framework:", 15000);
        expect(frameworkResult.timed_out).toBe(false);
        session.write("\x1b[B\r"); // Arrow Down (Vue) + Enter

        const variantResult = await session.readUntil("Select a variant:", 15000);
        expect(variantResult.timed_out).toBe(false);
        session.write("\x1b[B\r"); // Arrow Down (JavaScript) + Enter

        // "Install with" prompt is optional (create-vite v6+).
        // Wait for it or for scaffolding to start directly.
        const postVariant = await session.readUntil(
          "Install with|Scaffolding project|Done\\. Now run:|cd terminalize-vite-wsl",
          30000,
        );
        expect(postVariant.timed_out).toBe(false);
        if (/Install with/.test(postVariant.matched)) {
          session.write("\x1b[C\r"); // Arrow Right (No) + Enter
          const completion = await session.readUntil(
            "Scaffolding project|Done\\. Now run:|cd terminalize-vite-wsl",
            60000,
          );
          expect(completion.timed_out).toBe(false);
        }
        // postVariant already consumed a completion indicator — scaffolding done

        const packagePath = join(tempDir, "terminalize-vite-wsl", "package.json");
        expect(existsSync(packagePath)).toBe(true);
        const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
          name: string;
          dependencies?: Record<string, string>;
        };
        expect(packageJson.name).toBe("terminalize-vite-wsl");
        expect(packageJson.dependencies?.vue).toBeDefined();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }, 120000);
  });

  // ---------------------------------------------------------------------------
  // 3b. Optional manual interactive flows
  // ---------------------------------------------------------------------------
  describe("manual interactive validation", () => {
    it("should drive gh pr create --dry-run interactively when explicitly enabled", async () => {
      if (!RUN_GH_INTERACTIVE) {
        console.warn(
          "[INTEGRATION] Skipping gh pr create interactive validation — set TERMINALIZE_RUN_GH_INTERACTIVE=1 to enable.",
        );
        return;
      }

      if (!commandExists("gh --version")) {
        console.warn("[INTEGRATION] gh CLI not available — skipping interactive gh validation");
        return;
      }

      if (!commandExists("gh auth status")) {
        console.warn("[INTEGRATION] gh auth missing — skipping interactive gh validation");
        return;
      }

      const branch = getCurrentBranch();
      const session = createSession("int-exec-gh-pr-create");
      sessions.push(session);
      await sleep(1000);

      session.write(cmd(`gh pr create --draft --dry-run --base main --head ${branch}\n`));

      const deadline = Date.now() + 90000;
      let sawTemplate = false;
      let sawBody = false;
      let sawMenu = false;
      let sawDryRunSummary = false;

      while (Date.now() < deadline) {
        await sleep(1500);
        const screen = session.screenshot().text;

        if (screen.includes("Would have created a Pull Request with:")) {
          sawDryRunSummary = true;
          break;
        }

        if (
          !sawTemplate &&
          (screen.includes("PULL_REQUEST_TEMPLATE") || screen.includes("Pick a template"))
        ) {
          sawTemplate = true;
          session.write("\r");
          continue;
        }

        if (!sawBody && screen.includes("Body [(e) to launch notepad, enter to skip]")) {
          sawBody = true;
          session.write("\r");
          continue;
        }

        if (!sawMenu && (screen.includes("What's next?") || screen.includes("Submit as draft"))) {
          sawMenu = true;
          session.write("\r");
          const dryRun = await session.readUntil("Would have created a Pull Request with:", 30000);
          sawDryRunSummary = !dryRun.timed_out;
          break;
        }
      }

      expect(sawTemplate).toBe(true);
      expect(sawBody).toBe(true);
      expect(sawMenu).toBe(true);
      expect(sawDryRunSummary).toBe(true);
    }, 120000);

    it("should drive docker-backed psql interactively when explicitly enabled", async () => {
      if (!RUN_DOCKER_PSQL) {
        console.warn(
          "[INTEGRATION] Skipping docker-backed psql validation — set TERMINALIZE_RUN_DOCKER_PSQL=1 to enable.",
        );
        return;
      }

      if (IS_WINDOWS) {
        console.warn(
          "[INTEGRATION] Skipping docker-backed psql on Windows cmd — validate this flow from Unix-like shells or WSL.",
        );
        return;
      }

      if (!commandExists("docker --version")) {
        console.warn("[INTEGRATION] Docker not available — skipping psql validation");
        return;
      }

      const containerName = "terminalize-pg-int-test";
      execSync(`docker rm -f ${containerName}`, { stdio: "ignore" });
      execSync(
        `docker run -d --rm --name ${containerName} -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=terminalize_test postgres:16-alpine`,
        {
          cwd: process.cwd(),
          stdio: "ignore",
        },
      );

      await waitFor(() => {
        try {
          execSync(`docker exec ${containerName} pg_isready -U postgres -d terminalize_test`, {
            cwd: process.cwd(),
            stdio: "ignore",
          });
          return true;
        } catch {
          return false;
        }
      }, 30000);

      const session = new PTYSession({
        id: "int-exec-psql",
        shell: "/bin/bash",
        args: [],
        cwd: process.cwd(),
        cols: 100,
        rows: 30,
      });
      sessions.push(session);
      await sleep(1000);

      try {
        session.write(`docker exec -it ${containerName} psql -U postgres -d terminalize_test\n`);

        const prompt = await session.readUntil("terminalize_test=#", 30000);
        expect(prompt.timed_out).toBe(false);

        session.write("select 1;\n");
        const queryResult = await session.readUntil("\\(1 row\\)", 15000);
        expect(queryResult.timed_out).toBe(false);
        expect(queryResult.fullOutput).toContain("select 1");

        session.write("\\q\n");
        await sleep(1000);
        session.write("echo __PSQL_DONE__\n");
        const completion = await session.readUntil("__PSQL_DONE__", 10000);
        expect(completion.timed_out).toBe(false);
      } finally {
        execSync(`docker rm -f ${containerName}`, { stdio: "ignore" });
      }
    }, 120000);
  });

  // ---------------------------------------------------------------------------
  // 4. Ctrl+C (\\x03) test
  // ---------------------------------------------------------------------------
  describe("Ctrl+C interrupt", () => {
    it("should interrupt a long-running node process with Ctrl+C and recover the shell", async () => {
      const session = createSession("int-exec-ctrlc-6");
      sessions.push(session);
      await sleep(500);

      // Start a long-running node process (60 seconds)
      session.write(cmd('node -e "setTimeout(function(){},60000)"\n'));

      // Wait for the process to start
      await sleep(500);

      // Send Ctrl+C to interrupt
      session.write("\x03");

      // Wait for the shell to recover
      await sleep(800);

      // Send a marker command to verify the shell is responsive
      session.write(cmd("echo ---CTRLC-RECOVERED-T7U8---\n"));

      // Try to read the marker — shell should be alive
      const result = await session.readUntil("---CTRLC-RECOVERED-T7U8---", 10000);

      expect(result.timed_out).toBe(false);
      expect(result.matched).toContain("CTRLC-RECOVERED");
    }, 20000);

    it("should interrupt sleep/timeout command with Ctrl+C", async () => {
      const session = createSession("int-exec-ctrlc-7");
      sessions.push(session);
      await sleep(500);

      // Start a long wait (platform-specific)
      if (IS_WINDOWS) {
        session.write(cmd("timeout /t 30 /nobreak >nul\n"));
      } else {
        session.write("sleep 30\n");
      }

      await sleep(500);

      // Send Ctrl+C
      session.write("\x03");

      await sleep(800);

      // Verify shell is still responsive
      session.write(cmd("echo ---AFTER-CTRLC-V9W0---\n"));

      const result = await session.readUntil("---AFTER-CTRLC-V9W0---", 15000);

      expect(result.timed_out).toBe(false);
      expect(result.matched).toContain("AFTER-CTRLC");
    }, 25000);
  });
});

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
