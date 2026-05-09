import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const tokensCssPath = resolve(__dirname, '../styles/tokens.css');
const shadowSliderCssPath = resolve(__dirname, '../components/ShadowTimeSlider.css');
const landingHtmlPath = resolve(__dirname, '../../../landing/index.html');

function readCustomProperty(css: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(`Missing custom property: ${name}`);
  }
  return match[1].trim();
}

describe('Design tokens', () => {
  it('defines --color-surface-hover in tokens.css', () => {
    const css = readFileSync(tokensCssPath, 'utf8');
    expect(css).toMatch(/--color-surface-hover:\s*[^;]+;/);
  });

  it('uses hover token fallback in ShadowTimeSlider styles', () => {
    const css = readFileSync(shadowSliderCssPath, 'utf8');
    expect(css).toContain('var(--color-surface-hover, var(--color-surface-alt))');
  });

  it('keeps ShadowTimeSlider date presets in one row', () => {
    const css = readFileSync(shadowSliderCssPath, 'utf8');
    expect(css).toMatch(/\.shadow-slider__presets\s*\{[^}]*flex-wrap:\s*nowrap;/s);
  });

  it('keeps app color and typography foundation in parity with the landing page', () => {
    const tokens = readFileSync(tokensCssPath, 'utf8');
    const landing = readFileSync(landingHtmlPath, 'utf8');

    const parityVariables = [
      '--landing-bg',
      '--landing-bg-top',
      '--landing-bg-mid',
      '--landing-surface-strong',
      '--landing-border',
      '--landing-border-soft',
      '--landing-text',
      '--landing-text-secondary',
      '--landing-text-muted',
      '--landing-nav-bg',
      '--landing-nav-control',
      '--landing-nav-control-hover',
      '--landing-accent',
      '--landing-accent-hover',
      '--landing-accent-soft',
      '--landing-accent-text',
      '--landing-tertiary',
      '--landing-tertiary-text',
      '--landing-tertiary-soft',
      '--landing-button-text',
      '--landing-shadow',
      '--landing-shadow-soft',
      '--landing-radius-lg',
      '--landing-radius-md',
      '--landing-radius-sm',
      '--landing-max-width',
      '--landing-focus',
    ];

    for (const variable of parityVariables) {
      expect(readCustomProperty(tokens, variable)).toBe(readCustomProperty(landing, variable));
    }

    expect(readCustomProperty(tokens, '--color-accent')).toBe('var(--landing-accent)');
    expect(readCustomProperty(tokens, '--color-accent-text')).toBe('var(--landing-accent-text)');
    expect(readCustomProperty(tokens, '--color-text')).toBe('var(--landing-text)');
    expect(readCustomProperty(tokens, '--color-text-secondary')).toBe('var(--landing-text-secondary)');
    expect(readCustomProperty(tokens, '--font-family')).toContain("'Segoe UI'");
  });
});
