import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Spring tuner removal contract', () => {
  it('is not imported or rendered in App.tsx', () => {
    const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(appSource).not.toContain("import('./components/SpringTuner')");
    expect(appSource).not.toContain('{SpringTuner && activeScreen === \'settings\' && (');
  });
});
