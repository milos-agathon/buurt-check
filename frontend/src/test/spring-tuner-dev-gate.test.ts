import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Spring tuner dev gate contract', () => {
  it('is lazy-loaded behind an import.meta.env.DEV guard in App.tsx', () => {
    const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(appSource).toContain(
      "const SpringTuner = import.meta.env.DEV ? lazy(() => import('./components/SpringTuner')) : null;",
    );
    expect(appSource).toContain('{SpringTuner && activeScreen === \'settings\' && (');
  });
});
