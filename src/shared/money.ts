import type { Currency, Locale } from './types.ts';

/**
 * Integer-only minor unit currency helpers.
 * Never performs floating-point money accumulation.
 */
export function usdCentsToLbp(usdCents: number, exchangeRateLbpPerUsd: number): number {
  const safeCents = Math.round(usdCents);
  const safeRate = Math.round(exchangeRateLbpPerUsd);
  // (cents * rate) / 100 rounded to nearest 1,000 LBP for crisp Lebanese cash denominations
  const rawLbp = Math.round((safeCents * safeRate) / 100);
  return Math.round(rawLbp / 1000) * 1000;
}

export function formatMoney(
  usdCents: number,
  currency: Currency,
  exchangeRateLbpPerUsd: number,
  locale: Locale = 'en'
): string {
  if (currency === 'USD') {
    const dollars = Math.floor(Math.abs(usdCents) / 100);
    const cents = Math.abs(usdCents) % 100;
    const sign = usdCents < 0 ? '-' : '';
    const formattedDollars = new Intl.NumberFormat(locale === 'ar' ? 'en-US' : 'en-US').format(dollars);
    const formattedCents = cents === 0 ? '' : `.${String(cents).padStart(2, '0')}`;
    return `${sign}$${formattedDollars}${formattedCents}`;
  }

  const lbp = usdCentsToLbp(usdCents, exchangeRateLbpPerUsd);
  const formatted = new Intl.NumberFormat('en-US').format(lbp);
  return locale === 'ar' ? `${formatted} ل.ل.` : `${formatted} LBP`;
}

export function formatBpsAsPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const remainder = bps % 100;
  if (remainder === 0) return `${whole}%`;
  return `${whole}.${String(remainder).replace(/0+$/, '')}%`;
}

export function calculateCommissionUsdCents(lineTotalUsdCents: number, commissionBps: number): number {
  // Integer half-up rounding in minor units
  return Math.round((lineTotalUsdCents * commissionBps) / 10000);
}

/**
 * Automated WCAG 2.2 AA Contrast Checker for design token validation.
 */
function hexToRelativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = hexToRelativeLuminance(hexA);
  const l2 = hexToRelativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}
