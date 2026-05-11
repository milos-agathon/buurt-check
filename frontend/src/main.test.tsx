import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderRootMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderRootMock }));
const updateSWMock = vi.fn();
const registerSWMock = vi.fn(() => updateSWMock);
const prewarmAddressApiMock = vi.fn();
const getRegistrationsMock = vi.fn();
const unregisterMock = vi.fn();

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: registerSWMock,
}));

vi.mock('./services/api', () => ({
  prewarmAddressApi: prewarmAddressApiMock,
}));

vi.mock('./App.tsx', () => ({
  default: () => <div data-testid="app-root">App</div>,
}));

vi.mock('./i18n', () => ({}));

describe('main entry', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: getRegistrationsMock,
        controller: null,
      },
    });
    renderRootMock.mockReset();
    createRootMock.mockClear();
    registerSWMock.mockReset();
    updateSWMock.mockReset();
    prewarmAddressApiMock.mockReset();
    getRegistrationsMock.mockReset();
    unregisterMock.mockReset();
    getRegistrationsMock.mockResolvedValue([]);
  });

  it('wraps App in MotionConfig with reducedMotion=user', async () => {
    await import('./main.tsx');

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(renderRootMock).toHaveBeenCalledTimes(1);

    const renderedTree = renderRootMock.mock.calls[0][0] as ReactElement;
    render(renderedTree);

    expect(screen.getByTestId('motion-config')).toHaveAttribute('data-reduced-motion', 'user');
    expect(screen.getByTestId('app-root')).toBeInTheDocument();
    expect(prewarmAddressApiMock).toHaveBeenCalledTimes(1);
    expect(registerSWMock).not.toHaveBeenCalled();
    expect(getRegistrationsMock).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('unregisters stale service workers in development', async () => {
    getRegistrationsMock.mockResolvedValue([{ unregister: unregisterMock }]);

    await import('./main.tsx');

    await vi.waitFor(() => {
      expect(unregisterMock).toHaveBeenCalledTimes(1);
    });
  }, 15_000);
});

