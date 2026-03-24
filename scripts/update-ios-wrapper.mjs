import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { paths, resolveIosConfig } from './ios-config.mjs';

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:-]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function runNpm(args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
    const commandArgs = isWindows
      ? ['/d', '/s', '/c', `npm ${args.map(quoteArg).join(' ')}`]
      : args;

    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      cwd,
      env: process.env,
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

function replaceAll(source, pattern, replacer) {
  if (pattern instanceof RegExp) {
    return source.replace(pattern, replacer);
  }
  return source.split(pattern).join(replacer);
}

function ensureCodeSignEntitlements(projectSource) {
  if (projectSource.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) {
    return projectSource;
  }

  return projectSource.replaceAll(
    'INFOPLIST_FILE = App/Info.plist;',
    'INFOPLIST_FILE = App/Info.plist;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;',
  );
}

function normalizeGeneratedProject() {
  const config = resolveIosConfig();
  let pbxproj = readFileSync(paths.iosPbxproj, 'utf8');

  pbxproj = replaceAll(
    pbxproj,
    /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,
    `PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleId};`,
  );
  pbxproj = replaceAll(
    pbxproj,
    /IPHONEOS_DEPLOYMENT_TARGET = [^;]+;/g,
    'IPHONEOS_DEPLOYMENT_TARGET = 15.0;',
  );
  pbxproj = replaceAll(
    pbxproj,
    /TARGETED_DEVICE_FAMILY = [^;]+;/g,
    'TARGETED_DEVICE_FAMILY = 1;',
  );
  pbxproj = replaceAll(
    pbxproj,
    /MARKETING_VERSION = [^;]+;/g,
    `MARKETING_VERSION = ${config.versionName};`,
  );
  pbxproj = replaceAll(
    pbxproj,
    /CURRENT_PROJECT_VERSION = [^;]+;/g,
    `CURRENT_PROJECT_VERSION = ${config.buildNumber};`,
  );
  if (config.teamId) {
    if (pbxproj.match(/DEVELOPMENT_TEAM = [^;]*;/)) {
      pbxproj = replaceAll(
        pbxproj,
        /DEVELOPMENT_TEAM = [^;]*;/g,
        `DEVELOPMENT_TEAM = ${config.teamId};`,
      );
    } else {
      pbxproj = pbxproj.replaceAll(
        'CODE_SIGN_STYLE = Automatic;',
        `CODE_SIGN_STYLE = Automatic;\n\t\t\t\tDEVELOPMENT_TEAM = ${config.teamId};`,
      );
    }
  }
  pbxproj = ensureCodeSignEntitlements(pbxproj);

  writeFileSync(paths.iosPbxproj, pbxproj, 'utf8');

  const entitlements = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>com.apple.developer.associated-domains</key>\n\t<array>\n\t\t<string>applinks:${config.host}</string>\n\t</array>\n</dict>\n</plist>\n`;
  writeFileSync(paths.iosEntitlements, entitlements, 'utf8');
}

async function ensureIosProject() {
  if (existsSync(paths.iosProject)) {
    return;
  }

  await runNpm(['exec', '--', 'cap', 'add', 'ios'], paths.root);
}

async function syncIosProject() {
  try {
    await runNpm(['exec', '--', 'cap', 'sync', 'ios'], paths.root);
  } catch (error) {
    if (process.platform !== 'win32') {
      throw error;
    }

    console.warn(
      '[ios] `cap sync ios` failed on Windows, falling back to `cap copy ios`. '
        + 'CocoaPods and archive steps still require macOS.',
    );
    await runNpm(['exec', '--', 'cap', 'copy', 'ios'], paths.root);
  }
}

async function main() {
  await runNpm(['--prefix', './frontend', 'run', 'build'], paths.root);
  await ensureIosProject();
  await syncIosProject();
  normalizeGeneratedProject();
  console.log(`iOS wrapper synced in ${paths.iosDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
