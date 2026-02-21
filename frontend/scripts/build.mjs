import { spawn } from 'node:child_process';
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

async function main() {
  await runNpm(['exec', '--', 'tsc', '-b']);

  // Prevent esbuild OOM crashes seen on constrained Windows hosts.
  const goMaxProcs = process.env.GOMAXPROCS ?? '1';
  await runNpm(['exec', '--', 'vite', 'build'], { GOMAXPROCS: goMaxProcs });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
