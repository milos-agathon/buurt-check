import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import SpringTuner from './SpringTuner';
import { setupTestI18n } from '../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

describe('SpringTuner', () => {
  it('renders spring constants in dev panel', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <SpringTuner />
      </I18nextProvider>,
    );
    expect(screen.getByTestId('spring-tuner')).toBeInTheDocument();
    expect(screen.getByText('SPRING_EXPAND')).toBeInTheDocument();
    expect(screen.getByText('SPRING_TAB')).toBeInTheDocument();
  });
});
