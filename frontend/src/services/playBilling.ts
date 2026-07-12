const PLAY_BILLING_METHOD = 'https://play.google.com/billing';
const PLAY_BILLING_PENDING_REPORT_KEY = 'buurt-check:play-billing:pending-report';
const PLAY_PRODUCT_ID = (import.meta.env.VITE_GOOGLE_PLAY_PRODUCT_ID ?? 'full_dossier_unlock').trim();

interface DigitalGoodsPrice {
  currency: string;
  value: string;
}

interface DigitalGoodsItemDetails {
  itemId: string;
  title?: string;
  description?: string;
  price: DigitalGoodsPrice;
}

interface DigitalGoodsPurchaseDetails {
  itemId: string;
  purchaseToken: string;
}

interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<DigitalGoodsItemDetails[]>;
  listPurchases(): Promise<DigitalGoodsPurchaseDetails[]>;
  consume(purchaseToken: string): Promise<void>;
}

declare global {
  interface Window {
    getDigitalGoodsService?: (paymentMethod: string) => Promise<DigitalGoodsService>;
  }
}

export interface PlayBillingPurchaseSession {
  productId: string;
  purchaseToken: string;
  paymentResponse: PaymentResponse;
}

export interface PlayBillingRestorablePurchase {
  productId: string;
  purchaseToken: string;
}

function isConfigured(): boolean {
  return PLAY_PRODUCT_ID.length > 0;
}

async function getPlayBillingService(): Promise<DigitalGoodsService> {
  if (
    !window.isSecureContext
    || typeof window.getDigitalGoodsService !== 'function'
    || typeof PaymentRequest === 'undefined'
    || !isConfigured()
  ) {
    throw new Error('Google Play Billing is unavailable in this context');
  }

  return window.getDigitalGoodsService(PLAY_BILLING_METHOD);
}

async function getProductDetails(
  service: DigitalGoodsService,
  productId: string,
): Promise<DigitalGoodsItemDetails> {
  const [details] = await service.getDetails([productId]);
  if (!details) {
    throw new Error(`Digital goods details missing for ${productId}`);
  }
  return details;
}

function getPlayBillingProductId(): string | null {
  return isConfigured() ? PLAY_PRODUCT_ID : null;
}

export function isPlayBillingContextAvailableSync(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext
    && typeof window.getDigitalGoodsService === 'function'
    && typeof PaymentRequest !== 'undefined'
    && isConfigured();
}

export async function isPlayBillingReady(): Promise<boolean> {
  try {
    const service = await getPlayBillingService();
    await getProductDetails(service, PLAY_PRODUCT_ID);
    return true;
  } catch {
    return false;
  }
}

function storePendingPlayBillingReport(reportId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PLAY_BILLING_PENDING_REPORT_KEY, reportId);
  } catch {
    // Ignore storage failures.
  }
}

export function getPendingPlayBillingReport(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(PLAY_BILLING_PENDING_REPORT_KEY);
  } catch {
    return null;
  }
}

export function clearPendingPlayBillingReport(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PLAY_BILLING_PENDING_REPORT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export async function beginPlayBillingPurchase(reportId: string): Promise<PlayBillingPurchaseSession> {
  const service = await getPlayBillingService();
  const productId = getPlayBillingProductId();
  if (!productId) {
    throw new Error('Google Play product ID is not configured');
  }

  const details = await getProductDetails(service, productId);
  const paymentRequest = new PaymentRequest(
    [{
      supportedMethods: PLAY_BILLING_METHOD,
      data: { sku: productId },
    }],
    {
      total: {
        label: details.title || 'Buurt Check Questions Pack',
        amount: {
          currency: details.price.currency,
          value: details.price.value,
        },
      },
    },
  );

  storePendingPlayBillingReport(reportId);
  try {
    const paymentResponse = await paymentRequest.show();
    const responseDetails = paymentResponse.details as DigitalGoodsPurchaseDetails | undefined;
    if (!responseDetails?.purchaseToken) {
      clearPendingPlayBillingReport();
      throw new Error('Google Play Billing did not return a purchase token');
    }

    return {
      productId,
      purchaseToken: responseDetails.purchaseToken,
      paymentResponse,
    };
  } catch (error) {
    clearPendingPlayBillingReport();
    throw error;
  }
}

export async function completePlayBillingPurchase(
  purchase: PlayBillingPurchaseSession,
  result: PaymentComplete,
): Promise<void> {
  try {
    await purchase.paymentResponse.complete(result);
  } catch {
    // Ignore UI completion failures after the backend decision is made.
  }
}

export async function consumePlayBillingPurchaseToken(purchaseToken: string): Promise<void> {
  const service = await getPlayBillingService();
  await service.consume(purchaseToken);
}

export async function findRestorablePlayBillingPurchase(): Promise<PlayBillingRestorablePurchase | null> {
  const service = await getPlayBillingService();
  const productId = getPlayBillingProductId();
  if (!productId) {
    return null;
  }

  const purchases = await service.listPurchases();
  const match = purchases.find((purchase) => purchase.itemId === productId);
  if (!match?.purchaseToken) {
    return null;
  }

  return {
    productId,
    purchaseToken: match.purchaseToken,
  };
}
