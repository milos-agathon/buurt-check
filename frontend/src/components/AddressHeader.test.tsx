import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import AddressHeader from './AddressHeader';
import { setupTestI18n, makeResolvedAddress } from '../test/helpers';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  [i18nEn, i18nNl] = await Promise.all([setupTestI18n('en'), setupTestI18n('nl')]);
});

describe('AddressHeader shortlist aria labels', () => {
  it('uses translated add label in English', () => {
    render(
      <I18nextProvider i18n={i18nEn}>
        <AddressHeader
          address={makeResolvedAddress()}
          isBookmarked={false}
          onBookmarkToggle={() => {}}
        />
      </I18nextProvider>,
    );

    expect(screen.getByLabelText('Save property')).toBeInTheDocument();
  });

  it('uses translated remove label in Dutch', () => {
    render(
      <I18nextProvider i18n={i18nNl}>
        <AddressHeader
          address={makeResolvedAddress()}
          isBookmarked
          onBookmarkToggle={() => {}}
        />
      </I18nextProvider>,
    );

    expect(screen.getByLabelText('Woning verwijderen uit opgeslagen')).toBeInTheDocument();
  });
});
