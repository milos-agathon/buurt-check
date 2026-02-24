export type SourceFetchStatus = 'idle' | 'loading' | 'success' | 'error';
export type SourceDatePrecision = 'year' | 'month' | 'day';

export interface ParsedSourceDate {
  precision: SourceDatePrecision;
  year: number;
  month?: number;
  day?: number;
  recencyDate: Date;
}

export function resolveSourceFetchStatus(
  enabled: boolean,
  hasData: boolean,
  loading: boolean,
  error: boolean,
): SourceFetchStatus {
  if (!enabled) return 'idle';
  if (hasData) return 'success';
  if (loading) return 'loading';
  if (error) return 'error';
  return 'loading';
}

export function toUtcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function isValidMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildParsedSourceDate(
  year: number,
  month?: number,
  day?: number,
): ParsedSourceDate | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;

  if (month == null) {
    return {
      precision: 'year',
      year,
      recencyDate: toUtcDate(year, 12, 31),
    };
  }

  if (!isValidMonth(month)) return null;

  if (day == null) {
    return {
      precision: 'month',
      year,
      month,
      recencyDate: toUtcDate(year, month, daysInMonth(year, month)),
    };
  }

  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return null;

  return {
    precision: 'day',
    year,
    month,
    day,
    recencyDate: toUtcDate(year, month, day),
  };
}

export function parseSourceDateValue(raw: string | number | null | undefined): ParsedSourceDate | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;

  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (match) {
    return buildParsedSourceDate(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10),
      Number.parseInt(match[3], 10),
    );
  }

  match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return buildParsedSourceDate(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10),
      Number.parseInt(match[3], 10),
    );
  }

  match = value.match(/^(\d{4})MM(\d{2})$/i);
  if (match) {
    return buildParsedSourceDate(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10),
    );
  }

  match = value.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    return buildParsedSourceDate(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10),
    );
  }

  match = value.match(/^(\d{4})(\d{2})$/);
  if (match) {
    return buildParsedSourceDate(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10),
    );
  }

  match = value.match(/^(\d{4})JJ00$/i);
  if (match) {
    return buildParsedSourceDate(Number.parseInt(match[1], 10));
  }

  match = value.match(/^(\d{4})$/);
  if (match) {
    return buildParsedSourceDate(Number.parseInt(match[1], 10));
  }

  return null;
}

export function formatCoverageDate(parsed: ParsedSourceDate, language: string): string {
  if (parsed.precision === 'year') return String(parsed.year);
  const locale = language === 'nl' ? 'nl-NL' : 'en-US';
  const month = parsed.month ?? 1;
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(toUtcDate(parsed.year, month, 1));
}

export function staleThresholdDate(now = new Date()): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear() - 1,
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
}
