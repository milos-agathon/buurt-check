import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distRoot = resolve(__dirname, '../../dist');
const distDir = resolve(__dirname, '../../dist/assets');

const hasDistDir = existsSync(distDir);

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const filePath = resolve(dir, entry);
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      return collectFiles(filePath);
    }
    return [filePath];
  });
}

function normalizeDistPath(filePath: string): string {
  return relative(distRoot, filePath).replace(/\\/g, '/');
}

function isStandaloneRuntimeAsset(filePath: string): boolean {
  const normalized = normalizeDistPath(filePath);
  if (normalized.startsWith('__pycache__/') || normalized.endsWith('.py') || normalized.endsWith('.pyc')) {
    return true;
  }
  return normalized === 'privacy.html'
    || normalized === 'terms.html'
    || normalized === 'offline.html'
    || normalized === 'legal.css'
    || normalized === 'og-image.svg'
    || normalized === 'og-image.png'
    || normalized === '.well-known/apple-app-site-association'
    || normalized === '.well-known/assetlinks.json';
}

describe.skipIf(!hasDistDir)('Bundle budget', () => {
  it('initial app dist gzip total under 500KB (excludes workers, service worker, and standalone docs)', () => {
    const files = collectFiles(distRoot).filter((filePath) => (
      !filePath.includes('sunlightWorker-') && !filePath.includes('svfWorker-')
      && normalizeDistPath(filePath) !== 'sw.js'
      && !isStandaloneRuntimeAsset(filePath)
    ));
    const totalGzip = files.reduce((sum, filePath) => {
      const gzipped = gzipSync(readFileSync(filePath)).length;
      return sum + gzipped;
    }, 0);
    expect(totalGzip).toBeLessThan(500 * 1024);
  });

  it('sunlight worker chunk under 150KB', () => {
    const files = readdirSync(distDir);
    const workerChunk = files.find((f) => f.startsWith('sunlightWorker-'));
    expect(workerChunk).toBeDefined();
    const size = statSync(resolve(distDir, workerChunk!)).size;
    expect(size).toBeLessThan(150 * 1024);
  });

  it('svf worker chunk under 550KB', () => {
    const files = readdirSync(distDir);
    const workerChunk = files.find((f) => f.startsWith('svfWorker-'));
    expect(workerChunk).toBeDefined();
    const size = statSync(resolve(distDir, workerChunk!)).size;
    expect(size).toBeLessThan(550 * 1024);
  });

  it('vendor-three chunk under 550KB', () => {
    const files = readdirSync(distDir);
    const threeChunk = files.find((f) => f.startsWith('vendor-three'));
    expect(threeChunk).toBeDefined();
    const size = statSync(resolve(distDir, threeChunk!)).size;
    expect(size).toBeLessThan(550 * 1024);
  });

  it('vendor-react chunk under 200KB', () => {
    const files = readdirSync(distDir);
    const reactChunk = files.find((f) => f.startsWith('vendor-react'));
    expect(reactChunk).toBeDefined();
    const size = statSync(resolve(distDir, reactChunk!)).size;
    expect(size).toBeLessThan(200 * 1024);
  });

  it('main index chunk under 360KB', () => {
    const files = readdirSync(distDir);
    const indexChunk = files.find((f) => f.startsWith('index-') && f.endsWith('.js'));
    expect(indexChunk).toBeDefined();
    const size = statSync(resolve(distDir, indexChunk!)).size;
    expect(size).toBeLessThan(360 * 1024);
  });

  it('service worker bundle under 35KB', () => {
    const serviceWorker = resolve(distRoot, 'sw.js');
    expect(existsSync(serviceWorker)).toBe(true);
    const size = statSync(serviceWorker).size;
    expect(size).toBeLessThan(35 * 1024);
  });
});
