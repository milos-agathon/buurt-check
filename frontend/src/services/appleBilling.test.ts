const capacitorMocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  isPluginAvailable: vi.fn(),
  appleBillingBridge: {
    isAvailable: vi.fn(),
    getProduct: vi.fn(),
    purchaseProduct: vi.fn(),
    getPendingTransaction: vi.fn(),
    finishTransaction: vi.fn(),
    presentPdfShareSheet: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: capacitorMocks.isNativePlatform,
    getPlatform: capacitorMocks.getPlatform,
    isPluginAvailable: capacitorMocks.isPluginAvailable,
  },
  registerPlugin: vi.fn(() => capacitorMocks.appleBillingBridge),
}));

const {
  isNativePlatform,
  getPlatform,
  isPluginAvailable,
  appleBillingBridge,
} = capacitorMocks;

import {
  beginAppleBillingPurchase,
  clearPendingAppleBillingReport,
  getPendingAppleBillingReport,
  isAppleBillingPendingError,
} from './appleBilling';

describe('appleBilling', () => {
  beforeEach(() => {
    localStorage.clear();
    isNativePlatform.mockReset();
    getPlatform.mockReset();
    isPluginAvailable.mockReset();
    appleBillingBridge.isAvailable.mockReset();
    appleBillingBridge.getProduct.mockReset();
    appleBillingBridge.purchaseProduct.mockReset();
    appleBillingBridge.getPendingTransaction.mockReset();
    appleBillingBridge.finishTransaction.mockReset();
    appleBillingBridge.presentPdfShareSheet.mockReset();

    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    isPluginAvailable.mockReturnValue(true);
  });

  it('stores the pending report while Apple purchase approval is pending', async () => {
    const pendingError = { code: 'PURCHASE_PENDING' };
    appleBillingBridge.purchaseProduct.mockRejectedValue(pendingError);

    await expect(beginAppleBillingPurchase('report-123')).rejects.toEqual(pendingError);

    expect(isAppleBillingPendingError(pendingError)).toBe(true);
    expect(getPendingAppleBillingReport()).toBe('report-123');
  });

  it('clears the pending report for non-pending failures', async () => {
    appleBillingBridge.purchaseProduct.mockRejectedValue(new Error('purchase failed'));

    await expect(beginAppleBillingPurchase('report-123')).rejects.toThrow('purchase failed');

    expect(getPendingAppleBillingReport()).toBeNull();
    clearPendingAppleBillingReport();
    expect(getPendingAppleBillingReport()).toBeNull();
  });
});
