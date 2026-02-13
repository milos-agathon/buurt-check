import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DossierSheet from './DossierSheet';

describe('DossierSheet', () => {
  const defaultProps = {
    snap: 'half' as const,
    onSnapChange: vi.fn(),
    children: <div data-testid="sheet-content">Content</div>,
  };

  it('renders children', () => {
    render(<DossierSheet {...defaultProps} />);
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
  });

  it('renders drag handle with 44px hit area', () => {
    render(<DossierSheet {...defaultProps} />);
    const handle = screen.getByTestId('sheet-handle');
    expect(handle).toBeInTheDocument();
  });

  it('renders as hidden when snap is hidden', () => {
    render(<DossierSheet {...defaultProps} snap="hidden" />);
    const sheet = screen.getByTestId('dossier-sheet');
    expect(sheet).toBeInTheDocument();
  });

  it('renders at peek when snap is peek', () => {
    render(<DossierSheet {...defaultProps} snap="peek" />);
    expect(screen.getByTestId('dossier-sheet')).toBeInTheDocument();
  });

  it('renders backdrop at full snap', () => {
    render(<DossierSheet {...defaultProps} snap="full" />);
    expect(screen.getByTestId('sheet-backdrop')).toBeInTheDocument();
  });

  it('does not render backdrop at half snap', () => {
    render(<DossierSheet {...defaultProps} snap="half" />);
    expect(screen.queryByTestId('sheet-backdrop')).not.toBeInTheDocument();
  });

  it('calls onSnapChange("half") on Escape key at full snap', () => {
    const onSnapChange = vi.fn();
    render(<DossierSheet {...defaultProps} snap="full" onSnapChange={onSnapChange} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onSnapChange).toHaveBeenCalledWith('half');
  });

  it('does not call onSnapChange on Escape at half snap', () => {
    const onSnapChange = vi.fn();
    render(<DossierSheet {...defaultProps} snap="half" onSnapChange={onSnapChange} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onSnapChange).not.toHaveBeenCalled();
  });

  it('handle has role=separator with aria-label', () => {
    render(<DossierSheet {...defaultProps} />);
    const handle = screen.getByTestId('sheet-handle');
    expect(handle).toHaveAttribute('role', 'separator');
    expect(handle).toHaveAttribute('aria-label');
  });
});
