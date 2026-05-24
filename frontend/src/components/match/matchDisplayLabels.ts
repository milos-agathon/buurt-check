import type { TFunction } from 'i18next';

export const MATCH_PROPERTY_TYPE_OPTIONS = [
  { value: 'apartment', labelKey: 'match.propertyTypes.apartment' },
  { value: 'row_house', labelKey: 'match.propertyTypes.rowHouse' },
  { value: 'family_house', labelKey: 'match.propertyTypes.familyHouse' },
  { value: 'house', labelKey: 'match.propertyTypes.house' },
  { value: 'studio', labelKey: 'match.propertyTypes.studio' },
  { value: 'unknown', labelKey: 'match.propertyTypes.unknown' },
] as const;

const PROPERTY_TYPE_LABEL_KEYS = Object.fromEntries(
  MATCH_PROPERTY_TYPE_OPTIONS.map((option) => [option.value, option.labelKey]),
) as Record<string, string>;

const AVAILABILITY_STATUS_LABEL_KEYS: Record<string, string> = {
  available: 'match.availabilityStatus.available',
  reserved: 'match.availabilityStatus.reserved',
  sold_rented: 'match.availabilityStatus.soldRented',
  expired: 'match.availabilityStatus.expired',
  unknown: 'match.availabilityStatus.unknown',
};

const FRESHNESS_STATUS_LABEL_KEYS: Record<string, string> = {
  current: 'match.freshnessStatus.current',
  aging: 'match.freshnessStatus.aging',
  stale: 'match.freshnessStatus.stale',
  unavailable: 'match.freshnessStatus.unavailable',
  mock: 'match.freshnessStatus.mock',
  conflict: 'match.freshnessStatus.conflict',
};

const FRESHNESS_INDICATOR_LABEL_KEYS: Record<string, string> = {
  missing_data: 'match.freshnessIndicator.missingData',
  stale_data: 'match.freshnessIndicator.staleData',
  mock_data: 'match.freshnessIndicator.mockData',
};

const PROVIDER_HEALTH_LABEL_KEYS: Record<string, string> = {
  healthy: 'match.providerHealth.healthy',
  degraded: 'match.providerHealth.degraded',
  failed: 'match.providerHealth.failed',
  unconfigured: 'match.providerHealth.unconfigured',
  mock_only: 'match.providerHealth.mockOnly',
};

const PROVIDER_MODE_LABEL_KEYS: Record<string, string> = {
  licensed: 'match.listings.providerMode.licensed',
  mock: 'match.listings.providerMode.mock',
  user_provided: 'match.listings.providerMode.user_provided',
  outbound_placeholder: 'match.listings.providerMode.outbound_placeholder',
  unavailable: 'match.listings.providerMode.unavailable',
};

const DIMENSION_LABEL_KEYS: Record<string, string> = {
  green_access: 'match.comparison.indicator.green_access',
  calmness: 'match.comparison.indicator.calmness',
  mobility: 'match.comparison.indicator.mobility',
  amenities: 'match.comparison.indicator.amenities',
  family_fit: 'match.comparison.indicator.family_fit',
  affordability_buy: 'match.comparison.indicator.affordability_buy',
  affordability_rent: 'match.comparison.indicator.affordability_rent',
  housing_stock: 'match.comparison.indicator.housing_stock',
  environmental_quality: 'match.comparison.indicator.environmental_quality',
  social_lifestyle_fit: 'match.comparison.indicator.social_lifestyle_fit',
  safety_context: 'match.comparison.indicator.safety_context',
  listing_availability_buy: 'match.comparison.indicator.listing_availability_buy',
  listing_availability_rent: 'match.comparison.indicator.listing_availability_rent',
};

const GENERATION_MODE_LABEL_KEYS: Record<string, string> = {
  ai: 'match.report.generationMode.ai',
  ai_with_fallback: 'match.report.generationMode.aiWithFallback',
  deterministic_fallback: 'match.report.generationMode.deterministicFallback',
};

const LOCALE_LABEL_KEYS: Record<string, string> = {
  en: 'match.locale.en',
  nl: 'match.locale.nl',
};

const ADMIN_STATUS_LABEL_KEYS: Record<string, string> = {
  healthy: 'match.admin.status.healthy',
  degraded: 'match.admin.status.degraded',
  failed: 'match.admin.status.failed',
  mock_only: 'match.admin.status.mockOnly',
  unconfigured: 'match.admin.status.unconfigured',
};

const ADMIN_SEVERITY_LABEL_KEYS: Record<string, string> = {
  info: 'match.admin.severity.info',
  warning: 'match.admin.severity.warning',
  error: 'match.admin.severity.error',
  critical: 'match.admin.severity.critical',
};

const ADMIN_ERROR_LABEL_KEYS: Record<string, string> = {
  source_timeout: 'match.admin.error.sourceTimeout',
  pdf_failed: 'match.admin.error.pdfFailed',
  mock_dispatch_failed: 'match.admin.error.mockDispatchFailed',
};

const ADMIN_ANOMALY_LABEL_KEYS: Record<string, string> = {
  score_outlier: 'match.admin.anomaly.scoreOutlier',
};

const ADMIN_EVENT_LABEL_KEYS: Record<string, string> = {
  match_quiz_started: 'match.admin.event.matchQuizStarted',
  match_feedback_submitted: 'match.admin.event.matchFeedbackSubmitted',
  match_neighborhood_saved: 'match.admin.event.matchNeighborhoodSaved',
  match_report_viewed: 'match.admin.event.matchReportViewed',
};

const ADMIN_TRACE_STATUS_LABEL_KEYS: Record<string, string> = {
  implemented: 'match.admin.traceStatus.implemented',
  partial: 'match.admin.traceStatus.partial',
  deferred: 'match.admin.traceStatus.deferred',
};

