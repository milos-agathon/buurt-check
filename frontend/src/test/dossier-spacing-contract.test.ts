import { readFileSync } from 'node:fs';

describe('Dossier spacing contract', () => {
  it('keeps the risk-grid spacing tied to the shared dossier section gap at all breakpoints', () => {
    const dossierCss = readFileSync('src/components/DossierSheet.css', 'utf-8');
    const appCss = readFileSync('src/App.css', 'utf-8');

    expect(dossierCss).toMatch(
      /\.dossier-sheet__content\s*{[\s\S]*?--dossier-section-gap:\s*var\(--space-lg\)/i,
    );
    expect(dossierCss).toMatch(
      /@media\s*\(min-width:\s*960px\)\s*{[\s\S]*?\.dossier-sheet__content\s*{[\s\S]*?--dossier-section-gap:\s*var\(--space-xl\)/i,
    );
    expect(appCss).toMatch(
      /\.dossier-section--risk-grid\s*{[\s\S]*?margin-top:\s*calc\(var\(--space-sm\)\s*-\s*var\(--dossier-section-gap\)\)/i,
    );
  });
});
