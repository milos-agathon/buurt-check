import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomSheet from './BottomSheet';

describe('BottomSheet', () => {
  it('renders children when open', () => {
    render(
      <BottomSheet isOpen onClose={vi.fn()}>
        <p>Sheet content</p>
      </BottomSheet>,
    );
    expect(screen.getByText('Sheet content')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <BottomSheet isOpen={false} onClose={vi.fn()}>
        <p>Sheet content</p>
      </BottomSheet>,
    );
    expect(screen.queryByText('Sheet content')).not.toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen onClose={onClose}>
        <p>Content</p>
      </BottomSheet>,
    );
    const overlay = screen.getByTestId('bottom-sheet-overlay');
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores backdrop clicks without a matching backdrop pointerdown', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen onClose={onClose}>
        <p>Content</p>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByTestId('bottom-sheet-overlay'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose when sheet content clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen onClose={onClose}>
        <p>Content</p>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByText('Content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen onClose={onClose}>
        <p>Content</p>
      </BottomSheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has dialog role', () => {
    render(
      <BottomSheet isOpen onClose={vi.fn()}>
        <p>Content</p>
      </BottomSheet>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
