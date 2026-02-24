import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { setupTestI18n, makeResolvedAddress, makeBuildingFacts } from './helpers';
import AddressHeader from '../components/AddressHeader';
import RiskTile from '../components/RiskTile';
import ShortlistScreen from '../components/ShortlistScreen';
import ViewingChecklist from '../components/ViewingChecklist';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nEn = await setupTestI18n('en');
  i18nNl = await setupTestI18n('nl');
});

describe('AddressHeader i18n', () => {
  it('renders building details in Dutch', () => {
    render(
      <I18nextProvider i18n={i18nNl}>
        <AddressHeader
          address={makeResolvedAddress()}
          building={makeBuildingFacts({ construction_year: 1917, num_units: 3 })}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText(/Bouwjaar 1917/)).toBeInTheDocument();
    expect(screen.getByText(/Eenheden/)).toBeInTheDocument();
  });
});

describe('RiskTile accessibility', () => {
  it('has aria-label with score context', () => {
    render(
      <I18nextProvider i18n={i18nEn}>
        <RiskTile
          category="noise"
          labelKey="risk.noise.tileLabel"
          score={72}
          severity="good"
          summary="Test summary"
        />
      </I18nextProvider>,
    );
    const tile = screen.getByTestId('risk-tile-noise');
    expect(tile).toHaveAttribute('aria-label');
    expect(tile.getAttribute('aria-label')).toMatch(/Noise.*72.*100/);
  });

  it('has unavailable aria-label when score is null', () => {
    render(
      <I18nextProvider i18n={i18nEn}>
        <RiskTile
          category="noise"
          labelKey="risk.noise.tileLabel"
          severity="unavailable"
        />
      </I18nextProvider>,
    );
    const tile = screen.getByTestId('risk-tile-noise');
    expect(tile.getAttribute('aria-label')).toMatch(/unavailable/i);
  });
});

describe('ShortlistScreen accessible risk dots', () => {
  it('dots have role=img and aria-label', () => {
    render(
      <I18nextProvider i18n={i18nEn}>
        <ShortlistScreen
          items={[
            {
              vboId: 'vbo-1',
              address: 'Test 1',
              postcode: '1000AA',
              city: 'Amsterdam',
              savedAt: Date.now(),
              riskScores: { noise: 72, air: 64, climate: 55, sunlight: 60 },
            },
          ]}
          onRemove={() => {}}
          onCompare={() => {}}
          onSelectAddress={() => {}}
        />
      </I18nextProvider>,
    );
    const dots = screen.getAllByRole('img');
    expect(dots.length).toBeGreaterThanOrEqual(4);
    expect(dots[0]).toHaveAttribute('aria-label');
  });
});

describe('ViewingChecklist group semantics', () => {
  it('has role=group and aria-label on question groups', () => {
    render(
      <I18nextProvider i18n={i18nEn}>
        <ViewingChecklist
          categories={[
            {
              name: 'Noise',
              name_nl: 'Geluid',
              severity: 'moderate',
              questions: [
                { text_en: 'Test question?', text_nl: 'Testvraag?' },
              ],
            },
          ]}
          checkedQuestions={new Set()}
          onToggleQuestion={() => {}}
        />
      </I18nextProvider>,
    );
    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('aria-label', 'Noise');
  });
});

describe('AddressSearch NL time formatting', () => {
  it('uses i18n for relative time strings', async () => {
    // This test verifies the i18n keys exist and translate correctly
    const t = i18nNl.t.bind(i18nNl);
    expect(t('search.recentTime.justNow')).toBe('zojuist');
    expect(t('search.recentTime.minutesAgo', { count: 5 })).toBe('5m geleden');
    expect(t('search.recentTime.hoursAgo', { count: 2 })).toBe('2u geleden');
    expect(t('search.recentTime.yesterday')).toBe('gisteren');
    expect(t('search.recentTime.daysAgo', { count: 3 })).toBe('3d geleden');
  });
});

describe('TopBar i18n aria-labels', () => {
  it('has translated aria-label keys', () => {
    // Verify the keys exist and translate correctly
    expect(i18nEn.t('aria.home')).toBe('Buurt Check home');
    expect(i18nEn.t('aria.language')).toBe('Language');
    expect(i18nEn.t('aria.settings')).toBe('Settings');
    expect(i18nNl.t('aria.home')).toBe('Startpagina Buurt Check');
    expect(i18nNl.t('aria.language')).toBe('Taal');
    expect(i18nNl.t('aria.settings')).toBe('Instellingen');
  });

  it('translates neighborhood navigation label', () => {
    expect(i18nEn.t('nav.neighborhood')).toBe('Neighborhood');
    expect(i18nNl.t('nav.neighborhood')).toBe('Buurt');
  });
});

describe('Back button i18n', () => {
  it('common.back translates correctly in both languages', () => {
    expect(i18nEn.t('common.back')).toBe('Back');
    expect(i18nNl.t('common.back')).toBe('Terug');
  });
});

describe('Skip navigation i18n', () => {
  it('a11y.skip_to_content translates correctly in both languages', () => {
    expect(i18nEn.t('a11y.skip_to_content')).toBe('Skip to main content');
    expect(i18nNl.t('a11y.skip_to_content')).toBe('Ga naar hoofdinhoud');
  });
});

describe('3D viewer keyboard hint i18n', () => {
  it('viewer3d.keyboardHint translates correctly in both languages', () => {
    expect(i18nEn.t('viewer3d.keyboardHint')).toMatch(/arrow keys/i);
    expect(i18nNl.t('viewer3d.keyboardHint')).toMatch(/pijltjestoetsen/i);
  });
});
