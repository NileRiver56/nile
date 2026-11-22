import type { Offer } from './types.ts';

export function parseUtcTimestampMs(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Normalize SQL 'YYYY-MM-DD HH:MM:SS' to ISO UTC
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? trimmed.replace(' ', 'T') + 'Z'
    : trimmed;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

export function isWithinSchedule(startsAt?: string | null, endsAt?: string | null, nowMs = Date.now()): boolean {
  const startMs = parseUtcTimestampMs(startsAt);
  if (startMs !== null && nowMs < startMs) return false;
  const endMs = parseUtcTimestampMs(endsAt);
  if (endMs !== null && nowMs > endMs) return false;
  return true;
}

export interface ResolvedOfferPrice {
  effectiveUsdCents: number;
  compareAtUsdCents: number | null;
  savingsUsdCents: number;
  appliedOffer: Offer | null;
}

export function resolveUnitOfferPrice(
  baseUnitUsdCents: number,
  product: {
    id: string;
    sellerId: string;
    categoryId: string;
    department: string;
    compareAtUsdCents?: number | null;
  },
  offers: Offer[],
  nowMs = Date.now()
): ResolvedOfferPrice {
  let bestUnitCents = baseUnitUsdCents;
  let bestOffer: Offer | null = null;

  for (const offer of offers) {
    if (!offer.active || offer.approvalStatus !== 'approved') continue;
    if (!isWithinSchedule(offer.startsAt, offer.endsAt, nowMs)) continue;

    let matches = false;
    if (offer.targetType === 'all') matches = true;
    else if (offer.targetType === 'department') matches = offer.targetId === product.department;
    else if (offer.targetType === 'category') matches = offer.targetId === product.categoryId;
    else if (offer.targetType === 'seller') matches = offer.targetId === product.sellerId;
    else if (offer.targetType === 'product') matches = offer.targetId === product.id;

    if (!matches) continue;

    let discountedCents = baseUnitUsdCents;
    if (offer.offerType === 'percent' || offer.offerType === 'flash_percent') {
      const pct = Math.min(90, Math.max(1, Math.round(offer.discountValue)));
      const discount = Math.round((baseUnitUsdCents * pct) / 100);
      discountedCents = Math.max(1, baseUnitUsdCents - discount);
    } else if (offer.offerType === 'fixed_usd_cents') {
      const offCents = Math.max(0, Math.round(offer.discountValue));
      discountedCents = Math.max(1, baseUnitUsdCents - Math.min(baseUnitUsdCents - 1, offCents));
    }

    if (discountedCents < bestUnitCents) {
      bestUnitCents = discountedCents;
      bestOffer = offer;
    }
  }

  const savingsUsdCents = Math.max(0, baseUnitUsdCents - bestUnitCents);
  const compareAtUsdCents = bestOffer
    ? Math.max(baseUnitUsdCents, product.compareAtUsdCents || 0)
    : product.compareAtUsdCents ?? null;

  return {
    effectiveUsdCents: bestUnitCents,
    compareAtUsdCents,
    savingsUsdCents,
    appliedOffer: bestOffer,
  };
}
