import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

import { resolveVercelTarget } from './vercel-target.mjs';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(ROOT, '.vercel-static');
const LANDING_DIR = resolve(ROOT, 'landing');
const FRONTEND_DIR = resolve(ROOT, 'frontend');
const FRONTEND_DIST_DIR = resolve(FRONTEND_DIR, 'dist');

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:-]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function runNpm(args) {
  return new Promise((resolvePromise, reject) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
    const commandArgs = isWindows
      ? ['/d', '/s', '/c', `npm ${args.map(quoteArg).join(' ')}`]
      : args;

    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`npm ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function resetOutputDir() {
  rmSync(OUTPUT_DIR, { force: true, recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

function copyIntoOutput(sourceDir) {
  if (!existsSync(sourceDir)) {
    throw new Error(`Missing source directory: ${sourceDir}`);
  }
  cpSync(sourceDir, OUTPUT_DIR, { force: true, recursive: true });
}

async function main() {
  const target = resolveVercelTarget();
  console.log(`[vercel-build] target=${target}`);
  resetOutputDir();

  if (target === 'landing') {
    copyIntoOutput(LANDING_DIR);
    return;
  }

  await runNpm(['--prefix', 'frontend', 'run', 'build']);
  copyIntoOutput(FRONTEND_DIST_DIR);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
