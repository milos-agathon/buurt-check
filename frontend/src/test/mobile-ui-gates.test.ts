import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readCss(relativePath: string): string {
  return readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleBlock(css: string, selector: string): string {
  const pattern = new RegExp(`${escapeRegex(selector)}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const match = css.match(pattern);
  if (!match) {
    throw new Error(`Missing selector: ${selector}`);
  }
  return match[1];
}

function pxValue(block: string, property: string): number {
  const pattern = new RegExp(`${escapeRegex(property)}\\s*:\\s*([0-9.]+)px`, 'm');
  const match = block.match(pattern);
  if (!match) {
    throw new Error(`Missing px value for ${property}`);
  }
  return Number(match[1]);
}

describe('Mobile UI quality gates', () => {
  it('toolbar rows avoid overlapping hit-area patterns', () => {
    const topBarCss = readCss('components/TopBar.css');
    const tabBarCss = readCss('components/TabBar.css');
    const actionBarCss = readCss('components/ActionBar.css');

    expect(ruleBlock(topBarCss, '.top-bar__actions')).toContain('display: flex');
    expect(ruleBlock(topBarCss, '.top-bar__actions')).toContain('gap: var(--space-3xs)');
    expect(ruleBlock(tabBarCss, '.tab-bar')).toContain('display: flex');
    expect(ruleBlock(actionBarCss, '.action-bar')).toContain('display: flex');

    expect(ruleBlock(tabBarCss, '.tab-bar__tab')).not.toMatch(/position:\s*absolute/);
    expect(ruleBlock(actionBarCss, '.action-bar__btn')).not.toMatch(/position:\s*absolute/);
    expect(ruleBlock(topBarCss, '.top-bar__settings')).not.toMatch(/position:\s*absolute/);

    for (const css of [topBarCss, tabBarCss, actionBarCss]) {
      expect(css).not.toMatch(/margin-(top|right|bottom|left):\s*-[0-9.]+px/);
    }
  });

  it('risk tile skeleton dimensions stay within 4px of loaded tiles', () => {
    const riskTileCss = readCss('components/RiskTile.css');
    const riskTileSkeletonCss = readCss('components/RiskTileSkeleton.css');
    const riskTilesGridCss = readCss('components/RiskTilesGrid.css');

    const loadedMinHeight = pxValue(ruleBlock(riskTileCss, '.risk-tile'), 'min-height');
    const skeletonMinHeight = pxValue(ruleBlock(riskTileSkeletonCss, '.risk-tile-skeleton-card'), 'min-height');

    expect(Math.abs(loadedMinHeight - skeletonMinHeight)).toBeLessThanOrEqual(4);
    expect(ruleBlock(riskTileSkeletonCss, '.risk-tile-skeleton-grid')).toContain('gap: var(--space-sm)');
    expect(ruleBlock(riskTilesGridCss, '.risk-tiles-grid')).toContain('gap: var(--space-sm)');
  });

  it('skeleton CSS reserves stable layout slots to prevent transition shifts', () => {
    const riskTileSkeletonCss = readCss('components/RiskTileSkeleton.css');

    const tileMinHeight = pxValue(ruleBlock(riskTileSkeletonCss, '.risk-tile-skeleton-card'), 'min-height');

    expect(tileMinHeight).toBeGreaterThan(0);
  });
});
