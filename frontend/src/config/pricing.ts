import type { PricingResponse } from '../types/api';
import { buildPrimaryApiUrl } from './apiBase';

const FALLBACK_PRICE = import.meta.env.VITE_DOSSIER_PRICE_EUR || '3.99';

let cachedPrice = FALLBACK_PRICE;
let cachedServerRenderAvailable = false;
let inFlight: Promise<string> | null = null;

function isValidPrice(value: unknown): value is string {
  return typeof value === 'string' && /^\d+(\.\d{2})$/.test(value);
}

export async function fetchPrice(): Promise<string> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch(buildPrimaryApiUrl('/pricing'));
      if (!response.ok) return cachedPrice;
      const data = await response.json() as Partial<PricingResponse>;
      const price = data.price_eur;
      if (isValidPrice(price)) {
        cachedPrice = price;
      }
      if (typeof data.server_render_available === 'boolean') {
        cachedServerRenderAvailable = data.server_render_available;
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

/** True when backend has forge3d server-side rendering enabled. */
export function isServerRenderAvailable(): boolean {
  return cachedServerRenderAvailable;
}
