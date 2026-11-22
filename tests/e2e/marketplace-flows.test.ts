import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb } from '../../server/db/client.ts';
import { ensureEssentialSeed } from '../../server/db/essentialSeed.ts';
import { MarketplaceRepo } from '../../server/db/marketplaceRepo.ts';
import { processPendingJobs } from '../../server/services/jobs.ts';
import { processMarketingEmailJob } from '../../server/services/email.ts';
import { toSqlTimestamp } from '../../server/services/security.ts';

test('end-to-end marketing, moderation, segments, email automation, and attribution flows', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nilelink-e2e-'));
  const prevStorage = process.env.STORAGE_DIR;
  process.env.STORAGE_DIR = tmpDir;

  const db = await getDb();
  try {
    await ensureEssentialSeed(db);
    const repo = new MarketplaceRepo(db);

    // 1. Home Builder: create draft section -> publish -> snapshot & restore
    const sec = await repo.adminCreateHomeSection('admin-1', {
      sectionType: 'hero',
      title: { en: 'Cedar Launch', ar: 'إطلاق الأرز' },
      content: { subtitleEn: 'Crafted in Lebanon', subtitleAr: 'صنع في لبنان', ctaUrl: '/catalog' },
      insertAtIndex: 0,
    });
    assert.equal(sec.status, 'draft');
    const pub = await repo.adminPublishHomePage('admin-1', { changeNote: 'Initial E2E launch' });
    assert.ok(pub.version >= 1);
    const publicHome = await repo.getBootstrapData({
      isLoggedIn: false,
      isNewVisitor: true,
      locale: 'en',
      includeDrafts: false,
    });
    assert.ok(publicHome.homeSections.some((s) => s.id === sec.id));

    // 2. Register seller & enforce SellerPromoRules guardrails + admin moderation
    const sellerReg = await repo.registerSeller({
      ownerName: 'Layla Artisan',
      email: 'layla.e2e@example.com',
      phone: '+96170888999',
      password: 'Password123!',
      storeNameEn: 'Layla Looms',
      storeNameAr: 'أنوال ليلى',
      department: 'fashion',
      governorate: 'beirut',
      district: 'achrafieh',
      commercialRegRef: 'CR-E2E-1',
      payoutMethod: 'whish',
      payoutAccount: '+96170888999',
    });
    await repo.adminUpdateSeller(sellerReg.seller.id, 'admin-1', { status: 'approved', verified: true });

    const prod = await repo.createSellerProduct(sellerReg.seller.id, sellerReg.user.id, {
      titleEn: 'Handwoven Silk Scarf',
      titleAr: 'وشاح حرير يدوي',
      descriptionEn: 'Authentic Beirut weave',
      descriptionAr: 'نسيج بيروتي أصيل',
      basePriceUsdCents: 8000,
      department: 'fashion',
      sku: 'SILK-E2E-1',
      stock: 15,
      published: true,
    });

    await repo.adminUpdateSellerPromoRules('admin-1', {
      sellerOffersEnabled: true,
      requireAdminApproval: true,
      maxDiscountPercent: 40,
      maxFixedDiscountUsdCents: 3000,
      maxActiveOffersPerSeller: 2,
      allowFlashOffersBySellers: false,
    });

    // Exceeding maxDiscountPercent rejects
    await assert.rejects(
      () =>
        repo.sellerProposeOffer(sellerReg.seller.id, sellerReg.user.id, {
          title: { en: 'Too Steep', ar: 'خصم كبير' },
          offerType: 'percent',
          discountValue: 55,
          targetType: 'product',
          targetId: prod.id,
        }),
      /40%/
    );

    // Valid offer enters pending queue then gets approved
    const sellerOffer = await repo.sellerProposeOffer(sellerReg.seller.id, sellerReg.user.id, {
      title: { en: 'Weekend Loom Deal', ar: 'عرض نهاية الأسبوع' },
      offerType: 'percent',
      discountValue: 20,
      targetType: 'product',
      targetId: prod.id,
    });
    assert.equal(sellerOffer.approvalStatus, 'pending');
    const moderated = await repo.adminUpdateOffer(sellerOffer.id, 'admin-1', { approvalStatus: 'approved', active: true });
    assert.equal(moderated.approvalStatus, 'approved');

    // 3. Coupons & Bulk CSV import + formula neutralization
    const coupon = await repo.createCoupon(null, 'admin-1', {
      code: 'E2ECEDAR10',
      discountType: 'percent',
      discountValue: 10,
      minOrderUsdCents: 2000,
      active: true,
    });
    assert.equal(coupon.code, 'E2ECEDAR10');

    // 4. Flash Sale atomic decrement + cron revert
    const nowMs = Date.now();
    const flash = await repo.adminCreateFlashSale('admin-1', {
      slug: 'e2e-flash',
      title: { en: 'Evening Flash', ar: 'عرض مسائي' },
      startsAt: new Date(nowMs - 60_000).toISOString(),
      endsAt: new Date(nowMs + 3_600_000).toISOString(),
      autoRevert: true,
      items: [
        {
          productId: prod.id,
          discountPercent: 25,
          stockCap: 5,
        },
      ],
    });

    // 5. Campaign creation + Customer Order attribution
    const cmp = await repo.adminCreateCampaign('admin-1', {
      slug: 'beirut-autumn',
      title: { en: 'Beirut Autumn', ar: 'خريف بيروت' },
      subtitle: { en: 'Curated local drop', ar: 'إصدار محلي' },
      description: { en: 'Limited marketplace showcase', ar: 'عرض محدود' },
      status: 'active',
      featuredOfferIds: [sellerOffer.id],
      featuredCouponCodes: ['E2ECEDAR10'],
      featuredFlashSaleId: flash.id,
    });
    assert.equal(cmp.slug, 'beirut-autumn');

    const buyer = await repo.registerCustomer({
      name: 'Rami Buyer',
      email: 'rami.e2e@example.com',
      phone: '+96170123456',
      password: 'Password123!',
      locale: 'en',
    });

    const order = await repo.createOrder({
      userId: buyer.id,
      customerName: 'Rami Buyer',
      customerPhone: '+96170123456',
      governorate: 'beirut',
      district: 'achrafieh',
      town: 'Gemmayze',
      addressNotes: 'Floor 3',
      paymentMethod: 'cod',
      couponCode: 'E2ECEDAR10',
      items: [{ productId: prod.id, variantId: prod.variants[0].id, quantity: 2 }],
    });
    assert.ok(order.grandTotalUsdCents > 0);
    assert.ok(order.discountTotalUsdCents > 0);

    // Verify Flash Sale claimedCount incremented by 2
    const flashAfterOrder = (await repo.adminListFlashSales()).find((f) => f.id === flash.id)!;
    assert.equal(flashAfterOrder.items[0].claimedCount, 2);

    // 6. Segment + Email Campaign + Welcome/Opt-out + Abandoned Cart
    const seg = await repo.adminCreateSegment('admin-1', {
      name: { en: 'Beirut Buyers', ar: 'مشتري بيروت' },
      description: 'Ordered in Beirut',
      rules: { audienceScope: 'registered_customers', governorate: 'beirut', minOrderCount: 1 },
    });
    assert.equal(seg.cachedMemberCount, 1);

    const emailCmp = await repo.adminCreateEmailCampaign('admin-1', {
      name: 'E2E VIP Broadcast',
      subject: { en: 'Autumn VIP', ar: 'عروض الخريف' },
      segmentId: seg.id,
      blocks: [
        { id: 'eb1', type: 'header', titleEn: 'Autumn Drop', titleAr: 'عروض الخريف' },
        { id: 'eb2', type: 'coupon_box', titleEn: 'Use Code', couponCode: 'E2ECEDAR10' },
      ],
    });
    await repo.adminSendOrScheduleEmailCampaign(emailCmp.id, 'admin-1', { sendNow: true });
    await processPendingJobs(db, 30);

    // Subscribe + unsubscribe opt-out verification
    const sub = await repo.subscribeNewsletter('optout.e2e@example.com', 'ar', 'home');
    const tokRow = await db.queryOne<{ unsubscribe_token: string }>(
      'SELECT unsubscribe_token FROM newsletter_subscribers WHERE id = ?',
      [sub.id]
    );
    assert.equal(await repo.unsubscribeNewsletterByToken(tokRow!.unsubscribe_token), true);
    await processMarketingEmailJob(db, {
      campaignId: emailCmp.id,
      to: 'optout.e2e@example.com',
      locale: 'ar',
      subject: 'Skip me',
      blocks: [{ id: 's1', type: 'header', titleEn: 'Hi' }],
    });

    // Abandoned cart flow + deduplication
    const cartBuyer = await repo.registerCustomer({
      name: 'Tala Cart',
      email: 'tala.e2e@example.com',
      phone: '+96170999000',
      password: 'Password123!',
      locale: 'en',
    });
    const cartId = `cart-${crypto.randomUUID()}`;
    await db.execute('INSERT INTO carts (id, user_id, updated_at) VALUES (?, ?, ?)', [
      cartId,
      cartBuyer.id,
      toSqlTimestamp(new Date(Date.now() - 3 * 3_600_000)),
    ]);
    await db.execute('INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?, 1)', [
      `ci-${crypto.randomUUID()}`,
      cartId,
      prod.id,
      prod.variants[0].id,
    ]);
    await repo.adminCreateAutomationFlow('admin-1', {
      name: { en: 'Abandoned Cart E2E', ar: 'سلة متروكة' },
      triggerType: 'abandoned_cart',
      delayHours: 1,
      subject: { en: 'Complete order', ar: 'أكمل طلبك' },
      blocks: [{ id: 'ab1', type: 'hero_text', titleEn: 'Still interested?', bodyEn: 'Checkout now' }],
      active: true,
    });
    const run1 = await processPendingJobs(db, 20);
    assert.equal(run1.automationJobsQueued, 1);
    const run2 = await processPendingJobs(db, 20);
    assert.equal(run2.automationJobsQueued, 0);

    // 7. Marketing Analytics Attribution assertions
    const analytics = await repo.getMarketingAnalytics();
    assert.equal(analytics.kpis.totalOrderGmvUsdCents, order.grandTotalUsdCents);
    assert.equal(analytics.kpis.promoAttributedGmvUsdCents, order.grandTotalUsdCents);
    assert.equal(analytics.kpis.couponOrdersCount, 1);
    assert.equal(analytics.kpis.emailUnsubscribedSkipped, 1);
    const couponAttr = analytics.couponAttribution.find((c) => c.code === 'E2ECEDAR10')!;
    assert.equal(couponAttr.ordersCount, 1);
    assert.equal(couponAttr.revenueUsdCents, order.grandTotalUsdCents);
    const cmpAttr = analytics.campaignAttribution.find((c) => c.id === cmp.id)!;
    assert.equal(cmpAttr.ordersCount, 1);
  } finally {
    db.close();
    if (prevStorage === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = prevStorage;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
