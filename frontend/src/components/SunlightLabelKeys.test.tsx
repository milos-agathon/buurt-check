import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement } from 'react';
import SunlightRiskCard from './SunlightRiskCard';
import { makeSunlightResult, setupTestI18n } from '../test/helpers';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nEn = await setupTestI18n('en');
});

function renderWithI18n(element: ReactElement) {
  return render(
    <I18nextProvider i18n={i18nEn}>
      {element}
    </I18nextProvider>,
  );
}

describe('Sunlight translation key separation', () => {
  it('uses sunlight.title_full for the sunlight analysis card title', () => {
    renderWithI18n(<SunlightRiskCard sunlight={makeSunlightResult()} />);

    expect(screen.getByText('Roof direct sun (clear-sky visibility)')).toBeInTheDocument();
  });
});
