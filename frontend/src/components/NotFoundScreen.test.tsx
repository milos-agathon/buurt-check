import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { setupTestI18n } from '../test/helpers';
import NotFoundScreen from './NotFoundScreen';

describe('NotFoundScreen', () => {
  it('renders recovery routes in English', async () => {
    const i18n = await setupTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <NotFoundScreen route="#/does-not-exist" onSearch={() => undefined} onSaved={() => undefined} />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: /could not find/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search an address/i })).toHaveFocus();
    expect(screen.getByRole('button', { name: /Open saved homes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Privacy/i })).toHaveAttribute('href', '/privacy.html');
    expect(screen.getByRole('link', { name: /Terms/i })).toHaveAttribute('href', '/terms.html');
    expect(screen.getByText('#/does-not-exist')).toBeInTheDocument();
  });

  it('fires recovery callbacks', async () => {
    const i18n = await setupTestI18n('en');
    const onSearch = vi.fn();
    const onSaved = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <NotFoundScreen onSearch={onSearch} onSaved={onSaved} />
      </I18nextProvider>,
    );

    screen.getByRole('button', { name: /Search an address/i }).click();
    screen.getByRole('button', { name: /Open saved homes/i }).click();
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
