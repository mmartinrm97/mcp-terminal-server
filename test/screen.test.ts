import { describe, it, expect } from 'vitest';
import { renderScreen } from '../src/screen.js';

describe('renderScreen', () => {
  it('should render plain text', () => {
    const result = renderScreen('hello world', 80, 24);
    expect(result.rows[0]).toBe('hello world');
    expect(result.text).toBe('hello world');
  });

  it('should handle newlines', () => {
    const result = renderScreen('line1\nline2\nline3', 80, 24);
    expect(result.rows[0]).toBe('line1');
    expect(result.rows[1]).toBe('line2');
    expect(result.rows[2]).toBe('line3');
    expect(result.cursorRow).toBe(3);
  });

  it('should handle carriage returns', () => {
    const result = renderScreen('hello\rworld', 80, 24);
    // \r moves cursor to column 0, then 'world' overwrites
    expect(result.rows[0]).toBe('world');
  });

  it('should strip ANSI color codes', () => {
    const result = renderScreen('\x1b[31mred\x1b[0m', 80, 24);
    expect(result.rows[0]).toBe('red');
  });

  it('should handle CUP (cursor position)', () => {
    // Write "A", then move to row 1 col 0 and write "B"
    const result = renderScreen('A\x1b[2;1HB', 80, 24);
    expect(result.rows[0]).toBe('A');
    expect(result.rows[1]).toBe('B');
  });

  it('should handle cursor up/down/forward/back', () => {
    // Write "AB", back one (\x1b[D), write "C" → overwrites B → "AC"
    const result = renderScreen('AB\x1b[DC', 80, 24);
    expect(result.rows[0]).toBe('AC');
  });

  it('should handle erase in line (K)', () => {
    // Write "hello", move to col 0, erase to end, write "hi"
    const result = renderScreen('hello\x1b[0G\x1b[Khi', 80, 24);
    expect(result.rows[0]).toBe('hi');
  });

  it('should handle erase in display (J)', () => {
    // Write two lines, then move to top and erase to end
    const screen = renderScreen('line1\nline2\x1b[H\x1b[J', 80, 24);
    expect(screen.rows[0]).toBe('');
    expect(screen.rows[1]).toBe('');
  });

  it('should handle tabs', () => {
    const result = renderScreen('a\tb', 80, 24);
    expect(result.rows[0]).toBe('a       b');
  });

  it('should handle scrolling when reaching bottom', () => {
    // Write 24 full-screen lines + 1 extra (0-24) to a 24-row terminal.
    // Each line ends with \n.
    // Lines 0-23 fill rows 0-23, line23's \n triggers scroll 1.
    // After scroll 1: row 0 = line1, row 23 = cleared.
    // Line24 written to row 23, line24's \n triggers scroll 2.
    // After scroll 2: row 0 = line2, row 23 = cleared.
    const input = Array.from({ length: 25 }, (_, i) => `line${i}\n`).join('');
    const result = renderScreen(input, 80, 24);
    expect(result.rows[0]).toBe('line2');
    expect(result.rows[23]).toBe('');
  });

  it('should handle OSC sequences (window title)', () => {
    const result = renderScreen('hello\x1b]0;title\x07world', 80, 24);
    expect(result.rows[0]).toBe('helloworld');
  });

  it('should track cursor position', () => {
    const result = renderScreen('abc', 80, 24);
    expect(result.cursorCol).toBe(4); // after writing 3 chars, col is at position 4 (1-indexed)
    expect(result.cursorRow).toBe(1);
  });

  it('should handle bold/reverse video ANSI codes', () => {
    const result = renderScreen('\x1b[1mbold\x1b[0m \x1b[7mreverse\x1b[0m', 80, 24);
    expect(result.rows[0]).toBe('bold reverse');
  });

  it('should render a simulated TUI menu', () => {
    const raw = [
      '\x1b[2J',                                // clear screen
      '\x1b[1;1HSelect a framework:',            // header at row 1
      '\x1b[3;1H  ○ Vanilla',                    // option at row 3
      '\x1b[4;1H  ○ Vue',                        // option at row 4
      '\x1b[5;1H  ● React',                      // selected at row 5
      '\x1b[6;1H  ○ Preact',                     // option at row 6
    ].join('');
    const result = renderScreen(raw, 80, 24);
    expect(result.rows[0]).toContain('Select a framework:');
    expect(result.rows[4]).toContain('● React');
    expect(result.rows[2]).toContain('○ Vanilla');
  });

  it('should handle real-world ANSI from create-vite menu', () => {
    // Simulated output from create-vite's framework selection
    const raw = '\x1b[36m\x1b[14;1H│  \x1b[m\x1b[2m○\x1b[22m \x1b[33m\x1b[2mVanilla\x1b[m\x1b[K\x1b[36m\r\n│  \x1b[m\x1b[2m○\x1b[22m \x1b[32m\x1b[2mVue\x1b[m\x1b[K\x1b[36m\r\n│  \x1b[32m● \x1b[36mReact\x1b[K';
    const result = renderScreen(raw, 100, 30);
    // Find the row containing React
    const reactRow = result.rows.find((r) => r.includes('React'));
    expect(reactRow).toBeDefined();
    expect(reactRow).toContain('●');
    expect(reactRow).not.toContain('\x1b');
  });
});
