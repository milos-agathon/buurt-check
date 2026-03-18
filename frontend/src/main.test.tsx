import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderRootMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderRootMock }));
const registerSWMock = vi.fn();

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: registerSWMock,
}));

vi.mock('./App.tsx', () => ({
  default: () => <div data-testid="app-root">App</div>,
}));

vi.mock('./i18n', () => ({}));

describe('main entry', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });
    renderRootMock.mockReset();
    createRootMock.mockClear();
    registerSWMock.mockReset();
  });

  it('wraps App in MotionConfig with reducedMotion=user', async () => {
    await import('./main.tsx');

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(renderRootMock).toHaveBeenCalledTimes(1);

    const renderedTree = renderRootMock.mock.calls[0][0] as ReactElement;
    render(renderedTree);

    expect(screen.getByTestId('motion-config')).toHaveAttribute('data-reduced-motion', 'user');
    expect(screen.getByTestId('app-root')).toBeInTheDocument();
    expect(registerSWMock).toHaveBeenCalledWith(
      expect.objectContaining({
        immediate: true,
      }),
    );
  });
});

