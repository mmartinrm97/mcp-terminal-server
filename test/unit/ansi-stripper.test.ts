import { describe, it, expect } from "vitest";
import { stripAnsi } from "../../src/lib/ansi-stripper.js";

describe("stripAnsi", () => {
  it("should return an empty string unchanged", () => {
    expect(stripAnsi("")).toBe("");
  });

  it("should return plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("should strip color codes (CSI ...m)", () => {
    const input = "\x1b[31mRed text\x1b[0m";
    expect(stripAnsi(input)).toBe("Red text");
  });

  it("should strip cursor movement sequences", () => {
    const input = "\x1b[10;20HHello\x1b[2AWorld";
    expect(stripAnsi(input)).toBe("HelloWorld");
  });

  it("should strip erase sequences (ED, EL)", () => {
    const input = "\x1b[2J\x1b[KClean";
    expect(stripAnsi(input)).toBe("Clean");
  });

  it("should strip OSC sequences", () => {
    const input = "\x1b]0;title\x07content";
    expect(stripAnsi(input)).toBe("content");
  });

  it("should handle multiple ANSI codes mixed with text", () => {
    const input = "\x1b[32m\x1b[1mBold Green\x1b[0m normal";
    expect(stripAnsi(input)).toBe("Bold Green normal");
  });

  it("should preserve newlines and tabs", () => {
    const input = "\x1b[31mLine 1\n\tLine 2\x1b[0m";
    expect(stripAnsi(input)).toBe("Line 1\n\tLine 2");
  });

  it("should handle prompt-style output with ANSI", () => {
    const input = "\x1b]0;bash\x07\x1b[32muser@host\x1b[0m:\x1b[34m~/projects\x1b[0m$ ";
    expect(stripAnsi(input)).toBe("user@host:~/projects$ ");
  });
});
