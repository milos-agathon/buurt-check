import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
];

function loadEnvFile(env) {
  for (const fileName of ENV_FILES) {
    const filePath = resolve(process.cwd(), fileName);
    try {
      const source = readFileSync(filePath, 'utf8');
      for (const rawLine of source.split(/\r?\n/u)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separatorIndex = line.indexOf('=');
        if (separatorIndex < 0) continue;
        const key = line.slice(0, separatorIndex).trim();
        if (!key || key in env) continue;
        let value = line.slice(separatorIndex + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    } catch {
      // Ignore missing env files.
    }
  }
}

const env = { ...process.env };
loadEnvFile(env);

const packageName = env.VITE_PLAY_PACKAGE_NAME || 'TODO_SET_PLAY_PACKAGE_NAME';
const fingerprintsRaw = env.VITE_PLAY_SHA256_CERT_FINGERPRINTS
  || 'TODO_SET_SHA256_CERT_FINGERPRINT';
const fingerprints = fingerprintsRaw
  .split(',')
  .map((fingerprint) => fingerprint.trim())
  .filter(Boolean);

const assetLinks = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: packageName,
    sha256_cert_fingerprints: fingerprints,
  },
}];

const outputPath = resolve(process.cwd(), 'public', '.well-known', 'assetlinks.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(assetLinks, null, 2)}\n`, 'utf8');

if (
  packageName.startsWith('TODO_SET_')
  || fingerprints.some((fingerprint) => fingerprint.startsWith('TODO_SET_'))
) {
  console.warn(
    '[assetlinks] Generated placeholder assetlinks.json. Set VITE_PLAY_PACKAGE_NAME and '
      + 'VITE_PLAY_SHA256_CERT_FINGERPRINTS before a production release.',
  );
}
