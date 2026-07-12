import { Capacitor, registerPlugin } from '@capacitor/core';

const APPLE_BILLING_PENDING_REPORT_KEY = 'buurt-check:apple-billing:pending-report';
const APPLE_PRODUCT_ID = (import.meta.env.VITE_APPLE_PRODUCT_ID ?? 'full_dossier_unlock').trim();

interface AppleBillingBridgePlugin {
  isAvailable(): Promise<{ available: boolean }>;
  getProduct(options: { productId: string }): Promise<AppleBillingProduct>;
  purchaseProduct(options: { productId: string }): Promise<AppleBillingPurchaseSession>;
  getPendingTransaction(
    options: { productId: string },
  ): Promise<AppleBillingPendingTransaction | undefined>;
  finishTransaction(options: { transactionId: string }): Promise<void>;
  presentPdfShareSheet(options: {
    base64Data: string;
    filename: string;
    mimeType?: string;
    title?: string;
  }): Promise<void>;
}

export interface AppleBillingProduct {
  productId: string;
  title?: string;
  description?: string;
  displayPrice: string;
  currencyCode?: string;
}

export interface AppleBillingPurchaseSession {
  productId: string;
  transactionId: string;
  originalTransactionId?: string | null;
  signedTransactionInfo: string;
}

export interface AppleBillingPendingTransaction {
  productId: string;
  transactionId: string;
  originalTransactionId?: string | null;
  signedTransactionInfo: string;
}

const AppleBillingBridge = registerPlugin<AppleBillingBridgePlugin>('AppleBillingBridge');

function isConfigured(): boolean {
  return APPLE_PRODUCT_ID.length > 0;
}

function getAppleBillingProductId(): string | null {
  return isConfigured() ? APPLE_PRODUCT_ID : null;
}

export function isAppleBillingContextAvailableSync(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'ios'
    && Capacitor.isPluginAvailable('AppleBillingBridge')
    && isConfigured();
}

export async function isAppleBillingReady(): Promise<boolean> {
  if (!isAppleBillingContextAvailableSync()) {
    return false;
  }
  try {
    const status = await AppleBillingBridge.isAvailable();
    if (!status.available) return false;
    await AppleBillingBridge.getProduct({ productId: APPLE_PRODUCT_ID });
    return true;
  } catch {
    return false;
  }
}

export async function getAppleBillingProduct(): Promise<AppleBillingProduct> {
  if (!isAppleBillingContextAvailableSync()) {
    throw new Error('Apple Billing is unavailable in this context');
  }
  const productId = getAppleBillingProductId();
  if (!productId) {
    throw new Error('Apple product ID is not configured');
  }
  return AppleBillingBridge.getProduct({ productId });
}

function storePendingAppleBillingReport(reportId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APPLE_BILLING_PENDING_REPORT_KEY, reportId);
  } catch {
    // Ignore storage failures.
  }
}

export function getPendingAppleBillingReport(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(APPLE_BILLING_PENDING_REPORT_KEY);
  } catch {
    return null;
  }
}

export function clearPendingAppleBillingReport(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(APPLE_BILLING_PENDING_REPORT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function isAppleBillingCancelledError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === 'PURCHASE_CANCELLED';
}

export function isAppleBillingPendingError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === 'PURCHASE_PENDING';
}

export async function beginAppleBillingPurchase(
  reportId: string,
): Promise<AppleBillingPurchaseSession> {
  const productId = getAppleBillingProductId();
  if (!productId) {
    throw new Error('Apple product ID is not configured');
  }

  storePendingAppleBillingReport(reportId);
  try {
    return await AppleBillingBridge.purchaseProduct({ productId });
  } catch (error) {
    if (!isAppleBillingPendingError(error)) {
      clearPendingAppleBillingReport();
    }
    if (typeof error === 'object' && error !== null && 'code' in error) {
      throw error;
    }
    throw error;
  }
}

export async function finishAppleBillingTransaction(transactionId: string): Promise<void> {
  await AppleBillingBridge.finishTransaction({ transactionId });
}

export async function findPendingAppleBillingPurchase(): Promise<AppleBillingPendingTransaction | null> {
  const productId = getAppleBillingProductId();
  if (!productId || !isAppleBillingContextAvailableSync()) {
    return null;
  }
  const pendingTransaction = await AppleBillingBridge.getPendingTransaction({ productId });
  if (
    !pendingTransaction
    || typeof pendingTransaction !== 'object'
    || typeof pendingTransaction.transactionId !== 'string'
    || typeof pendingTransaction.signedTransactionInfo !== 'string'
    || typeof pendingTransaction.productId !== 'string'
  ) {
    return null;
  }
  return pendingTransaction;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function presentAppleBillingPdfShareSheet(
  blob: Blob,
  filename: string,
  title?: string,
): Promise<void> {
  if (!isAppleBillingContextAvailableSync()) {
    throw new Error('Apple Billing PDF share is unavailable in this context');
  }

  await AppleBillingBridge.presentPdfShareSheet({
    base64Data: await blobToBase64(blob),
    filename,
    mimeType: 'application/pdf',
    title,
  });
}

