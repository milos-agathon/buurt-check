import {
  getAppleBillingProduct,
  isAppleBillingContextAvailableSync,
  isAppleBillingReady,
} from './appleBilling';
import {
  isPlayBillingContextAvailableSync,
  isPlayBillingReady,
} from './playBilling';

export type BillingProvider = 'stripe' | 'google_play' | 'apple_app_store';

export interface BillingProviderResolution {
  provider: BillingProvider;
  localizedPriceLabel?: string;
}

export async function resolveBillingProvider(): Promise<BillingProviderResolution> {
  if (isAppleBillingContextAvailableSync()) {
    if (!await isAppleBillingReady()) {
      return { provider: 'apple_app_store' };
    }
    const product = await getAppleBillingProduct();
    return {
      provider: 'apple_app_store',
      localizedPriceLabel: product.displayPrice,
    };
  }

  if (isPlayBillingContextAvailableSync() && await isPlayBillingReady()) {
    return { provider: 'google_play' };
  }

  return { provider: 'stripe' };
}
