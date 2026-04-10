import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:-]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function runNpm(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
    const commandArgs = isWindows
      ? ['/d', '/s', '/c', `npm ${args.map(quoteArg).join(' ')}`]
      : args;

    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function runNodeScript(scriptPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`node ${scriptPath} exited with code ${code}`));
    });
  });
}

async function withoutLegacyWoff(buildStep) {
  const publicDir = resolve(process.cwd(), 'public', 'fonts');
  const legacyWoff = resolve(publicDir, 'Satoshi-Variable.woff');
  const stashDir = resolve(process.cwd(), '.build-temp');
  const stashedWoff = resolve(stashDir, 'Satoshi-Variable.woff');

  const hadLegacyWoff = existsSync(legacyWoff);
  if (hadLegacyWoff) {
    mkdirSync(stashDir, { recursive: true });
    rmSync(stashedWoff, { force: true });
    renameSync(legacyWoff, stashedWoff);
  }

  try {
    await buildStep();
  } finally {
    if (existsSync(stashedWoff)) {
      renameSync(stashedWoff, legacyWoff);
    }
  }
}

async function main() {
  await runNpm(['exec', '--', 'tsc', '-b']);

  // Avoid stale hashed assets inflating bundle-budget checks.
  rmSync(resolve(process.cwd(), 'dist'), { recursive: true, force: true });
  await runNodeScript(resolve(process.cwd(), 'scripts', 'generate-assetlinks.mjs'));
  await runNodeScript(resolve(process.cwd(), 'scripts', 'generate-apple-app-site-association.mjs'));

  // Prevent esbuild OOM crashes seen on constrained Windows hosts.
  const goMaxProcs = process.env.GOMAXPROCS ?? '1';
  await withoutLegacyWoff(async () => {
    await runNpm(['exec', '--', 'vite', 'build'], { GOMAXPROCS: goMaxProcs });
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
