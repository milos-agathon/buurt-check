import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const ROOT = process.cwd();
const FRONTEND_DIR = resolve(ROOT, 'frontend');
const FRONTEND_DIST_DIR = resolve(FRONTEND_DIR, 'dist');
const ROOT_OUTPUT_DIRS = [
  resolve(ROOT, 'dist'),
  resolve(ROOT, 'public'),
];

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

function resetOutputDir(directory) {
  rmSync(directory, { force: true, recursive: true });
  mkdirSync(directory, { recursive: true });
}

async function main() {
  await runNpm(['--prefix', 'frontend', 'run', 'build']);

  if (!existsSync(FRONTEND_DIST_DIR)) {
    throw new Error(`Missing frontend build output at ${FRONTEND_DIST_DIR}`);
  }

  for (const outputDir of ROOT_OUTPUT_DIRS) {
    resetOutputDir(outputDir);
    cpSync(FRONTEND_DIST_DIR, outputDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