export function getMatchPropertyTypeLabel(
  propertyType: string | null | undefined,
  t: TFunction,
): string {
  if (!propertyType) {
    return t('match.common.unavailable');
  }
  return t(PROPERTY_TYPE_LABEL_KEYS[propertyType] ?? 'match.propertyTypes.other');
}

export function getMatchAvailabilityStatusLabel(
  availabilityStatus: string | null | undefined,
  t: TFunction,
): string {
  if (!availabilityStatus) {
    return t('match.availabilityStatus.unknown');
  }
  return t(AVAILABILITY_STATUS_LABEL_KEYS[availabilityStatus] ?? 'match.availabilityStatus.unknown');
}

export function getMatchFreshnessStatusLabel(
  freshnessStatus: string | null | undefined,
  t: TFunction,
): string {
  if (!freshnessStatus) {
    return t('match.freshnessStatus.unavailable');
  }
  return t(FRESHNESS_STATUS_LABEL_KEYS[freshnessStatus] ?? 'match.freshnessStatus.unavailable');
}

export function getMatchFreshnessIndicatorLabel(
  freshnessIndicator: string | null | undefined,
  t: TFunction,
): string {
  if (!freshnessIndicator) {
    return t('match.freshnessIndicator.unavailable');
  }
  return t(FRESHNESS_INDICATOR_LABEL_KEYS[freshnessIndicator] ?? 'match.freshnessIndicator.unavailable');
}

export function getMatchProviderHealthLabel(
  providerHealth: string | null | undefined,
  t: TFunction,
): string {
  if (!providerHealth) {
    return t('match.providerHealth.unavailable');
  }
  return t(PROVIDER_HEALTH_LABEL_KEYS[providerHealth] ?? 'match.providerHealth.unavailable');
}

export function getMatchProviderModeLabel(
  providerMode: string | null | undefined,
  t: TFunction,
): string {
  if (!providerMode) {
    return t('match.listings.providerMode.unavailable');
  }
  return t(PROVIDER_MODE_LABEL_KEYS[providerMode] ?? 'match.listings.providerMode.unavailable');
}

export function getMatchDimensionLabel(
  dimensionKey: string | null | undefined,
  t: TFunction,
): string {
  if (!dimensionKey) {
    return t('match.comparison.indicator.unknown');
  }
  return t(DIMENSION_LABEL_KEYS[dimensionKey] ?? 'match.comparison.indicator.unknown');
}

export function getMatchComparisonValueLabel(displayValue: string, t: TFunction): string {
  if (displayValue === 'unavailable') {
    return t('match.common.unavailable');
  }
  return displayValue;
}

export function getMatchGenerationModeLabel(
  generationMode: string | null | undefined,
  t: TFunction,
): string {
  if (!generationMode) {
    return t('match.report.generationMode.unavailable');
  }
  return t(GENERATION_MODE_LABEL_KEYS[generationMode] ?? 'match.report.generationMode.unavailable');
}

export function getMatchLocaleLabel(locale: string | null | undefined, t: TFunction): string {
  if (!locale) {
    return t('match.locale.unknown');
  }
  return t(LOCALE_LABEL_KEYS[locale] ?? 'match.locale.unknown');
}

export function getSavedNeighborhoodDisplayName(
  neighborhoodId: string,
  note: Record<string, unknown> | null | undefined,
  t: TFunction,
): string {
  const noteName = note?.neighborhood_name ?? note?.name;
  if (typeof noteName === 'string' && noteName.trim()) {
    return noteName.trim();
  }
  return t('match.saved.neighborhoodFallback', { id: neighborhoodId });
}

export function getMatchRecommendationReasonLabel(
  reasonCode: string,
  t: TFunction,
  exists: (key: string) => boolean,
): string {
  const key = `match.results.reasons.${reasonCode}`;
  return exists(key) ? t(key) : t('match.results.reasonUnavailable');
}

export function getMatchAdminStatusLabel(status: string | null | undefined, t: TFunction): string {
  if (!status) {
    return t('match.admin.status.unknown');
  }
  return t(ADMIN_STATUS_LABEL_KEYS[status] ?? 'match.admin.status.unknown');
}

export function getMatchAdminSeverityLabel(severity: string | null | undefined, t: TFunction): string {
  if (!severity) {
    return t('match.admin.severity.unknown');
  }
  return t(ADMIN_SEVERITY_LABEL_KEYS[severity] ?? 'match.admin.severity.unknown');
}

export function getMatchAdminErrorLabel(errorCode: string | null | undefined, t: TFunction): string {
  if (!errorCode) {
    return t('match.admin.error.none');
  }
  return t(ADMIN_ERROR_LABEL_KEYS[errorCode] ?? 'match.admin.error.unknown');
}

export function getMatchAdminAnomalyLabel(anomalyType: string | null | undefined, t: TFunction): string {
  if (!anomalyType) {
    return t('match.admin.anomaly.unknown');
  }
  return t(ADMIN_ANOMALY_LABEL_KEYS[anomalyType] ?? 'match.admin.anomaly.unknown');
}

export function getMatchAdminEventLabel(eventName: string | null | undefined, t: TFunction): string {
  if (!eventName) {
    return t('match.admin.event.unknown');
  }
  return t(ADMIN_EVENT_LABEL_KEYS[eventName] ?? 'match.admin.event.unknown');
}

export function getMatchAdminTraceStatusLabel(status: string | null | undefined, t: TFunction): string {
  if (!status) {
    return t('match.admin.traceStatus.unknown');
  }
  return t(ADMIN_TRACE_STATUS_LABEL_KEYS[status] ?? 'match.admin.traceStatus.unknown');
}
