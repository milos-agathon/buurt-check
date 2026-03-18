import {
  beginPlayBillingPurchase,
  clearPendingPlayBillingReport,
  consumePlayBillingPurchaseToken,
  findRestorablePlayBillingPurchase,
  getPendingPlayBillingReport,
  isPlayBillingContextAvailableSync,
  isPlayBillingReady,
} from './playBilling';

describe('playBilling', () => {
  const getDetails = vi.fn();
  const listPurchases = vi.fn();
  const consume = vi.fn();
  const getDigitalGoodsService = vi.fn();
  const show = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    getDetails.mockReset();
    listPurchases.mockReset();
    consume.mockReset();
    getDigitalGoodsService.mockReset();
    show.mockReset();

    getDetails.mockResolvedValue([{
      itemId: 'full_dossier_unlock',
      title: 'Buurt Check Full Dossier',
      price: {
        currency: 'EUR',
        value: '3.99',
      },
    }]);
    listPurchases.mockResolvedValue([]);
    consume.mockResolvedValue(undefined);
    getDigitalGoodsService.mockResolvedValue({
      getDetails,
      listPurchases,
      consume,
    });

    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, 'getDigitalGoodsService', {
      configurable: true,
      value: getDigitalGoodsService,
    });
    Object.defineProperty(window, 'PaymentRequest', {
      configurable: true,
      value: class MockPaymentRequest {
        show = show;
      },
    });
  });

  it('detects when the Google Play Billing runtime is available', async () => {
    await expect(isPlayBillingReady()).resolves.toBe(true);
    expect(isPlayBillingContextAvailableSync()).toBe(true);
  });

  it('stores the pending report and returns the purchase token', async () => {
    show.mockResolvedValue({
      details: {
        itemId: 'full_dossier_unlock',
        purchaseToken: 'purchase-token-123',
      },
    });

    const purchase = await beginPlayBillingPurchase('report-123');

    expect(getPendingPlayBillingReport()).toBe('report-123');
    expect(purchase.purchaseToken).toBe('purchase-token-123');
    expect(getDetails).toHaveBeenCalledWith(['full_dossier_unlock']);
  });

  it('clears the pending report when the user cancels the purchase sheet', async () => {
    show.mockRejectedValue(new DOMException('cancelled', 'AbortError'));

    await expect(beginPlayBillingPurchase('report-123')).rejects.toThrow();
    expect(getPendingPlayBillingReport()).toBeNull();
  });

  it('restores and consumes a pending Google Play purchase', async () => {
    listPurchases.mockResolvedValue([{
      itemId: 'full_dossier_unlock',
      purchaseToken: 'purchase-token-123',
    }]);

    const restored = await findRestorablePlayBillingPurchase();
    await consumePlayBillingPurchaseToken('purchase-token-123');
    clearPendingPlayBillingReport();

    expect(restored).toEqual({
      productId: 'full_dossier_unlock',
      purchaseToken: 'purchase-token-123',
    });
    expect(consume).toHaveBeenCalledWith('purchase-token-123');
    expect(getPendingPlayBillingReport()).toBeNull();
  });
});
