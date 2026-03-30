import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const WORKTREE_PORT = 4174;
const BASELINE_PORT = 4175;
const RUNS = Number.parseInt(process.env.LANDING_PERF_RUNS ?? '3', 10);
const SETTLE_MS = Number.parseInt(process.env.LANDING_PERF_SETTLE_MS ?? '1500', 10);
const MODE = process.argv[2] === 'live' ? 'live' : 'local';
const LIVE_BASELINE_URL = process.env.LANDING_PERF_LIVE_URL ?? 'https://buurt-check.nl/';
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(ROOT_DIR, 'frontend/package.json'));
const { chromium } = require('@playwright/test');

const SCENARIOS = [
  {
    label: 'Mobile 390x844',
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
  {
    label: 'Desktop 1440x900',
    viewport: { width: 1440, height: 900 },
  },
];

function gitShow(repoPath) {
  const result = spawnSync('git', ['show', `HEAD:${repoPath}`], {
    cwd: ROOT_DIR,
    encoding: null,
  });

  if (result.status !== 0) {
    throw new Error(`Unable to read HEAD:${repoPath}: ${result.stderr?.toString().trim() || 'git show failed'}`);
  }

  return result.stdout;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middleIndex];
  }

  return Math.round((sorted[middleIndex - 1] + sorted[middleIndex]) / 2);
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

