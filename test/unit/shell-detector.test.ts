import { describe, it, expect } from "vitest";
import { detectShell } from "../../src/lib/shell-detector.js";

describe("detectShell", () => {
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

  it("should return pwsh.exe with args when explicitly specified on Windows", () => {
    const info = detectShell("pwsh");
    expect(info.shell).toBe("pwsh.exe");
    expect(info.shellName).toBe("pwsh");
    // pwsh uses -NoLogo -NoExit on Windows
    expect(info.args).toContain("-NoLogo");
    expect(info.args).toContain("-NoExit");
  });

  it("should return cmd.exe when explicitly specified", () => {
    const info = detectShell("cmd");
    expect(info.shell).toBe("cmd.exe");
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
    // Should end with .exe on Windows, or be a standard shell name on Unix
    const isWindows = process.platform === "win32";
    if (isWindows) {
      expect(info.shell).toMatch(/\.exe$/);
    }
    // shell should be a valid string
    expect(info.shell).toBeTruthy();
  });

  it("should include args for pwsh", () => {
    const info = detectShell("pwsh");
    expect(info.args).toBeInstanceOf(Array);
    if (process.platform === "win32") {
      expect(info.args.length).toBeGreaterThan(0);
    }
  });

  it("should handle auto on the current platform without throwing", () => {
    expect(() => detectShell("auto")).not.toThrow();
  });
});
