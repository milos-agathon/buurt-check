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

  it('uses dynamic viewport units for match-first map shells', () => {
    const resultsMapCss = readCss('components/match-first/ResultsMap.css');
    const neighborhoodDetailCss = readCss('components/match-first/NeighborhoodDetail.css');
    const classicViewportHeightUnit = /[0-9.]+vh\b/;

    expect(ruleBlock(resultsMapCss, '.results-map-shell')).toContain('min-height: calc(100dvh - 96px)');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-detail')).toContain('min-height: calc(100dvh - 96px)');
    expect(resultsMapCss).not.toMatch(classicViewportHeightUnit);
    expect(neighborhoodDetailCss).not.toMatch(classicViewportHeightUnit);
    expect(ruleBlock(resultsMapCss, '.results-map')).toContain('min-height: min(66dvh, 660px)');
    expect(ruleBlock(resultsMapCss, '.recommendation-list')).toContain('max-height: min(66dvh, 660px)');
    expect(resultsMapCss).toMatch(/@media\s*\(max-width:\s*760px\)\s*{[\s\S]*?\.results-map\s*{[\s\S]*?min-height:\s*62dvh/);
    expect(neighborhoodDetailCss).toMatch(/@media\s*\(max-width:\s*760px\)\s*{[\s\S]*?\.neighborhood-building-layer,[\s\S]*?\.neighborhood-building-layer__canvas\s*{[\s\S]*?min-height:\s*54dvh[\s\S]*?height:\s*54dvh/);
  });

  it('uses solid token backgrounds for match map workspace shells', () => {
    const resultsMapCss = readCss('components/match-first/ResultsMap.css');
    const neighborhoodDetailCss = readCss('components/match-first/NeighborhoodDetail.css');

    expect(ruleBlock(resultsMapCss, '.results-map-shell')).not.toMatch(/(?:linear|radial)-gradient/);
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-detail')).not.toMatch(/(?:linear|radial)-gradient/);
    expect(ruleBlock(resultsMapCss, '.results-map-shell')).toContain('background: var(--color-bg)');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-detail')).toContain('background: var(--color-bg)');
  });

  it('match map and selected-neighborhood surfaces avoid raw hex colors', () => {
    const resultsMapCss = readCss('components/match-first/ResultsMap.css');
    const neighborhoodDetailCss = readCss('components/match-first/NeighborhoodDetail.css');
    const rawHexColor = /#[0-9a-fA-F]{3,8}\b/;

    expect(resultsMapCss).not.toMatch(rawHexColor);
    expect(neighborhoodDetailCss).not.toMatch(rawHexColor);
    expect(ruleBlock(resultsMapCss, '.results-map')).toContain('background: var(--color-surface-alt)');
    expect(ruleBlock(resultsMapCss, '.results-map__marker')).toContain('background: var(--color-surface)');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer')).toContain(
      'background: var(--color-surface-alt)',
    );
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__basemap')).toContain(
      'background: var(--color-surface-alt)',
    );
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__basemap .leaflet-container')).toContain(
      'background: var(--color-surface-alt)',
    );
  });

  it('match map workspace overlays stay within restrained briefing elevation', () => {
    const resultsMapCss = readCss('components/match-first/ResultsMap.css');
    const neighborhoodDetailCss = readCss('components/match-first/NeighborhoodDetail.css');
    const heavyShadow = /box-shadow:\s*0\s+(?:1[2-9]|[2-9][0-9])px/;

    expect(resultsMapCss).not.toMatch(heavyShadow);
    expect(neighborhoodDetailCss).not.toMatch(heavyShadow);
    expect(ruleBlock(resultsMapCss, '.results-map__selection-popup')).toContain(
      'box-shadow: 0 8px 24px rgba(20, 54, 49, 0.10)',
    );
    expect(ruleBlock(resultsMapCss, '.recommendation-card--selected')).toContain(
      'box-shadow: 0 2px 8px rgba(20, 54, 49, 0.10)',
    );
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer')).toContain(
      'box-shadow: 0 2px 8px rgba(28, 45, 63, 0.06)',
    );
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__amenity-popup')).toContain(
      'box-shadow: 0 8px 24px rgba(31, 82, 78, 0.12)',
    );
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-detail__house-popup')).toContain(
      'box-shadow: 0 8px 24px rgba(31, 82, 78, 0.12)',
    );
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-detail__context-rail')).toContain(
      'box-shadow: 0 2px 8px rgba(28, 45, 63, 0.06)',
    );
  });

  it('Match surfaces avoid viewport-scaled font sizes', () => {
    const cssPaths = [
      'components/match-first/SurveyShell.css',
      'components/match-first/SurveyIntro.css',
      'components/match-first/ResultsMap.css',
      'components/match-first/NeighborhoodDetail.css',
      'components/match-first/MatchSuccessCheckmark.css',
      'components/match-first/MatchingProgressScreen.css',
      'components/match-first/MatchFirstLanding.css',
      'components/match-first/HeroMapBackground.css',
      'components/match/MatchListings.css',
      'components/match/MatchFeedbackControls.css',
      'components/match/MatchComparison.css',
      'components/match/MatchAlerts.css',
      'components/match/MatchAdminDashboard.css',
      'components/match/MatchSaved.css',
      'components/match/MatchReport.css',
      'components/match/MatchShareExport.css',
      'components/match/MatchSimilarSearch.css',
    ];

    for (const path of cssPaths) {
      const css = readCss(path);

      expect(css, path).not.toMatch(/font-size\s*:\s*[^;]*(?:vw|vh|vmin|vmax)/);
    }
  });

  it('Match result and report labels wrap instead of clipping on narrow screens', () => {
    const resultsMapCss = readCss('components/match-first/ResultsMap.css');
    const matchReportCss = readCss('components/match/MatchReport.css');

    const wrappingSelectors = [
      [resultsMapCss, '.results-map__selection-popup-main strong'],
      [resultsMapCss, '.recommendation-card__name'],
      [matchReportCss, '.match-report__status,\n.match-report__guardrail'],
    ] as const;

    for (const [css, selector] of wrappingSelectors) {
      const block = ruleBlock(css, selector);

      expect(block, selector).toContain('white-space: normal');
      expect(block, selector).toContain('overflow-wrap: anywhere');
      expect(block, selector).not.toMatch(/text-overflow\s*:\s*ellipsis/);
      expect(block, selector).not.toMatch(/white-space\s*:\s*nowrap/);
    }
  });

  it('landing hero background relies on the neighborhood image instead of generated gradient art', () => {
    const heroCss = readCss('components/match-first/HeroMapBackground.css');
    const heroComponent = readFileSync(
      resolve(__dirname, '..', 'components/match-first/HeroMapBackground.tsx'),
      'utf8',
    );

    expect(heroComponent).toContain('src="/images/showcase-neighborhood.webp"');
    expect(heroComponent).not.toContain('hero-map-background__grid');
    expect(heroCss).not.toMatch(/(?:linear|radial)-gradient/);
    expect(heroCss).not.toMatch(/\.hero-map-background__grid/);
    expect(heroCss).toMatch(/@keyframes\s+hero-map-image-drift\s*{[\s\S]*?transform:\s*translate3d/);
    expect(heroCss).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('guided intake controls use explicit bounded tracks instead of auto-fit grids', () => {
    const surveyShellCss = readCss('components/match-first/SurveyShell.css');

    expect(surveyShellCss).not.toMatch(/\.survey-question__(?:choices|range)\s*{[\s\S]*?repeat\(auto-fit/);
    expect(ruleBlock(surveyShellCss, '.survey-question__choices')).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr))',
    );
    expect(ruleBlock(surveyShellCss, '.survey-question__range')).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)',
    );
    expect(surveyShellCss).toMatch(/@media\s*\(max-width:\s*680px\)\s*{[\s\S]*?\.survey-question__choices,[\s\S]*?\.survey-question__range\s*{[\s\S]*?grid-template-columns:\s*1fr/);
  });

  it('review screen owns its lazy-loaded progress and custom-preference styling', () => {
    const surveyShellCss = readCss('components/match-first/SurveyShell.css');
    const surveyReviewComponent = readFileSync(
      resolve(__dirname, '..', 'components/match-first/SurveyReview.tsx'),
      'utf8',
    );

    expect(surveyReviewComponent).toContain("import './SurveyShell.css';");
    expect(surveyReviewComponent).toContain('className="survey-question__progress"');
    expect(surveyReviewComponent).toContain('additional-preferences__summary');
    expect(surveyShellCss).not.toContain('--color-border-subtle');
    expect(ruleBlock(surveyShellCss, '.survey-question__progress')).toContain('height: 10px');
    expect(ruleBlock(surveyShellCss, '.additional-preferences__summary')).toContain(
      'border-top: 1px solid var(--landing-border-soft)',
    );
  });

  it('matching progress uses calm token surfaces instead of decorative gradients', () => {
    const progressCss = readCss('components/match-first/MatchingProgressScreen.css');

    expect(progressCss).not.toMatch(/(?:linear|radial)-gradient/);
    expect(ruleBlock(progressCss, '.matching-progress')).toContain('background: var(--landing-bg-top)');
    expect(progressCss).not.toContain('--color-border-subtle');
    expect(ruleBlock(progressCss, '.matching-progress__bar')).toContain('background: var(--landing-border-soft)');
    expect(ruleBlock(progressCss, '.matching-progress__map-lines span')).toContain(
      'background: color-mix(in srgb, var(--color-accent-text) 10%, var(--color-surface))',
    );
    expect(progressCss).toMatch(/@keyframes\s+matching-progress-drift\s*{[\s\S]*?transform:\s*translateX\(0\)[\s\S]*?transform:\s*translateX\(12px\)/);
    expect(progressCss).not.toMatch(/@keyframes\s+matching-progress-drift\s*{[\s\S]*?(?:left|top|width|height)\s*:/);
  });

  it('legacy Match surfaces avoid generic three-column summary grids', () => {
    const matchListingsCss = readCss('components/match/MatchListings.css');
    const matchAlertsCss = readCss('components/match/MatchAlerts.css');
    const matchSavedCss = readCss('components/match/MatchSaved.css');
    const matchShareExportCss = readCss('components/match/MatchShareExport.css');
    const matchSimilarCss = readCss('components/match/MatchSimilarSearch.css');
    const matchComparisonCss = readCss('components/match/MatchComparison.css');
    const matchAdminCss = readCss('components/match/MatchAdminDashboard.css');

    expect(matchListingsCss).not.toMatch(/repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(matchComparisonCss).not.toMatch(/repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    for (const css of [matchListingsCss, matchAlertsCss, matchSavedCss, matchShareExportCss]) {
      expect(css).not.toMatch(/repeat\(auto-fit/);
    }
    expect(matchSimilarCss).not.toMatch(/repeat\(3,\s*auto\)/);
    expect(ruleBlock(matchAdminCss, '.match-admin__grid')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(ruleBlock(matchAdminCss, '.match-admin article')).toContain('background: transparent');
    expect(ruleBlock(matchAdminCss, '.match-admin article')).toContain('border-top: 1px solid var(--color-border)');
    expect(ruleBlock(matchSavedCss, '.match-saved__neighborhoods')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(ruleBlock(matchSavedCss, '.match-saved__item')).toContain('background: transparent');
    expect(ruleBlock(matchSavedCss, '.match-saved__item')).toContain('border-top: 1px solid var(--color-border)');
    expect(ruleBlock(matchAlertsCss, '.match-alerts__form')).toContain(
      'grid-template-columns: minmax(220px, 1.35fr) minmax(150px, 0.65fr)',
    );
    expect(ruleBlock(matchAlertsCss, '.match-alerts__item')).toContain('background: transparent');
    expect(ruleBlock(matchAlertsCss, '.match-alerts__item')).toContain('border-top: 1px solid var(--color-border)');
    expect(ruleBlock(matchListingsCss, '.match-listings__item dl')).toContain(
      'grid-template-columns: minmax(112px, 1.1fr) minmax(112px, 0.9fr)',
    );
    expect(ruleBlock(matchListingsCss, '.match-listings__sections')).toContain(
      'grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.9fr)',
    );
    expect(ruleBlock(matchComparisonCss, '.match-comparison__summary')).toContain(
      'grid-template-columns: minmax(260px, 1.35fr) minmax(220px, 0.9fr)',
    );
    expect(ruleBlock(matchShareExportCss, '.match-share-export__meta')).toContain(
      'grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1.2fr)',
    );
    expect(ruleBlock(matchSimilarCss, '.match-similar__controls')).toContain('display: flex');
    expect(ruleBlock(matchSimilarCss, '.match-similar__controls')).toContain('flex-wrap: wrap');
  });

  it('legacy Match comparison table stacks on narrow screens instead of relying on side-scroll', () => {
    const matchComparisonCss = readCss('components/match/MatchComparison.css');
    const matchComparisonComponent = readFileSync(
      resolve(__dirname, '..', 'components/match/MatchComparison.tsx'),
      'utf8',
    );

    expect(matchComparisonComponent).toContain('data-column-label={neighborhood.name}');
    expect(matchComparisonCss).toMatch(/@media\s*\(max-width:\s*720px\)\s*{[\s\S]*?\.match-comparison__table-wrap\s*{[\s\S]*?overflow-x:\s*visible/);
    expect(matchComparisonCss).toMatch(/@media\s*\(max-width:\s*720px\)\s*{[\s\S]*?\.match-comparison__table\s*{[\s\S]*?min-width:\s*0[\s\S]*?display:\s*block/);
    expect(matchComparisonCss).toMatch(/@media\s*\(max-width:\s*720px\)\s*{[\s\S]*?\.match-comparison__table td\s*{[\s\S]*?min-width:\s*0/);
    expect(ruleBlock(matchComparisonCss, '.match-comparison__table td::before')).toContain('content: attr(data-column-label)');
  });

  it('legacy Match surfaces use defined Polar Frost state tokens', () => {
    const matchFeedbackCss = readCss('components/match/MatchFeedbackControls.css');
    const matchComparisonCss = readCss('components/match/MatchComparison.css');
    const privateFallbackAlias = /--(?:space-2|color-accent-muted|color-focus|color-warning-text)\b/;

    expect(matchFeedbackCss).not.toMatch(privateFallbackAlias);
    expect(matchComparisonCss).not.toMatch(privateFallbackAlias);
    expect(ruleBlock(matchFeedbackCss, '.match-feedback')).toContain('gap: var(--space-sm)');
    expect(ruleBlock(matchFeedbackCss, '.match-feedback__button--active')).toContain(
      'background: var(--color-accent-light)',
    );
    expect(ruleBlock(matchFeedbackCss, '.match-feedback__button:focus-visible')).toContain(
      'box-shadow: var(--focus-ring-accent)',
    );
    expect(ruleBlock(matchComparisonCss, '.match-comparison__missing')).toContain(
      'color: var(--color-tertiary-text)',
    );
  });

  it('legacy Match CSS avoids raw hex fallback colors', () => {
    const legacyMatchCssPaths = [
      'components/match/MatchAdminDashboard.css',
      'components/match/MatchAlerts.css',
      'components/match/MatchComparison.css',
      'components/match/MatchFeedbackControls.css',
      'components/match/MatchListings.css',
      'components/match/MatchReport.css',
      'components/match/MatchSaved.css',
      'components/match/MatchShareExport.css',
      'components/match/MatchSimilarSearch.css',
    ];
    const rawHexColor = /#[0-9a-fA-F]{3,8}\b/;

    for (const path of legacyMatchCssPaths) {
      expect(readCss(path), path).not.toMatch(rawHexColor);
    }
  });

  it('legacy Match CSS avoids static token fallbacks', () => {
    const legacyMatchCssPaths = [
      'components/match/MatchAdminDashboard.css',
      'components/match/MatchAlerts.css',
      'components/match/MatchComparison.css',
      'components/match/MatchFeedbackControls.css',
      'components/match/MatchListings.css',
      'components/match/MatchReport.css',
      'components/match/MatchSaved.css',
      'components/match/MatchShareExport.css',
      'components/match/MatchSimilarSearch.css',
    ];
    const staticFallback = /var\(--[^)]+,\s*[^)]+\)/;

    for (const path of legacyMatchCssPaths) {
      expect(readCss(path), path).not.toMatch(staticFallback);
    }
  });

  it('Match preference and feedback controls keep touch targets at least 44px', () => {
    const surveyShellCss = readCss('components/match-first/SurveyShell.css');
    const matchFeedbackCss = readCss('components/match/MatchFeedbackControls.css');

    expect(ruleBlock(surveyShellCss, '.additional-preferences__chip')).toContain('min-height: 44px');
    expect(ruleBlock(surveyShellCss, '.additional-preferences__remove')).toContain('min-height: 44px');
    expect(ruleBlock(surveyShellCss, '.additional-preferences__remove')).toContain('display: inline-flex');
    expect(ruleBlock(matchFeedbackCss, '.match-feedback__button')).toContain('min-height: 44px');
    expect(ruleBlock(matchFeedbackCss, '.match-feedback__button:active:not(:disabled)')).toContain('transform: translateY(1px)');
  });

  it('legacy Match action buttons keep touch targets and tactile states', () => {
    const matchSavedCss = readCss('components/match/MatchSaved.css');
    const matchShareCss = readCss('components/match/MatchShareExport.css');
    const matchListingsCss = readCss('components/match/MatchListings.css');
    const matchAlertsCss = readCss('components/match/MatchAlerts.css');
    const matchSimilarCss = readCss('components/match/MatchSimilarSearch.css');

    const buttonSelectors = [
      [matchSavedCss, '.match-saved__item button'],
      [matchShareCss, '.match-share-export__actions button'],
      [matchListingsCss, '.match-listings__item button'],
      [matchAlertsCss, '.match-alerts__suggestions button,\n.match-alerts__form button,\n.match-alerts__actions button'],
      [matchSimilarCss, '.match-similar__controls button'],
    ] as const;

    for (const [css, selector] of buttonSelectors) {
      const block = ruleBlock(css, selector);

      expect(pxValue(block, 'min-height')).toBeGreaterThanOrEqual(44);
      expect(block, selector).toContain('cursor: pointer');
      expect(block, selector).toContain('transform 160ms ease');
    }

    expect(ruleBlock(matchSavedCss, '.match-saved__item button:active:not(:disabled)')).toContain('transform: translateY(1px)');
    expect(ruleBlock(matchShareCss, '.match-share-export__actions button:active:not(:disabled)')).toContain('transform: translateY(1px)');
    expect(ruleBlock(matchListingsCss, '.match-listings__item button:active:not(:disabled)')).toContain('transform: translateY(1px)');
    expect(ruleBlock(matchAlertsCss, '.match-alerts__suggestions button:active:not(:disabled),\n.match-alerts__form button:active:not(:disabled),\n.match-alerts__actions button:active:not(:disabled)')).toContain('transform: translateY(1px)');
    expect(ruleBlock(matchSimilarCss, '.match-similar__controls button:active:not(:disabled)')).toContain('transform: translateY(1px)');
    expect(ruleBlock(matchShareCss, '.match-share-export__consent')).toContain('min-height: 44px');

    expect(matchSavedCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.match-saved__item button[\s\S]*?transition:\s*none/);
    expect(matchShareCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.match-share-export__actions button[\s\S]*?transition:\s*none/);
    expect(matchListingsCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.match-listings__item button[\s\S]*?transition:\s*none/);
    expect(matchAlertsCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.match-alerts__suggestions button[\s\S]*?\.match-alerts__actions button[\s\S]*?transition:\s*none/);
    expect(matchSimilarCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.match-similar__controls button[\s\S]*?transition:\s*none/);
  });

  it('Match landing and guided-intake controls expose tactile active feedback', () => {
    const landingCss = readCss('components/match-first/MatchFirstLanding.css');
    const surveyShellCss = readCss('components/match-first/SurveyShell.css');

    expect(ruleBlock(landingCss, '.match-first-landing__lang-btn')).toContain('transform 160ms ease');
    expect(ruleBlock(landingCss, '.match-first-landing__lang-btn:active')).toContain('transform: translateY(1px)');
    expect(ruleBlock(landingCss, '.match-first-landing__cta')).toContain('transform 160ms ease');
    expect(ruleBlock(landingCss, '.match-first-landing__cta:active:not(:disabled)')).toContain('transform: translateY(1px)');
    expect(ruleBlock(landingCss, '.match-first-landing__address-link')).toContain('transform 160ms ease');
    expect(ruleBlock(landingCss, '.match-first-landing__address-link:active')).toContain('transform: translateY(1px)');

    expect(ruleBlock(surveyShellCss, '.survey-question__choice')).toContain('transform 160ms ease');
    expect(ruleBlock(surveyShellCss, '.survey-question__choice:active')).toContain('transform: translateY(1px)');
    expect(ruleBlock(surveyShellCss, '.additional-preferences__chip')).toContain('transform 160ms ease');
    expect(ruleBlock(surveyShellCss, '.additional-preferences__chip:active:not(:disabled)')).toContain('transform: translateY(1px)');
    expect(ruleBlock(surveyShellCss, '.additional-preferences__remove')).toContain('transform 160ms ease');
    expect(ruleBlock(surveyShellCss, '.additional-preferences__remove:active:not(:disabled)')).toContain('transform: translateY(1px)');

    expect(landingCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.match-first-landing__lang-btn[\s\S]*?\.match-first-landing__address-link[\s\S]*?transition:\s*none/);
    expect(surveyShellCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.survey-question__choice[\s\S]*?\.additional-preferences__remove[\s\S]*?transition:\s*none/);
  });

  it('Match landing language switcher uses tokenized surface colors', () => {
    const landingCss = readCss('components/match-first/MatchFirstLanding.css');
    const languageSwitcher = ruleBlock(landingCss, '.match-first-landing__language');

    expect(languageSwitcher).not.toMatch(/rgba\(/);
    expect(languageSwitcher).toContain('border: 1px solid var(--landing-border-soft)');
    expect(languageSwitcher).toContain(
      'background: color-mix(in srgb, var(--color-surface) 82%, transparent)',
    );
  });

  it('Match map and selected-neighborhood controls keep touch targets at least 44px', () => {
    const resultsMapCss = readCss('components/match-first/ResultsMap.css');
    const neighborhoodDetailCss = readCss('components/match-first/NeighborhoodDetail.css');

    const resultsMarker = ruleBlock(resultsMapCss, '.results-map__marker');
    expect(pxValue(resultsMarker, 'width')).toBeGreaterThanOrEqual(44);
    expect(pxValue(resultsMarker, 'height')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(resultsMapCss, '.results-map__marker--selected'), 'width')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(resultsMapCss, '.results-map__marker--selected'), 'height')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(resultsMapCss, '.recommendation-card__detail'), 'min-height')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(resultsMapCss, '.results-map__controls button'), 'min-width')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(resultsMapCss, '.results-map__controls button'), 'min-height')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(resultsMapCss, '.recommendation-card__rank'), 'min-width')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(resultsMapCss, '.recommendation-card__rank'), 'height')).toBeGreaterThanOrEqual(44);

    expect(pxValue(ruleBlock(neighborhoodDetailCss, '.neighborhood-detail__back,\n.match-first-landing__secondary'), 'min-height')).toBeGreaterThanOrEqual(44);
    const amenityMarker = ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__amenity-marker');
    expect(pxValue(amenityMarker, 'width')).toBeGreaterThanOrEqual(44);
    expect(pxValue(amenityMarker, 'min-width')).toBeGreaterThanOrEqual(44);
    expect(pxValue(amenityMarker, 'height')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__amenity-popup-close'), 'width')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__amenity-popup-close'), 'height')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__controls button,\n.neighborhood-detail__house-popup-actions button,\n.house-selection__selected button'), 'min-height')).toBeGreaterThanOrEqual(44);
    const neighborhoodControls = ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__controls button');
    expect(pxValue(neighborhoodControls, 'width')).toBeGreaterThanOrEqual(44);
    expect(pxValue(neighborhoodControls, 'min-width')).toBeGreaterThanOrEqual(44);
    expect(pxValue(neighborhoodControls, 'height')).toBeGreaterThanOrEqual(44);
    expect(pxValue(ruleBlock(neighborhoodDetailCss, '.recommendation-card__detail'), 'min-height')).toBeGreaterThanOrEqual(44);
    expect(neighborhoodDetailCss).toMatch(/grid-template-columns:\s*repeat\(3,\s*44px\)/);
  });

  it('Match map and selected-neighborhood controls expose tactile active feedback', () => {
    const resultsMapCss = readCss('components/match-first/ResultsMap.css');
    const neighborhoodDetailCss = readCss('components/match-first/NeighborhoodDetail.css');

    expect(ruleBlock(resultsMapCss, '.results-map__marker')).toContain('transform 160ms ease');
    expect(ruleBlock(resultsMapCss, '.results-map__marker:active')).toContain('transform: translateY(1px)');
    expect(ruleBlock(resultsMapCss, '.recommendation-card__button')).toContain('transform 160ms ease');
    expect(ruleBlock(resultsMapCss, '.recommendation-card__button:active')).toContain('transform: translateY(1px)');
    expect(ruleBlock(resultsMapCss, '.recommendation-card__detail')).toContain('transform 160ms ease');
    expect(ruleBlock(resultsMapCss, '.recommendation-card__detail:active')).toContain('transform: translateY(1px)');

    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-detail__back,\n.match-first-landing__secondary')).toContain('transform 160ms ease');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-detail__back:active,\n.match-first-landing__secondary:active')).toContain('transform: translateY(1px)');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__amenity-marker')).toContain('transform 160ms ease');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__amenity-marker:active')).toContain('--amenity-marker-press-y: 1px');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__amenity-popup-close')).toContain('transform 160ms ease');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__amenity-popup-close:active')).toContain('transform: translateY(1px)');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__controls button,\n.neighborhood-detail__house-popup-actions button,\n.house-selection__selected button')).toContain('transform 160ms ease');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__controls button:active,\n.neighborhood-detail__house-popup-actions button:active,\n.house-selection__selected button:active')).toContain('transform: translateY(1px)');
    expect(ruleBlock(neighborhoodDetailCss, '.house-selection__list button')).toContain('transform 160ms ease');
    expect(ruleBlock(neighborhoodDetailCss, '.house-selection__list button:active:not(:disabled)')).toContain('transform: translateY(1px)');
    expect(ruleBlock(neighborhoodDetailCss, '.house-selection__candidate-list button')).toContain('transform 160ms ease');
    expect(ruleBlock(neighborhoodDetailCss, '.house-selection__candidate-list button:active:not(:disabled)')).toContain('transform: translateY(1px)');
    expect(ruleBlock(neighborhoodDetailCss, '.house-selection__actions button')).toContain('transform 160ms ease');
    expect(ruleBlock(neighborhoodDetailCss, '.house-selection__actions button:active:not(:disabled)')).toContain('transform: translateY(1px)');
    expect(ruleBlock(neighborhoodDetailCss, '.recommendation-card__detail')).toContain('transform 160ms ease');
    expect(ruleBlock(neighborhoodDetailCss, '.recommendation-card__detail:active')).toContain('transform: translateY(1px)');
    expect(neighborhoodDetailCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.neighborhood-building-layer__amenity-marker[\s\S]*?transition:\s*none/);
    expect(neighborhoodDetailCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.house-selection__actions button[\s\S]*?transition:\s*none/);
  });

  it('Match map action controls use tokenized surfaces instead of raw rgba colors', () => {
    const resultsMapCss = readCss('components/match-first/ResultsMap.css');
    const neighborhoodDetailCss = readCss('components/match-first/NeighborhoodDetail.css');
    const rawRgba = /rgba\(/;
    const expectedBorder = 'border: 1px solid color-mix(in srgb, var(--color-accent-text) 28%, transparent)';
    const expectedSurface = 'background: color-mix(in srgb, var(--color-surface) 92%, transparent)';

    const selectors = [
      [resultsMapCss, '.results-map__controls button'],
      [
        neighborhoodDetailCss,
        '.neighborhood-building-layer__controls button,\n.neighborhood-detail__house-popup-actions button,\n.house-selection__selected button',
      ],
    ] as const;

    for (const [css, selector] of selectors) {
      const block = ruleBlock(css, selector);

      expect(block, selector).not.toMatch(rawRgba);
      expect(block, selector).toContain(expectedBorder);
      expect(block, selector).toContain(expectedSurface);
    }
  });

  it('selected-neighborhood map overlays do not intercept amenity marker pointer events', () => {
    const neighborhoodDetailCss = readCss('components/match-first/NeighborhoodDetail.css');

    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__legend')).toContain('pointer-events: none');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__fallback,\n.neighborhood-building-layer p[role=\'status\']')).toContain('pointer-events: none');
    expect(ruleBlock(neighborhoodDetailCss, '.neighborhood-building-layer__basemap-fallback')).toContain('pointer-events: none');
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
