import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { MatchListing, MatchListingProviderResult } from '../../types/match';
import {
  getMatchAvailabilityStatusLabel,
  getMatchProviderHealthLabel,
  getMatchProviderModeLabel,
  getMatchPropertyTypeLabel,
} from './matchDisplayLabels';
import './MatchListings.css';

interface MatchListingsProps {
  result: MatchListingProviderResult | null;
  loading?: boolean;
  errorCode?: string | null;
  onCreateAlert?: (listing: MatchListing) => void;
}

function formatMoney(cents: number | null | undefined, unavailableLabel: string): string {
  if (cents == null) return unavailableLabel;

  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPriceRange(listings: MatchListing[], unavailableLabel: string): string {
  const prices = listings
    .map((listing) => listing.journey_intent === 'buy' ? listing.price_cents : listing.rent_cents)
    .filter((price): price is number => price != null);
  if (prices.length === 0) return unavailableLabel;

  return `${formatMoney(Math.min(...prices), unavailableLabel)} - ${formatMoney(Math.max(...prices), unavailableLabel)}`;
}

function getListingUnavailableReasonLabel(reason: string, t: TFunction): string {
  if (reason === 'listing_provider_unconfigured') {
    return t('match.listings.unavailableReasonCode.listingProviderUnconfigured');
  }

  if (reason.startsWith('listing_provider_failed:')) {
    return t('match.listings.unavailableReasonCode.listingProviderFailed');
  }

  return t('match.listings.unavailableReasonCode.unknown');
}

function ListingRow({ listing, onCreateAlert }: {
  listing: MatchListing;
  onCreateAlert?: (listing: MatchListing) => void;
}) {
  const { t } = useTranslation();
  const price = listing.journey_intent === 'buy' ? listing.price_cents : listing.rent_cents;
  const unavailableLabel = t('match.common.unavailable');

  return (
    <article className="match-listings__item">
      <div>
        <h3>{t(`match.listings.intent.${listing.journey_intent}`)}</h3>
        <p>{formatMoney(price, unavailableLabel)}</p>
      </div>
      <dl>
        <div>
          <dt>{t('match.listings.propertyType')}</dt>
          <dd>{getMatchPropertyTypeLabel(listing.property_type, t)}</dd>
        </div>
        <div>
          <dt>{t('match.listings.daysOnMarket')}</dt>
          <dd>{listing.days_on_market ?? t('match.common.unavailable')}</dd>
        </div>
        <div>
          <dt>{t('match.listings.availability')}</dt>
          <dd>{getMatchAvailabilityStatusLabel(listing.availability_status, t)}</dd>
        </div>
      </dl>
      {listing.provider_mode === 'mock' && (
        <p className="match-listings__mock">{t('match.listings.mockLabel')}</p>
      )}
      {onCreateAlert && (
        <button type="button" onClick={() => onCreateAlert(listing)}>
          {t('match.alerts.createFromListing')}
        </button>
      )}
    </article>
  );
}

export default function MatchListings({
  result,
  loading = false,
  errorCode = null,
  onCreateAlert,
}: MatchListingsProps) {
  const { t } = useTranslation();
  const grouped = useMemo(() => {
    const buy = result?.listings.filter((listing) => listing.journey_intent === 'buy') ?? [];
    const rent = result?.listings.filter((listing) => listing.journey_intent === 'rent') ?? [];
    return { buy, rent };
  }, [result]);

  if (loading) {
    return (
      <section className="match-listings" aria-busy="true">
        <h1>{t('match.listings.title')}</h1>
        <p role="status">{t('match.listings.loading')}</p>
      </section>
    );
  }

  if (errorCode) {
    return (
      <section className="match-listings" role="alert">
        <h1>{t('match.listings.title')}</h1>
        <p>{t(errorCode)}</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="match-listings">
        <h1>{t('match.listings.title')}</h1>
        <p>{t('match.listings.empty')}</p>
      </section>
    );
  }

  return (
    <section className="match-listings" aria-labelledby="match-listings-title">
      <header className="match-listings__header">
        <div>
          <p className="match-listings__eyebrow">{t('match.listings.eyebrow')}</p>
          <h1 id="match-listings-title">{t('match.listings.title')}</h1>
        </div>
        <div className="match-listings__status">
          <strong>{result.provider.name}</strong>
          <span>{getMatchProviderModeLabel(result.provider.mode, t)}</span>
          <span>{getMatchProviderHealthLabel(result.provider.health, t)}</span>
        </div>
      </header>

      {result.availability_density != null && (
        <p className="match-listings__density">
          {t('match.listings.availabilityDensity', { density: result.availability_density })}
        </p>
      )}

      {result.unavailable_reason && (
        <p className="match-listings__unavailable">
          {t('match.listings.unavailableReason', {
            reason: getListingUnavailableReasonLabel(result.unavailable_reason, t),
          })}
        </p>
      )}

      <div className="match-listings__sections">
        {(['buy', 'rent'] as const).map((intent) => (
          <section key={intent} className="match-listings__group">
            <h2>{t(`match.listings.group.${intent}`)}</h2>
            <p className="match-listings__range">
              {t('match.listings.priceRange', {
                range: formatPriceRange(grouped[intent], t('match.common.unavailable')),
              })}
            </p>
            {grouped[intent].length === 0 ? (
              <p>{t('match.listings.noHomes')}</p>
            ) : (
              grouped[intent].map((listing) => (
                <ListingRow
                  key={listing.listing_id}
                  listing={listing}
                  onCreateAlert={onCreateAlert}
                />
              ))
            )}
          </section>
        ))}
      </div>

      <footer className="match-listings__limitations">
        <h2>{t('match.common.limitations')}</h2>
        <ul>
          {result.provider.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </footer>
    </section>
  );
}
