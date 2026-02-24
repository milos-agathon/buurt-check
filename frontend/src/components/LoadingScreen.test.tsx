import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { I18nextProvider } from 'react-i18next';
import type { ComponentProps } from 'react';
import LoadingScreen from './LoadingScreen';
import { makeResolvedAddress, setupTestI18n } from '../test/helpers';

let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

function renderLoadingScreen(overrides?: Partial<ComponentProps<typeof LoadingScreen>>) {
  return render(
    <I18nextProvider i18n={i18nInstance}>
      <LoadingScreen
        address={makeResolvedAddress()}
        pendingDisplayName={null}
        step="checkingAir"
        {...overrides}
      />
    </I18nextProvider>,
  );
}

describe('LoadingScreen', () => {
  it('renders address confirmation lines from resolved address', () => {
    renderLoadingScreen({
      address: makeResolvedAddress({
        street: 'Keizersgracht',
        house_number: '123',
        house_letter: 'A',
        addition: '2',
        postcode: '1012AB',
        city: 'Amsterdam',
      }),
    });

    expect(screen.getByText('Keizersgracht 123A2')).toBeInTheDocument();
    expect(screen.getByText('1012AB Amsterdam')).toBeInTheDocument();
  });

  it('falls back to parsed display name when resolved address is not available', () => {
    renderLoadingScreen({
      address: null,
      pendingDisplayName: 'Keizersgracht 123-II, 1012 AB Amsterdam',
      step: 'findingBuilding',
    });

    expect(screen.getByText('Keizersgracht 123-II')).toBeInTheDocument();
    expect(screen.getByText('1012 AB Amsterdam')).toBeInTheDocument();
    expect(screen.getByTestId('loading-screen-status-text')).toHaveTextContent('Finding building...');
  });

  it('shows warning message and advances progress bar by step', () => {
    renderLoadingScreen({
      step: 'checkingAir',
      warningKey: 'loading.warning.noiseStep',
    });

    expect(screen.getByTestId('loading-screen-status-text')).toHaveTextContent(
      'Noise data temporarily unavailable',
    );

    const progressFill = screen.getByTestId('loading-screen-progress-fill');
    expect(progressFill.getAttribute('style')).toContain('scaleX(0.666');
  });

  it('sets a labeled progressbar with value attributes', () => {
    renderLoadingScreen({
      step: 'checkingAir',
    });

    const progressbar = screen.getByRole('progressbar', { name: 'Dossier loading progress' });
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    expect(progressbar).toHaveAttribute('aria-valuenow', '67');
  });

  it('includes reduced-motion overrides for all loading animations', () => {
    const css = readFileSync('src/components/LoadingScreen.css', 'utf-8');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.loading-screen__segment');
    expect(css).toContain('animation: none');
    expect(css).toContain('.loading-screen__progress-fill');
    expect(css).toContain('transition: none');
  });
});
