import type { PricingResponse } from '../types/api';

const FALLBACK_PRICE = import.meta.env.VITE_DOSSIER_PRICE_EUR || '14.99';

let cachedPrice = FALLBACK_PRICE;
let inFlight: Promise<string> | null = null;

function isValidPrice(value: unknown): value is string {
  return typeof value === 'string' && /^\d+(\.\d{2})$/.test(value);
}

export async function fetchPrice(): Promise<string> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch('/api/pricing');
      if (!response.ok) return cachedPrice;
      const data = await response.json() as Partial<PricingResponse>;
      const price = data.price_eur;
      if (isValidPrice(price)) {
        cachedPrice = price;
      }
    } catch {
      // Keep fallback/cached price.
    } finally {
      inFlight = null;
    }
    return cachedPrice;
  })();

  return inFlight;
}

export function getDossierPrice(): string {
  return cachedPrice;
}

export function getDossierPriceDisplay(): string {
  return `€${cachedPrice}`;
}
