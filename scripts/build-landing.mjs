import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import process from 'node:process';

const ROOT_DIR = process.cwd();
const LANDING_DIR = resolve(ROOT_DIR, 'landing');
const OUTPUT_DIR = resolve(ROOT_DIR, process.env.LANDING_BUILD_DIR ?? 'dist-landing');
const LANDING_GA_MEASUREMENT_ID = (process.env.BUURTCHECK_GA_MEASUREMENT_ID ?? '').trim();
const LANDING_APP_URL = (process.env.BUURTCHECK_LANDING_APP_URL ?? 'https://app.buurt-check.nl/#/search').trim();
const GA_MEASUREMENT_PLACEHOLDER = '__BUURTCHECK_GA_MEASUREMENT_ID__';
const APP_URL_PLACEHOLDER = '__BUURTCHECK_APP_URL__';

function escapeHtmlAttribute(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function copyTree(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });

  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, entry);
    const stats = statSync(sourcePath);

    if (stats.isDirectory()) {
      if (entry === 'source' && sourceDir === `${LANDING_DIR}${sep}images`) {
        continue;
      }

      copyTree(sourcePath, targetPath);
      continue;
    }

    if (sourcePath.endsWith('.html')) {
      const html = readFileSync(sourcePath, 'utf8')
        .replaceAll(
          GA_MEASUREMENT_PLACEHOLDER,
          escapeHtmlAttribute(LANDING_GA_MEASUREMENT_ID),
        )
        .replaceAll(
          APP_URL_PLACEHOLDER,
          escapeHtmlAttribute(LANDING_APP_URL),
        );
      writeFileSync(targetPath, html, 'utf8');
      continue;
    }

    cpSync(sourcePath, targetPath);
  }
}

rmSync(OUTPUT_DIR, { recursive: true, force: true });
copyTree(LANDING_DIR, OUTPUT_DIR);

console.log(`Landing build written to ${OUTPUT_DIR}`);
