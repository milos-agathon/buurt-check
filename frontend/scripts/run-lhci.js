/**
 * Wrapper for LHCI autorun that works around the Windows chrome-launcher
 * EPERM cleanup bug. Chrome-launcher's destroyTmp() calls fs.rmSync() on
 * the Chrome temp directory, which fails on Windows because Chrome child
 * processes haven't fully released file locks.
 *
 * Fix: Patch chrome-launcher's destroyTmp to swallow rmSync EPERM errors
 * before spawning LHCI. The audit results are valid regardless of cleanup.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const configArg = process.argv[2] || '../.lighthouserc.json';

// Locate chrome-launcher inside lighthouse's dependency tree
const launcherPath = require.resolve(
  'lighthouse/node_modules/chrome-launcher/dist/chrome-launcher.js'
);

// Read and patch: wrap rmSync in try-catch to tolerate EPERM
const original = readFileSync(launcherPath, 'utf8');
const needle = 'rmSync(this.userDataDir, { recursive: true, force: true, maxRetries: 10 });';
if (original.includes(needle)) {
  const patched = original.replace(
    needle,
    `try { rmSync(this.userDataDir, { recursive: true, force: true, maxRetries: 10 }); } catch (_e) { /* Windows EPERM during Chrome cleanup — benign */ }`
  );
  writeFileSync(launcherPath, patched, 'utf8');
}

try {
  execSync(`lhci autorun --config ${configArg}`, {
    stdio: 'inherit',
    cwd: resolve(import.meta.dirname, '..'),
  });
} finally {
  // Restore original file to keep node_modules clean
  if (original.includes(needle)) {
    writeFileSync(launcherPath, original, 'utf8');
  }
}
