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

const teamId = (env.BUURT_IOS_TEAM_ID || 'TODO_SET_TEAM_ID').trim();
const bundleId = (env.BUURT_IOS_BUNDLE_ID || 'nl.buurtcheck.app.ios').trim();
const appId = `${teamId}.${bundleId}`;

const association = {
  applinks: {
    apps: [],
    details: [{
      appIDs: [appId],
      components: [
        { '/': '/address/*', comment: 'Open dossier deep links in the iPhone app.' },
        { '/': '/search', comment: 'Open the search screen in the iPhone app.' },
        { '/': '/saved', comment: 'Open the shortlist screen in the iPhone app.' },
        { '/': '/compare', comment: 'Open the compare screen in the iPhone app.' },
        { '/': '/settings', comment: 'Open the settings screen in the iPhone app.' },
      ],
    }],
  },
};

const outputPath = resolve(
  process.cwd(),
  'public',
  '.well-known',
  'apple-app-site-association',
);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(association, null, 2), 'utf8');

if (teamId.startsWith('TODO_SET_')) {
  console.warn(
    '[aasa] Generated placeholder apple-app-site-association. Set BUURT_IOS_TEAM_ID '
      + 'before a production release.',
  );
}
