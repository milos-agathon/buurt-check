import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distAssetsDir = resolve(__dirname, '../../dist/assets');

const hasDist = existsSync(distAssetsDir);

describe.skipIf(!hasDist)('Spring tuner production bundle guard', () => {
  it('does not emit a SpringTuner chunk in production build output', () => {
    const files = readdirSync(distAssetsDir);
    const springChunk = files.find((file) => /springtuner|spring-tuner/i.test(file));
    expect(springChunk).toBeUndefined();
  });

  it('does not include spring tuner markers in built JS assets', () => {
    const files = readdirSync(distAssetsDir).filter((file) => file.endsWith('.js'));
    const bundleText = files
      .map((file) => readFileSync(resolve(distAssetsDir, file), 'utf8'))
      .join('\n');

    expect(bundleText).not.toContain('spring-tuner');
    expect(bundleText).not.toContain('Spring Tuner (Dev)');
  });
});
