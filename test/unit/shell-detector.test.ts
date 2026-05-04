import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:os module for cross-platform testing
vi.mock("node:os");
import { platform } from "node:os";
import { detectShell } from "../../src/lib/shell-detector.js";

// ---------------------------------------------------------------------------
// Platform-agnostic tests (run on whatever platform we're on)
// ---------------------------------------------------------------------------

const IS_WINDOWS = process.platform === "win32";

describe("detectShell", () => {
  beforeEach(() => {
    vi.mocked(platform).mockReturnValue(process.platform as "win32" | "linux" | "darwin");
  });

  it("should return bash when explicitly specified", () => {
    const info = detectShell("bash");
    expect(info.shell).toBe("bash");
    expect(info.shellName).toBe("bash");
    expect(info.args).toEqual([]);
  });

  it("should return zsh when explicitly specified", () => {
    const info = detectShell("zsh");
    expect(info.shell).toBe("zsh");
    expect(info.shellName).toBe("zsh");
    expect(info.args).toEqual([]);
  });

  it("should return pwsh with args when explicitly specified", () => {
    vi.mocked(platform).mockReturnValue(IS_WINDOWS ? "win32" : "linux");
    const info = detectShell("pwsh");
    expect(info.shell).toBe(IS_WINDOWS ? "pwsh.exe" : "pwsh");
    expect(info.shellName).toBe("pwsh");
    if (IS_WINDOWS) {
      expect(info.args).toContain("-NoLogo");
      expect(info.args).toContain("-NoExit");
    }
  });

  it("should return cmd when explicitly specified", () => {
    const info = detectShell("cmd");
    expect(info.shell).toBe(IS_WINDOWS ? "cmd.exe" : "cmd");
    expect(info.shellName).toBe("cmd");
  });

  it("should detect appropriate shell when auto is specified", () => {
    const info = detectShell("auto");
    expect(typeof info.shell).toBe("string");
    expect(info.shell.length).toBeGreaterThan(0);
    expect(typeof info.shellName).toBe("string");
    expect(Array.isArray(info.args)).toBe(true);
  });

  it("auto should return a valid executable name", () => {
    const info = detectShell("auto");
    if (IS_WINDOWS) {
      expect(info.shell).toMatch(/\.exe$/);
    }
    expect(info.shell).toBeTruthy();
  });

  it("should include args for pwsh", () => {
    const info = detectShell("pwsh");
    expect(info.args).toBeInstanceOf(Array);
    if (IS_WINDOWS) {
      expect(info.args.length).toBeGreaterThan(0);
    }
  });

  it("should handle auto on the current platform without throwing", () => {
    expect(() => detectShell("auto")).not.toThrow();
  });

  it("should fall back to auto for unknown shell values", () => {
    // @ts-expect-error testing runtime behavior with invalid value
    const info = detectShell("invalid");
    expect(info.shell).toBeTruthy();
    expect(info.shellName).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Cross-platform tests via mocked node:os.platform()
  // -----------------------------------------------------------------------

  it("should detect /bin/bash via SHELL env on Linux", () => {
    vi.mocked(platform).mockReturnValue("linux");
    vi.stubEnv("SHELL", "/bin/bash");

    const info = detectShell("auto");
    expect(info.shell).toBe("/bin/bash");
    expect(info.shellName).toBe("bash");

    vi.unstubAllEnvs();
  });

  it("should fall back to /bin/bash when SHELL is unset on Linux", () => {
    vi.mocked(platform).mockReturnValue("linux");
    vi.unstubAllEnvs();
    delete process.env.SHELL;

    const info = detectShell("auto");
    expect(info.shell).toBe("/bin/bash");
    expect(info.shellName).toBe("bash");
  });

  it("should detect pwsh.exe on Windows auto-detection", () => {
    vi.mocked(platform).mockReturnValue("win32");

    const info = detectShell("auto");
    expect(info.shell).toBe("pwsh.exe");
    expect(info.shellName).toBe("pwsh");
  });
});
