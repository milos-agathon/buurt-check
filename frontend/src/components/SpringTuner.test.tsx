import { render, screen } from '@testing-library/react';
import SpringTuner from './SpringTuner';

describe('SpringTuner', () => {
  it('renders spring constants in dev panel', () => {
    render(<SpringTuner />);
    expect(screen.getByTestId('spring-tuner')).toBeInTheDocument();
    expect(screen.getByText('SPRING_SHEET')).toBeInTheDocument();
    expect(screen.getByText('SPRING_EXPAND')).toBeInTheDocument();
  });
});
