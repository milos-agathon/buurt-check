import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DossierSheet from './DossierSheet';

describe('DossierSheet', () => {
  const defaultProps = {
    snap: 'half' as const,
    children: <div data-testid="sheet-content">Content</div>,
  };

  it('renders children in normal flow when visible', () => {
    render(<DossierSheet {...defaultProps} />);
    expect(screen.getByTestId('dossier-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
  });

  it('renders as hidden when snap is hidden', () => {
    render(<DossierSheet {...defaultProps} snap="hidden" />);
    const sheet = screen.getByTestId('dossier-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveStyle({ display: 'none' });
  });

  it('does not render legacy curtain or drag handle', () => {
    render(<DossierSheet {...defaultProps} snap="full" />);
    expect(screen.queryByTestId('sheet-backdrop')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sheet-handle')).not.toBeInTheDocument();
  });

  it('sets action bar offset custom property when actionBarVisible is true', () => {
    render(<DossierSheet {...defaultProps} actionBarVisible />);
    const content = document.getElementById('dossier-content');
    expect(content).toBeTruthy();
    expect(content!.style.getPropertyValue('--dossier-action-bar-offset')).toBe('var(--action-bar-height, 64px)');
  });

  it('sets action bar offset to 0px when actionBarVisible is false', () => {
    render(<DossierSheet {...defaultProps} actionBarVisible={false} />);
    const content = document.getElementById('dossier-content');
    expect(content).toBeTruthy();
    expect(content!.style.getPropertyValue('--dossier-action-bar-offset')).toBe('0px');
  });

  it('defaults actionBarVisible to false (no extra padding)', () => {
    render(<DossierSheet {...defaultProps} />);
    const content = document.getElementById('dossier-content');
    expect(content).toBeTruthy();
    expect(content!.style.getPropertyValue('--dossier-action-bar-offset')).toBe('0px');
  });
});
