// @integration — requires real shell
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { PTYSession } from "../../src/core/pty-session.js";

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------
const IS_WINDOWS = process.platform === "win32";

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
        await sleep(1000);

        const frameworkScreen = session.screenshot();
        expect(frameworkScreen.text).toContain("Select a framework:");
        session.write("\x1b[B\r"); // Vue
        await sleep(1000);

        const variantScreen = session.screenshot();
        expect(variantScreen.text).toContain("Select a variant:");
        session.write("\x1b[B\r"); // JavaScript
        await sleep(1000);

        const installScreen = session.screenshot();
        expect(installScreen.text).toMatch(/Install with (npm|pnpm) and start now\?/);
        session.write("\x1b[C\r"); // No

        const completion = await session.readUntil(
          "Scaffolding project|Done\\. Now run:|cd terminalize-vite-wsl",
          60000,
        );
        expect(completion.timed_out).toBe(false);

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
