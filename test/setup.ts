/**
 * Test setup — suppress known node-pty errors on Windows.
 * These are emitted asynchronously by node-pty's internal ConPTY socket
 * after a process has exited and don't affect test correctness.
 */
if (process.platform === "win32") {
  process.on("uncaughtException", (err) => {
    if (
      err.message?.includes("Cannot resize a pty that has already exited") ||
      err.message?.includes("AttachConsole failed")
    ) {
      // Suppress known Windows node-pty noise
      return;
    }
    // Re-throw unexpected errors
    console.error("Unexpected uncaught exception:", err);
    process.exit(1);
  });
}
