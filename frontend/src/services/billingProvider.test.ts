import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./appleBilling', () => ({
  getAppleBillingProduct: vi.fn(),
  isAppleBillingContextAvailableSync: vi.fn(() => false),
  isAppleBillingReady: vi.fn().mockResolvedValue(false),
}));

vi.mock('./playBilling', () => ({
  isPlayBillingContextAvailableSync: vi.fn(() => false),
  isPlayBillingReady: vi.fn().mockResolvedValue(false),
}));

import {
  getAppleBillingProduct,
  isAppleBillingContextAvailableSync,
  isAppleBillingReady,
} from './appleBilling';
import {
  isPlayBillingContextAvailableSync,
  isPlayBillingReady,
} from './playBilling';
import { resolveBillingProvider } from './billingProvider';

const mockGetAppleBillingProduct = vi.mocked(getAppleBillingProduct);
const mockIsAppleBillingContextAvailableSync = vi.mocked(isAppleBillingContextAvailableSync);
const mockIsAppleBillingReady = vi.mocked(isAppleBillingReady);
const mockIsPlayBillingContextAvailableSync = vi.mocked(isPlayBillingContextAvailableSync);
const mockIsPlayBillingReady = vi.mocked(isPlayBillingReady);

describe('resolveBillingProvider', () => {
  beforeEach(() => {
    mockGetAppleBillingProduct.mockReset();
    mockIsAppleBillingContextAvailableSync.mockReset();
    mockIsAppleBillingReady.mockReset();
    mockIsPlayBillingContextAvailableSync.mockReset();
    mockIsPlayBillingReady.mockReset();

    mockIsAppleBillingContextAvailableSync.mockReturnValue(false);
    mockIsAppleBillingReady.mockResolvedValue(false);
    mockIsPlayBillingContextAvailableSync.mockReturnValue(false);
    mockIsPlayBillingReady.mockResolvedValue(false);
  });

  it('prefers Apple billing and returns the localized StoreKit price', async () => {
    mockIsAppleBillingContextAvailableSync.mockReturnValue(true);
    mockIsAppleBillingReady.mockResolvedValue(true);
    mockGetAppleBillingProduct.mockResolvedValue({
      productId: 'full_dossier_unlock',
      displayPrice: '$4.99',
    });
    mockIsPlayBillingContextAvailableSync.mockReturnValue(true);
    mockIsPlayBillingReady.mockResolvedValue(true);

    await expect(resolveBillingProvider()).resolves.toEqual({
      provider: 'apple_app_store',
      localizedPriceLabel: '$4.99',
    });
  });

  it('keeps the Apple provider when the native bridge exists but product loading is not ready yet', async () => {
    mockIsAppleBillingContextAvailableSync.mockReturnValue(true);
    mockIsAppleBillingReady.mockResolvedValue(false);

    await expect(resolveBillingProvider()).resolves.toEqual({
      provider: 'apple_app_store',
    });
  });

  it('falls back to Google Play when Apple is unavailable and Play Billing is ready', async () => {
    mockIsPlayBillingContextAvailableSync.mockReturnValue(true);
    mockIsPlayBillingReady.mockResolvedValue(true);

    await expect(resolveBillingProvider()).resolves.toEqual({
      provider: 'google_play',
    });
  });

  it('falls back to Stripe when neither native billing runtime is available', async () => {
    await expect(resolveBillingProvider()).resolves.toEqual({
      provider: 'stripe',
    });
  });
});