async function waitForServer(url, serverProcess) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Server for ${url} exited early with code ${serverProcess.exitCode}`);
    }

    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Retry until timeout.
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function stopServer(serverProcess) {
  if (!serverProcess || serverProcess.exitCode !== null) {
    return;
  }

  serverProcess.kill();
}

function startServer({ port, landingDir, publicDir }) {
  return spawn('node', ['./scripts/serve-landing.mjs'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      LANDING_PORT: String(port),
      LANDING_PUBLIC_DIR: publicDir,
      LANDING_STATIC_DIR: landingDir,
    },
    stdio: 'ignore',
  });
}

function prepareBaselineWorkspace() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'landing-baseline-'));
  const baselineLandingDir = join(tempRoot, 'landing');

  mkdirSync(baselineLandingDir, { recursive: true });
  writeFileSync(join(baselineLandingDir, 'index.html'), gitShow('landing/index.html'));
  writeFileSync(join(baselineLandingDir, 'og-image.svg'), gitShow('landing/og-image.svg'));
  writeFileSync(join(baselineLandingDir, 'og-image.png'), gitShow('landing/og-image.png'));
  cpSync(resolve(ROOT_DIR, 'landing', 'fonts'), join(baselineLandingDir, 'fonts'), { recursive: true });

  return {
    tempRoot,
    landingDir: baselineLandingDir,
    publicDir: resolve(ROOT_DIR, 'frontend', 'public'),
    source: 'HEAD:landing/index.html',
  };
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function prepareLiveBaselineWorkspace() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'landing-live-baseline-'));
  const baselineLandingDir = join(tempRoot, 'landing');
  const liveOrigin = new URL(LIVE_BASELINE_URL).origin;

  mkdirSync(join(baselineLandingDir, 'fonts'), { recursive: true });
  writeFileSync(join(baselineLandingDir, 'index.html'), await fetchBytes(LIVE_BASELINE_URL));
  writeFileSync(join(baselineLandingDir, 'og-image.svg'), await fetchBytes(`${liveOrigin}/og-image.svg`));
  writeFileSync(join(baselineLandingDir, 'og-image.png'), await fetchBytes(`${liveOrigin}/og-image.png`));
  writeFileSync(
    join(baselineLandingDir, 'fonts', 'Satoshi-Variable.woff'),
    await fetchBytes(`${liveOrigin}/fonts/Satoshi-Variable.woff`),
  );
  writeFileSync(
    join(baselineLandingDir, 'fonts', 'Satoshi-Variable.woff2'),
    await fetchBytes(`${liveOrigin}/fonts/Satoshi-Variable.woff2`),
  );

  return {
    tempRoot,
    landingDir: baselineLandingDir,
    publicDir: resolve(ROOT_DIR, 'frontend', 'public'),
    source: `snapshot:${LIVE_BASELINE_URL}`,
  };
}

async function measureLcp(url, scenario) {
  const browser = await chromium.launch({ headless: true });
  const measurements = [];

  try {
    for (let runIndex = 0; runIndex < RUNS; runIndex += 1) {
      const context = await browser.newContext({
        isMobile: scenario.isMobile ?? false,
        locale: 'nl-NL',
        viewport: scenario.viewport,
      });
      const page = await context.newPage();

      await page.addInitScript(() => {
        window.__landingLcpEntries = [];

        new PerformanceObserver((entryList) => {
          window.__landingLcpEntries = entryList.getEntries().map((entry) => ({
            startTime: Math.round(entry.startTime),
            size: entry.size,
          }));
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });

      await page.goto(url, { timeout: 45_000, waitUntil: 'load' });
      await page.waitForTimeout(SETTLE_MS);

      const measurement = await page.evaluate(() => {
        const entries = window.__landingLcpEntries || [];
        const lastEntry = entries.at(-1);
        return lastEntry ? Math.round(lastEntry.startTime) : null;
      });

      await context.close();

      if (measurement === null) {
        throw new Error(`No LCP entry was recorded for ${scenario.label}`);
      }

      measurements.push(measurement);
    }
  } finally {
    await browser.close();
  }

  return measurements;
}

async function main() {
  const baselineWorkspace = MODE === 'live'
    ? await prepareLiveBaselineWorkspace()
    : prepareBaselineWorkspace();
  const worktreeUrl = `http://${HOST}:${WORKTREE_PORT}/`;
  const baselineUrl = `http://${HOST}:${BASELINE_PORT}/`;
  const worktreeServer = startServer({
    landingDir: resolve(ROOT_DIR, 'landing'),
    port: WORKTREE_PORT,
    publicDir: resolve(ROOT_DIR, 'frontend', 'public'),
  });
  const baselineServer = startServer({
    landingDir: baselineWorkspace.landingDir,
    port: BASELINE_PORT,
    publicDir: baselineWorkspace.publicDir,
  });

  try {
    await waitForServer(worktreeUrl, worktreeServer);
    await waitForServer(baselineUrl, baselineServer);

    const scenarioResults = [];

    for (const scenario of SCENARIOS) {
      const baselineRuns = await measureLcp(baselineUrl, scenario);
      const worktreeRuns = await measureLcp(worktreeUrl, scenario);

      scenarioResults.push({
        baselineMedianMs: median(baselineRuns),
        baselineRunsMs: baselineRuns,
        deltaMs: median(worktreeRuns) - median(baselineRuns),
        scenario: scenario.label,
        worktreeMedianMs: median(worktreeRuns),
        worktreeRunsMs: worktreeRuns,
      });
    }

    const output = {
      baseline: MODE === 'local'
        ? {
          port: BASELINE_PORT,
          source: baselineWorkspace.source,
          url: baselineUrl,
        }
        : {
          liveSourceUrl: LIVE_BASELINE_URL,
          port: BASELINE_PORT,
          source: baselineWorkspace.source,
          url: baselineUrl,
        },
      comparison: MODE === 'live' ? 'live-vs-candidate' : 'local-proxy',
      generatedAt: new Date().toISOString(),
      note: MODE === 'live'
        ? 'Live-snapshot-versus-candidate comparison. Baseline HTML and static assets are fetched from the currently deployed landing page at measurement time, then both baseline and candidate are served locally under the same conditions.'
        : 'Local proxy comparison only. This is not a live-versus-production measurement.',
      runs: RUNS,
      scenarios: scenarioResults,
      settleMs: SETTLE_MS,
      worktree: {
        port: WORKTREE_PORT,
        source: 'working tree landing/index.html',
        url: worktreeUrl,
      },
    };

    if (process.env.LANDING_PERF_OUTPUT) {
      writeFileSync(process.env.LANDING_PERF_OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
    }

    console.log(
      MODE === 'live'
        ? `Landing live-snapshot-versus-candidate LCP comparison (${RUNS} runs, ${SETTLE_MS}ms settle):`
        : `Landing local LCP comparison (${RUNS} runs, ${SETTLE_MS}ms settle):`,
    );
    scenarioResults.forEach((result) => {
      const deltaPrefix = result.deltaMs >= 0 ? '+' : '';
      console.log(
        `- ${result.scenario}: baseline ${result.baselineMedianMs}ms, worktree ${result.worktreeMedianMs}ms, delta ${deltaPrefix}${result.deltaMs}ms`,
      );
    });
    console.log(JSON.stringify(output, null, 2));
  } finally {
    stopServer(worktreeServer);
    stopServer(baselineServer);
    if (baselineWorkspace) {
      rmSync(baselineWorkspace.tempRoot, { force: true, recursive: true });
    }
  }
}

await main();
