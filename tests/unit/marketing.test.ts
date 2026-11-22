import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCommissionUsdCents, formatBpsAsPercent, getContrastRatio, usdCentsToLbp } from '../../src/shared/money.ts';
import { evaluateCartPromotions, resolveUnitOfferPrice } from '../../src/shared/offers.ts';
import { renderEmailBlocks } from '../../server/services/email.ts';
import type { FlashSale, Offer } from '../../src/shared/types.ts';

const baseProduct = {
  id: 'prod-1',
  sellerId: 'sel-1',
  categoryId: 'cat-home',
  department: 'home-gadgets',
  compareAtUsdCents: null,
};

function makeOffer(overrides: Partial<Offer>): Offer {
  return {
    id: 'off-1',
    title: { en: 'Test Offer', ar: 'عرض' },
    offerType: 'percent',
    discountValue: 20,
    targetType: 'all',
    targetId: null,
    sellerId: null,
    approvalStatus: 'approved',
    fundingSource: 'platform',
    fundingPlatformBps: 10000,
    stackingRule: 'exclusive',
    priority: 10,
    rules: {},
    startsAt: null,
    endsAt: null,
    active: true,
    ...overrides,
  };
}

test('money helpers maintain integer minor units and WCAG contrast ratios', () => {
  assert.equal(usdCentsToLbp(1000, 89500), 895000);
  assert.equal(calculateCommissionUsdCents(5000, 1250), 625);
  assert.equal(formatBpsAsPercent(1250), '12.5%');
  assert.ok(getContrastRatio('#F3EFE8', '#17181B') >= 12);
  assert.ok(getContrastRatio('#17181B', '#FF5A44') >= 4.5);
});

test('offers engine handles unit discounts, BOGO, tiered qty, cart threshold, and audience gating', () => {
  const now = Date.now();
  const unitRes = resolveUnitOfferPrice(10000, baseProduct, [makeOffer({ offerType: 'percent', discountValue: 25 })], now);
  assert.equal(unitRes.effectiveUsdCents, 7500);
  assert.equal(unitRes.savingsUsdCents, 2500);

  // Unapproved offer must never apply
  const unapproved = resolveUnitOfferPrice(
    10000,
    baseProduct,
    [makeOffer({ approvalStatus: 'pending', discountValue: 50 })],
    now
  );
  assert.equal(unapproved.effectiveUsdCents, 10000);

  // First-order offer skips repeat buyers
  const firstOrderOffer = makeOffer({ offerType: 'first_order', discountValue: 15 });
  assert.equal(resolveUnitOfferPrice(10000, baseProduct, [firstOrderOffer], now, [], { isFirstOrder: false }).effectiveUsdCents, 10000);
  assert.equal(resolveUnitOfferPrice(10000, baseProduct, [firstOrderOffer], now, [], { isFirstOrder: true }).effectiveUsdCents, 8500);

  // BOGO with qty=2 grants 1 free unit
  const bogoEval = evaluateCartPromotions(
    [{ product: baseProduct, baseUnitUsdCents: 4000, quantity: 2 }],
    [makeOffer({ id: 'off-bogo', offerType: 'bogo' })],
    [],
    {},
    now
  );
  assert.equal(bogoEval.extraOfferDiscountUsdCents, 4000);

  // Cart threshold + free shipping
  const thresholdEval = evaluateCartPromotions(
    [{ product: baseProduct, baseUnitUsdCents: 6000, quantity: 2 }],
    [
      makeOffer({
        id: 'off-thresh',
        offerType: 'cart_threshold',
        discountValue: 1500,
        rules: { minCartUsdCents: 10000 },
        stackingRule: 'stackable',
      }),
      makeOffer({
        id: 'off-ship',
        offerType: 'free_shipping',
        discountValue: 0,
        rules: { minCartUsdCents: 10000 },
      }),
    ],
    [],
    {},
    now
  );
  assert.equal(thresholdEval.extraOfferDiscountUsdCents, 1500);
  assert.equal(thresholdEval.freeShippingApplied, true);
});

test('flash sale stock cap exhausts cleanly when claimedCount >= stockCap', () => {
  const now = Date.now();
  const flash: FlashSale = {
    id: 'fs-1',
    slug: 'flash-test',
    title: { en: 'Flash', ar: 'فلاش' },
    bgToken: 'ember',
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 600_000).toISOString(),
    status: 'active',
    autoRevert: true,
    createdAt: new Date(now).toISOString(),
    items: [
      {
        id: 'fsi-1',
        flashSaleId: 'fs-1',
        productId: 'prod-1',
        discountPercent: 40,
        salePriceUsdCents: 6000,
        stockCap: 2,
        claimedCount: 1,
      },
    ],
  };

  const activePrice = resolveUnitOfferPrice(10000, baseProduct, [], now, [flash]);
  assert.equal(activePrice.effectiveUsdCents, 6000);

  flash.items[0].claimedCount = 2;
  const exhaustedPrice = resolveUnitOfferPrice(10000, baseProduct, [], now, [flash]);
  assert.equal(exhaustedPrice.effectiveUsdCents, 10000);
});

test('renderEmailBlocks escapes HTML injection and strips unsafe URL schemes', () => {
  const rendered = renderEmailBlocks(
    [
      { id: 'b1', type: 'header', titleEn: '<script>alert("xss")</script>', titleAr: 'رأس' },
      { id: 'b2', type: 'hero_text', titleEn: 'Hello', bodyEn: '<img src=x onerror=alert(1)>', imageUrl: 'data:text/html,xss' },
      { id: 'b3', type: 'cta_button', buttonLabelEn: 'Go', buttonUrl: 'javascript:alert(1)' },
    ],
    {
      locale: 'en',
      subject: '<b>Test</b>',
      unsubscribeUrl: 'https://nilelink.lb/api/newsletter/unsubscribe?token=abc',
      appUrl: 'https://nilelink.lb',
    }
  );
  assert.ok(!rendered.html.includes('<script>'));
  assert.ok(!rendered.html.includes('javascript:alert'));
  assert.ok(!rendered.html.includes('data:text/html'));
  assert.ok(rendered.html.includes('&lt;script&gt;'));
  assert.ok(rendered.html.includes('https://nilelink.lb/api/newsletter/unsubscribe?token=abc'));
});
