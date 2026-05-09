import { readFileSync } from 'node:fs';

describe('Dossier spacing contract', () => {
  it('ties the risk section stack to the shared risk-grid gap token', () => {
    const appCss = readFileSync('src/App.css', 'utf-8');

    expect(appCss).toMatch(
      /\.dossier-section--risk-grid\s*{[\s\S]*?--risk-grid-vertical-gap:\s*var\(--space-sm\)[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column[\s\S]*?gap:\s*var\(--risk-grid-vertical-gap\)/i,
    );
  });
});
