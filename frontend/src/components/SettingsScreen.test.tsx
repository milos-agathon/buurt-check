import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { ComponentProps } from 'react';
import SettingsScreen from './SettingsScreen';
import { setupTestI18n } from '../test/helpers';

let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

beforeEach(async () => {
  await i18nInstance.changeLanguage('en');
});

function renderSettings(overrides?: Partial<ComponentProps<typeof SettingsScreen>>) {
  const onThemeChange = vi.fn();
  const onClearRecent = vi.fn();
  const onClearShortlist = vi.fn();
  const onAnalyticsConsentChange = vi.fn();
  render(
    <I18nextProvider i18n={i18nInstance}>
      <SettingsScreen
        onClearRecent={onClearRecent}
        onClearShortlist={onClearShortlist}
        theme="light"
        onThemeChange={onThemeChange}
        analyticsEnabled={true}
        analyticsConsent="granted"
        onAnalyticsConsentChange={onAnalyticsConsentChange}
        {...overrides}
      />
    </I18nextProvider>,
  );
  return { onThemeChange, onClearRecent, onClearShortlist, onAnalyticsConsentChange };
}

describe('SettingsScreen accessibility semantics', () => {
  it('renders language and theme controls as radio groups', () => {
    renderSettings();

    const languageGroup = screen.getByRole('radiogroup', { name: 'Language' });
    const enLanguage = within(languageGroup).getByRole('radio', { name: 'EN' });
    const nlLanguage = within(languageGroup).getByRole('radio', { name: 'NL' });
    expect(enLanguage).toHaveAttribute('aria-checked', 'true');
    expect(nlLanguage).toHaveAttribute('aria-checked', 'false');

    const themeGroup = screen.getByRole('radiogroup', { name: 'Appearance' });
    const systemTheme = within(themeGroup).getByRole('radio', { name: 'System' });
    const lightTheme = within(themeGroup).getByRole('radio', { name: 'Light' });
    const darkTheme = within(themeGroup).getByRole('radio', { name: 'Dark' });
    expect(systemTheme).toHaveAttribute('aria-checked', 'false');
    expect(lightTheme).toHaveAttribute('aria-checked', 'true');
    expect(darkTheme).toHaveAttribute('aria-checked', 'false');
  });

  it('defaults the appearance selection to light when no theme prop is supplied', () => {
    renderSettings({ theme: undefined });

    const themeGroup = screen.getByRole('radiogroup', { name: 'Appearance' });
    expect(within(themeGroup).getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'false');
    expect(within(themeGroup).getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    expect(within(themeGroup).getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
  });

  it('updates checked language and theme selection states', async () => {
    const { onThemeChange } = renderSettings({ theme: 'system' });

    const languageGroup = screen.getByRole('radiogroup', { name: 'Language' });
    const nlLanguage = within(languageGroup).getByRole('radio', { name: 'NL' });
    fireEvent.click(nlLanguage);

    await waitFor(() => {
      expect(nlLanguage).toHaveAttribute('aria-checked', 'true');
    });

    fireEvent.click(screen.getByRole('radio', { name: /Dark|Donker/i }));
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('renders analytics consent controls and updates the selected state', () => {
    const { onAnalyticsConsentChange } = renderSettings({ analyticsConsent: 'denied' });

    const analyticsGroup = screen.getByRole('radiogroup', { name: 'Analytics' });
    const allowAnalytics = within(analyticsGroup).getByRole('radio', { name: 'Allow analytics' });
    const essentialOnly = within(analyticsGroup).getByRole('radio', { name: 'Essential only' });

    expect(allowAnalytics).toHaveAttribute('aria-checked', 'false');
    expect(essentialOnly).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(allowAnalytics);
    expect(onAnalyticsConsentChange).toHaveBeenCalledWith('granted');
  });

  it('requires confirmation before clearing recent searches', () => {
    const { onClearRecent } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Clear recent searches' }));
    expect(onClearRecent).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear now' }));
    expect(onClearRecent).toHaveBeenCalledTimes(1);
  });

  it('renders privacy policy and terms links', () => {
    renderSettings();

    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy.html');
    expect(screen.getByRole('link', { name: 'Terms of use' })).toHaveAttribute('href', '/terms.html');
  });

  it('links feedback to the canonical GitHub repository', () => {
    renderSettings();

    expect(screen.getByRole('link', { name: 'Report an issue on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/milos-agathon/buurt-check',
    );
  });
});
