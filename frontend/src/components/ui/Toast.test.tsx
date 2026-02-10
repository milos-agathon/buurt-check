import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastContainer, useToast } from './Toast';
import { renderHook } from '@testing-library/react';

describe('ToastContainer', () => {
  it('renders toast messages', () => {
    render(
      <ToastContainer
        toasts={[{ id: 1, text: 'Item saved' }]}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Item saved')).toBeInTheDocument();
  });

  it('renders nothing when no toasts', () => {
    const { container } = render(
      <ToastContainer toasts={[]} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders action button when provided', () => {
    render(
      <ToastContainer
        toasts={[{ id: 1, text: 'Deleted', action: { label: 'Undo', onClick: vi.fn() } }]}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });

  it('calls onDismiss when toast clicked', () => {
    const onDismiss = vi.fn();
    render(
      <ToastContainer
        toasts={[{ id: 1, text: 'Hello' }]}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText('Hello'));
    expect(onDismiss).toHaveBeenCalledWith(1);
  });
});

describe('useToast', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('adds and auto-dismisses toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => { result.current.showToast('Test message'); });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].text).toBe('Test message');

    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('auto-dismisses action toasts after 6 seconds', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('With action', { label: 'Undo', onClick: vi.fn() });
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current.toasts).toHaveLength(1); // Still there at 4s

    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.toasts).toHaveLength(0); // Gone at 6s
  });
});
