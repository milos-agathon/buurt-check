import { readFileSync } from 'node:fs';

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function ruleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  if (!match) {
    throw new Error(`Missing selector: ${selector}`);
  }
  return match[1];
}

describe('production UI polish contracts', () => {
  it('keeps static landing pages from creating horizontal mobile scroll', () => {
    const landing = read('public/landing.html');
    const legal = read('public/legal.css');

    expect(landing).toMatch(/html\s*{[\s\S]*?overflow-x:\s*hidden/);
    expect(landing).toMatch(/body\s*{[\s\S]*?overflow-x:\s*hidden/);
    expect(landing).toMatch(/body\s*{[\s\S]*?min-height:\s*100dvh/);
    expect(landing).not.toMatch(/body\s*{[\s\S]*?min-height:\s*100vh/);

    expect(legal).toMatch(/html,\s*body\s*{[\s\S]*?overflow-x:\s*hidden/);
    expect(legal).toMatch(/body\s*{[\s\S]*?min-height:\s*100dvh/);
  });

  it('keeps landing and legal surfaces visually close to the app shell', () => {
    const landing = read('public/landing.html');
    const legal = read('public/legal.css');
    const consent = read('public/analytics-consent.css');

    expect(landing).toContain('--landing-shadow: 0 6px 22px rgba(23, 29, 28, 0.04);');
    expect(landing).toContain('--landing-radius-lg: 12px;');
    expect(landing).not.toMatch(/--landing-shadow:\s*0 24px 54px/);
    expect(landing).not.toMatch(/\.hero__trust-line,[\s\S]*?border-radius:\s*999px/);
    expect(landing).not.toMatch(/\.source-pill\s*{[\s\S]*?border-radius:\s*999px/);

    expect(legal).toContain('--page-shadow: 0 6px 22px rgba(23, 29, 28, 0.04);');
    expect(legal).not.toMatch(/border-radius:\s*999px/);
    expect(consent).not.toMatch(/box-shadow:\s*0 18px 48px/);
  });

  it('keeps desktop app navigation after the main content hierarchy', () => {
    const tabBar = read('src/components/TabBar.css');
    const appCss = read('src/App.css');
    const desktopBlock = tabBar.match(/@media\s*\(min-width:\s*960px\)\s*{([\s\S]*)}$/m)?.[1] ?? '';

    expect(desktopBlock).toContain('top: auto');
    expect(desktopBlock).toContain('bottom: calc(var(--viewport-bottom-offset, 0px))');
    expect(desktopBlock).toContain('width: 100vw');
    expect(desktopBlock).toContain('border-radius: 0');
    expect(appCss).toMatch(/\.app__main\s*{[\s\S]*?padding-top:\s*calc\(var\(--top-bar-height\) \+ 18px\)/);
    expect(appCss).not.toContain('padding-top: calc(var(--tab-bar-height) + var(--space-xl))');
  });

  it('gives desktop search a fuller workbench composition', () => {
    const addressSearch = read('src/components/AddressSearch.css');
    const preview = read('src/components/SearchEvidencePreview.css');

    expect(addressSearch).toMatch(/@media\s*\(min-width:\s*960px\)\s*{[\s\S]*?min-height:\s*calc\(100dvh - 260px\)/);
    expect(addressSearch).toMatch(/grid-template-rows:\s*auto auto minmax\(0,\s*1fr\)/);
    expect(addressSearch).toMatch(/\.address-search__wrapper\s*{[\s\S]*?align-self:\s*start/);
    expect(preview).toMatch(/\.search-evidence-preview\s*{[\s\S]*?min-height:\s*520px/);
    expect(preview).toMatch(/\.search-evidence-preview\s*{[\s\S]*?justify-content:\s*space-between/);
  });

  it('makes risk cards read consequence before raw score mechanics', () => {
    const riskTileTsx = read('src/components/RiskTile.tsx');
    const riskTileCss = read('src/components/RiskTile.css');

    const consequenceIndex = riskTileTsx.indexOf('risk-tile__consequence');
    const scoreIndex = riskTileTsx.indexOf('risk-tile__score-area');

    expect(consequenceIndex).toBeGreaterThan(-1);
    expect(scoreIndex).toBeGreaterThan(-1);
    expect(consequenceIndex).toBeLessThan(scoreIndex);
    expect(ruleBlock(riskTileCss, '.risk-tile__question-line')).toContain('border-radius: var(--radius-sm)');
    expect(ruleBlock(riskTileCss, '.risk-tile__score-area')).toContain('margin-top: auto');
  });
});
