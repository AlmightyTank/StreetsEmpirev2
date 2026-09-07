/**
 * Money is integer cents everywhere. These helpers are the only place that
 * turns cents into something a player reads.
 */

export const CENTS_PER_DOLLAR = 100;

export function centsToDollars(cents: number): number {
  return cents / CENTS_PER_DOLLAR;
}

/** $42,104 - whole dollars, the default for game numbers. */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const dollars = Math.floor(Math.abs(cents) / CENTS_PER_DOLLAR);
  return `${negative ? '-' : ''}$${dollars.toLocaleString('en-US')}`;
}

/** $42,104.50 - used where the fraction actually matters, like condom pricing. */
export function formatCentsExact(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / CENTS_PER_DOLLAR);
  const rest = String(abs % CENTS_PER_DOLLAR).padStart(2, '0');
  return `${negative ? '-' : ''}$${dollars.toLocaleString('en-US')}.${rest}`;
}

/** $42K - the mobile status bar. */
export function formatCentsCompact(cents: number): string {
  const dollars = Math.floor(Math.abs(cents) / CENTS_PER_DOLLAR);
  const sign = cents < 0 ? '-' : '';

  if (dollars >= 1_000_000_000) return `${sign}$${(dollars / 1_000_000_000).toFixed(1)}B`;
  if (dollars >= 1_000_000) return `${sign}$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `${sign}$${Math.floor(dollars / 1_000)}K`;
  return `${sign}$${dollars}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}
