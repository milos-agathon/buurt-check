import { spawn } from 'node:child_process';
import process from 'node:process';

import { resolveVercelTarget } from './vercel-target.mjs';

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:-]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
    const commandArgs = isWindows
      ? ['/d', '/s', '/c', `npm ${args.map(quoteArg).join(' ')}`]
      : args;

    const child = spawn(command, commandArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
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

async function main() {
  const target = resolveVercelTarget();
  console.log(`[vercel-install] target=${target}`);

  if (target === 'landing') {
    console.log('[vercel-install] landing deployment does not require npm install.');
    return;
  }

  await runNpm(['--prefix', 'frontend', 'ci']);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
