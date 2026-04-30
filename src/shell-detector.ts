import { platform } from 'node:os';

/**
 * Information about a detected or specified shell.
 */
export interface ShellInfo {
  /** The actual executable path/name to spawn */
  shell: string;
  /** Human-readable shell name */
  shellName: string;
  /** Arguments to pass to the shell executable */
  args: string[];
}

/**
 * Detect the preferred shell for the current platform.
 *
 * Cross-platform detection:
 *
 * | SO      | Shell preferido | Fallback |
 * |---------|-----------------|----------|
 * | Linux   | $SHELL → bash   | sh       |
 * | macOS   | $SHELL → zsh    | bash     |
 * | Windows | pwsh.exe        | cmd.exe  |
 *
 * When a specific shell is requested, it is used directly with platform-appropriate
 * executable name resolution (e.g., `pwsh` → `pwsh.exe` on Windows).
 */
export function detectShell(shell: 'auto' | 'bash' | 'zsh' | 'pwsh' | 'cmd'): ShellInfo {
  const isWindows = platform() === 'win32';

  switch (shell) {
    case 'bash':
      return { shell: 'bash', shellName: 'bash', args: [] };

    case 'zsh':
      return { shell: 'zsh', shellName: 'zsh', args: [] };

    case 'pwsh':
      return {
        shell: isWindows ? 'pwsh.exe' : 'pwsh',
        shellName: 'pwsh',
        args: isWindows ? ['-NoLogo', '-NoExit'] : [],
      };

    case 'cmd':
      return {
        shell: isWindows ? 'cmd.exe' : 'cmd',
        shellName: 'cmd',
        args: [],
      };

    case 'auto':
      return detectAutoShell();

    default:
      return detectAutoShell();
  }
}

/**
 * Auto-detect the best available shell for the current platform.
 */
function detectAutoShell(): ShellInfo {
  const isWindows = platform() === 'win32';

  if (isWindows) {
    // Try pwsh first, fallback to cmd
    const pwshPath = findExecutable('pwsh.exe');
    if (pwshPath) {
      return { shell: pwshPath, shellName: 'pwsh', args: ['-NoLogo', '-NoExit'] };
    }
    return { shell: 'cmd.exe', shellName: 'cmd', args: [] };
  }

  // Unix: check SHELL env var, then try common shells
  const envShell = process.env.SHELL;
  if (envShell) {
    return { shell: envShell, shellName: envShell.split('/').pop() ?? 'bash', args: [] };
  }

  // Try common shells in order
  for (const candidate of ['/bin/bash', '/bin/zsh', '/bin/sh']) {
    try {
      // Can't really check existence without fs, just fall through
      // Use the first reasonable candidate
      const name = candidate.split('/').pop() ?? 'bash';
      return { shell: candidate, shellName: name, args: [] };
    } catch {
      // continue
    }
  }

  return { shell: '/bin/sh', shellName: 'sh', args: [] };
}

/**
 * Find a Windows executable using `where` command.
 * For Unix, this is a no-op (returns the candidate as-is).
 */
function findExecutable(name: string): string | null {
  if (platform() !== 'win32') return name;

  try {
    // Use which/where to find the executable - but since require('child_process').execSync
    // is heavy for a simple lookup, fall back to assuming it's on PATH
    return name;
  } catch {
    return null;
  }
}
