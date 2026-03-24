import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { paths, resolveIosConfig } from './ios-config.mjs';

const DEFAULT_APPLE_PRODUCT_ID = 'full_dossier_unlock';
const APPLE_CERT_FILES = [
  'AppleIncRootCertificate.cer',
  'AppleRootCA-G2.cer',
  'AppleRootCA-G3.cer',
];
const REQUIRED_AASA_PATHS = ['/address/*', '/search', '/saved', '/compare', '/settings'];
const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  'frontend/.env',
  'frontend/.env.local',
  'frontend/.env.production',
  'frontend/.env.production.local',
  'backend/.env',
  'backend/.env.local',
  'backend/.env.production',
  'backend/.env.production.local',
];

function parseEnvFile(filePath) {
  const env = {};
  if (!existsSync(filePath)) {
    return env;
  }

  const source = readFileSync(filePath, 'utf8');
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function loadMergedEnv() {
  const env = {};
  for (const relativePath of ENV_FILES) {
    Object.assign(env, parseEnvFile(new URL(`../${relativePath}`, import.meta.url)));
  }
  return { ...env, ...process.env };
}

function normalizeBoolean(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function printLines(label, lines) {
  if (lines.length === 0) return;
  console.log(`${label}:`);
  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

async function main() {
  const strict = process.argv.includes('--strict');
  const env = loadMergedEnv();
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  const passes = [];
  const warnings = [];
  const failures = [];
  const config = resolveIosConfig();

  const pushResult = (collection, message) => {
    collection.push(message);
  };

  const requireFile = (filePath, description) => {
    if (!existsSync(filePath)) {
      pushResult(failures, `${description} missing at ${filePath}`);
      return false;
    }
    pushResult(passes, `${description} present`);
    return true;
  };

  const aasaPath = new URL('../frontend/public/.well-known/apple-app-site-association', import.meta.url);
  const capacitorConfigPath = new URL('../ios/App/App/capacitor.config.json', import.meta.url);
  const storyboardPath = new URL('../ios/App/App/Base.lproj/Main.storyboard', import.meta.url);
  const infoPlistPath = new URL('../ios/App/App/Info.plist', import.meta.url);
  const bridgeControllerPath = new URL('../ios/App/App/BridgeViewController.swift', import.meta.url);
  const nativeBridgePath = new URL('../ios/App/App/AppleBillingBridge.swift', import.meta.url);
  const appleCertDir = new URL('../backend/app/certs/apple', import.meta.url);

  requireFile(paths.iosProject, 'iOS Xcode project');
  requireFile(paths.iosPbxproj, 'iOS project.pbxproj');
  requireFile(paths.iosEntitlements, 'iOS entitlements file');
  requireFile(bridgeControllerPath, 'custom bridge controller');
  requireFile(nativeBridgePath, 'Apple billing bridge');
  requireFile(aasaPath, 'Apple App Site Association file');
  requireFile(capacitorConfigPath, 'synced Capacitor iOS config');
  requireFile(infoPlistPath, 'iOS Info.plist');
  requireFile(storyboardPath, 'iOS storyboard');

  for (const certificateFile of APPLE_CERT_FILES) {
    requireFile(new URL(`../backend/app/certs/apple/${certificateFile}`, import.meta.url), `Apple root certificate ${certificateFile}`);
  }

  const baseUrl = config.baseUrl;
  if (baseUrl.protocol !== 'https:') {
    const message = `BUURT_BASE_URL must use https for App Store release checks (current: ${baseUrl.origin})`;
    pushResult(strict ? failures : warnings, message);
  } else {
    pushResult(passes, `BUURT_BASE_URL uses https (${baseUrl.origin})`);
  }

  if (isLocalHost(baseUrl.hostname)) {
    const message = `BUURT_BASE_URL host must be public for universal links (current: ${baseUrl.host})`;
    pushResult(strict ? failures : warnings, message);
  } else {
    pushResult(passes, `BUURT_BASE_URL host is public (${baseUrl.host})`);
  }

  const pbxproj = existsSync(paths.iosPbxproj) ? readFileSync(paths.iosPbxproj, 'utf8') : '';
  if (pbxproj) {
    if (pbxproj.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleId};`)) {
      pushResult(passes, `Xcode project bundle identifier matches ${config.bundleId}`);
    } else {
      pushResult(failures, `Xcode project bundle identifier does not match ${config.bundleId}`);
    }

    if (pbxproj.includes('TARGETED_DEVICE_FAMILY = 1;')) {
      pushResult(passes, 'Xcode project is configured for iPhone only');
    } else {
      pushResult(failures, 'Xcode project must target iPhone only');
    }

    if (pbxproj.includes('IPHONEOS_DEPLOYMENT_TARGET = 15.0;')) {
      pushResult(passes, 'Xcode deployment target is pinned to iOS 15.0');
    } else {
      pushResult(failures, 'Xcode deployment target must be iOS 15.0');
    }

    if (pbxproj.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) {
      pushResult(passes, 'Xcode project uses App/App.entitlements');
    } else {
      pushResult(failures, 'Xcode project is missing CODE_SIGN_ENTITLEMENTS = App/App.entitlements');
    }
  }

  const entitlements = existsSync(paths.iosEntitlements) ? readFileSync(paths.iosEntitlements, 'utf8') : '';
  if (entitlements.includes(`applinks:${config.host}`)) {
    pushResult(passes, `entitlements include applinks:${config.host}`);
  } else {
    pushResult(failures, `entitlements must include applinks:${config.host}`);
  }

  const infoPlist = existsSync(infoPlistPath) ? readFileSync(infoPlistPath, 'utf8') : '';
  if (infoPlist.includes('<string>UIInterfaceOrientationPortrait</string>')) {
    pushResult(passes, 'Info.plist keeps portrait orientation');
  } else {
    pushResult(failures, 'Info.plist must include portrait orientation');
  }
  if (
    infoPlist.includes('UIInterfaceOrientationLandscapeLeft')
    || infoPlist.includes('UIInterfaceOrientationLandscapeRight')
  ) {
    pushResult(failures, 'Info.plist must not include landscape iPhone orientations');
  } else {
    pushResult(passes, 'Info.plist excludes landscape iPhone orientations');
  }

  const storyboard = existsSync(storyboardPath) ? readFileSync(storyboardPath, 'utf8') : '';
  if (storyboard.includes('customClass="BridgeViewController"')) {
    pushResult(passes, 'storyboard uses BridgeViewController');
  } else {
    pushResult(failures, 'storyboard must use BridgeViewController as the root controller');
  }

  if (existsSync(capacitorConfigPath)) {
    const capacitorConfig = readJsonFile(capacitorConfigPath);
    const packages = Array.isArray(capacitorConfig.packageClassList)
      ? capacitorConfig.packageClassList
      : [];
    if (packages.includes('AppPlugin')) {
      pushResult(passes, 'synced Capacitor config includes AppPlugin');
    } else {
      pushResult(failures, 'synced Capacitor config must include AppPlugin');
    }
  }

  if (existsSync(aasaPath)) {
    const aasa = readJsonFile(aasaPath);
    const details = Array.isArray(aasa?.applinks?.details) ? aasa.applinks.details : [];
    const detail = details[0];
    const appIDs = Array.isArray(detail?.appIDs) ? detail.appIDs : [];
    const components = Array.isArray(detail?.components) ? detail.components : [];
    const expectedAppId = config.teamId ? `${config.teamId}.${config.bundleId}` : null;

    if (expectedAppId) {
      if (appIDs.includes(expectedAppId)) {
        pushResult(passes, `AASA includes ${expectedAppId}`);
      } else {
        pushResult(failures, `AASA must include ${expectedAppId}`);
      }
    } else {
      const message = 'BUURT_IOS_TEAM_ID is not set, so the AASA file is still using a placeholder appID';
      pushResult(strict ? failures : warnings, message);
    }

    for (const route of REQUIRED_AASA_PATHS) {
      const matched = components.some((component) => component?.['/'] === route);
      if (!matched) {
        pushResult(failures, `AASA is missing applinks component ${route}`);
      }
    }
    if (REQUIRED_AASA_PATHS.every((route) => components.some((component) => component?.['/'] === route))) {
      pushResult(passes, 'AASA includes the expected universal-link routes');
    }
  }

  const appleEnabled = normalizeBoolean(env.BUURT_APPLE_ENABLED || '');
  if (appleEnabled) {
    pushResult(passes, 'BUURT_APPLE_ENABLED=true');
  } else {
    pushResult(strict ? failures : warnings, 'BUURT_APPLE_ENABLED is not true');
  }

  const backendBundleId = (env.BUURT_APPLE_BUNDLE_ID || config.bundleId).trim();
  if (backendBundleId === config.bundleId) {
    pushResult(passes, 'backend Apple bundle ID matches the iOS bundle ID');
  } else {
    pushResult(failures, 'backend Apple bundle ID does not match the iOS bundle ID');
  }

  const backendProductId = (env.BUURT_APPLE_PRODUCT_ID || DEFAULT_APPLE_PRODUCT_ID).trim();
  const frontendProductId = (env.VITE_APPLE_PRODUCT_ID || '').trim();
  if (!frontendProductId) {
    if (backendProductId === DEFAULT_APPLE_PRODUCT_ID) {
      pushResult(passes, 'frontend Apple product ID will use the default full_dossier_unlock fallback');
    } else {
      pushResult(failures, 'VITE_APPLE_PRODUCT_ID must be set when using a non-default Apple product ID');
    }
  } else if (frontendProductId !== backendProductId) {
    pushResult(failures, 'frontend and backend Apple product IDs do not match');
  } else {
    pushResult(passes, 'frontend and backend Apple product IDs match');
  }

  const appleEnvironment = (env.BUURT_APPLE_ENVIRONMENT || 'production').trim().toLowerCase();
  if (appleEnvironment === 'production') {
    pushResult(passes, 'BUURT_APPLE_ENVIRONMENT=production');
  } else {
    pushResult(strict ? failures : warnings, `BUURT_APPLE_ENVIRONMENT is ${appleEnvironment}, expected production`);
  }

  const appleIssuerId = (env.BUURT_APPLE_ISSUER_ID || '').trim();
  const appleKeyId = (env.BUURT_APPLE_KEY_ID || '').trim();
  const applePrivateKeyFile = (env.BUURT_APPLE_PRIVATE_KEY_FILE || '').trim();
  const applePrivateKeyPem = (env.BUURT_APPLE_PRIVATE_KEY_PEM || '').trim();
  const appleAppStoreId = (env.BUURT_APPLE_APP_STORE_ID || '').trim();

  if (!appleIssuerId) {
    pushResult(strict ? failures : warnings, 'BUURT_APPLE_ISSUER_ID is not set');
  } else {
    pushResult(passes, 'BUURT_APPLE_ISSUER_ID is set');
  }

  if (!appleKeyId) {
    pushResult(strict ? failures : warnings, 'BUURT_APPLE_KEY_ID is not set');
  } else {
    pushResult(passes, 'BUURT_APPLE_KEY_ID is set');
  }

  if (!applePrivateKeyFile && !applePrivateKeyPem) {
    pushResult(strict ? failures : warnings, 'Set BUURT_APPLE_PRIVATE_KEY_FILE or BUURT_APPLE_PRIVATE_KEY_PEM');
  } else if (applePrivateKeyFile && !existsSync(resolve(paths.root, applePrivateKeyFile))) {
    pushResult(strict ? failures : warnings, 'BUURT_APPLE_PRIVATE_KEY_FILE does not exist in the repo-relative location provided');
  } else {
    pushResult(passes, 'Apple private key input is configured');
  }

  if (!appleAppStoreId) {
    pushResult(strict ? failures : warnings, 'BUURT_APPLE_APP_STORE_ID is not set');
  } else if (!/^\d+$/u.test(appleAppStoreId)) {
    pushResult(failures, 'BUURT_APPLE_APP_STORE_ID must be numeric');
  } else {
    pushResult(passes, 'BUURT_APPLE_APP_STORE_ID is numeric');
  }

  if (config.teamId) {
    pushResult(passes, 'BUURT_IOS_TEAM_ID is set');
  }

  printLines('Pass', passes);
  printLines('Warning', warnings);
  printLines('Fail', failures);

  if (failures.length > 0) {
    console.error(`iOS release readiness check failed with ${failures.length} issue(s).`);
    process.exit(1);
  }

  console.log(
    strict
      ? 'iOS release readiness check passed.'
      : 'iOS repo-side readiness check passed.',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
