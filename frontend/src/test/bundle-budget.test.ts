import { existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = resolve(__dirname, '../../dist/assets');

const hasDistDir = existsSync(distDir);

describe.skipIf(!hasDistDir)('Bundle budget', () => {
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

  it('main index chunk under 350KB', () => {
    const files = readdirSync(distDir);
    const indexChunk = files.find((f) => f.startsWith('index-') && f.endsWith('.js'));
    expect(indexChunk).toBeDefined();
    const size = statSync(resolve(distDir, indexChunk!)).size;
    expect(size).toBeLessThan(350 * 1024);
  });
});
