import { mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { paths, resolveIosConfig } from './ios-config.mjs';

function runCommand(command, args, cwd = paths.root) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd,
      env: process.env,
      shell: false,
    });

    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('`npm run ios:archive` requires macOS with Xcode installed.');
  }

  const config = resolveIosConfig();
  if (!config.teamId) {
    throw new Error('Set BUURT_IOS_TEAM_ID before archiving the iOS app.');
  }

  await runCommand(process.execPath, ['./scripts/update-ios-wrapper.mjs']);
  await runCommand(process.execPath, ['./scripts/check-ios-release-readiness.mjs', '--strict']);

  if (!existsSync(paths.iosProject)) {
    throw new Error('Missing ios/App/App.xcodeproj after sync.');
  }

  mkdirSync(paths.iosBuildDir, { recursive: true });
  const archivePath = resolve(paths.iosBuildDir, 'BuurtCheck.xcarchive');
  const baseArgs = existsSync(paths.iosWorkspace)
    ? ['-workspace', paths.iosWorkspace]
    : ['-project', paths.iosProject];

  await runCommand(
    'xcodebuild',
    [
      ...baseArgs,
      '-scheme',
      'App',
      '-configuration',
      'Release',
      '-destination',
      'generic/platform=iOS',
      '-archivePath',
      archivePath,
      'archive',
      'CODE_SIGN_STYLE=Automatic',
      `DEVELOPMENT_TEAM=${config.teamId}`,
      `PRODUCT_BUNDLE_IDENTIFIER=${config.bundleId}`,
      `MARKETING_VERSION=${config.versionName}`,
      `CURRENT_PROJECT_VERSION=${config.buildNumber}`,
      'IPHONEOS_DEPLOYMENT_TARGET=15.0',
      'TARGETED_DEVICE_FAMILY=1',
      '-allowProvisioningUpdates',
    ],
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
