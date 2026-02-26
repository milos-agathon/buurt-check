import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import AddressHeader from './AddressHeader';
import { setupTestI18n, makeResolvedAddress } from '../test/helpers';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  [i18nEn, i18nNl] = await Promise.all([setupTestI18n('en'), setupTestI18n('nl')]);
});

describe('AddressHeader', () => {
  it('renders address street and postcode', () => {
    render(
      <I18nextProvider i18n={i18nEn}>
        <AddressHeader address={makeResolvedAddress()} />
      </I18nextProvider>,
    );

    expect(screen.getByTestId('address-header')).toBeInTheDocument();
  });

  it('renders building details when provided', () => {
    render(
      <I18nextProvider i18n={i18nNl}>
        <AddressHeader
          address={makeResolvedAddress()}
          building={{ pand_id: '0363100012345678', construction_year: 1923, num_units: 4, intended_use: ['Woonfunctie'], intended_use_en: ['Residential'] }}
        />
      </I18nextProvider>,
    );

    expect(screen.getByTestId('address-header')).toBeInTheDocument();
  });

  it('does not render change button when onChangeAddress is not provided', () => {
    render(
      <I18nextProvider i18n={i18nEn}>
        <AddressHeader address={makeResolvedAddress()} />
      </I18nextProvider>,
    );

    expect(screen.queryByText('Change address')).not.toBeInTheDocument();
  });

  it('renders change address button when onChangeAddress is provided', () => {
    const handleChange = vi.fn();
    render(
      <I18nextProvider i18n={i18nEn}>
        <AddressHeader address={makeResolvedAddress()} onChangeAddress={handleChange} />
      </I18nextProvider>,
    );

    const button = screen.getByText('Change address');
    expect(button).toBeInTheDocument();
  });

  it('calls onChangeAddress when change button is clicked', () => {
    const handleChange = vi.fn();
    render(
      <I18nextProvider i18n={i18nEn}>
        <AddressHeader address={makeResolvedAddress()} onChangeAddress={handleChange} />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByText('Change address'));
    expect(handleChange).toHaveBeenCalledOnce();
  });

  it('renders NL translation for change button', () => {
    const handleChange = vi.fn();
    render(
      <I18nextProvider i18n={i18nNl}>
        <AddressHeader address={makeResolvedAddress()} onChangeAddress={handleChange} />
      </I18nextProvider>,
    );

    expect(screen.getByText('Ander adres')).toBeInTheDocument();
  });
});
