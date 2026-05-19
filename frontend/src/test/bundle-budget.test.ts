import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distRoot = resolve(__dirname, '../../dist');
const distDir = resolve(__dirname, '../../dist/assets');

const hasDistDir = existsSync(distDir);

function readIndexHtml(): string {
  return readFileSync(resolve(distRoot, 'index.html'), 'utf-8');
}

function initialDocumentFiles(): string[] {
  const html = readIndexHtml();
  const scriptAssets = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)]
    .map((match) => match[1]);
  const linkedAssets = [...html.matchAll(/<link[^>]+rel="(?:modulepreload|stylesheet)"[^>]+href="([^"]+)"/g)]
    .map((match) => match[1]);
  const assetPaths = [...new Set([...scriptAssets, ...linkedAssets])]
    .filter((href) => href.startsWith('/assets/'))
    .map((href) => resolve(distRoot, href.slice(1)));

  return [resolve(distRoot, 'index.html'), ...assetPaths];
}

function mainIndexChunkName(): string | undefined {
  const html = readIndexHtml();
  return html.match(/src="\/assets\/(index-[^"]+\.js)"/)?.[1];
}

describe.skipIf(!hasDistDir)('Bundle budget', () => {
  it('initial document gzip total under 500KB', () => {
    const files = initialDocumentFiles();
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

  it('vendor-three chunk under 760KB', () => {
    const files = readdirSync(distDir);
    const threeChunk = files.find((f) => f.startsWith('vendor-three'));
    expect(threeChunk).toBeDefined();
    const size = statSync(resolve(distDir, threeChunk!)).size;
    expect(size).toBeLessThan(760 * 1024);
  });

  it('does not modulepreload vendor-three from the initial document', () => {
    const html = readFileSync(resolve(distRoot, 'index.html'), 'utf-8');
    const modulePreloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)]
      .map((match) => match[1]);

    expect(modulePreloads.filter((href) => href.includes('/assets/vendor-three'))).toEqual([]);
  });

  it('vendor-react chunk under 200KB', () => {
    const files = readdirSync(distDir);
    const reactChunk = files.find((f) => f.startsWith('vendor-react'));
    expect(reactChunk).toBeDefined();
    const size = statSync(resolve(distDir, reactChunk!)).size;
    expect(size).toBeLessThan(200 * 1024);
  });

  it('main index chunk under 360KB', () => {
    const indexChunk = mainIndexChunkName();
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
