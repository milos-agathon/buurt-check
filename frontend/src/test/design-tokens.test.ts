import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const tokensCssPath = resolve(__dirname, '../styles/tokens.css');
const shadowSliderCssPath = resolve(__dirname, '../components/ShadowTimeSlider.css');

describe('Design tokens', () => {
  it('defines --color-surface-hover in tokens.css', () => {
    const css = readFileSync(tokensCssPath, 'utf8');
    expect(css).toMatch(/--color-surface-hover:\s*[^;]+;/);
  });

  it('uses hover token fallback in ShadowTimeSlider styles', () => {
    const css = readFileSync(shadowSliderCssPath, 'utf8');
    expect(css).toContain('var(--color-surface-hover, var(--color-surface-alt))');
  });
});
