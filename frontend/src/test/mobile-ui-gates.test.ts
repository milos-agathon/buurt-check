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
  it('root shell clamps horizontal overflow without turning #root into a scroll surface', () => {
    const indexCss = readCss('index.css');

    expect(ruleBlock(indexCss, 'html')).toContain('width: 100%');
    expect(ruleBlock(indexCss, 'html')).toContain('min-height: 100%');
    expect(ruleBlock(indexCss, 'html')).toContain('background: var(--app-page-bg, var(--color-bg))');
    expect(ruleBlock(indexCss, 'html')).toContain('overflow-x: hidden');

    expect(ruleBlock(indexCss, 'body')).toContain('margin: 0');
    expect(ruleBlock(indexCss, 'body')).toContain('min-width: 320px');
    expect(ruleBlock(indexCss, 'body')).toContain('width: 100%');
    expect(ruleBlock(indexCss, 'body')).toContain('min-height: 100dvh');
    expect(ruleBlock(indexCss, 'body')).toContain('background: var(--app-page-bg, var(--color-bg))');
    expect(ruleBlock(indexCss, 'body')).toContain('overflow-x: hidden');

    expect(ruleBlock(indexCss, '#root')).toContain('width: 100%');
    expect(ruleBlock(indexCss, '#root')).toContain('min-height: 100dvh');
    expect(ruleBlock(indexCss, '#root')).not.toMatch(/overflow\s*:/);
    expect(ruleBlock(indexCss, '#root')).not.toMatch(/overscroll-behavior/);
  });

  it('toolbar rows avoid overlapping hit-area patterns', () => {
    const topBarCss = readCss('components/TopBar.css');
    const tabBarCss = readCss('components/TabBar.css');
    const actionBarCss = readCss('components/ActionBar.css');
    const dossierSheetCss = readCss('components/DossierSheet.css');
    const compareCss = readCss('components/CompareScreen.css');

    expect(ruleBlock(topBarCss, '.top-bar__actions')).toContain('display: flex');
    expect(ruleBlock(topBarCss, '.top-bar__actions')).toContain('gap: var(--space-sm)');
    expect(ruleBlock(tabBarCss, '.tab-bar')).toContain('display: flex');
    expect(ruleBlock(actionBarCss, '.action-bar')).toContain('display: flex');
    expect(ruleBlock(tabBarCss, '.tab-bar')).toContain('bottom: calc(var(--viewport-bottom-offset, 0px))');
    expect(ruleBlock(actionBarCss, '.action-bar')).toContain('bottom: calc(var(--viewport-bottom-offset, 0px) + var(--tab-bar-height, 56px) + env(safe-area-inset-bottom, 0px))');
    expect(ruleBlock(dossierSheetCss, '.dossier-sheet__content')).toContain('var(--dossier-action-bar-offset, 0px)');
    expect(ruleBlock(compareCss, '.compare-screen__snap-column')).not.toMatch(/50vw/);

    expect(ruleBlock(tabBarCss, '.tab-bar__tab')).not.toMatch(/position:\s*absolute/);
    expect(ruleBlock(actionBarCss, '.action-bar__btn')).not.toMatch(/position:\s*absolute/);
    expect(ruleBlock(topBarCss, '.top-bar__settings')).not.toMatch(/position:\s*absolute/);
    expect(ruleBlock(topBarCss, '.top-bar__settings')).toContain('border: none');
    expect(ruleBlock(topBarCss, '.top-bar__settings')).toContain('border-radius: 0');
    expect(ruleBlock(topBarCss, '.top-bar__settings')).toContain('background: transparent');
    expect(ruleBlock(topBarCss, '.top-bar__settings')).toContain('box-shadow: none');
    expect(ruleBlock(topBarCss, '.top-bar__settings:hover')).toContain('background: transparent');
    expect(ruleBlock(topBarCss, '.top-bar__settings:hover')).toContain('box-shadow: none');
    expect(ruleBlock(topBarCss, '.top-bar__settings:focus-visible')).toContain('background: transparent');
    expect(ruleBlock(topBarCss, '.top-bar__settings:focus-visible')).toContain('box-shadow: none');

    for (const css of [topBarCss, tabBarCss, actionBarCss]) {
      expect(css).not.toMatch(/margin-(top|right|bottom|left):\s*-[0-9.]+px/);
    }
  });

  it('keeps the search shell within a 320px mobile viewport', () => {
    const appCss = readCss('App.css');
    const topBarCss = readCss('components/TopBar.css');
    const addressSearchCss = readCss('components/AddressSearch.css');

    expect(appCss).toMatch(/@media\s*\(max-width:\s*360px\)\s*{[\s\S]*?\.app\s*{[\s\S]*?padding-inline:\s*0/);
    expect(ruleBlock(topBarCss, '.top-bar')).toContain('left: 0');
    expect(ruleBlock(topBarCss, '.top-bar')).toContain('right: 0');
    expect(ruleBlock(topBarCss, '.top-bar')).toContain('width: 100%');
    expect(ruleBlock(topBarCss, '.top-bar')).not.toContain('margin-left: calc(50% - 50vw)');
    expect(ruleBlock(topBarCss, '.top-bar')).toContain('box-sizing: border-box');
    expect(ruleBlock(topBarCss, '.top-bar')).toContain('position: fixed');
    expect(ruleBlock(topBarCss, '.top-bar')).toContain('top: 0');
    expect(ruleBlock(topBarCss, '.top-bar')).toContain('border-bottom: 1px solid var(--landing-border-soft)');
    expect(ruleBlock(topBarCss, '.top-bar')).not.toContain('border-radius: var(--radius-card)');
    expect(topBarCss).toMatch(/@media\s*\(max-width:\s*360px\)\s*{[\s\S]*?\.top-bar__logo-img\s*{[\s\S]*?max-width:\s*124px/);
    expect(topBarCss).toMatch(/@media\s*\(max-width:\s*360px\)\s*{[\s\S]*?\.top-bar__lang-btn\s*{[\s\S]*?min-width:\s*44px/);
    expect(addressSearchCss).not.toMatch(/\.address-search__trust-grid\b/);
    expect(addressSearchCss).toMatch(/\.address-search__wrapper\s*{[\s\S]*?order:\s*2/);
    expect(addressSearchCss).toMatch(/\.address-search__dropdown\s*{[\s\S]*?max-height:\s*var\(--address-search-dropdown-max-height,\s*min\(176px,\s*24vh\)\)/);
    expect(appCss).toMatch(/\.app\[data-screen='search'\]\s*{[\s\S]*?height:\s*100dvh[\s\S]*?overflow:\s*hidden/);
    expect(appCss).toMatch(/\.app\[data-screen='search'\]\s+\.app__main\s*{[\s\S]*?height:\s*100dvh[\s\S]*?overflow:\s*hidden/);
    expect(addressSearchCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*{[\s\S]*?\.address-search\s*{[\s\S]*?padding-bottom:\s*0/);
  });

  it('keeps briefing and saved screens on the landing surface system', () => {
    const appCss = readCss('App.css');
    const dossierSheetCss = readCss('components/DossierSheet.css');
    const shortlistCss = readCss('components/ShortlistScreen.css');

    expect(ruleBlock(appCss, '.app')).toContain('padding-top: 0');
    expect(ruleBlock(appCss, '.app__main')).toContain('width: min(var(--landing-max-width), calc(100vw - 40px))');
    expect(ruleBlock(appCss, '.app__main')).toContain('margin-inline: auto');
    expect(ruleBlock(appCss, '.app__main')).toContain('padding-top: calc(var(--top-bar-height) + 18px)');

    expect(ruleBlock(dossierSheetCss, '.dossier-sheet')).toContain('background: transparent');
    expect(ruleBlock(dossierSheetCss, '.dossier-sheet')).toContain('border: 0');
    expect(ruleBlock(dossierSheetCss, '.dossier-sheet')).toContain('box-shadow: none');

    expect(ruleBlock(shortlistCss, '.shortlist-screen')).toContain('padding-inline: 0');
    expect(ruleBlock(shortlistCss, '.shortlist-screen__card')).toContain('background: var(--landing-surface-strong)');
    expect(ruleBlock(shortlistCss, '.shortlist-screen__card')).toContain('border: 1px solid var(--landing-border)');
    expect(ruleBlock(shortlistCss, '.shortlist-screen__card-address')).toContain('color: var(--landing-text)');
  });

  it('risk tile skeleton dimensions stay within 4px of loaded tiles', () => {
    const riskTileCss = readCss('components/RiskTile.css');
    const riskTileSkeletonCss = readCss('components/RiskTileSkeleton.css');
    const riskTilesGridCss = readCss('components/RiskTilesGrid.css');

    const loadedMinHeight = pxValue(ruleBlock(riskTileCss, '.risk-tile'), 'min-height');
    const skeletonMinHeight = pxValue(ruleBlock(riskTileSkeletonCss, '.risk-tile-skeleton-card'), 'min-height');

    expect(Math.abs(loadedMinHeight - skeletonMinHeight)).toBeLessThanOrEqual(4);
    expect(ruleBlock(riskTileSkeletonCss, '.risk-tile-skeleton-grid')).toContain('gap: var(--risk-grid-vertical-gap, var(--space-sm))');
    expect(ruleBlock(riskTilesGridCss, '.risk-tiles-grid')).toContain('gap: var(--risk-grid-vertical-gap, var(--space-sm))');
  });

  it('skeleton CSS reserves stable layout slots to prevent transition shifts', () => {
    const riskTileSkeletonCss = readCss('components/RiskTileSkeleton.css');

    const tileMinHeight = pxValue(ruleBlock(riskTileSkeletonCss, '.risk-tile-skeleton-card'), 'min-height');

    expect(tileMinHeight).toBeGreaterThan(0);
  });

  it('risk cards preserve the 9.5 evidence-card contract', () => {
    const riskTileCss = readCss('components/RiskTile.css');
    const riskGridCss = readCss('components/RiskTilesGrid.css');
    const riskDetailCss = readCss('components/RiskDetailView.css');

    expect(riskTileCss).toMatch(/\.risk-tile\s*{[\s\S]*?border:\s*1px solid var\(--color-border\)/);
    expect(riskTileCss).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(riskTileCss).not.toMatch(/!important/);
    expect(riskGridCss).toMatch(/@media\s*\(max-width:\s*359px\)/);
    expect(riskDetailCss).not.toMatch(/width:\s*[0-9]+px/);
  });
});
