import type { FlashSale, FlashSaleItem, Offer, OfferTargetType } from './types.ts';

export function parseUtcTimestampMs(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
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

export interface ProductOfferTarget {
  id: string;
  sellerId: string;
  categoryId: string;
  department: string;
  compareAtUsdCents?: number | null;
}

export interface OfferAudienceContext {
  isLoggedIn?: boolean;
  isFirstOrder?: boolean;
}

export interface ResolvedOfferPrice {
  effectiveUsdCents: number;
  compareAtUsdCents: number | null;
  savingsUsdCents: number;
  appliedOffer: Offer | null;
  appliedFlashItem: FlashSaleItem | null;
}

export function offerMatchesTarget(
  targetType: OfferTargetType,
  targetId: string | null | undefined,
  product: ProductOfferTarget
): boolean {
  if (targetType === 'all') return true;
  if (targetType === 'department') return targetId === product.department;
  if (targetType === 'category') return targetId === product.categoryId;
  if (targetType === 'seller') return targetId === product.sellerId;
  if (targetType === 'product') return targetId === product.id;
  return false;
}

export function resolveUnitOfferPrice(
  baseUnitUsdCents: number,
  product: ProductOfferTarget,
  offers: Offer[],
  nowMs = Date.now(),
  flashSales: FlashSale[] = [],
  ctx: OfferAudienceContext = {}
): ResolvedOfferPrice {
  let bestUnitCents = baseUnitUsdCents;
  let bestOffer: Offer | null = null;
  let bestFlashItem: FlashSaleItem | null = null;

  // 1. Active flash sales with remaining stock cap
  for (const fs of flashSales) {
    if (fs.status === 'ended') continue;
    if (!isWithinSchedule(fs.startsAt, fs.endsAt, nowMs)) continue;
    for (const item of fs.items || []) {
      if (item.productId !== product.id) continue;
      if (item.stockCap > 0 && item.claimedCount >= item.stockCap) continue;
      const pctPrice = Math.max(
        1,
        Math.round(baseUnitUsdCents - (baseUnitUsdCents * Math.min(90, Math.max(1, item.discountPercent))) / 100)
      );
      const flashUnit = item.salePriceUsdCents > 0 ? Math.min(pctPrice, item.salePriceUsdCents) : pctPrice;
      if (flashUnit < bestUnitCents) {
        bestUnitCents = flashUnit;
        bestFlashItem = item;
        bestOffer = null;
      }
    }
  }

  // 2. Unit-level offers
  for (const offer of offers) {
    if (!offer.active || offer.approvalStatus !== 'approved') continue;
    if (!isWithinSchedule(offer.startsAt, offer.endsAt, nowMs)) continue;
    if (!offerMatchesTarget(offer.targetType, offer.targetId, product)) continue;

    if (offer.offerType === 'first_order' && ctx.isFirstOrder === false) continue;
    if (offer.offerType === 'vip_exclusive' && !ctx.isLoggedIn) continue;

    let discountedCents = baseUnitUsdCents;
    if (
      offer.offerType === 'percent' ||
      offer.offerType === 'flash_percent' ||
      offer.offerType === 'first_order' ||
      offer.offerType === 'vip_exclusive'
    ) {
      const pct = Math.min(90, Math.max(1, Math.round(offer.discountValue)));
      const discount = Math.round((baseUnitUsdCents * pct) / 100);
      discountedCents = Math.max(1, baseUnitUsdCents - discount);
    } else if (offer.offerType === 'fixed_usd_cents') {
      const offCents = Math.max(0, Math.round(offer.discountValue));
      discountedCents = Math.max(1, baseUnitUsdCents - Math.min(baseUnitUsdCents - 1, offCents));
    } else {
      // Multi-unit / cart-level types (bogo, buy_x_get_y, tiered_qty, cart_threshold, bundle_deal, free_shipping)
      continue;
    }

    if (discountedCents < bestUnitCents) {
      bestUnitCents = discountedCents;
      bestOffer = offer;
      bestFlashItem = null;
    }
  }

  const savingsUsdCents = Math.max(0, baseUnitUsdCents - bestUnitCents);
  const compareAtUsdCents =
    bestOffer || bestFlashItem
      ? Math.max(baseUnitUsdCents, product.compareAtUsdCents || 0)
      : product.compareAtUsdCents ?? null;

  return {
    effectiveUsdCents: bestUnitCents,
    compareAtUsdCents,
    savingsUsdCents,
    appliedOffer: bestOffer,
    appliedFlashItem: bestFlashItem,
  };
}

export interface CartPromoInputLine {
  product: ProductOfferTarget;
  baseUnitUsdCents: number;
  quantity: number;
}

export interface EvaluatedLinePromotion {
  productId: string;
  sellerId: string;
  quantity: number;
  baseUnitUsdCents: number;
  effectiveUnitUsdCents: number;
  lineSubtotalUsdCents: number;
  extraLineDiscountUsdCents: number;
  appliedOfferId: string | null;
  appliedFlashItemId: string | null;
  fundingSource: 'platform' | 'seller' | 'shared';
  fundingPlatformBps: number;
}

export interface EvaluatedCartPromotions {
  lines: EvaluatedLinePromotion[];
  subtotalAfterUnitOffersUsdCents: number;
  extraOfferDiscountUsdCents: number;
  freeShippingApplied: boolean;
  appliedPromoTitles: string[];
  appliedOfferIds: string[];
}

export function evaluateCartPromotions(
  inputLines: CartPromoInputLine[],
  offers: Offer[],
  flashSales: FlashSale[] = [],
  ctx: OfferAudienceContext = {},
  nowMs = Date.now()
): EvaluatedCartPromotions {
  const approvedActive = offers
    .filter((o) => o.active && o.approvalStatus === 'approved' && isWithinSchedule(o.startsAt, o.endsAt, nowMs))
    .filter((o) => {
      if (o.offerType === 'first_order') return ctx.isFirstOrder !== false;
      if (o.offerType === 'vip_exclusive') return Boolean(ctx.isLoggedIn);
      return true;
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const unitResolved = inputLines.map((line) => {
    const resolved = resolveUnitOfferPrice(
      line.baseUnitUsdCents,
      line.product,
      approvedActive,
      nowMs,
      flashSales,
      ctx
    );
    const lineSubtotal = resolved.effectiveUsdCents * line.quantity;
    return {
      input: line,
      resolved,
      lineSubtotal,
      extraLineDiscountUsdCents: 0,
      appliedOfferId: resolved.appliedOffer?.id ?? null,
      appliedFlashItemId: resolved.appliedFlashItem?.id ?? null,
      fundingSource: resolved.appliedOffer?.fundingSource ?? ('platform' as const),
      fundingPlatformBps: resolved.appliedOffer?.fundingPlatformBps ?? 10000,
    };
  });

  const promoTitles = new Set<string>();
  const appliedOfferIds = new Set<string>();
  for (const item of unitResolved) {
    if (item.resolved.appliedOffer) {
      promoTitles.add(item.resolved.appliedOffer.title.en);
      appliedOfferIds.add(item.resolved.appliedOffer.id);
    }
  }

  // Evaluate quantity-based (bogo, buy_x_get_y, tiered_qty) per line
  for (const item of unitResolved) {
    const qty = item.input.quantity;
    if (qty <= 0) continue;
    // Skip additional multi-unit discounts if an exclusive unit offer is already active
    if (item.resolved.appliedOffer?.stackingRule === 'exclusive') continue;

    let bestExtra = 0;
    let bestMultiOffer: Offer | null = null;

    for (const offer of approvedActive) {
      if (!offerMatchesTarget(offer.targetType, offer.targetId, item.input.product)) continue;
      if (item.resolved.appliedOffer && offer.stackingRule === 'best_only' && item.resolved.appliedOffer.stackingRule === 'best_only') {
        // Respect best_only unless multi-unit yields a better total discount
      }

      const unitPrice = item.resolved.effectiveUsdCents;
      let candidateDiscount = 0;

      if (offer.offerType === 'bogo') {
        const freeUnits = Math.floor(qty / 2);
        const pct = Math.min(100, Math.max(1, offer.rules?.getDiscountPct ?? 100));
        candidateDiscount = Math.round((freeUnits * unitPrice * pct) / 100);
      } else if (offer.offerType === 'buy_x_get_y') {
        const buyX = Math.max(1, offer.rules?.buyQty ?? 2);
        const getY = Math.max(1, offer.rules?.getQty ?? 1);
        const cycle = buyX + getY;
        const discountedUnits = Math.floor(qty / cycle) * getY;
        const pct = Math.min(100, Math.max(1, offer.rules?.getDiscountPct ?? (offer.discountValue || 50)));
        candidateDiscount = Math.round((discountedUnits * unitPrice * pct) / 100);
      } else if (offer.offerType === 'tiered_qty') {
        const tiers = [...(offer.rules?.tiers || [])].sort((a, b) => b.minQty - a.minQty);
        const matchedTier = tiers.find((t) => qty >= t.minQty);
        if (matchedTier) {
          const pct = Math.min(90, Math.max(1, matchedTier.discountPercent));
          candidateDiscount = Math.round((item.lineSubtotal * pct) / 100);
        }
      }

      if (offer.rules?.maxDiscountUsdCents && candidateDiscount > offer.rules.maxDiscountUsdCents) {
        candidateDiscount = offer.rules.maxDiscountUsdCents;
      }

      if (candidateDiscount > bestExtra && candidateDiscount < item.lineSubtotal) {
        bestExtra = candidateDiscount;
        bestMultiOffer = offer;
      }
    }

    if (bestMultiOffer && bestExtra > 0) {
      item.extraLineDiscountUsdCents = bestExtra;
      item.appliedOfferId = bestMultiOffer.id;
      item.fundingSource = bestMultiOffer.fundingSource;
      item.fundingPlatformBps = bestMultiOffer.fundingPlatformBps;
      promoTitles.add(bestMultiOffer.title.en);
      appliedOfferIds.add(bestMultiOffer.id);
    }
  }

  // Cart-wide rules: bundle_deal, cart_threshold, free_shipping
  const currentTotal = unitResolved.reduce((sum, l) => sum + (l.lineSubtotal - l.extraLineDiscountUsdCents), 0);
  const productIdsInCart = new Set(inputLines.map((l) => l.product.id));

  let bestCartOffer: Offer | null = null;
  let bestCartExtra = 0;
  let freeShippingApplied = false;

  for (const offer of approvedActive) {
    if (offer.offerType === 'bundle_deal') {
      const reqIds = offer.rules?.bundleProductIds || [];
      if (reqIds.length >= 2 && reqIds.every((id) => productIdsInCart.has(id))) {
        const matchingSubtotal = unitResolved
          .filter((l) => reqIds.includes(l.input.product.id))
          .reduce((s, l) => s + (l.lineSubtotal - l.extraLineDiscountUsdCents), 0);
        const pct = Math.min(90, Math.max(1, offer.rules?.bundleDiscountPct ?? offer.discountValue));
        let disc = Math.round((matchingSubtotal * pct) / 100);
        if (offer.rules?.maxDiscountUsdCents) disc = Math.min(disc, offer.rules.maxDiscountUsdCents);
        if (disc > bestCartExtra) {
          bestCartExtra = disc;
          bestCartOffer = offer;
        }
      }
    } else if (offer.offerType === 'cart_threshold') {
      const minCart = Math.max(0, offer.rules?.minCartUsdCents ?? 0);
      if (currentTotal >= minCart && currentTotal > 0) {
        let disc =
          offer.discountValue <= 90 && !offer.rules?.minCartUsdCents
            ? Math.round((currentTotal * offer.discountValue) / 100)
            : offer.discountValue > 90
              ? offer.discountValue
              : Math.round((currentTotal * offer.discountValue) / 100);
        if (offer.rules?.maxDiscountUsdCents) disc = Math.min(disc, offer.rules.maxDiscountUsdCents);
        disc = Math.min(currentTotal - 1, Math.max(0, disc));
        if (disc > bestCartExtra) {
          bestCartExtra = disc;
          bestCartOffer = offer;
        }
      }
    } else if (offer.offerType === 'free_shipping') {
      const minCart = Math.max(0, offer.rules?.minCartUsdCents ?? 0);
      const hasMatchingTarget = unitResolved.some((l) =>
        offerMatchesTarget(offer.targetType, offer.targetId, l.input.product)
      );
      if (hasMatchingTarget && currentTotal >= minCart) {
        freeShippingApplied = true;
        promoTitles.add(offer.title.en);
        appliedOfferIds.add(offer.id);
      }
    }
  }

  // Distribute cart-level extra discount proportionally across matching lines (integer cents safe)
  if (bestCartOffer && bestCartExtra > 0 && currentTotal > 0) {
    promoTitles.add(bestCartOffer.title.en);
    appliedOfferIds.add(bestCartOffer.id);
    let distributed = 0;
    const eligible =
      bestCartOffer.offerType === 'bundle_deal'
        ? unitResolved.filter((l) => (bestCartOffer!.rules?.bundleProductIds || []).includes(l.input.product.id))
        : unitResolved;
    const eligibleSum = eligible.reduce((s, l) => s + (l.lineSubtotal - l.extraLineDiscountUsdCents), 0);
    if (eligibleSum > 0) {
      eligible.forEach((l, idx) => {
        const net = l.lineSubtotal - l.extraLineDiscountUsdCents;
        const share =
          idx === eligible.length - 1
            ? Math.max(0, bestCartExtra - distributed)
            : Math.round((bestCartExtra * net) / eligibleSum);
        const bounded = Math.min(net - 1, Math.max(0, share));
        l.extraLineDiscountUsdCents += bounded;
        distributed += bounded;
      });
    }
  }

  const lines: EvaluatedLinePromotion[] = unitResolved.map((item) => ({
    productId: item.input.product.id,
    sellerId: item.input.product.sellerId,
    quantity: item.input.quantity,
    baseUnitUsdCents: item.input.baseUnitUsdCents,
    effectiveUnitUsdCents: item.resolved.effectiveUsdCents,
    lineSubtotalUsdCents: item.lineSubtotal,
    extraLineDiscountUsdCents: item.extraLineDiscountUsdCents,
    appliedOfferId: item.appliedOfferId,
    appliedFlashItemId: item.appliedFlashItemId,
    fundingSource: item.fundingSource,
    fundingPlatformBps: item.fundingPlatformBps,
  }));

  const subtotalAfterUnitOffersUsdCents = lines.reduce((s, l) => s + l.lineSubtotalUsdCents, 0);
  const extraOfferDiscountUsdCents = lines.reduce((s, l) => s + l.extraLineDiscountUsdCents, 0);

  return {
    lines,
    subtotalAfterUnitOffersUsdCents,
    extraOfferDiscountUsdCents,
    freeShippingApplied,
    appliedPromoTitles: Array.from(promoTitles),
    appliedOfferIds: Array.from(appliedOfferIds),
  };
}
