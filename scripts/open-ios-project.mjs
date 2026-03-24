import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { paths } from './ios-config.mjs';

function runOpen(targetPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('open', [targetPath], {
      stdio: 'inherit',
      cwd: paths.root,
      env: process.env,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`open exited with code ${code}`));
    });
  });
}

async function main() {
  if (!existsSync(paths.iosProject)) {
    throw new Error('Missing ios/App/App.xcodeproj. Run `npm run ios:sync` first.');
  }

  const target = existsSync(paths.iosWorkspace) ? paths.iosWorkspace : paths.iosProject;
  if (process.platform !== 'darwin') {
    console.log(target);
    return;
  }

  await runOpen(target);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
