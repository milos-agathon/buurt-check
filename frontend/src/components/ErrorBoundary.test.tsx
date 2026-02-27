import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

// A component that throws on demand
function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test crash');
  }
  return <div>Child content</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress React error boundary console noise during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary fallback={<div>Fallback</div>}>
        <div>Normal content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Normal content')).toBeInTheDocument();
    expect(screen.queryByText('Fallback')).not.toBeInTheDocument();
  });

  it('renders fallback when a child throws', () => {
    render(
      <ErrorBoundary fallback={<div>Fallback</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Fallback')).toBeInTheDocument();
    expect(screen.queryByText('Child content')).not.toBeInTheDocument();
  });

  it('resets error state when key prop changes (new address)', () => {
    // Render with a throwing child and key="address-1"
    const { rerender } = render(
      <ErrorBoundary key="address-1" fallback={<div>Fallback</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Fallback')).toBeInTheDocument();

    // Change the key to simulate a new address selection.
    // React unmounts the old ErrorBoundary and mounts a fresh one.
    // The new child does not throw, so normal content renders.
    rerender(
      <ErrorBoundary key="address-2" fallback={<div>Fallback</div>}>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
    expect(screen.queryByText('Fallback')).not.toBeInTheDocument();
  });

  it('stays in error state when key does NOT change (same address)', () => {
    const { rerender } = render(
      <ErrorBoundary key="address-1" fallback={<div>Fallback</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Fallback')).toBeInTheDocument();

    // Same key — ErrorBoundary is NOT remounted, error state persists
    // even though the child would no longer throw
    rerender(
      <ErrorBoundary key="address-1" fallback={<div>Fallback</div>}>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Fallback')).toBeInTheDocument();
    expect(screen.queryByText('Child content')).not.toBeInTheDocument();
  });

  it('logs error in DEV mode via componentDidCatch', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Fallback</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    // React itself logs + our componentDidCatch logs
    expect(errorSpy).toHaveBeenCalled();
    const ourLog = errorSpy.mock.calls.find(
      (args) => args[0] === '[ErrorBoundary]'
    );
    expect(ourLog).toBeDefined();
    expect(ourLog![1]).toBeInstanceOf(Error);
    expect(ourLog![1].message).toBe('Test crash');
  });
});
