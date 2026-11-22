import crypto from 'node:crypto';
import type {
  AttributeItem,
  AuditLogEntry,
  AutomationFlow,
  AutomationTriggerType,
  BannerBgToken,
  BannerPageScope,
  BannerPlacementType,
  BrandItem,
  Campaign,
  CampaignStatus,
  Category,
  Coupon,
  CouponDiscountType,
  CustomerAddress,
  CustomerSegment,
  CustomerSegmentRule,
  DeliveryMode,
  DeliveryZone,
  DeviceTargetType,
  EmailBlock,
  EmailCampaign,
  EmailCampaignStatus,
  EmailTemplateItem,
  FeaturedPlacement,
  FeaturedPlacementTargetType,
  FeaturedSlotKey,
  FlashSale,
  FlashSaleItem,
  FlashSaleStatus,
  HomeMigrationReport,
  HomePageSnapshot,
  HomeSection,
  HomeSectionAudience,
  HomeSectionStatus,
  HomeSectionStyle,
  HomeSectionTargeting,
  HomeSectionTemplate,
  HomeSectionType,
  HomeSectionVersion,
  LedgerEntry,
  LocalizedText,
  MarketingAudienceType,
  MarketingAnalyticsSummary,
  MarketingPopup,
  MediaAsset,
  MenuConfig,
  NewsletterSubscriber,
  NotificationItem,
  Offer,
  OfferApprovalStatus,
  OfferBanner,
  OfferConflict,
  OfferFundingSource,
  OfferRulesConfig,
  OfferStackingRule,
  OfferTargetType,
  OfferType,
  Order,
  OrderDispute,
  OrderItem,
  PageContent,
  PaymentConfig,
  PaymentMethod,
  PaymentStatus,
  PayoutRequest,
  PlatformSettings,
  PopupFrequency,
  PopupTrigger,
  PopupType,
  Product,
  ProductSpec,
  ProductVariant,
  ReturnRequest,
  Review,
  SegmentContact,
  Seller,
  SellerDocumentReview,
  SellerPromoRules,
  SellerStaffMember,
  SellerStatus,
  SiteChromeSettings,
  StockMovementItem,
  StorefrontThemeId,
  SubOrder,
  SubOrderStatus,
  SubscriptionPlan,
  SubscriptionTier,
  SupportTicket,
} from '../../src/shared/types.ts';
import {
  DEFAULT_SITE_CHROME,
  HOME_SECTION_PRESETS,
  mapLegacySectionType,
  normalizeTargeting,
} from '../../src/shared/homeSections.ts';
import { evaluateCartPromotions, isWithinSchedule, resolveUnitOfferPrice } from '../../src/shared/offers.ts';
import type { DbClient, DbTx } from './client.ts';
import { getPaymentAdapter, isCardGatewayConfigured } from '../paymentAdapters.ts';
import { parseNaturalQuery } from '../searchParser.ts';
import {
  buildOtpAuthUri,
  generateTotpSecret,
  hashPassword,
  sha256Hex,
  timingSafeStringMatch,
  toSqlTimestamp,
  validatePasswordStrength,
  verifyPassword,
  verifyTotpCode,
  writeAuditLog,
  type AuthContextUser,
} from '../services/security.ts';
import { queueEmail, type MarketingEmailJobPayload } from '../services/email.ts';
import { enqueueJob, releaseEligibleEscrowHolds } from '../services/jobs.ts';

function parseJson<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return val as T;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '').slice(-8);
}

export class MarketplaceRepo {
  private publishedChromeCache: { value: SiteChromeSettings; cachedAt: number } | null = null;
  private publishedHomeSectionsCache: { value: HomeSection[]; cachedAt: number } | null = null;

  constructor(private readonly db: DbClient) {}

  invalidateHomeCache() {
    this.publishedChromeCache = null;
    this.publishedHomeSectionsCache = null;
  }

  private keyCol(): string {
    return this.db.driver === 'mysql' ? '`key`' : 'key';
  }

  // --- Settings & Config ---
  async getPlatformSettings(): Promise<PlatformSettings> {
    const row = await this.db.queryOne<{ value_json: string }>(
      `SELECT value_json FROM settings WHERE ${this.keyCol()} = 'platform'`
    );
    return parseJson<PlatformSettings>(row?.value_json, {
      siteName: 'NileLink',
      exchangeRateLbpPerUsd: 89500,
      defaultCommissionBps: 1000,
      codFeeUsdCents: 150,
      holdPeriodDays: 3,
      maintenanceMode: false,
      announcement: { en: '', ar: '' },
    });
  }

  async getPaymentConfig(): Promise<PaymentConfig> {
    const row = await this.db.queryOne<{ value_json: string }>(
      `SELECT value_json FROM settings WHERE ${this.keyCol()} = 'payments'`
    );
    const saved = parseJson<{
      codEnabled: boolean;
      whishManualEnabled: boolean;
      whishAccountNumber: string;
      whishInstructions: LocalizedText;
      cardEnabled: boolean;
    }>(row?.value_json, {
      codEnabled: true,
      whishManualEnabled: true,
      whishAccountNumber: '',
      whishInstructions: { en: '', ar: '' },
      cardEnabled: false,
    });
    const cardGatewayConfigured = isCardGatewayConfigured();
    return {
      codEnabled: Boolean(saved.codEnabled),
      whishManualEnabled: Boolean(saved.whishManualEnabled) && Boolean(saved.whishAccountNumber?.trim()),
      whishAccountNumber: saved.whishAccountNumber || '',
      whishInstructions: saved.whishInstructions || { en: '', ar: '' },
      cardEnabled: Boolean(saved.cardEnabled) && cardGatewayConfigured,
      cardGatewayConfigured,
    };
  }

  async getCategories(): Promise<Category[]> {
    const rows = await this.db.query<{
      id: string;
      parent_id: string | null;
      slug: string;
      department: 'fashion' | 'electronics' | 'home-gadgets';
      name_json: string;
      commission_bps: number | null;
    }>('SELECT id, parent_id, slug, department, name_json, commission_bps FROM categories WHERE active = 1 ORDER BY sort_order ASC');

    return rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      slug: r.slug,
      department: r.department,
      name: parseJson<LocalizedText>(r.name_json, { en: r.slug, ar: r.slug }),
      commissionBps: r.commission_bps,
    }));
  }

  async getDeliveryZones(): Promise<DeliveryZone[]> {
    const rows = await this.db.query<{
      governorate_code: string;
      name_json: string;
      platform_fee_usd_cents: number;
      eta_days: string;
    }>('SELECT governorate_code, name_json, platform_fee_usd_cents, eta_days FROM delivery_zones');
    return rows.map((r) => ({
      governorateCode: r.governorate_code,
      name: parseJson<LocalizedText>(r.name_json, { en: r.governorate_code, ar: r.governorate_code }),
      platformFeeUsdCents: Number(r.platform_fee_usd_cents),
      etaDays: r.eta_days,
    }));
  }

  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const rows = await this.db.query<{
      tier: SubscriptionTier;
      name_json: string;
      monthly_fee_usd_cents: number;
      product_limit: number | null;
      commission_discount_bps: number;
      features_json: string;
    }>('SELECT tier, name_json, monthly_fee_usd_cents, product_limit, commission_discount_bps, features_json FROM subscription_plans ORDER BY monthly_fee_usd_cents ASC');

    return rows.map((r) => ({
      tier: r.tier,
      name: parseJson<LocalizedText>(r.name_json, { en: r.tier, ar: r.tier }),
      monthlyFeeUsdCents: Number(r.monthly_fee_usd_cents),
      productLimit: r.product_limit === null ? null : Number(r.product_limit),
      commissionDiscountBps: Number(r.commission_discount_bps),
      features: parseJson<LocalizedText[]>(r.features_json, []),
    }));
  }

  // --- First-Run Admin Setup & Auth ---
  async getAdminSetupStatus(): Promise<{ hasSuperAdmin: boolean; setupTokenPending: boolean }> {
    const adminRow = await this.db.queryOne<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM users WHERE role_key = 'admin_super' AND deleted_at IS NULL"
    );
    const hasSuperAdmin = Number(adminRow?.cnt ?? 0) > 0;
    const tokRow = await this.db.queryOne<{ value_json: string }>(
      `SELECT value_json FROM settings WHERE ${this.keyCol()} = 'admin_setup_token_hash'`
    );
    return { hasSuperAdmin, setupTokenPending: !hasSuperAdmin && Boolean(tokRow) };
  }

  async setupInitialAdmin(input: {
    setupToken: string;
    name: string;
    email: string;
    phone: string;
    password: string;
    ipAddress?: string;
  }) {
    const pwErr = validatePasswordStrength(input.password);
    if (pwErr) throw new Error(pwErr);

    return this.db.transaction(async (tx) => {
      const adminRow = await tx.queryOne<{ cnt: number }>(
        "SELECT COUNT(*) AS cnt FROM users WHERE role_key = 'admin_super' AND deleted_at IS NULL"
      );
      if (Number(adminRow?.cnt ?? 0) > 0) {
        throw new Error('Super admin is already configured. Sign in with your email, password, and 2FA code.');
      }

      const tokRow = await tx.queryOne<{ value_json: string }>(
        `SELECT value_json FROM settings WHERE ${this.keyCol()} = 'admin_setup_token_hash'`
      );
      if (!tokRow) {
        throw new Error('No pending admin setup token found.');
      }
      const parsed = parseJson<{ hash: string }>(tokRow.value_json, { hash: '' });
      const submittedHash = sha256Hex(input.setupToken.trim());
      if (!parsed.hash || !timingSafeStringMatch(parsed.hash, submittedHash)) {
        throw new Error('Invalid one-time setup token. Check server startup logs.');
      }

      const emailNorm = input.email.trim().toLowerCase();
      const dup = await tx.queryOne<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ?', [emailNorm]);
      if (dup) throw new Error('Email is already registered.');

      const userId = `usr-${crypto.randomUUID()}`;
      const totpSecret = generateTotpSecret();
      const now = toSqlTimestamp();

      await tx.execute(
        `INSERT INTO users (id, name, email, phone, password_hash, role_key, email_verified_at, totp_secret, totp_enabled, preferred_locale, preferred_currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'admin_super', ?, ?, 1, 'en', 'USD', ?, ?)`,
        [userId, input.name.trim(), emailNorm, input.phone.trim(), hashPassword(input.password), now, totpSecret, now, now]
      );

      await tx.execute(`DELETE FROM settings WHERE ${this.keyCol()} = 'admin_setup_token_hash'`);

      await writeAuditLog(tx, {
        actorUserId: userId,
        action: 'admin.initial_setup',
        entityType: 'user',
        entityId: userId,
        after: { email: emailNorm, roleKey: 'admin_super', totpEnabled: true },
        ipAddress: input.ipAddress,
      });

      return {
        userId,
        email: emailNorm,
        name: input.name.trim(),
        totpSecret,
        otpauthUri: buildOtpAuthUri(emailNorm, totpSecret),
      };
    });
  }

  async registerCustomer(input: {
    name: string;
    email: string;
    phone: string;
    password: string;
    locale?: 'en' | 'ar';
    ipAddress?: string;
  }) {
    const pwErr = validatePasswordStrength(input.password);
    if (pwErr) throw new Error(pwErr);

    const emailNorm = input.email.trim().toLowerCase();
    return this.db.transaction(async (tx) => {
      const dup = await tx.queryOne<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ?', [emailNorm]);
      if (dup) throw new Error('An account with this email already exists.');

      const id = `usr-${crypto.randomUUID()}`;
      const now = toSqlTimestamp();
      const locale = input.locale === 'ar' ? 'ar' : 'en';
      await tx.execute(
        `INSERT INTO users (id, name, email, phone, password_hash, role_key, preferred_locale, preferred_currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'customer', ?, 'USD', ?, ?)`,
        [id, input.name.trim(), emailNorm, input.phone.trim(), hashPassword(input.password), locale, now, now]
      );

      await queueEmail(tx, {
        to: emailNorm,
        templateKey: 'welcome',
        locale,
        vars: { name: input.name.trim() },
      });

      await writeAuditLog(tx, {
        actorUserId: id,
        action: 'auth.register_customer',
        entityType: 'user',
        entityId: id,
        ipAddress: input.ipAddress,
      });

      return { id, name: input.name.trim(), email: emailNorm, phone: input.phone.trim(), roleKey: 'customer' as const };
    });
  }

  async loginUser(input: { email: string; password: string; totpCode?: string; ipAddress?: string }) {
    const emailNorm = input.email.trim().toLowerCase();
    const row = await this.db.queryOne<{
      id: string;
      name: string;
      email: string;
      phone: string;
      password_hash: string;
      role_key: string;
      totp_secret: string | null;
      totp_enabled: number | boolean;
      failed_login_attempts: number;
      locked_until: string | null;
      is_blocked: number | boolean;
      deleted_at: string | null;
    }>('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1', [emailNorm]);

    if (!row || row.deleted_at) {
      throw new Error('Invalid email or password.');
    }
    if (row.is_blocked) {
      throw new Error('Account suspended. Contact NileLink support.');
    }
    const nowMs = Date.now();
    if (row.locked_until && new Date(row.locked_until.replace(' ', 'T') + 'Z').getTime() > nowMs) {
      throw new Error('Too many failed sign-in attempts. Please wait 15 minutes before retrying.');
    }

    if (!verifyPassword(input.password, row.password_hash)) {
      const nextAttempts = Number(row.failed_login_attempts || 0) + 1;
      const lockedUntil = nextAttempts >= 5 ? toSqlTimestamp(new Date(nowMs + 15 * 60_000)) : null;
      await this.db.execute(
        'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
        [nextAttempts, lockedUntil, row.id]
      );
      throw new Error('Invalid email or password.');
    }

    const requiresTotp = row.role_key === 'admin_super' || row.role_key === 'admin_staff' || Boolean(row.totp_enabled);
    if (requiresTotp) {
      if (!row.totp_secret) {
        throw new Error('2FA secret is not enrolled on this privileged account.');
      }
      if (!input.totpCode || !verifyTotpCode(row.totp_secret, input.totpCode)) {
        throw new Error('Valid 6-digit 2FA authenticator code is required.');
      }
    }

    await this.db.execute(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
      [toSqlTimestamp(), row.id]
    );

    return { id: row.id, name: row.name, email: row.email, roleKey: row.role_key };
  }

  async startTotpEnrollment(userId: string) {
    const user = await this.db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('User not found.');
    const secret = generateTotpSecret();
    await this.db.execute('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', [secret, userId]);
    return { secret, otpauthUri: buildOtpAuthUri(user.email, secret) };
  }

  async confirmTotpEnrollment(userId: string, code: string) {
    const user = await this.db.queryOne<{ totp_secret: string | null }>(
      'SELECT totp_secret FROM users WHERE id = ?',
      [userId]
    );
    if (!user?.totp_secret) throw new Error('Start 2FA enrollment first.');
    if (!verifyTotpCode(user.totp_secret, code)) {
      throw new Error('Invalid 6-digit authenticator code.');
    }
    await this.db.execute('UPDATE users SET totp_enabled = 1 WHERE id = ?', [userId]);
    return { totpEnabled: true };
  }

  async createAdminStaff(input: {
    actorUserId: string;
    name: string;
    email: string;
    phone: string;
    password: string;
    permissions: string[];
    ipAddress?: string;
  }) {
    const pwErr = validatePasswordStrength(input.password);
    if (pwErr) throw new Error(pwErr);

    const emailNorm = input.email.trim().toLowerCase();
    return this.db.transaction(async (tx) => {
      const dup = await tx.queryOne<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ?', [emailNorm]);
      if (dup) throw new Error('Email already registered.');

      const id = `usr-${crypto.randomUUID()}`;
      const totpSecret = generateTotpSecret();
      const now = toSqlTimestamp();
      await tx.execute(
        `INSERT INTO users (id, name, email, phone, password_hash, role_key, email_verified_at, totp_secret, totp_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'admin_staff', ?, ?, 1, ?, ?)`,
        [id, input.name.trim(), emailNorm, input.phone.trim(), hashPassword(input.password), now, totpSecret, now, now]
      );

      for (const perm of input.permissions) {
        await tx.execute(
          'INSERT INTO user_permissions (id, user_id, permission_key) VALUES (?, ?, ?)',
          [`up-${crypto.randomUUID()}`, id, perm]
        );
      }

      await writeAuditLog(tx, {
        actorUserId: input.actorUserId,
        action: 'admin.create_staff',
        entityType: 'user',
        entityId: id,
        after: { email: emailNorm, permissions: input.permissions },
        ipAddress: input.ipAddress,
      });

      return { id, email: emailNorm, name: input.name.trim(), totpSecret, otpauthUri: buildOtpAuthUri(emailNorm, totpSecret) };
    });
  }

  // --- Sellers & Stores Mapping ---
  private async mapSellerRow(row: Record<string, unknown>, tx: DbTx = this.db): Promise<Seller> {
    const bannerMedia = row.banner_media_id
      ? await tx.queryOne<{ public_url: string }>('SELECT public_url FROM media WHERE id = ?', [row.banner_media_id])
      : null;
    const logoMedia = row.logo_media_id
      ? await tx.queryOne<{ public_url: string }>('SELECT public_url FROM media WHERE id = ?', [row.logo_media_id])
      : null;
    const subRow = await tx.queryOne<{ plan_tier: SubscriptionTier; status: string; next_due_at: string }>(
      'SELECT plan_tier, status, next_due_at FROM subscriptions WHERE seller_id = ? ORDER BY created_at DESC LIMIT 1',
      [row.id]
    );

    return {
      id: String(row.id),
      slug: String(row.slug),
      userId: String(row.owner_user_id),
      name: parseJson<LocalizedText>(row.name_json, { en: String(row.legal_name), ar: String(row.legal_name) }),
      tagline: parseJson<LocalizedText>(row.tagline_json, { en: '', ar: '' }),
      about: parseJson<LocalizedText>(row.about_json, { en: '', ar: '' }),
      department: String(row.department_slug) as Seller['department'],
      status: String(row.status) as SellerStatus,
      statusReason: row.status_reason ? String(row.status_reason) : null,
      verified: Boolean(row.verified),
      rating: Number(row.rating_avg_x10 || 0) / 10,
      reviewCount: Number(row.review_count || 0),
      governorate: String(row.governorate),
      district: String(row.district),
      cityAddress: String(row.city_address || ''),
      whatsappPhone: String(row.whatsapp_phone || row.phone || ''),
      payoutMethod: String(row.payout_method || 'whish') as Seller['payoutMethod'],
      payoutAccount: String(row.payout_account || ''),
      commercialRegRef: String(row.commercial_reg_ref || ''),
      customCommissionBps: row.custom_commission_bps !== null && row.custom_commission_bps !== undefined ? Number(row.custom_commission_bps) : null,
      subscriptionTier: subRow?.plan_tier || 'free',
      subscriptionStatus: (subRow?.status as Seller['subscriptionStatus']) || 'active',
      subscriptionNextDue: subRow?.next_due_at || toSqlTimestamp(),
      deliveryMode: (String(row.delivery_mode || 'platform') as DeliveryMode),
      selfDeliveryFeesUsdCents: parseJson<Record<string, number>>(row.self_delivery_fees_json, {}),
      storefrontTheme: (String(row.theme_id || 'obsidian-ember') as StorefrontThemeId),
      announcement: row.announcement_json ? parseJson<LocalizedText | null>(row.announcement_json, null) : null,
      bannerImage: bannerMedia?.public_url || '/src/assets/images/hero_beirut_editorial_1795297173320.jpg',
      logoImage: logoMedia?.public_url || null,
      returnPolicy: row.return_policy_json ? parseJson<LocalizedText | null>(row.return_policy_json, null) : null,
      processingHours: row.processing_hours !== null && row.processing_hours !== undefined ? Number(row.processing_hours) : 24,
      vacationMode: Boolean(row.vacation_mode),
      seoTitle: row.seo_title ? String(row.seo_title) : null,
      seoDescription: row.seo_description ? String(row.seo_description) : null,
      createdAt: String(row.created_at),
    };
  }

  private async mapProductRows(rows: Record<string, unknown>[], tx: DbTx = this.db): Promise<Product[]> {
    const out: Product[] = [];
    for (const r of rows) {
      const variants = await tx.query<{
        id: string;
        sku: string;
        size: string | null;
        color: string;
        color_hex: string;
        stock: number;
        price_delta_usd_cents: number;
      }>('SELECT id, sku, size, color, color_hex, stock, price_delta_usd_cents FROM product_variants WHERE product_id = ?', [
        r.id,
      ]);
      const mediaRows = await tx.query<{ public_url: string }>(
        "SELECT public_url FROM media WHERE entity_type = 'product_image' AND entity_id = ? ORDER BY created_at ASC",
        [r.id]
      );

      out.push({
        id: String(r.id),
        slug: String(r.slug),
        sellerId: String(r.seller_id),
        categoryId: String(r.category_id),
        brandId: r.brand_id ? String(r.brand_id) : null,
        department: String(r.department) as Product['department'],
        title: parseJson<LocalizedText>(r.title_json, { en: '', ar: '' }),
        subtitle: parseJson<LocalizedText>(r.subtitle_json, { en: '', ar: '' }),
        description: parseJson<LocalizedText>(r.description_json, { en: '', ar: '' }),
        basePriceUsdCents: Number(r.base_price_usd_cents),
        compareAtUsdCents: r.compare_at_usd_cents !== null && r.compare_at_usd_cents !== undefined ? Number(r.compare_at_usd_cents) : null,
        sellerCurrency: String(r.seller_currency || 'USD') as Product['sellerCurrency'],
        images: mediaRows.map((m) => m.public_url),
        model3dUrl: r.model_3d_url ? String(r.model_3d_url) : null,
        rating: Number(r.rating_avg_x10 || 0) / 10,
        reviewCount: Number(r.review_count || 0),
        isDeal: Boolean(r.compare_at_usd_cents && Number(r.compare_at_usd_cents) > Number(r.base_price_usd_cents)),
        isFeatured: Boolean(r.featured),
        published: Boolean(r.published),
        moderationStatus: String(r.moderation_status || 'pending'),
        variants: variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          size: v.size || undefined,
          color: v.color,
          colorHex: v.color_hex,
          stock: Number(v.stock),
          priceDeltaUsdCents: Number(v.price_delta_usd_cents),
        })),
        specs: parseJson<ProductSpec[]>(r.specs_json, []),
        tags: [],
        createdAt: String(r.created_at),
      });
    }
    return out;
  }

  async getPublicSellers(): Promise<Seller[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT sel.*, st.slug, st.name_json, st.tagline_json, st.about_json, st.announcement_json,
              st.department_slug, st.theme_id, st.logo_media_id, st.banner_media_id, st.rating_avg_x10, st.review_count,
              ss.delivery_mode, ss.self_delivery_fees_json, ss.processing_hours, ss.vacation_mode, ss.return_policy_json, ss.seo_title, ss.seo_description
       FROM sellers sel
       INNER JOIN stores st ON st.seller_id = sel.id
       LEFT JOIN store_settings ss ON ss.store_id = st.id
       WHERE sel.status = 'approved' AND sel.deleted_at IS NULL
       ORDER BY sel.created_at DESC`
    );
    const list: Seller[] = [];
    for (const r of rows) list.push(await this.mapSellerRow(r));
    return list;
  }

  async getSellerById(sellerId: string): Promise<Seller | null> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      `SELECT sel.*, st.slug, st.name_json, st.tagline_json, st.about_json, st.announcement_json,
              st.department_slug, st.theme_id, st.logo_media_id, st.banner_media_id, st.rating_avg_x10, st.review_count,
              ss.delivery_mode, ss.self_delivery_fees_json, ss.processing_hours, ss.vacation_mode, ss.return_policy_json, ss.seo_title, ss.seo_description
       FROM sellers sel
       INNER JOIN stores st ON st.seller_id = sel.id
       LEFT JOIN store_settings ss ON ss.store_id = st.id
       WHERE sel.id = ? AND sel.deleted_at IS NULL LIMIT 1`,
      [sellerId]
    );
    return row ? this.mapSellerRow(row) : null;
  }

  async getSellerBySlug(slug: string): Promise<Seller | null> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      `SELECT sel.*, st.slug, st.name_json, st.tagline_json, st.about_json, st.announcement_json,
              st.department_slug, st.theme_id, st.logo_media_id, st.banner_media_id, st.rating_avg_x10, st.review_count,
              ss.delivery_mode, ss.self_delivery_fees_json, ss.processing_hours, ss.vacation_mode, ss.return_policy_json, ss.seo_title, ss.seo_description
       FROM sellers sel
       INNER JOIN stores st ON st.seller_id = sel.id
       LEFT JOIN store_settings ss ON ss.store_id = st.id
       WHERE st.slug = ? AND sel.deleted_at IS NULL LIMIT 1`,
      [slug]
    );
    return row ? this.mapSellerRow(row) : null;
  }

  async getPublicProducts(): Promise<Product[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT p.*
       FROM products p
       INNER JOIN sellers sel ON sel.id = p.seller_id
       WHERE p.published = 1 AND p.moderation_status = 'approved' AND p.deleted_at IS NULL AND sel.status = 'approved' AND sel.deleted_at IS NULL
       ORDER BY p.created_at DESC`
    );
    return this.mapProductRows(rows);
  }

  async searchPublicProducts(filters: {
    q?: string;
    department?: string;
    sellerId?: string;
    maxPrice?: number;
    minRating?: number;
    inStockOnly?: boolean;
    dealsOnly?: boolean;
    sort?: string;
  }) {
    const q = (filters.q || '').trim();
    const parsed = q ? parseNaturalQuery(q) : null;
    const [allProducts, activeOffers] = await Promise.all([this.getPublicProducts(), this.getActiveOffers()]);
    let results = allProducts;

    const effPrice = (p: Product) => resolveUnitOfferPrice(p.basePriceUsdCents, p, activeOffers).effectiveUsdCents;

    const effDept = filters.department || parsed?.department;
    if (effDept) results = results.filter((p) => p.department === effDept);
    if (filters.sellerId) results = results.filter((p) => p.sellerId === filters.sellerId);
    if (filters.dealsOnly) {
      results = results.filter(
        (p) => Boolean(p.isDeal) || resolveUnitOfferPrice(p.basePriceUsdCents, p, activeOffers).appliedOffer !== null
      );
    }

    const effMax = filters.maxPrice ?? parsed?.maxPriceUsdCents;
    if (effMax !== undefined && !Number.isNaN(effMax)) {
      results = results.filter((p) => effPrice(p) <= effMax);
    }
    if (parsed?.minPriceUsdCents !== undefined) {
      results = results.filter((p) => effPrice(p) >= parsed.minPriceUsdCents!);
    }
    if (filters.minRating !== undefined && !Number.isNaN(filters.minRating)) {
      results = results.filter((p) => p.rating >= filters.minRating!);
    }
    if (filters.inStockOnly || parsed?.inStockOnly) {
      results = results.filter((p) => p.variants.some((v) => v.stock > 0));
    }
    if (parsed?.size) {
      results = results.filter((p) =>
        p.variants.some((v) => (v.size || '').toUpperCase() === parsed.size)
      );
    }
    if (parsed?.color) {
      results = results.filter((p) =>
        p.variants.some((v) => v.color.toLowerCase().includes(parsed.color!.toLowerCase()))
      );
    }
    if (parsed && parsed.keywords.length > 0) {
      results = results.filter((p) => {
        const haystack = `${p.title.en} ${p.title.ar} ${p.subtitle.en} ${p.subtitle.ar} ${p.description.en}`.toLowerCase();
        return parsed.keywords.every((kw) => haystack.includes(kw));
      });
    }

    if (filters.sort === 'price_asc') results = [...results].sort((a, b) => effPrice(a) - effPrice(b));
    if (filters.sort === 'price_desc') results = [...results].sort((a, b) => effPrice(b) - effPrice(a));
    if (filters.sort === 'rating') results = [...results].sort((a, b) => b.rating - a.rating);

    return { products: results, parsedQuery: parsed };
  }

  async getProductDetail(slugOrId: string) {
    const row = await this.db.queryOne<Record<string, unknown>>(
      `SELECT p.* FROM products p
       INNER JOIN sellers sel ON sel.id = p.seller_id
       WHERE (p.slug = ? OR p.id = ?) AND p.published = 1 AND p.moderation_status = 'approved' AND p.deleted_at IS NULL AND sel.status = 'approved'
       LIMIT 1`,
      [slugOrId, slugOrId]
    );
    if (!row) return null;
    const [product] = await this.mapProductRows([row]);
    const seller = await this.getSellerById(product.sellerId);
    const reviews = await this.getReviewsForProduct(product.id);
    return { product, seller, reviews };
  }

  async getStorefrontDetail(slug: string) {
    const seller = await this.getSellerBySlug(slug);
    if (!seller || seller.status !== 'approved') return null;
    const rows = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM products WHERE seller_id = ? AND published = 1 AND moderation_status = 'approved' AND deleted_at IS NULL ORDER BY created_at DESC",
      [seller.id]
    );
    const products = await this.mapProductRows(rows);
    const reviews = await this.getReviewsForSeller(seller.id);
    return { seller, products, reviews };
  }

  async getReviewsForProduct(productId: string): Promise<Review[]> {
    const rows = await this.db.query<{
      id: string;
      product_id: string;
      seller_id: string;
      user_id: string;
      author_name: string;
      rating: number;
      comment: string;
      verified_buyer: number | boolean;
      seller_reply: string | null;
      created_at: string;
    }>(
      `SELECT r.*, u.name AS author_name
       FROM reviews r
       INNER JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ? AND r.moderation_status = 'approved'
       ORDER BY r.created_at DESC`,
      [productId]
    );
    return rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      sellerId: r.seller_id,
      userId: r.user_id,
      authorName: r.author_name,
      rating: Number(r.rating),
      comment: r.comment,
      verifiedBuyer: Boolean(r.verified_buyer),
      sellerReply: r.seller_reply || undefined,
      createdAt: String(r.created_at),
    }));
  }

  async getReviewsForSeller(sellerId: string): Promise<Review[]> {
    const rows = await this.db.query<{
      id: string;
      product_id: string;
      seller_id: string;
      user_id: string;
      author_name: string;
      rating: number;
      comment: string;
      verified_buyer: number | boolean;
      seller_reply: string | null;
      created_at: string;
    }>(
      `SELECT r.*, u.name AS author_name
       FROM reviews r
       INNER JOIN users u ON u.id = r.user_id
       WHERE r.seller_id = ? AND r.moderation_status = 'approved'
       ORDER BY r.created_at DESC`,
      [sellerId]
    );
    return rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      sellerId: r.seller_id,
      userId: r.user_id,
      authorName: r.author_name,
      rating: Number(r.rating),
      comment: r.comment,
      verifiedBuyer: Boolean(r.verified_buyer),
      sellerReply: r.seller_reply || undefined,
      createdAt: String(r.created_at),
    }));
  }

  async getBootstrapData(ctx?: {
    isLoggedIn?: boolean;
    isNewVisitor?: boolean;
    locale?: 'en' | 'ar';
    includeDrafts?: boolean;
    asOf?: string | null;
    audiencePreview?: string | null;
    device?: 'desktop' | 'mobile';
  }) {
    const [
      settings,
      paymentsConfig,
      categories,
      brands,
      attributes,
      sellers,
      products,
      subscriptionPlans,
      deliveryZones,
      homeSections,
      banners,
      popups,
      featuredPlacements,
      offers,
      flashSales,
      campaigns,
      siteChrome,
    ] = await Promise.all([
      this.getPlatformSettings(),
      this.getPaymentConfig(),
      this.getCategories(),
      this.getBrands(),
      this.getAttributes(),
      this.getPublicSellers(),
      this.getPublicProducts(),
      this.getSubscriptionPlans(),
      this.getDeliveryZones(),
      this.getPublicHomeSections(ctx),
      this.getActiveBanners(),
      this.getActivePopups(),
      this.getActiveFeaturedPlacements(),
      this.getActiveOffers(),
      this.getActiveFlashSales(),
      this.getActiveCampaigns(),
      this.getSiteChrome(Boolean(ctx?.includeDrafts)),
    ]);

    return {
      settings,
      paymentsConfig,
      categories,
      brands,
      attributes,
      sellers,
      products,
      subscriptionPlans,
      deliveryZones,
      homeSections,
      banners,
      popups,
      featuredPlacements,
      offers,
      flashSales,
      campaigns,
      siteChrome,
    };
  }

  // --- Pages ---
  async getAllPages(): Promise<PageContent[]> {
    const rows = await this.db.query<{
      id: string;
      slug: string;
      title_json: string;
      body_json: string;
      published: number | boolean;
      updated_at: string;
    }>('SELECT * FROM pages ORDER BY slug ASC');

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: parseJson<LocalizedText>(r.title_json, { en: r.slug, ar: r.slug }),
      body: parseJson<LocalizedText>(r.body_json, { en: '', ar: '' }),
      published: Boolean(r.published),
      updatedAt: String(r.updated_at),
    }));
  }

  async getPageBySlug(slug: string): Promise<PageContent | null> {
    const row = await this.db.queryOne<{
      id: string;
      slug: string;
      title_json: string;
      body_json: string;
      published: number | boolean;
      updated_at: string;
    }>('SELECT * FROM pages WHERE slug = ? AND published = 1 LIMIT 1', [slug]);
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      title: parseJson<LocalizedText>(row.title_json, { en: row.slug, ar: row.slug }),
      body: parseJson<LocalizedText>(row.body_json, { en: '', ar: '' }),
      published: Boolean(row.published),
      updatedAt: String(row.updated_at),
    };
  }

  // --- User Cart & Wishlist Sync ---
  async getUserCart(userId: string) {
    const cartRow = await this.db.queryOne<{ id: string }>('SELECT id FROM carts WHERE user_id = ? LIMIT 1', [userId]);
    if (!cartRow) return [];
    const items = await this.db.query<{ product_id: string; variant_id: string; quantity: number }>(
      'SELECT product_id, variant_id, quantity FROM cart_items WHERE cart_id = ?',
      [cartRow.id]
    );
    return items.map((i) => ({ productId: i.product_id, variantId: i.variant_id, quantity: Number(i.quantity) }));
  }

  async saveUserCart(userId: string, items: Array<{ productId: string; variantId: string; quantity: number }>) {
    await this.db.transaction(async (tx) => {
      let cartRow = await tx.queryOne<{ id: string }>('SELECT id FROM carts WHERE user_id = ? LIMIT 1', [userId]);
      if (!cartRow) {
        const cartId = `crt-${crypto.randomUUID()}`;
        await tx.execute('INSERT INTO carts (id, user_id, updated_at) VALUES (?, ?, ?)', [
          cartId,
          userId,
          toSqlTimestamp(),
        ]);
        cartRow = { id: cartId };
      } else {
        await tx.execute('UPDATE carts SET updated_at = ? WHERE id = ?', [toSqlTimestamp(), cartRow.id]);
      }
      await tx.execute('DELETE FROM cart_items WHERE cart_id = ?', [cartRow.id]);
      for (const item of items) {
        if (item.quantity > 0) {
          await tx.execute(
            'INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?, ?)',
            [`ci-${crypto.randomUUID()}`, cartRow.id, item.productId, item.variantId, item.quantity]
          );
        }
      }
    });
  }

  async getUserWishlist(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ product_id: string }>(
      'SELECT product_id FROM wishlists WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map((r) => r.product_id);
  }

  async toggleUserWishlist(userId: string, productId: string): Promise<{ wished: boolean; wishlist: string[] }> {
    const existing = await this.db.queryOne<{ id: string }>(
      'SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );
    if (existing) {
      await this.db.execute('DELETE FROM wishlists WHERE id = ?', [existing.id]);
    } else {
      await this.db.execute(
        'INSERT INTO wishlists (id, user_id, product_id, created_at) VALUES (?, ?, ?, ?)',
        [`wsh-${crypto.randomUUID()}`, userId, productId, toSqlTimestamp()]
      );
    }
    const wishlist = await this.getUserWishlist(userId);
    return { wished: !existing, wishlist };
  }

  // --- Commission Resolution & Orders ---
  async resolveCommissionBps(
    sellerId: string,
    categoryId: string,
    tx: DbTx = this.db
  ): Promise<{ bps: number; source: 'seller_custom' | 'category' | 'platform_default' }> {
    const sellerRow = await tx.queryOne<{ custom_commission_bps: number | null }>(
      'SELECT custom_commission_bps FROM sellers WHERE id = ?',
      [sellerId]
    );
    if (sellerRow && sellerRow.custom_commission_bps !== null && sellerRow.custom_commission_bps !== undefined) {
      return { bps: Number(sellerRow.custom_commission_bps), source: 'seller_custom' };
    }
    const catRow = await tx.queryOne<{ commission_bps: number | null }>(
      'SELECT commission_bps FROM categories WHERE id = ?',
      [categoryId]
    );
    if (catRow && catRow.commission_bps !== null && catRow.commission_bps !== undefined) {
      return { bps: Number(catRow.commission_bps), source: 'category' };
    }
    const plat = await this.getPlatformSettings();
    return { bps: Number(plat.defaultCommissionBps), source: 'platform_default' };
  }

  private mapCouponRow(row: Record<string, unknown>): Coupon {
    const dType = String(row.discount_type || 'percent') as CouponDiscountType;
    const dVal = Number(row.discount_value ?? 0);
    return {
      id: String(row.id),
      code: String(row.code),
      sellerId: row.seller_id ? String(row.seller_id) : null,
      discountType: dType,
      discountValue: dVal,
      discountPercent: dType === 'percent' ? dVal : 0,
      maxDiscountUsdCents: row.max_discount_usd_cents !== null && row.max_discount_usd_cents !== undefined ? Number(row.max_discount_usd_cents) : null,
      minOrderUsdCents: Number(row.min_order_usd_cents ?? 0),
      targetType: String(row.target_type || 'all') as OfferTargetType,
      targetId: row.target_id ? String(row.target_id) : null,
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      maxUses: row.max_uses !== null && row.max_uses !== undefined ? Number(row.max_uses) : null,
      perCustomerLimit: Number(row.per_customer_limit ?? 1),
      usedCount: Number(row.used_count ?? 0),
      firstOrderOnly: Boolean(row.first_order_only),
      autoGeneratedBatch: row.auto_generated_batch ? String(row.auto_generated_batch) : null,
      startsAt: row.starts_at ? String(row.starts_at) : null,
      endsAt: row.ends_at ? String(row.ends_at) : null,
      active: Boolean(row.active),
    };
  }

  async validateCoupon(
    code: string,
    subtotalUsdCents: number,
    sellerIds: string[],
    opts?: { userId?: string | null; customerPhone?: string | null; tx?: DbTx }
  ): Promise<Coupon> {
    const db = opts?.tx || this.db;
    const clean = code.trim().toUpperCase();
    const row = await db.queryOne<Record<string, unknown>>(
      'SELECT * FROM coupons WHERE UPPER(code) = ? AND active = 1 LIMIT 1',
      [clean]
    );

    if (!row) throw new Error('Invalid or expired coupon code.');
    const coupon = this.mapCouponRow(row);

    if (!isWithinSchedule(coupon.startsAt, coupon.endsAt)) {
      throw new Error('This coupon is outside its active schedule window.');
    }
    if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) {
      throw new Error('This coupon has reached its redemption limit.');
    }
    if (subtotalUsdCents < coupon.minOrderUsdCents) {
      throw new Error(`Minimum order for ${coupon.code} is $${(coupon.minOrderUsdCents / 100).toFixed(2)}.`);
    }
    if (coupon.sellerId && !sellerIds.includes(coupon.sellerId)) {
      throw new Error(`Coupon ${coupon.code} applies only to items from its issuing store.`);
    }

    const phoneNorm = opts?.customerPhone ? normalizePhone(opts.customerPhone) : '';
    if (coupon.perCustomerLimit > 0 && (opts?.userId || phoneNorm.length >= 6)) {
      const clauses: string[] = [];
      const params: unknown[] = [coupon.id];
      if (opts?.userId) {
        clauses.push('user_id = ?');
        params.push(opts.userId);
      }
      if (phoneNorm.length >= 6) {
        clauses.push('customer_phone_norm = ?');
        params.push(phoneNorm);
      }
      const red = await db.queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM coupon_redemptions WHERE coupon_id = ? AND (${clauses.join(' OR ')})`,
        params
      );
      if (Number(red?.cnt ?? 0) >= coupon.perCustomerLimit) {
        throw new Error(`Coupon ${coupon.code} usage limit reached for your account.`);
      }
    }

    if (coupon.firstOrderOnly && (opts?.userId || phoneNorm.length >= 6)) {
      const existingOrd = opts?.userId
        ? await db.queryOne<{ id: string }>('SELECT id FROM orders WHERE user_id = ? LIMIT 1', [opts.userId])
        : await db.queryOne<{ id: string }>('SELECT id FROM orders WHERE customer_phone LIKE ? LIMIT 1', [`%${phoneNorm}`]);
      if (existingOrd) {
        throw new Error(`Coupon ${coupon.code} is valid for first-time orders only.`);
      }
    }

    return coupon;
  }

  async createOrder(
    input: {
      userId: string | null;
      customerName: string;
      customerPhone: string;
      governorate: string;
      district: string;
      town: string;
      addressNotes: string;
      paymentMethod: PaymentMethod;
      transferReference?: string;
      couponCode?: string;
      items: Array<{ productId: string; variantId: string; quantity: number }>;
    },
    ipAddress?: string
  ): Promise<Order> {
    if (!input.items || input.items.length === 0) throw new Error('Your cart is empty.');
    const settings = await this.getPlatformSettings();
    const payCfg = await this.getPaymentConfig();

    if (input.paymentMethod === 'cod' && !payCfg.codEnabled) {
      throw new Error('Cash on Delivery is currently disabled by platform settings.');
    }
    if (input.paymentMethod === 'whish_manual' && !payCfg.whishManualEnabled) {
      throw new Error('Whish / OMT transfer is not available until configured in Admin Console.');
    }

    const orderNumber = `NL-${new Date().getFullYear()}-${String(crypto.randomInt(100000, 999999))}`;
    const phoneNorm = normalizePhone(input.customerPhone);

    return this.db.transaction(async (tx) => {
      const [activeOffers, activeFlashSales] = await Promise.all([
        this.getActiveOffers(tx),
        this.getActiveFlashSales(tx),
      ]);

      let isFirstOrder = true;
      if (input.userId) {
        const prior = await tx.queryOne<{ id: string }>('SELECT id FROM orders WHERE user_id = ? LIMIT 1', [input.userId]);
        isFirstOrder = !prior;
      } else if (phoneNorm.length >= 6) {
        const prior = await tx.queryOne<{ id: string }>('SELECT id FROM orders WHERE customer_phone LIKE ? LIMIT 1', [`%${phoneNorm}`]);
        isFirstOrder = !prior;
      }

      const resolvedCartLines: Array<{
        product: Product;
        variant: ProductVariant;
        seller: Seller;
        quantity: number;
        baseUnitUsdCents: number;
      }> = [];

      for (const reqItem of input.items) {
        if (reqItem.quantity < 1) throw new Error('Invalid item quantity.');
        const pRow = await tx.queryOne<Record<string, unknown>>(
          'SELECT * FROM products WHERE id = ? AND published = 1 AND deleted_at IS NULL',
          [reqItem.productId]
        );
        if (!pRow) throw new Error('One or more items in your bag are unavailable.');
        const [product] = await this.mapProductRows([pRow], tx);
        const variant = product.variants.find((v) => v.id === reqItem.variantId);
        if (!variant) throw new Error(`Selected variant unavailable for ${product.title.en}.`);
        if (variant.stock < reqItem.quantity) {
          throw new Error(`Insufficient stock for ${product.title.en} (${variant.sku}).`);
        }

        const seller = await this.getSellerById(product.sellerId);
        if (!seller || seller.status !== 'approved') {
          throw new Error('Merchant storefront is currently unavailable.');
        }

        const stockRes = await tx.execute(
          'UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [reqItem.quantity, variant.id, reqItem.quantity]
        );
        if (stockRes.affectedRows === 0) {
          throw new Error(`Stock race conflict for ${variant.sku}; please retry.`);
        }
        await tx.execute(
          'INSERT INTO stock_movements (id, variant_id, delta, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [`stk-${crypto.randomUUID()}`, variant.id, -reqItem.quantity, 'order_reserved', orderNumber, toSqlTimestamp()]
        );

        const baseUnitUsdCents = product.basePriceUsdCents + variant.priceDeltaUsdCents;
        resolvedCartLines.push({ product, variant, seller, quantity: reqItem.quantity, baseUnitUsdCents });
      }

      const promoEval = evaluateCartPromotions(
        resolvedCartLines.map((l) => ({
          product: l.product,
          baseUnitUsdCents: l.baseUnitUsdCents,
          quantity: l.quantity,
        })),
        activeOffers,
        activeFlashSales,
        { isLoggedIn: Boolean(input.userId), isFirstOrder }
      );

      // Claim flash sale stock caps atomically
      for (let i = 0; i < promoEval.lines.length; i++) {
        const evalLine = promoEval.lines[i];
        const rawLine = resolvedCartLines[i];
        if (evalLine.appliedFlashItemId) {
          const claimRes = await tx.execute(
            'UPDATE flash_sale_items SET claimed_count = claimed_count + ? WHERE id = ? AND (stock_cap = 0 OR claimed_count + ? <= stock_cap)',
            [rawLine.quantity, evalLine.appliedFlashItemId, rawLine.quantity]
          );
          if (claimRes.affectedRows === 0) {
            throw new Error(`Flash deal stock cap reached for ${rawLine.product.title.en}; remove item or retry.`);
          }
        }
      }

      const grouped = new Map<
        string,
        {
          seller: Seller;
          items: Array<{
            product: Product;
            variant: ProductVariant;
            quantity: number;
            unitPrice: number;
            lineTotal: number;
            extraOfferDiscountUsdCents: number;
            commBps: number;
            commSource: string;
            commCents: number;
          }>;
        }
      >();

      let subtotalUsdCents = 0;
      for (let i = 0; i < resolvedCartLines.length; i++) {
        const raw = resolvedCartLines[i];
        const ev = promoEval.lines[i];
        const unitPrice = ev.effectiveUnitUsdCents;
        const lineTotal = ev.lineSubtotalUsdCents;
        const netLineTotal = Math.max(1, lineTotal - ev.extraLineDiscountUsdCents);
        const comm = await this.resolveCommissionBps(raw.seller.id, raw.product.categoryId, tx);
        const commCents = Math.round((netLineTotal * comm.bps) / 10000);
        subtotalUsdCents += lineTotal;

        const bucket = grouped.get(raw.seller.id) || { seller: raw.seller, items: [] };
        bucket.items.push({
          product: raw.product,
          variant: raw.variant,
          quantity: raw.quantity,
          unitPrice,
          lineTotal,
          extraOfferDiscountUsdCents: ev.extraLineDiscountUsdCents,
          commBps: comm.bps,
          commSource: comm.source,
          commCents,
        });
        grouped.set(raw.seller.id, bucket);
      }

      let couponRecord: Coupon | null = null;
      if (input.couponCode && input.couponCode.trim()) {
        const c = await this.validateCoupon(
          input.couponCode,
          subtotalUsdCents - promoEval.extraOfferDiscountUsdCents,
          Array.from(grouped.keys()),
          { userId: input.userId, customerPhone: input.customerPhone, tx }
        );
        couponRecord = c;
        await tx.execute('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [c.id]);
      }

      const zoneRow = await tx.queryOne<{ platform_fee_usd_cents: number }>(
        'SELECT platform_fee_usd_cents FROM delivery_zones WHERE governorate_code = ?',
        [input.governorate]
      );
      const platformZoneFee = Number(zoneRow?.platform_fee_usd_cents ?? 500);
      const waiveShipping = promoEval.freeShippingApplied || couponRecord?.discountType === 'free_shipping';

      let deliveryTotalUsdCents = 0;
      let discountTotalUsdCents = 0;
      let couponTotalUsedUsdCents = 0;
      const orderId = `ord-${crypto.randomUUID()}`;
      const createdAt = toSqlTimestamp();
      const builtSubOrders: SubOrder[] = [];

      const matchingSubOrderEntries = Array.from(grouped.entries());
      const couponTargetSubtotal = matchingSubOrderEntries.reduce((sum, [sid, b]) => {
        if (couponRecord?.sellerId && couponRecord.sellerId !== sid) return sum;
        return sum + b.items.reduce((s, i) => s + (i.lineTotal - i.extraOfferDiscountUsdCents), 0);
      }, 0);

      let fixedCouponBudget = 0;
      if (couponRecord && couponTargetSubtotal > 0) {
        if (couponRecord.discountType === 'fixed_usd_cents') {
          fixedCouponBudget = Math.min(couponTargetSubtotal - 1, Math.max(0, couponRecord.discountValue));
        } else if (couponRecord.discountType === 'percent') {
          fixedCouponBudget = Math.round((couponTargetSubtotal * couponRecord.discountValue) / 100);
        }
        if (couponRecord.maxDiscountUsdCents && fixedCouponBudget > couponRecord.maxDiscountUsdCents) {
          fixedCouponBudget = couponRecord.maxDiscountUsdCents;
        }
      }

      let distributedCoupon = 0;
      const eligibleCouponSellers = matchingSubOrderEntries.filter(
        ([sid]) => !couponRecord?.sellerId || couponRecord.sellerId === sid
      );

      for (const [sellerId, bucket] of matchingSubOrderEntries) {
        const subSubtotal = bucket.items.reduce((s, i) => s + i.lineTotal, 0);
        const subPromoDiscount = bucket.items.reduce((s, i) => s + i.extraOfferDiscountUsdCents, 0);
        const subComm = bucket.items.reduce((s, i) => s + i.commCents, 0);

        let subCouponDiscount = 0;
        if (couponRecord && fixedCouponBudget > 0 && (!couponRecord.sellerId || couponRecord.sellerId === sellerId)) {
          const netSub = Math.max(0, subSubtotal - subPromoDiscount);
          const idxInEligible = eligibleCouponSellers.findIndex(([esid]) => esid === sellerId);
          if (idxInEligible === eligibleCouponSellers.length - 1) {
            subCouponDiscount = Math.max(0, fixedCouponBudget - distributedCoupon);
          } else if (couponTargetSubtotal > 0) {
            subCouponDiscount = Math.round((fixedCouponBudget * netSub) / couponTargetSubtotal);
          }
          subCouponDiscount = Math.min(netSub, subCouponDiscount);
          distributedCoupon += subCouponDiscount;
        }

        const subDiscount = subPromoDiscount + subCouponDiscount;
        couponTotalUsedUsdCents += subCouponDiscount;

        const baseDeliveryFee =
          bucket.seller.deliveryMode === 'self'
            ? Number(bucket.seller.selfDeliveryFeesUsdCents[input.governorate] ?? platformZoneFee)
            : platformZoneFee;
        const deliveryFee = waiveShipping ? 0 : baseDeliveryFee;

        deliveryTotalUsdCents += deliveryFee;
        discountTotalUsdCents += subDiscount;

        const sellerNet = subSubtotal - subDiscount - subComm + (bucket.seller.deliveryMode === 'self' ? deliveryFee : 0);
        const subOrderId = `sub-${crypto.randomUUID()}`;

        await tx.execute(
          `INSERT INTO sub_orders (id, order_id, seller_id, status, delivery_mode, delivery_fee_usd_cents, subtotal_usd_cents, discount_usd_cents, commission_usd_cents, seller_net_usd_cents, cod_collected, updated_at)
           VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            subOrderId,
            orderId,
            sellerId,
            bucket.seller.deliveryMode,
            deliveryFee,
            subSubtotal,
            subDiscount,
            subComm,
            sellerNet,
            createdAt,
          ]
        );

        const orderItemsOut: OrderItem[] = [];
        for (const item of bucket.items) {
          const itemId = `oi-${crypto.randomUUID()}`;
          const variantLabel = `${item.variant.size ? item.variant.size + ' · ' : ''}${item.variant.color}`;
          await tx.execute(
            `INSERT INTO order_items (id, sub_order_id, product_id, variant_id, title_snapshot_json, variant_label, sku, quantity, unit_price_usd_cents, line_total_usd_cents, commission_bps_snapshot, commission_usd_cents)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              itemId,
              subOrderId,
              item.product.id,
              item.variant.id,
              JSON.stringify(item.product.title),
              variantLabel,
              item.variant.sku,
              item.quantity,
              item.unitPrice,
              item.lineTotal,
              item.commBps,
              item.commCents,
            ]
          );
          await tx.execute(
            `INSERT INTO commissions_log (id, order_item_id, seller_id, applied_bps, source_rule, amount_usd_cents, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [`cml-${crypto.randomUUID()}`, itemId, sellerId, item.commBps, item.commSource, item.commCents, createdAt]
          );
          orderItemsOut.push({
            id: itemId,
            productId: item.product.id,
            variantId: item.variant.id,
            titleSnapshot: item.product.title,
            variantLabel,
            sku: item.variant.sku,
            quantity: item.quantity,
            unitPriceUsdCents: item.unitPrice,
            lineTotalUsdCents: item.lineTotal,
            commissionBpsSnapshot: item.commBps,
            commissionUsdCents: item.commCents,
          });
        }

        await tx.execute(
          `INSERT INTO ledger_entries (id, seller_id, sub_order_id, order_number, entry_type, direction, amount_usd_cents, availability, note, created_at)
           VALUES (?, ?, ?, ?, 'ORDER_GROSS', 'credit', ?, 'pending', ?, ?)`,
          [`led-${crypto.randomUUID()}`, sellerId, subOrderId, orderNumber, subSubtotal - subDiscount, `Order ${orderNumber} gross`, createdAt]
        );
        await tx.execute(
          `INSERT INTO ledger_entries (id, seller_id, sub_order_id, order_number, entry_type, direction, amount_usd_cents, availability, note, created_at)
           VALUES (?, ?, ?, ?, 'PLATFORM_COMMISSION', 'debit', ?, 'pending', ?, ?)`,
          [`led-${crypto.randomUUID()}`, sellerId, subOrderId, orderNumber, subComm, `Platform commission on ${orderNumber}`, createdAt]
        );
        if (bucket.seller.deliveryMode === 'self' && deliveryFee > 0) {
          await tx.execute(
            `INSERT INTO ledger_entries (id, seller_id, sub_order_id, order_number, entry_type, direction, amount_usd_cents, availability, note, created_at)
             VALUES (?, ?, ?, ?, 'DELIVERY_FEE', 'credit', ?, 'pending', ?, ?)`,
            [`led-${crypto.randomUUID()}`, sellerId, subOrderId, orderNumber, deliveryFee, `Self-delivery fee on ${orderNumber}`, createdAt]
          );
        }

        builtSubOrders.push({
          id: subOrderId,
          orderId,
          sellerId,
          sellerName: bucket.seller.name,
          status: 'pending',
          deliveryMode: bucket.seller.deliveryMode,
          deliveryFeeUsdCents: deliveryFee,
          subtotalUsdCents: subSubtotal,
          discountUsdCents: subDiscount,
          commissionUsdCents: subComm,
          sellerNetUsdCents: sellerNet,
          codCollected: false,
          items: orderItemsOut,
          updatedAt: createdAt,
        });
      }

      if (couponRecord) {
        await tx.execute(
          `INSERT INTO coupon_redemptions (id, coupon_id, user_id, customer_phone_norm, order_id, discount_usd_cents, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [`cred-${crypto.randomUUID()}`, couponRecord.id, input.userId, phoneNorm || 'guest', orderId, couponTotalUsedUsdCents, createdAt]
        );
      }

      const codFeeUsdCents = input.paymentMethod === 'cod' ? Number(settings.codFeeUsdCents) : 0;
      const grandTotalUsdCents = subtotalUsdCents - discountTotalUsdCents + deliveryTotalUsdCents + codFeeUsdCents;

      const payAdapter = getPaymentAdapter(input.paymentMethod);
      const payRes = payAdapter.authorize({
        orderNumber,
        amountUsdCents: grandTotalUsdCents,
        method: input.paymentMethod,
        transferReference: input.transferReference,
        whishAccountNumber: payCfg.whishAccountNumber,
        cardEnabledInSettings: payCfg.cardEnabled,
      });

      await tx.execute(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, governorate, district, town, address_notes, payment_method, payment_status, coupon_code, exchange_rate_snapshot, subtotal_usd_cents, delivery_total_usd_cents, cod_fee_usd_cents, discount_total_usd_cents, grand_total_usd_cents, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          orderNumber,
          input.userId,
          input.customerName.trim(),
          input.customerPhone.trim(),
          input.governorate,
          input.district,
          input.town,
          input.addressNotes.trim(),
          input.paymentMethod,
          payRes.paymentStatus,
          couponRecord?.code || null,
          settings.exchangeRateLbpPerUsd,
          subtotalUsdCents,
          deliveryTotalUsdCents,
          codFeeUsdCents,
          discountTotalUsdCents,
          grandTotalUsdCents,
          createdAt,
        ]
      );

      await tx.execute(
        `INSERT INTO payments (id, order_id, method, gateway_name, reference, amount_usd_cents, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`pay-${crypto.randomUUID()}`, orderId, input.paymentMethod, payRes.gatewayName, payRes.reference, grandTotalUsdCents, payRes.paymentStatus, createdAt]
      );

      if (input.userId) {
        await this.createNotification(
          tx,
          input.userId,
          { en: `Order ${orderNumber} placed`, ar: `تم استلام الطلب ${orderNumber}` },
          {
            en: `Your order totaling $${(grandTotalUsdCents / 100).toFixed(2)} is confirmed.`,
            ar: `تم تأكيد طلبك بقيمة ${(grandTotalUsdCents / 100).toFixed(2)} دولار.`,
          }
        );
      }
      for (const [, bucket] of matchingSubOrderEntries) {
        await this.createNotification(
          tx,
          bucket.seller.userId,
          { en: `New order ${orderNumber}`, ar: `طلب جديد ${orderNumber}` },
          {
            en: `${bucket.items.length} item(s) ordered from ${bucket.seller.name.en}.`,
            ar: `تم طلب ${bucket.items.length} منتج من متجرك ${bucket.seller.name.ar}.`,
          }
        );
      }

      await writeAuditLog(tx, {
        actorUserId: input.userId,
        action: 'order.created',
        entityType: 'order',
        entityId: orderId,
        after: { orderNumber, grandTotalUsdCents, paymentMethod: input.paymentMethod },
        ipAddress,
      });

      return {
        id: orderId,
        orderNumber,
        userId: input.userId,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        governorate: input.governorate,
        district: input.district,
        town: input.town,
        addressNotes: input.addressNotes.trim(),
        paymentMethod: input.paymentMethod,
        paymentStatus: payRes.paymentStatus,
        transferReference: input.transferReference || null,
        couponCode: couponRecord?.code || null,
        exchangeRateSnapshot: settings.exchangeRateLbpPerUsd,
        subtotalUsdCents,
        deliveryTotalUsdCents,
        codFeeUsdCents,
        discountTotalUsdCents,
        grandTotalUsdCents,
        subOrders: builtSubOrders,
        createdAt,
      };
    });
  }

  private async hydrateOrders(orderRows: Record<string, unknown>[]): Promise<Order[]> {
    const out: Order[] = [];
    for (const o of orderRows) {
      const payRow = await this.db.queryOne<{ reference: string | null }>(
        'SELECT reference FROM payments WHERE order_id = ? LIMIT 1',
        [o.id]
      );
      const subRows = await this.db.query<Record<string, unknown>>(
        `SELECT so.*, st.name_json AS seller_name_json
         FROM sub_orders so
         LEFT JOIN stores st ON st.seller_id = so.seller_id
         WHERE so.order_id = ?`,
        [o.id]
      );
      const subOrders: SubOrder[] = [];
      for (const sr of subRows) {
        const itemRows = await this.db.query<Record<string, unknown>>(
          'SELECT * FROM order_items WHERE sub_order_id = ?',
          [sr.id]
        );
        subOrders.push({
          id: String(sr.id),
          orderId: String(sr.order_id),
          sellerId: String(sr.seller_id),
          sellerName: parseJson<LocalizedText>(sr.seller_name_json, { en: 'Store', ar: 'متجر' }),
          status: String(sr.status) as SubOrderStatus,
          deliveryMode: String(sr.delivery_mode) as DeliveryMode,
          deliveryFeeUsdCents: Number(sr.delivery_fee_usd_cents),
          subtotalUsdCents: Number(sr.subtotal_usd_cents),
          discountUsdCents: Number(sr.discount_usd_cents),
          commissionUsdCents: Number(sr.commission_usd_cents),
          sellerNetUsdCents: Number(sr.seller_net_usd_cents),
          codCollected: Boolean(sr.cod_collected),
          courierName: sr.courier_name ? String(sr.courier_name) : null,
          trackingCode: sr.tracking_code ? String(sr.tracking_code) : null,
          items: itemRows.map((ir) => ({
            id: String(ir.id),
            productId: String(ir.product_id),
            variantId: String(ir.variant_id),
            titleSnapshot: parseJson<LocalizedText>(ir.title_snapshot_json, { en: '', ar: '' }),
            variantLabel: String(ir.variant_label),
            sku: String(ir.sku),
            quantity: Number(ir.quantity),
            unitPriceUsdCents: Number(ir.unit_price_usd_cents),
            lineTotalUsdCents: Number(ir.line_total_usd_cents),
            commissionBpsSnapshot: Number(ir.commission_bps_snapshot),
            commissionUsdCents: Number(ir.commission_usd_cents),
          })),
          updatedAt: String(sr.updated_at),
        });
      }

      out.push({
        id: String(o.id),
        orderNumber: String(o.order_number),
        userId: o.user_id ? String(o.user_id) : null,
        customerName: String(o.customer_name),
        customerPhone: String(o.customer_phone),
        governorate: String(o.governorate),
        district: String(o.district),
        town: String(o.town),
        addressNotes: String(o.address_notes),
        paymentMethod: String(o.payment_method) as PaymentMethod,
        paymentStatus: String(o.payment_status) as PaymentStatus,
        transferReference: payRow?.reference || null,
        couponCode: o.coupon_code ? String(o.coupon_code) : null,
        exchangeRateSnapshot: Number(o.exchange_rate_snapshot),
        subtotalUsdCents: Number(o.subtotal_usd_cents),
        deliveryTotalUsdCents: Number(o.delivery_total_usd_cents),
        codFeeUsdCents: Number(o.cod_fee_usd_cents),
        discountTotalUsdCents: Number(o.discount_total_usd_cents),
        grandTotalUsdCents: Number(o.grand_total_usd_cents),
        subOrders,
        createdAt: String(o.created_at),
      });
    }
    return out;
  }

  async lookupOrders(input: { user?: AuthContextUser; orderNumber?: string; phone?: string }): Promise<Order[]> {
    const orderNum = (input.orderNumber || '').trim();
    if (input.user) {
      if (orderNum) {
        const rows = await this.db.query<Record<string, unknown>>(
          'SELECT * FROM orders WHERE UPPER(order_number) = UPPER(?) AND user_id = ? ORDER BY created_at DESC',
          [orderNum, input.user.id]
        );
        return this.hydrateOrders(rows);
      }
      const rows = await this.db.query<Record<string, unknown>>(
        'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
        [input.user.id]
      );
      return this.hydrateOrders(rows);
    }

    // Guest lookup MUST match both orderNumber AND normalized phone digits (no blind leak)
    if (!orderNum || !input.phone) return [];
    const normSubmitted = normalizePhone(input.phone);
    if (normSubmitted.length < 6) return [];

    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM orders WHERE UPPER(order_number) = UPPER(?) LIMIT 5',
      [orderNum]
    );
    const matching = rows.filter((r) => normalizePhone(String(r.customer_phone)) === normSubmitted);
    return this.hydrateOrders(matching);
  }

  async addVerifiedReview(input: { productId: string; userId: string; rating: number; comment: string }): Promise<Review> {
    if (input.rating < 1 || input.rating > 5) throw new Error('Rating must be between 1 and 5.');
    if (input.comment.trim().length < 4) throw new Error('Please write at least a few words.');

    return this.db.transaction(async (tx) => {
      const prod = await tx.queryOne<{ id: string; seller_id: string }>('SELECT id, seller_id FROM products WHERE id = ?', [
        input.productId,
      ]);
      if (!prod) throw new Error('Product not found.');

      const purchase = await tx.queryOne<{ id: string }>(
        `SELECT o.id FROM orders o
         INNER JOIN sub_orders so ON so.order_id = o.id
         INNER JOIN order_items oi ON oi.sub_order_id = so.id
         WHERE o.user_id = ? AND oi.product_id = ? AND so.status IN ('confirmed', 'packed', 'shipped', 'delivered')
         LIMIT 1`,
        [input.userId, input.productId]
      );
      if (!purchase) {
        throw new Error('Verified buyer requirement: purchase and confirm this product before reviewing.');
      }

      const userRow = await tx.queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [input.userId]);
      const id = `rev-${crypto.randomUUID()}`;
      const now = toSqlTimestamp();

      await tx.execute(
        `INSERT INTO reviews (id, product_id, seller_id, user_id, rating, comment, verified_buyer, moderation_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'approved', ?)`,
        [id, input.productId, prod.seller_id, input.userId, Math.round(input.rating), input.comment.trim(), now]
      );

      // Recalculate product & store ratings
      const pStats = await tx.queryOne<{ avg_r: number; cnt: number }>(
        "SELECT AVG(rating) AS avg_r, COUNT(*) AS cnt FROM reviews WHERE product_id = ? AND moderation_status = 'approved'",
        [input.productId]
      );
      await tx.execute('UPDATE products SET rating_avg_x10 = ?, review_count = ? WHERE id = ?', [
        Math.round(Number(pStats?.avg_r || 0) * 10),
        Number(pStats?.cnt || 0),
        input.productId,
      ]);

      const sStats = await tx.queryOne<{ avg_r: number; cnt: number }>(
        "SELECT AVG(rating) AS avg_r, COUNT(*) AS cnt FROM reviews WHERE seller_id = ? AND moderation_status = 'approved'",
        [prod.seller_id]
      );
      await tx.execute('UPDATE stores SET rating_avg_x10 = ?, review_count = ? WHERE seller_id = ?', [
        Math.round(Number(sStats?.avg_r || 0) * 10),
        Number(sStats?.cnt || 0),
        prod.seller_id,
      ]);

      return {
        id,
        productId: input.productId,
        sellerId: prod.seller_id,
        userId: input.userId,
        authorName: userRow?.name || 'Verified Buyer',
        rating: Math.round(input.rating),
        comment: input.comment.trim(),
        verifiedBuyer: true,
        createdAt: now,
      };
    });
  }

  // --- Seller Workspace & Operations ---
  async registerSeller(input: {
    ownerName: string;
    email: string;
    phone: string;
    password: string;
    storeNameEn: string;
    storeNameAr?: string;
    department: 'fashion' | 'electronics' | 'home-gadgets';
    governorate: string;
    district: string;
    commercialRegRef: string;
    payoutMethod: 'whish' | 'omt' | 'bank';
    payoutAccount: string;
    ipAddress?: string;
  }) {
    const pwErr = validatePasswordStrength(input.password);
    if (pwErr) throw new Error(pwErr);
    const emailNorm = input.email.trim().toLowerCase();

    return this.db.transaction(async (tx) => {
      const dup = await tx.queryOne<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ?', [emailNorm]);
      if (dup) throw new Error('An account with this email already exists.');

      const userId = `usr-${crypto.randomUUID()}`;
      const sellerId = `sel-${crypto.randomUUID()}`;
      const storeId = `str-${crypto.randomUUID()}`;
      const slugBase = input.storeNameEn
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'store';
      const slug = `${slugBase}-${crypto.randomInt(100, 999)}`;
      const now = toSqlTimestamp();
      const nextDue = toSqlTimestamp(new Date(Date.now() + 30 * 86_400_000));

      await tx.execute(
        `INSERT INTO users (id, name, email, phone, password_hash, role_key, preferred_locale, preferred_currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'seller_owner', 'en', 'USD', ?, ?)`,
        [userId, input.ownerName.trim(), emailNorm, input.phone.trim(), hashPassword(input.password), now, now]
      );

      await tx.execute(
        `INSERT INTO sellers (id, owner_user_id, business_type, legal_name, commercial_reg_ref, governorate, district, city_address, phone, whatsapp_phone, status, verified, payout_method, payout_account, onboarding_step, created_at, updated_at)
         VALUES (?, ?, 'business', ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, 2, ?, ?)`,
        [
          sellerId,
          userId,
          input.storeNameEn.trim(),
          input.commercialRegRef.trim(),
          input.governorate,
          input.district,
          input.district,
          input.phone.trim(),
          normalizePhone(input.phone),
          input.payoutMethod,
          input.payoutAccount.trim(),
          now,
          now,
        ]
      );

      await tx.execute(
        `INSERT INTO stores (id, seller_id, slug, name_json, tagline_json, about_json, department_slug, theme_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'obsidian-ember', ?, ?)`,
        [
          storeId,
          sellerId,
          slug,
          JSON.stringify({ en: input.storeNameEn.trim(), ar: (input.storeNameAr || input.storeNameEn).trim() }),
          JSON.stringify({ en: 'Independent Lebanese merchant on NileLink', ar: 'متجر لبناني مستقل على نايل لينك' }),
          JSON.stringify({ en: 'Store profile awaiting final setup.', ar: 'ملف المتجر قيد الاستكمال.' }),
          input.department,
          now,
          now,
        ]
      );

      await tx.execute(
        `INSERT INTO store_settings (store_id, delivery_mode, self_delivery_fees_json, processing_hours, vacation_mode)
         VALUES (?, 'platform', '{}', 24, 0)`,
        [storeId]
      );

      await tx.execute(
        `INSERT INTO subscriptions (id, seller_id, plan_tier, status, next_due_at, created_at)
         VALUES (?, ?, 'free', 'active', ?, ?)`,
        [`subp-${crypto.randomUUID()}`, sellerId, nextDue, now]
      );

      await writeAuditLog(tx, {
        actorUserId: userId,
        action: 'seller.register',
        entityType: 'seller',
        entityId: sellerId,
        after: { storeName: input.storeNameEn.trim(), slug, status: 'pending' },
        ipAddress: input.ipAddress,
      });

      const seller = await this.mapSellerRow(
        (await tx.queryOne<Record<string, unknown>>(
          `SELECT sel.*, st.slug, st.name_json, st.tagline_json, st.about_json, st.announcement_json,
                  st.department_slug, st.theme_id, st.logo_media_id, st.banner_media_id, st.rating_avg_x10, st.review_count,
                  ss.delivery_mode, ss.self_delivery_fees_json, ss.processing_hours, ss.vacation_mode, ss.return_policy_json, ss.seo_title, ss.seo_description
           FROM sellers sel INNER JOIN stores st ON st.seller_id = sel.id LEFT JOIN store_settings ss ON ss.store_id = st.id
           WHERE sel.id = ?`,
          [sellerId]
        ))!,
        tx
      );

      return {
        user: { id: userId, name: input.ownerName.trim(), email: emailNorm, roleKey: 'seller_owner' as const, sellerId },
        seller,
      };
    });
  }

  async attachSellerDocument(sellerId: string, docType: string, mediaId: string) {
    const id = `doc-${crypto.randomUUID()}`;
    await this.db.execute(
      'INSERT INTO seller_documents (id, seller_id, doc_type, media_id, review_status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, sellerId, docType, mediaId, 'pending', toSqlTimestamp()]
    );
    return { id, sellerId, docType, mediaId, reviewStatus: 'pending' };
  }

  async getSellerBalance(sellerId: string) {
    const rows = await this.db.query<{
      id: string;
      seller_id: string;
      sub_order_id: string | null;
      order_number: string | null;
      entry_type: LedgerEntry['type'];
      direction: 'credit' | 'debit';
      amount_usd_cents: number;
      availability: LedgerEntry['availability'];
      note: string;
      created_at: string;
    }>('SELECT * FROM ledger_entries WHERE seller_id = ? ORDER BY created_at DESC', [sellerId]);

    const entries: LedgerEntry[] = rows.map((r) => ({
      id: r.id,
      sellerId: r.seller_id,
      subOrderId: r.sub_order_id,
      orderNumber: r.order_number,
      type: r.entry_type,
      direction: r.direction,
      amountUsdCents: Number(r.amount_usd_cents),
      availability: r.availability,
      note: r.note,
      createdAt: String(r.created_at),
    }));

    let pendingUsdCents = 0;
    let availableUsdCents = 0;
    let totalGrossUsdCents = 0;
    let totalCommissionUsdCents = 0;
    let totalPaidOutUsdCents = 0;

    for (const e of entries) {
      const signed = e.direction === 'credit' ? e.amountUsdCents : -e.amountUsdCents;
      if (e.availability === 'pending') pendingUsdCents += signed;
      if (e.availability === 'available') availableUsdCents += signed;
      if (e.type === 'ORDER_GROSS') totalGrossUsdCents += e.amountUsdCents;
      if (e.type === 'PLATFORM_COMMISSION') totalCommissionUsdCents += e.amountUsdCents;
      if (e.type === 'PAYOUT_SETTLED') totalPaidOutUsdCents += e.amountUsdCents;
    }

    const payoutRows = await this.db.query<{ amount_usd_cents: number }>(
      "SELECT amount_usd_cents FROM payouts WHERE seller_id = ? AND status = 'pending'",
      [sellerId]
    );
    const reservedForPayoutsUsdCents = payoutRows.reduce((s, p) => s + Number(p.amount_usd_cents), 0);

    return {
      pendingUsdCents,
      availableUsdCents,
      reservedForPayoutsUsdCents,
      totalGrossUsdCents,
      totalCommissionUsdCents,
      totalPaidOutUsdCents,
      entries,
    };
  }

  async getSellerWorkspace(sellerId: string) {
    const seller = await this.getSellerById(sellerId);
    if (!seller) throw new Error('Seller not found.');

    const prodRows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM products WHERE seller_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [sellerId]
    );
    const products = await this.mapProductRows(prodRows);

    const subRows = await this.db.query<Record<string, unknown>>(
      `SELECT so.*, o.order_number, o.customer_name, o.customer_phone, o.governorate, o.district, o.town, o.payment_method, o.payment_status, st.name_json AS seller_name_json
       FROM sub_orders so
       INNER JOIN orders o ON o.id = so.order_id
       LEFT JOIN stores st ON st.seller_id = so.seller_id
       WHERE so.seller_id = ?
       ORDER BY o.created_at DESC`,
      [sellerId]
    );

    const subOrders = [];
    for (const sr of subRows) {
      const itemRows = await this.db.query<Record<string, unknown>>('SELECT * FROM order_items WHERE sub_order_id = ?', [
        sr.id,
      ]);
      subOrders.push({
        id: String(sr.id),
        orderId: String(sr.order_id),
        sellerId: String(sr.seller_id),
        sellerName: parseJson<LocalizedText>(sr.seller_name_json, seller.name),
        status: String(sr.status) as SubOrderStatus,
        deliveryMode: String(sr.delivery_mode) as DeliveryMode,
        deliveryFeeUsdCents: Number(sr.delivery_fee_usd_cents),
        subtotalUsdCents: Number(sr.subtotal_usd_cents),
        discountUsdCents: Number(sr.discount_usd_cents),
        commissionUsdCents: Number(sr.commission_usd_cents),
        sellerNetUsdCents: Number(sr.seller_net_usd_cents),
        codCollected: Boolean(sr.cod_collected),
        courierName: sr.courier_name ? String(sr.courier_name) : null,
        trackingCode: sr.tracking_code ? String(sr.tracking_code) : null,
        items: itemRows.map((ir) => ({
          id: String(ir.id),
          productId: String(ir.product_id),
          variantId: String(ir.variant_id),
          titleSnapshot: parseJson<LocalizedText>(ir.title_snapshot_json, { en: '', ar: '' }),
          variantLabel: String(ir.variant_label),
          sku: String(ir.sku),
          quantity: Number(ir.quantity),
          unitPriceUsdCents: Number(ir.unit_price_usd_cents),
          lineTotalUsdCents: Number(ir.line_total_usd_cents),
          commissionBpsSnapshot: Number(ir.commission_bps_snapshot),
          commissionUsdCents: Number(ir.commission_usd_cents),
        })),
        updatedAt: String(sr.updated_at),
        orderNumber: String(sr.order_number),
        customerName: String(sr.customer_name),
        customerPhone: String(sr.customer_phone),
        governorate: String(sr.governorate),
        district: String(sr.district),
        town: String(sr.town),
        paymentMethod: String(sr.payment_method),
        paymentStatus: String(sr.payment_status),
      });
    }

    const balance = await this.getSellerBalance(sellerId);

    const payoutRows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM payouts WHERE seller_id = ? ORDER BY created_at DESC',
      [sellerId]
    );
    const payouts: PayoutRequest[] = payoutRows.map((p) => ({
      id: String(p.id),
      sellerId: String(p.seller_id),
      sellerName: seller.name,
      amountUsdCents: Number(p.amount_usd_cents),
      method: String(p.method) as PayoutRequest['method'],
      accountDetails: String(p.account_details),
      status: String(p.status) as PayoutRequest['status'],
      referenceCode: p.reference_code ? String(p.reference_code) : null,
      createdAt: String(p.created_at),
      settledAt: p.settled_at ? String(p.settled_at) : null,
    }));

    const couponRows = await this.db.query<Record<string, unknown>>('SELECT * FROM coupons WHERE seller_id = ?', [sellerId]);
    const coupons: Coupon[] = couponRows.map((c) => this.mapCouponRow(c));

    const docs = await this.db.query<{
      id: string;
      doc_type: string;
      media_id: string;
      review_status: string;
      reviewer_note: string | null;
      public_url: string;
      created_at: string;
    }>(
      `SELECT d.id, d.doc_type, d.media_id, d.review_status, d.reviewer_note, m.public_url, d.created_at
       FROM seller_documents d INNER JOIN media m ON m.id = d.media_id
       WHERE d.seller_id = ? ORDER BY d.created_at DESC`,
      [sellerId]
    );

    const reviews = await this.getReviewsForSeller(sellerId);
    const catId = `cat-${seller.department === 'home-gadgets' ? 'home' : seller.department}`;
    const commissionInfo = await this.resolveCommissionBps(seller.id, catId);

    const stockMovementRows = await this.db.query<{
      id: string;
      variant_id: string;
      sku: string;
      title_json: string;
      delta: number;
      reason: string;
      reference_id: string | null;
      created_at: string;
    }>(
      `SELECT sm.id, sm.variant_id, pv.sku, p.title_json, sm.delta, sm.reason, sm.reference_id, sm.created_at
       FROM stock_movements sm
       INNER JOIN product_variants pv ON pv.id = sm.variant_id
       INNER JOIN products p ON p.id = pv.product_id
       WHERE p.seller_id = ?
       ORDER BY sm.created_at DESC
       LIMIT 60`,
      [sellerId]
    );
    const stockMovements: StockMovementItem[] = stockMovementRows.map((sm) => ({
      id: sm.id,
      variantId: sm.variant_id,
      sku: sm.sku,
      productTitle: parseJson<LocalizedText>(sm.title_json, { en: sm.sku, ar: sm.sku }),
      delta: Number(sm.delta),
      reason: sm.reason,
      referenceId: sm.reference_id,
      createdAt: String(sm.created_at),
    }));

    const returnRows = await this.db.query<Record<string, unknown>>(
      `SELECT r.*, o.order_number, so.seller_id
       FROM returns r
       INNER JOIN sub_orders so ON so.id = r.sub_order_id
       INNER JOIN orders o ON o.id = so.order_id
       WHERE so.seller_id = ?
       ORDER BY r.created_at DESC`,
      [sellerId]
    );
    const returnsList: ReturnRequest[] = returnRows.map((r) => ({
      id: String(r.id),
      subOrderId: String(r.sub_order_id),
      userId: String(r.user_id),
      reason: String(r.reason),
      status: String(r.status) as ReturnRequest['status'],
      refundUsdCents: Number(r.refund_usd_cents || 0),
      createdAt: String(r.created_at),
      orderNumber: r.order_number ? String(r.order_number) : undefined,
      sellerId: String(r.seller_id),
    }));

    const disputeRows = await this.db.query<Record<string, unknown>>(
      `SELECT d.*, o.order_number, so.seller_id
       FROM disputes d
       INNER JOIN sub_orders so ON so.id = d.sub_order_id
       INNER JOIN orders o ON o.id = so.order_id
       WHERE so.seller_id = ?
       ORDER BY d.created_at DESC`,
      [sellerId]
    );
    const disputesList: OrderDispute[] = disputeRows.map((d) => ({
      id: String(d.id),
      subOrderId: String(d.sub_order_id),
      openedByUserId: String(d.opened_by_user_id),
      reason: String(d.reason),
      status: String(d.status) as OrderDispute['status'],
      resolutionNote: d.resolution_note ? String(d.resolution_note) : null,
      createdAt: String(d.created_at),
      orderNumber: d.order_number ? String(d.order_number) : undefined,
      sellerId: String(d.seller_id),
    }));

    const [
      subscriptionPlans,
      deliveryZones,
      sellerOffers,
      sellerPromoRules,
      categories,
      brands,
      attributes,
      sellerStaff,
      notifications,
    ] = await Promise.all([
      this.getSubscriptionPlans(),
      this.getDeliveryZones(),
      this.sellerListOffers(sellerId),
      this.getSellerPromoRules(),
      this.getCategories(),
      this.getBrands(),
      this.getAttributes(),
      this.listSellerStaff(sellerId),
      this.getUserNotifications(seller.userId),
    ]);

    return {
      seller,
      products,
      subOrders,
      balance,
      payouts,
      coupons,
      offers: sellerOffers,
      sellerPromoRules,
      reviews,
      documents: docs.map((d) => ({
        id: d.id,
        doc_type: d.doc_type,
        media_id: d.media_id,
        review_status: d.review_status,
        reviewer_note: d.reviewer_note,
        public_url: d.public_url,
        created_at: String(d.created_at),
      })),
      commissionInfo,
      subscriptionPlans,
      deliveryZones,
      categories,
      brands,
      attributes,
      stockMovements,
      sellerStaff,
      returns: returnsList,
      disputes: disputesList,
      notifications,
    };
  }

  async updateSellerProfile(
    sellerId: string,
    actorUserId: string,
    patch: {
      taglineEn?: string;
      taglineAr?: string;
      aboutEn?: string;
      aboutAr?: string;
      announcementEn?: string;
      announcementAr?: string;
      returnPolicyEn?: string;
      returnPolicyAr?: string;
      processingHours?: number;
      vacationMode?: boolean;
      seoTitle?: string;
      seoDescription?: string;
      storefrontTheme?: StorefrontThemeId;
      deliveryMode?: DeliveryMode;
      selfDeliveryFeesUsdCents?: Record<string, number>;
      payoutMethod?: 'whish' | 'omt' | 'bank';
      payoutAccount?: string;
      whatsappPhone?: string;
      bannerMediaId?: string;
      logoMediaId?: string;
    },
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const storeRow = await tx.queryOne<{
        id: string;
        tagline_json: string;
        about_json: string;
        announcement_json: string | null;
      }>('SELECT id, tagline_json, about_json, announcement_json FROM stores WHERE seller_id = ?', [sellerId]);
      if (!storeRow) throw new Error('Store not found.');

      const currTagline = parseJson<LocalizedText>(storeRow.tagline_json, { en: '', ar: '' });
      const currAbout = parseJson<LocalizedText>(storeRow.about_json, { en: '', ar: '' });
      const currAnn = storeRow.announcement_json ? parseJson<LocalizedText>(storeRow.announcement_json, { en: '', ar: '' }) : { en: '', ar: '' };
      const nextTagline = {
        en: patch.taglineEn !== undefined ? patch.taglineEn : currTagline.en,
        ar: patch.taglineAr !== undefined ? patch.taglineAr : currTagline.ar,
      };
      const nextAbout = {
        en: patch.aboutEn !== undefined ? patch.aboutEn : currAbout.en,
        ar: patch.aboutAr !== undefined ? patch.aboutAr : currAbout.ar,
      };
      const hasAnnChange = patch.announcementEn !== undefined || patch.announcementAr !== undefined;
      const nextAnn = hasAnnChange
        ? {
            en: patch.announcementEn !== undefined ? patch.announcementEn : currAnn.en,
            ar: patch.announcementAr !== undefined ? patch.announcementAr : currAnn.ar,
          }
        : null;

      await tx.execute(
        `UPDATE stores SET tagline_json = ?, about_json = ?,
         announcement_json = COALESCE(?, announcement_json),
         theme_id = COALESCE(?, theme_id),
         banner_media_id = COALESCE(?, banner_media_id),
         logo_media_id = COALESCE(?, logo_media_id),
         updated_at = ?
         WHERE id = ?`,
        [
          JSON.stringify(nextTagline),
          JSON.stringify(nextAbout),
          nextAnn ? JSON.stringify(nextAnn) : null,
          patch.storefrontTheme || null,
          patch.bannerMediaId || null,
          patch.logoMediaId || null,
          toSqlTimestamp(),
          storeRow.id,
        ]
      );

      const settingsRow = await tx.queryOne<{
        delivery_mode: string;
        self_delivery_fees_json: string;
        processing_hours: number;
        vacation_mode: number | boolean;
        return_policy_json: string | null;
        seo_title: string | null;
        seo_description: string | null;
      }>('SELECT * FROM store_settings WHERE store_id = ?', [storeRow.id]);

      const currRet = settingsRow?.return_policy_json
        ? parseJson<LocalizedText>(settingsRow.return_policy_json, { en: '', ar: '' })
        : { en: '', ar: '' };
      const nextRet =
        patch.returnPolicyEn !== undefined || patch.returnPolicyAr !== undefined
          ? {
              en: patch.returnPolicyEn !== undefined ? patch.returnPolicyEn : currRet.en,
              ar: patch.returnPolicyAr !== undefined ? patch.returnPolicyAr : currRet.ar,
            }
          : currRet;

      const nextFees =
        patch.selfDeliveryFeesUsdCents !== undefined
          ? patch.selfDeliveryFeesUsdCents
          : parseJson<Record<string, number>>(settingsRow?.self_delivery_fees_json, {});

      await tx.execute(
        `UPDATE store_settings
         SET delivery_mode = ?, self_delivery_fees_json = ?, processing_hours = ?, vacation_mode = ?, return_policy_json = ?, seo_title = ?, seo_description = ?
         WHERE store_id = ?`,
        [
          patch.deliveryMode || settingsRow?.delivery_mode || 'platform',
          JSON.stringify(nextFees),
          patch.processingHours !== undefined ? Math.max(1, Math.min(360, Math.trunc(patch.processingHours))) : Number(settingsRow?.processing_hours ?? 24),
          patch.vacationMode !== undefined ? (patch.vacationMode ? 1 : 0) : settingsRow?.vacation_mode ? 1 : 0,
          JSON.stringify(nextRet),
          patch.seoTitle !== undefined ? patch.seoTitle.trim() || null : settingsRow?.seo_title ?? null,
          patch.seoDescription !== undefined ? patch.seoDescription.trim() || null : settingsRow?.seo_description ?? null,
          storeRow.id,
        ]
      );

      if (patch.payoutMethod || patch.payoutAccount !== undefined || patch.whatsappPhone !== undefined) {
        await tx.execute(
          `UPDATE sellers
           SET payout_method = COALESCE(?, payout_method),
               payout_account = COALESCE(?, payout_account),
               whatsapp_phone = COALESCE(?, whatsapp_phone),
               updated_at = ?
           WHERE id = ?`,
          [
            patch.payoutMethod || null,
            patch.payoutAccount !== undefined ? patch.payoutAccount.trim() : null,
            patch.whatsappPhone !== undefined ? patch.whatsappPhone.trim() : null,
            toSqlTimestamp(),
            sellerId,
          ]
        );
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'seller.update_storefront',
        entityType: 'store',
        entityId: storeRow.id,
        after: patch,
        ipAddress,
      });

      const updatedSellerRow = await tx.queryOne<Record<string, unknown>>(
        `SELECT sel.*, st.slug, st.name_json, st.tagline_json, st.about_json, st.announcement_json,
                st.department_slug, st.theme_id, st.logo_media_id, st.banner_media_id, st.rating_avg_x10, st.review_count,
                ss.delivery_mode, ss.self_delivery_fees_json, ss.processing_hours, ss.vacation_mode, ss.return_policy_json, ss.seo_title, ss.seo_description
         FROM sellers sel INNER JOIN stores st ON st.seller_id = sel.id LEFT JOIN store_settings ss ON ss.store_id = st.id
         WHERE sel.id = ? LIMIT 1`,
        [sellerId]
      );
      return updatedSellerRow ? this.mapSellerRow(updatedSellerRow, tx) : null;
    });
  }

  async createSellerProduct(
    sellerId: string,
    actorUserId: string,
    input: {
      titleEn: string;
      titleAr?: string;
      subtitleEn?: string;
      subtitleAr?: string;
      descriptionEn?: string;
      descriptionAr?: string;
      basePriceUsdCents: number;
      compareAtUsdCents?: number | null;
      department?: 'fashion' | 'electronics' | 'home-gadgets';
      categoryId?: string;
      brandId?: string | null;
      specs?: ProductSpec[];
      model3dUrl?: string | null;
      sku: string;
      size?: string;
      color?: string;
      colorHex?: string;
      stock: number;
      variants?: Array<{ sku: string; size?: string; color?: string; colorHex?: string; stock: number; priceDeltaUsdCents?: number }>;
      mediaIds?: string[];
      published?: boolean;
    },
    ipAddress?: string
  ) {
    if (!Number.isInteger(input.basePriceUsdCents) || input.basePriceUsdCents <= 0) {
      throw new Error('Price must be a positive integer in USD cents.');
    }
    const seller = await this.getSellerById(sellerId);
    if (!seller) throw new Error('Seller not found.');

    return this.db.transaction(async (tx) => {
      const planRow = await tx.queryOne<{ product_limit: number | null }>(
        'SELECT product_limit FROM subscription_plans WHERE tier = ?',
        [seller.subscriptionTier]
      );
      if (planRow && planRow.product_limit !== null) {
        const cntRow = await tx.queryOne<{ cnt: number }>(
          'SELECT COUNT(*) AS cnt FROM products WHERE seller_id = ? AND deleted_at IS NULL',
          [sellerId]
        );
        if (Number(cntRow?.cnt ?? 0) >= Number(planRow.product_limit)) {
          throw new Error(`Your ${seller.subscriptionTier.toUpperCase()} plan limit (${planRow.product_limit} SKUs) has been reached.`);
        }
      }

      const prodId = `prd-${crypto.randomUUID()}`;
      const slugBase = input.titleEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
      const slug = `${slugBase}-${crypto.randomInt(1000, 9999)}`;
      const dept = input.department || seller.department;
      const categoryId = input.categoryId?.trim() || `cat-${dept === 'home-gadgets' ? 'home' : dept}`;
      const now = toSqlTimestamp();

      await tx.execute(
        `INSERT INTO products (id, seller_id, category_id, brand_id, department, slug, title_json, subtitle_json, description_json, specs_json, base_price_usd_cents, compare_at_usd_cents, seller_currency, moderation_status, published, featured, model_3d_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', 'approved', ?, 0, ?, ?, ?)`,
        [
          prodId,
          sellerId,
          categoryId,
          input.brandId || null,
          dept,
          slug,
          JSON.stringify({ en: input.titleEn.trim(), ar: (input.titleAr || input.titleEn).trim() }),
          JSON.stringify({ en: (input.subtitleEn || '').trim(), ar: (input.subtitleAr || input.subtitleEn || '').trim() }),
          JSON.stringify({ en: (input.descriptionEn || input.titleEn).trim(), ar: (input.descriptionAr || input.titleAr || input.titleEn).trim() }),
          JSON.stringify(input.specs || []),
          input.basePriceUsdCents,
          input.compareAtUsdCents || null,
          input.published === false ? 0 : 1,
          input.model3dUrl?.trim() || null,
          now,
          now,
        ]
      );

      const variantsInput =
        input.variants && input.variants.length > 0
          ? input.variants
          : [
              {
                sku: input.sku,
                size: input.size,
                color: input.color,
                colorHex: input.colorHex,
                stock: input.stock,
                priceDeltaUsdCents: 0,
              },
            ];

      for (const v of variantsInput) {
        const varId = `var-${crypto.randomUUID()}`;
        const vStock = Math.max(0, Math.trunc(v.stock));
        await tx.execute(
          `INSERT INTO product_variants (id, product_id, sku, size, color, color_hex, stock, price_delta_usd_cents)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            varId,
            prodId,
            v.sku.trim(),
            v.size?.trim() || null,
            (v.color || 'Default').trim(),
            v.colorHex || '#1C1D21',
            vStock,
            Math.trunc(v.priceDeltaUsdCents || 0),
          ]
        );
        await tx.execute(
          'INSERT INTO stock_movements (id, variant_id, delta, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [`stk-${crypto.randomUUID()}`, varId, vStock, 'initial_stock', prodId, now]
        );
      }

      if (input.mediaIds && input.mediaIds.length > 0) {
        for (const mId of input.mediaIds) {
          await tx.execute('UPDATE media SET entity_id = ? WHERE id = ? AND owner_user_id = ?', [
            prodId,
            mId,
            actorUserId,
          ]);
        }
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'seller.create_product',
        entityType: 'product',
        entityId: prodId,
        after: { sku: input.sku.trim(), basePriceUsdCents: input.basePriceUsdCents },
        ipAddress,
      });

      const created = await tx.queryOne<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', [prodId]);
      const [mapped] = await this.mapProductRows([created!], tx);
      return mapped;
    });
  }

  async toggleProductPublished(sellerId: string, productId: string, actorUserId: string, ipAddress?: string) {
    const row = await this.db.queryOne<Record<string, unknown>>(
      'SELECT * FROM products WHERE id = ? AND seller_id = ? AND deleted_at IS NULL',
      [productId, sellerId]
    );
    if (!row) throw new Error('Product not found.');
    const nextPub = row.published ? 0 : 1;
    await this.db.execute('UPDATE products SET published = ?, updated_at = ? WHERE id = ?', [
      nextPub,
      toSqlTimestamp(),
      productId,
    ]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'seller.toggle_product',
      entityType: 'product',
      entityId: productId,
      after: { published: Boolean(nextPub) },
      ipAddress,
    });
    const updated = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', [productId]);
    const [mapped] = await this.mapProductRows([updated!]);
    return mapped;
  }

  async updateSubOrderStatus(
    subOrderId: string,
    actor: AuthContextUser,
    patch: { status?: SubOrderStatus; codCollected?: boolean; courierName?: string; trackingCode?: string },
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const sub = await tx.queryOne<Record<string, unknown>>('SELECT * FROM sub_orders WHERE id = ?', [subOrderId]);
      if (!sub) throw new Error('Sub-order not found.');
      const isAdmin = actor.roleKey === 'admin_super' || actor.roleKey === 'admin_staff';
      if (!isAdmin && sub.seller_id !== actor.sellerId) {
        throw new Error('Unauthorized sub-order access.');
      }

      const nextStatus = patch.status || (String(sub.status) as SubOrderStatus);
      const nextCod = patch.codCollected !== undefined ? (patch.codCollected ? 1 : 0) : Number(sub.cod_collected);
      const now = toSqlTimestamp();
      const deliveredAt = nextStatus === 'delivered' && !sub.delivered_at ? now : sub.delivered_at;

      await tx.execute(
        `UPDATE sub_orders SET status = ?, cod_collected = ?, courier_name = COALESCE(?, courier_name), tracking_code = COALESCE(?, tracking_code), delivered_at = ?, updated_at = ? WHERE id = ?`,
        [nextStatus, nextCod, patch.courierName || null, patch.trackingCode || null, deliveredAt, now, subOrderId]
      );

      if (patch.codCollected && !sub.cod_collected) {
        const orderRow = await tx.queryOne<{ order_number: string }>('SELECT order_number FROM orders WHERE id = ?', [
          sub.order_id,
        ]);
        await tx.execute(
          `INSERT INTO ledger_entries (id, seller_id, sub_order_id, order_number, entry_type, direction, amount_usd_cents, availability, note, created_at)
           VALUES (?, ?, ?, ?, 'COD_COLLECTED', 'credit', 0, 'pending', ?, ?)`,
          [
            `led-${crypto.randomUUID()}`,
            sub.seller_id,
            subOrderId,
            orderRow?.order_number || null,
            `COD collected on ${orderRow?.order_number || subOrderId}`,
            now,
          ]
        );
      }

      if (patch.status && patch.status !== sub.status) {
        const orderRow = await tx.queryOne<{ order_number: string; user_id: string | null }>(
          'SELECT order_number, user_id FROM orders WHERE id = ?',
          [sub.order_id]
        );
        if (orderRow?.user_id) {
          await this.createNotification(
            tx,
            orderRow.user_id,
            {
              en: `Order ${orderRow.order_number} update: ${nextStatus}`,
              ar: `تحديث الطلب ${orderRow.order_number}: ${nextStatus}`,
            },
            {
              en: `Shipment status changed to ${nextStatus}${patch.trackingCode ? ` (Tracking: ${patch.trackingCode})` : ''}.`,
              ar: `تم تحديث حالة الشحنة إلى ${nextStatus}${patch.trackingCode ? ` (رمز التتبع: ${patch.trackingCode})` : ''}.`,
            }
          );
        }
      }

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: 'sub_order.update',
        entityType: 'sub_order',
        entityId: subOrderId,
        before: { status: sub.status, codCollected: Boolean(sub.cod_collected) },
        after: { status: nextStatus, codCollected: Boolean(nextCod) },
        ipAddress,
      });

      return tx.queryOne('SELECT * FROM sub_orders WHERE id = ?', [subOrderId]);
    });
  }

  async createCoupon(
    sellerId: string | null,
    actorUserId: string,
    input: {
      code: string;
      discountType?: CouponDiscountType;
      discountPercent?: number;
      discountValue?: number;
      maxDiscountUsdCents?: number | null;
      minOrderUsdCents?: number;
      targetType?: OfferTargetType;
      targetId?: string | null;
      campaignId?: string | null;
      maxUses?: number | null;
      perCustomerLimit?: number;
      firstOrderOnly?: boolean;
      autoGeneratedBatch?: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
      active?: boolean;
    },
    ipAddress?: string
  ): Promise<Coupon> {
    const clean = input.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (clean.length < 3) throw new Error('Coupon code must be at least 3 alphanumeric characters.');
    const discountType: CouponDiscountType = input.discountType || 'percent';
    const rawVal = input.discountValue ?? input.discountPercent ?? 10;
    const discountValue = discountType === 'free_shipping' ? 0 : Math.round(rawVal);

    if (discountType === 'percent' && (discountValue < 1 || discountValue > 90)) {
      throw new Error('Discount percent must be 1–90%.');
    }
    if (discountType === 'fixed_usd_cents' && discountValue < 50) {
      throw new Error('Fixed USD coupon discount must be at least $0.50 (50 cents).');
    }

    const dup = await this.db.queryOne<{ id: string }>('SELECT id FROM coupons WHERE UPPER(code) = ?', [clean]);
    if (dup) throw new Error(`Coupon code ${clean} already exists.`);

    const id = `cpn-${crypto.randomUUID()}`;
    await this.db.execute(
      `INSERT INTO coupons (id, code, seller_id, discount_type, discount_value, max_discount_usd_cents, min_order_usd_cents, target_type, target_id, campaign_id, max_uses, per_customer_limit, used_count, first_order_only, auto_generated_batch, starts_at, ends_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      [
        id,
        clean,
        sellerId,
        discountType,
        discountValue,
        input.maxDiscountUsdCents ? Math.max(1, Math.trunc(input.maxDiscountUsdCents)) : null,
        Math.max(0, Math.trunc(input.minOrderUsdCents || 0)),
        input.targetType || 'all',
        input.targetId?.trim() || null,
        input.campaignId?.trim() || null,
        input.maxUses ? Math.max(1, Math.trunc(input.maxUses)) : null,
        Math.max(1, Math.trunc(input.perCustomerLimit ?? 1)),
        input.firstOrderOnly ? 1 : 0,
        input.autoGeneratedBatch || null,
        input.startsAt ? toSqlTimestamp(new Date(input.startsAt)) : null,
        input.endsAt ? toSqlTimestamp(new Date(input.endsAt)) : null,
        input.active === false ? 0 : 1,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'coupon.created',
      entityType: 'coupon',
      entityId: id,
      after: { code: clean, discountType, discountValue, sellerId },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM coupons WHERE id = ?', [id]);
    return this.mapCouponRow(row!);
  }

  async adminGenerateBulkCoupons(
    actorUserId: string,
    input: {
      prefix: string;
      count: number;
      discountType: CouponDiscountType;
      discountValue: number;
      minOrderUsdCents?: number;
      maxDiscountUsdCents?: number | null;
      perCustomerLimit?: number;
      maxUsesPerCode?: number | null;
      startsAt?: string | null;
      endsAt?: string | null;
      campaignId?: string | null;
    },
    ipAddress?: string
  ): Promise<{ batchId: string; created: Coupon[] }> {
    const safePrefix = input.prefix.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'NL';
    const qty = Math.min(200, Math.max(1, Math.trunc(input.count)));
    const batchId = `batch-${crypto.randomUUID().slice(0, 8)}`;
    const created: Coupon[] = [];
    for (let i = 0; i < qty; i++) {
      const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      const code = `${safePrefix}-${suffix}`;
      const c = await this.createCoupon(
        null,
        actorUserId,
        {
          code,
          discountType: input.discountType,
          discountValue: input.discountValue,
          minOrderUsdCents: input.minOrderUsdCents,
          maxDiscountUsdCents: input.maxDiscountUsdCents,
          perCustomerLimit: input.perCustomerLimit ?? 1,
          maxUses: input.maxUsesPerCode ?? 1,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          campaignId: input.campaignId,
          autoGeneratedBatch: batchId,
        },
        ipAddress
      );
      created.push(c);
    }
    return { batchId, created };
  }

  async adminImportCouponsCsv(actorUserId: string, csvText: string, ipAddress?: string): Promise<{ imported: number; skipped: string[] }> {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    let imported = 0;
    const skipped: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (i === 0 && cols[0]?.toLowerCase() === 'code') continue;
      const code = (cols[0] || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      const dType = (cols[1] as CouponDiscountType) || 'percent';
      const dVal = Math.round(Number(cols[2] || 10));
      const minOrderCents = Math.max(0, Math.round(Number(cols[3] || 0) * 100));
      const maxUses = cols[4] ? Math.max(1, Math.trunc(Number(cols[4]))) : null;
      const perCust = cols[5] ? Math.max(1, Math.trunc(Number(cols[5]))) : 1;
      if (!code || code.length < 3 || Number.isNaN(dVal)) {
        skipped.push(cols[0] || `row_${i + 1}`);
        continue;
      }
      try {
        await this.createCoupon(
          null,
          actorUserId,
          {
            code,
            discountType: ['percent', 'fixed_usd_cents', 'free_shipping'].includes(dType) ? dType : 'percent',
            discountValue: dType === 'fixed_usd_cents' && dVal < 100 ? dVal * 100 : dVal,
            minOrderUsdCents: minOrderCents,
            maxUses,
            perCustomerLimit: perCust,
          },
          ipAddress
        );
        imported++;
      } catch {
        skipped.push(code);
      }
    }
    return { imported, skipped };
  }

  async adminExportCouponsCsv(): Promise<string> {
    const rows = await this.db.query<Record<string, unknown>>('SELECT * FROM coupons ORDER BY code ASC');
    const safeCsvCell = (raw: string) => {
      const s = String(raw ?? '');
      const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${neutralized.replace(/"/g, '""')}"`;
    };
    const header = 'code,discount_type,discount_value,min_order_usd,max_uses,per_customer_limit,used_count,active';
    const body = rows.map((r) => {
      const c = this.mapCouponRow(r);
      return [
        safeCsvCell(c.code),
        safeCsvCell(c.discountType),
        String(c.discountValue),
        (c.minOrderUsdCents / 100).toFixed(2),
        c.maxUses ?? '',
        String(c.perCustomerLimit),
        String(c.usedCount),
        c.active ? '1' : '0',
      ].join(',');
    });
    return [header, ...body].join('\n');
  }

  async adminUpdateCoupon(
    id: string,
    actorUserId: string,
    patch: Partial<{ active: boolean; maxUses: number | null; endsAt: string | null }>,
    ipAddress?: string
  ): Promise<Coupon> {
    const existing = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM coupons WHERE id = ?', [id]);
    if (!existing) throw new Error('Coupon not found.');
    await this.db.execute('UPDATE coupons SET active = ?, max_uses = ?, ends_at = ? WHERE id = ?', [
      patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active ? 1 : 0,
      patch.maxUses !== undefined ? patch.maxUses : existing.max_uses,
      patch.endsAt !== undefined ? (patch.endsAt ? toSqlTimestamp(new Date(patch.endsAt)) : null) : existing.ends_at,
      id,
    ]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'coupon.updated',
      entityType: 'coupon',
      entityId: id,
      after: patch,
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM coupons WHERE id = ?', [id]);
    return this.mapCouponRow(row!);
  }

  async adminDeleteCoupon(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM coupons WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'coupon.deleted',
      entityType: 'coupon',
      entityId: id,
      ipAddress,
    });
  }

  async requestPayout(sellerId: string, actorUserId: string, amountUsdCents: number, ipAddress?: string) {
    if (!Number.isInteger(amountUsdCents) || amountUsdCents < 1000) {
      throw new Error('Minimum payout request is $10.00.');
    }
    const seller = await this.getSellerById(sellerId);
    if (!seller) throw new Error('Seller not found.');

    return this.db.transaction(async (tx) => {
      const bal = await this.getSellerBalance(sellerId);
      const withdrawable = bal.availableUsdCents - bal.reservedForPayoutsUsdCents;
      if (amountUsdCents > withdrawable) {
        throw new Error(`Requested payout exceeds available balance ($${(withdrawable / 100).toFixed(2)}).`);
      }
      const id = `payreq-${crypto.randomUUID()}`;
      const now = toSqlTimestamp();
      await tx.execute(
        `INSERT INTO payouts (id, seller_id, amount_usd_cents, method, account_details, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        [id, sellerId, amountUsdCents, seller.payoutMethod, seller.payoutAccount, now]
      );
      await writeAuditLog(tx, {
        actorUserId,
        action: 'payout.requested',
        entityType: 'payout',
        entityId: id,
        after: { sellerId, amountUsdCents },
        ipAddress,
      });
      return {
        id,
        sellerId,
        sellerName: seller.name,
        amountUsdCents,
        method: seller.payoutMethod,
        accountDetails: seller.payoutAccount,
        status: 'pending' as const,
        createdAt: now,
      };
    });
  }

  async replyToReview(sellerId: string, reviewId: string, reply: string) {
    const rev = await this.db.queryOne<{ id: string }>('SELECT id FROM reviews WHERE id = ? AND seller_id = ?', [
      reviewId,
      sellerId,
    ]);
    if (!rev) throw new Error('Review not found.');
    await this.db.execute('UPDATE reviews SET seller_reply = ? WHERE id = ?', [reply.trim(), reviewId]);
    return this.db.queryOne('SELECT * FROM reviews WHERE id = ?', [reviewId]);
  }

  // --- Admin Console ---
  async getAdminOverview() {
    const [settings, paymentsConfig, categories, brands, attributes, deliveryZones, subscriptionPlans, pages, menus] =
      await Promise.all([
        this.getPlatformSettings(),
        this.getPaymentConfig(),
        this.getCategories(),
        this.getBrands(),
        this.getAttributes(),
        this.getDeliveryZones(),
        this.getSubscriptionPlans(),
        this.getAllPages(),
        this.adminListMenus(),
      ]);

    const sellerRows = await this.db.query<Record<string, unknown>>(
      `SELECT sel.*, st.slug, st.name_json, st.tagline_json, st.about_json, st.announcement_json,
              st.department_slug, st.theme_id, st.logo_media_id, st.banner_media_id, st.rating_avg_x10, st.review_count,
              ss.delivery_mode, ss.self_delivery_fees_json, ss.processing_hours, ss.vacation_mode, ss.return_policy_json, ss.seo_title, ss.seo_description
       FROM sellers sel
       INNER JOIN stores st ON st.seller_id = sel.id
       LEFT JOIN store_settings ss ON ss.store_id = st.id
       WHERE sel.deleted_at IS NULL ORDER BY sel.created_at DESC`
    );
    const sellers: Seller[] = [];
    for (const r of sellerRows) sellers.push(await this.mapSellerRow(r));

    const prodRows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM products WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200'
    );
    const products = await this.mapProductRows(prodRows);

    const sellerDocRows = await this.db.query<{
      id: string;
      seller_id: string;
      doc_type: string;
      media_id: string;
      public_url: string;
      review_status: string;
      reviewer_note: string | null;
      created_at: string;
    }>(
      `SELECT d.id, d.seller_id, d.doc_type, d.media_id, m.public_url, d.review_status, d.reviewer_note, d.created_at
       FROM seller_documents d
       INNER JOIN media m ON m.id = d.media_id
       ORDER BY d.created_at DESC LIMIT 100`
    );
    const sellerDocuments: SellerDocumentReview[] = sellerDocRows.map((d) => ({
      id: d.id,
      sellerId: d.seller_id,
      docType: d.doc_type,
      mediaId: d.media_id,
      publicUrl: d.public_url,
      reviewStatus: d.review_status as SellerDocumentReview['reviewStatus'],
      reviewerNote: d.reviewer_note,
      createdAt: String(d.created_at),
    }));

    const orderRows = await this.db.query<Record<string, unknown>>('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
    const orders = await this.hydrateOrders(orderRows);

    const returnRows = await this.db.query<Record<string, unknown>>(
      `SELECT r.*, o.order_number, so.seller_id
       FROM returns r
       INNER JOIN sub_orders so ON so.id = r.sub_order_id
       INNER JOIN orders o ON o.id = so.order_id
       ORDER BY r.created_at DESC LIMIT 100`
    );
    const returnsList: ReturnRequest[] = returnRows.map((r) => ({
      id: String(r.id),
      subOrderId: String(r.sub_order_id),
      userId: String(r.user_id),
      reason: String(r.reason),
      status: String(r.status) as ReturnRequest['status'],
      refundUsdCents: Number(r.refund_usd_cents || 0),
      createdAt: String(r.created_at),
      orderNumber: r.order_number ? String(r.order_number) : undefined,
      sellerId: r.seller_id ? String(r.seller_id) : undefined,
    }));

    const disputeRows = await this.db.query<Record<string, unknown>>(
      `SELECT d.*, o.order_number, so.seller_id
       FROM disputes d
       INNER JOIN sub_orders so ON so.id = d.sub_order_id
       INNER JOIN orders o ON o.id = so.order_id
       ORDER BY d.created_at DESC LIMIT 100`
    );
    const disputesList: OrderDispute[] = disputeRows.map((d) => ({
      id: String(d.id),
      subOrderId: String(d.sub_order_id),
      openedByUserId: String(d.opened_by_user_id),
      reason: String(d.reason),
      status: String(d.status) as OrderDispute['status'],
      resolutionNote: d.resolution_note ? String(d.resolution_note) : null,
      createdAt: String(d.created_at),
      orderNumber: d.order_number ? String(d.order_number) : undefined,
      sellerId: d.seller_id ? String(d.seller_id) : undefined,
    }));

    const ticketRows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 100'
    );
    const supportTickets: SupportTicket[] = ticketRows.map((t) => ({
      id: String(t.id),
      userId: t.user_id ? String(t.user_id) : null,
      email: String(t.email),
      subject: String(t.subject),
      message: String(t.message),
      status: String(t.status) as SupportTicket['status'],
      createdAt: String(t.created_at),
    }));

    const reviewRows = await this.db.query<{
      id: string;
      product_id: string;
      seller_id: string;
      user_id: string;
      author_name: string;
      rating: number;
      comment: string;
      verified_buyer: number | boolean;
      seller_reply: string | null;
      moderation_status: string;
      product_title_json: string | null;
      created_at: string;
    }>(
      `SELECT r.*, u.name AS author_name, p.title_json AS product_title_json
       FROM reviews r
       INNER JOIN users u ON u.id = r.user_id
       LEFT JOIN products p ON p.id = r.product_id
       ORDER BY r.created_at DESC LIMIT 100`
    );
    const reviews: Review[] = reviewRows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      sellerId: r.seller_id,
      userId: r.user_id,
      authorName: r.author_name,
      rating: Number(r.rating),
      comment: r.comment,
      verifiedBuyer: Boolean(r.verified_buyer),
      sellerReply: r.seller_reply || undefined,
      moderationStatus: (r.moderation_status || 'approved') as Review['moderationStatus'],
      productTitle: r.product_title_json ? parseJson<LocalizedText>(r.product_title_json, { en: r.product_id, ar: r.product_id }) : undefined,
      createdAt: String(r.created_at),
    }));

    const emailTplRows = await this.db.query<{
      key?: string;
      subject_json: string;
      body_json: string;
      updated_at: string;
    }>(`SELECT ${this.keyCol()} AS tpl_key, subject_json, body_json, updated_at FROM email_templates ORDER BY ${this.keyCol()} ASC`);
    const emailTemplates: EmailTemplateItem[] = emailTplRows.map((et) => ({
      key: String((et as unknown as { tpl_key: string }).tpl_key),
      subject: parseJson<LocalizedText>(et.subject_json, { en: '', ar: '' }),
      body: parseJson<LocalizedText>(et.body_json, { en: '', ar: '' }),
      updatedAt: String(et.updated_at),
    }));

    const payoutRows = await this.db.query<Record<string, unknown>>('SELECT * FROM payouts ORDER BY created_at DESC LIMIT 100');
    const payouts: PayoutRequest[] = payoutRows.map((p) => {
      const sel = sellers.find((s) => s.id === p.seller_id);
      return {
        id: String(p.id),
        sellerId: String(p.seller_id),
        sellerName: sel?.name || { en: 'Seller', ar: 'بائع' },
        amountUsdCents: Number(p.amount_usd_cents),
        method: String(p.method) as PayoutRequest['method'],
        accountDetails: String(p.account_details),
        status: String(p.status) as PayoutRequest['status'],
        referenceCode: p.reference_code ? String(p.reference_code) : null,
        createdAt: String(p.created_at),
        settledAt: p.settled_at ? String(p.settled_at) : null,
      };
    });

    const couponRows = await this.db.query<Record<string, unknown>>('SELECT * FROM coupons ORDER BY code ASC');
    const coupons: Coupon[] = couponRows.map((c) => this.mapCouponRow(c));

    const ledgerRows = await this.db.query<Record<string, unknown>>('SELECT * FROM ledger_entries ORDER BY created_at DESC LIMIT 50');
    const ledger: LedgerEntry[] = ledgerRows.map((r) => ({
      id: String(r.id),
      sellerId: String(r.seller_id),
      subOrderId: r.sub_order_id ? String(r.sub_order_id) : null,
      orderNumber: r.order_number ? String(r.order_number) : null,
      type: String(r.entry_type) as LedgerEntry['type'],
      direction: String(r.direction) as 'credit' | 'debit',
      amountUsdCents: Number(r.amount_usd_cents),
      availability: String(r.availability) as LedgerEntry['availability'],
      note: String(r.note),
      createdAt: String(r.created_at),
    }));

    const auditRows = await this.db.query<Record<string, unknown>>('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 60');
    const auditLog: AuditLogEntry[] = auditRows.map((a) => ({
      id: String(a.id),
      actorUserId: a.actor_user_id ? String(a.actor_user_id) : null,
      action: String(a.action),
      entityType: String(a.entity_type),
      entityId: String(a.entity_id),
      beforeJson: a.before_json ? String(a.before_json) : null,
      afterJson: a.after_json ? String(a.after_json) : null,
      ipAddress: a.ip_address ? String(a.ip_address) : null,
      createdAt: String(a.created_at),
    }));

    const staffRows = await this.db.query<{ id: string; name: string; email: string; role_key: string; totp_enabled: number | boolean; created_at: string }>(
      "SELECT id, name, email, role_key, totp_enabled, created_at FROM users WHERE role_key IN ('admin_super', 'admin_staff') AND deleted_at IS NULL ORDER BY created_at ASC"
    );
    const staffUsers = [];
    for (const u of staffRows) {
      const perms = await this.db.query<{ permission_key: string }>('SELECT permission_key FROM user_permissions WHERE user_id = ?', [
        u.id,
      ]);
      staffUsers.push({
        id: u.id,
        name: u.name,
        email: u.email,
        roleKey: u.role_key,
        totpEnabled: Boolean(u.totp_enabled),
        permissions: perms.map((p) => p.permission_key),
        createdAt: String(u.created_at),
      });
    }

    const userSummaryRows = await this.db.query<{
      id: string;
      name: string;
      email: string;
      phone: string;
      role_key: string;
      is_blocked: number | boolean;
      totp_enabled: number | boolean;
      created_at: string;
    }>(
      'SELECT id, name, email, phone, role_key, is_blocked, totp_enabled, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 120'
    );
    const users = [];
    for (const u of userSummaryRows) {
      const perms = await this.db.query<{ permission_key: string }>('SELECT permission_key FROM user_permissions WHERE user_id = ?', [
        u.id,
      ]);
      users.push({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        roleKey: u.role_key,
        isBlocked: Boolean(u.is_blocked),
        totpEnabled: Boolean(u.totp_enabled),
        permissions: perms.map((p) => p.permission_key),
        createdAt: String(u.created_at),
      });
    }

    const recentJobs = await this.db.query('SELECT id, job_type, status, attempts, last_error, created_at FROM jobs ORDER BY created_at DESC LIMIT 25');
    const emailLog = await this.db.query('SELECT * FROM email_log ORDER BY created_at DESC LIMIT 25');
    const errorLog = await this.db.query('SELECT id, route, message, created_at FROM error_log ORDER BY created_at DESC LIMIT 25');

    const prodCnt = await this.db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM products WHERE deleted_at IS NULL');
    const totalGmvUsdCents = orders.reduce((sum, o) => sum + o.subtotalUsdCents - o.discountTotalUsdCents, 0);
    const totalCommissionUsdCents = orders.reduce(
      (sum, o) => sum + o.subOrders.reduce((sSum, sub) => sSum + sub.commissionUsdCents, 0),
      0
    );
    const activeSubsUsdCents = sellers
      .filter((s) => s.status === 'approved')
      .reduce((sum, s) => {
        const plan = subscriptionPlans.find((p) => p.tier === s.subscriptionTier);
        return sum + (plan?.monthlyFeeUsdCents || 0);
      }, 0);

    const [
      homeBuilderData,
      bannersList,
      popupsList,
      featuredPlacementsList,
      offersList,
      flashSalesList,
      campaignsList,
      segmentsList,
      emailCampaignsList,
      automationFlowsList,
      newsletterSubscribersList,
      sellerPromoRules,
      marketingAnalytics,
    ] = await Promise.all([
      this.adminListHomeSections(),
      this.adminListBanners(),
      this.adminListPopups(),
      this.adminListFeaturedPlacements(),
      this.adminListOffers(),
      this.adminListFlashSales(),
      this.adminListCampaigns(),
      this.adminListSegments(),
      this.adminListEmailCampaigns(),
      this.adminListAutomationFlows(),
      this.adminListNewsletterSubscribers(),
      this.getSellerPromoRules(),
      this.getMarketingAnalytics(),
    ]);

    return {
      metrics: {
        totalGmvUsdCents,
        totalCommissionUsdCents,
        activeSubsUsdCents,
        ordersCount: orders.length,
        sellersCount: sellers.length,
        productsCount: Number(prodCnt?.cnt ?? 0),
      },
      settings,
      paymentsConfig,
      categories,
      brands,
      attributes,
      sellers,
      products,
      sellerDocuments,
      orders,
      returns: returnsList,
      disputes: disputesList,
      supportTickets,
      reviews,
      emailTemplates,
      payouts,
      coupons,
      deliveryZones,
      subscriptionPlans,
      ledger,
      pages,
      menus,
      homeSections: homeBuilderData.sections,
      homeSectionVersions: homeBuilderData.versionsBySectionId,
      banners: bannersList,
      popups: popupsList,
      featuredPlacements: featuredPlacementsList,
      offers: offersList,
      flashSales: flashSalesList,
      campaigns: campaignsList,
      segments: segmentsList,
      emailCampaigns: emailCampaignsList,
      automationFlows: automationFlowsList,
      newsletterSubscribers: newsletterSubscribersList,
      sellerPromoRules,
      marketingAnalytics,
      auditLog,
      staffUsers,
      users,
      recentJobs,
      emailLog,
      errorLog,
    };
  }

  async adminUpdateSeller(
    sellerId: string,
    actorUserId: string,
    patch: {
      status?: SellerStatus;
      verified?: boolean;
      customCommissionBps?: number | null;
      subscriptionTier?: SubscriptionTier;
    },
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const prev = await tx.queryOne<{ status: string; owner_user_id: string }>('SELECT status, owner_user_id FROM sellers WHERE id = ?', [
        sellerId,
      ]);
      if (!prev) throw new Error('Seller not found.');

      const now = toSqlTimestamp();
      await tx.execute(
        `UPDATE sellers SET
         status = COALESCE(?, status),
         verified = COALESCE(?, verified),
         custom_commission_bps = ?,
         updated_at = ?
         WHERE id = ?`,
        [
          patch.status || null,
          patch.verified !== undefined ? (patch.verified ? 1 : 0) : null,
          patch.customCommissionBps !== undefined ? patch.customCommissionBps : null,
          now,
          sellerId,
        ]
      );

      if (patch.subscriptionTier) {
        await tx.execute(
          'UPDATE subscriptions SET plan_tier = ? WHERE seller_id = ?',
          [patch.subscriptionTier, sellerId]
        );
      }

      if (patch.status && patch.status !== prev.status) {
        await this.createNotification(
          tx,
          prev.owner_user_id,
          { en: `Store status: ${patch.status}`, ar: `حالة المتجر: ${patch.status}` },
          {
            en: `Your merchant account status was updated to ${patch.status}.`,
            ar: `تم تحديث حالة حساب متجرك إلى ${patch.status}.`,
          }
        );
      }

      if (patch.status === 'approved' && prev.status !== 'approved') {
        const owner = await tx.queryOne<{ email: string; preferred_locale: string }>('SELECT email, preferred_locale FROM users WHERE id = ?', [
          prev.owner_user_id,
        ]);
        const store = await tx.queryOne<{ name_json: string }>('SELECT name_json FROM stores WHERE seller_id = ?', [
          sellerId,
        ]);
        if (owner) {
          const storeName = parseJson<LocalizedText>(store?.name_json, { en: 'Store', ar: 'متجر' });
          await queueEmail(tx, {
            to: owner.email,
            templateKey: 'seller_approved',
            locale: owner.preferred_locale === 'ar' ? 'ar' : 'en',
            vars: { storeName: storeName.en },
          });
        }
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.update_seller',
        entityType: 'seller',
        entityId: sellerId,
        before: { status: prev.status },
        after: patch,
        ipAddress,
      });

      const updatedRow = await tx.queryOne<Record<string, unknown>>(
        `SELECT sel.*, st.slug, st.name_json, st.tagline_json, st.about_json, st.announcement_json,
                st.department_slug, st.theme_id, st.logo_media_id, st.banner_media_id, st.rating_avg_x10, st.review_count,
                ss.delivery_mode, ss.self_delivery_fees_json, ss.processing_hours, ss.vacation_mode, ss.return_policy_json, ss.seo_title, ss.seo_description
         FROM sellers sel INNER JOIN stores st ON st.seller_id = sel.id LEFT JOIN store_settings ss ON ss.store_id = st.id
         WHERE sel.id = ? LIMIT 1`,
        [sellerId]
      );
      return updatedRow ? this.mapSellerRow(updatedRow, tx) : null;
    });
  }

  async adminUpdateSettings(
    actorUserId: string,
    patch: {
      platform?: Partial<PlatformSettings>;
      payments?: Partial<PaymentConfig>;
    },
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const kCol = this.keyCol();
      if (patch.platform) {
        const curr = await this.getPlatformSettings();
        const next = { ...curr, ...patch.platform };
        await tx.execute(`UPDATE settings SET value_json = ?, updated_at = ? WHERE ${kCol} = 'platform'`, [
          JSON.stringify(next),
          toSqlTimestamp(),
        ]);
      }
      if (patch.payments) {
        const row = await tx.queryOne<{ value_json: string }>(`SELECT value_json FROM settings WHERE ${kCol} = 'payments'`);
        const curr = parseJson<Record<string, unknown>>(row?.value_json, {});
        const next = { ...curr, ...patch.payments };
        await tx.execute(`UPDATE settings SET value_json = ?, updated_at = ? WHERE ${kCol} = 'payments'`, [
          JSON.stringify(next),
          toSqlTimestamp(),
        ]);
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.update_settings',
        entityType: 'settings',
        entityId: 'global',
        after: patch,
        ipAddress,
      });

      return { settings: await this.getPlatformSettings(), paymentsConfig: await this.getPaymentConfig() };
    });
  }

  async adminVerifyOrderPayment(orderId: string, actorUserId: string, status: 'paid' | 'failed', ipAddress?: string) {
    return this.db.transaction(async (tx) => {
      const orderRow = await tx.queryOne<{ id: string; payment_status: string }>('SELECT id, payment_status FROM orders WHERE id = ?', [
        orderId,
      ]);
      if (!orderRow) throw new Error('Order not found.');
      await tx.execute('UPDATE orders SET payment_status = ? WHERE id = ?', [status, orderId]);
      await tx.execute('UPDATE payments SET status = ?, verified_by_user_id = ? WHERE order_id = ?', [
        status,
        actorUserId,
        orderId,
      ]);
      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.verify_payment',
        entityType: 'order',
        entityId: orderId,
        before: { paymentStatus: orderRow.payment_status },
        after: { paymentStatus: status },
        ipAddress,
      });
      const updated = await tx.query<Record<string, unknown>>('SELECT * FROM orders WHERE id = ?', [orderId]);
      const [hydrated] = await this.hydrateOrders(updated);
      return hydrated;
    });
  }

  async adminSettlePayout(payoutId: string, actorUserId: string, referenceCode: string, ipAddress?: string) {
    if (referenceCode.trim().length < 3) throw new Error('Transfer reference code is required.');
    return this.db.transaction(async (tx) => {
      const pay = await tx.queryOne<{ id: string; seller_id: string; amount_usd_cents: number; status: string }>(
        'SELECT id, seller_id, amount_usd_cents, status FROM payouts WHERE id = ?',
        [payoutId]
      );
      if (!pay) throw new Error('Payout request not found.');
      if (pay.status === 'paid') throw new Error('Payout already settled.');

      const now = toSqlTimestamp();
      await tx.execute(
        "UPDATE payouts SET status = 'paid', reference_code = ?, settled_by_user_id = ?, settled_at = ? WHERE id = ?",
        [referenceCode.trim(), actorUserId, now, payoutId]
      );

      await tx.execute(
        `INSERT INTO ledger_entries (id, seller_id, entry_type, direction, amount_usd_cents, availability, note, created_at)
         VALUES (?, ?, 'PAYOUT_SETTLED', 'debit', ?, 'settled', ?, ?)`,
        [`led-${crypto.randomUUID()}`, pay.seller_id, pay.amount_usd_cents, `Payout settled (${referenceCode.trim()})`, now]
      );

      const owner = await tx.queryOne<{ id: string; email: string; preferred_locale: string }>(
        `SELECT u.id, u.email, u.preferred_locale FROM sellers s INNER JOIN users u ON u.id = s.owner_user_id WHERE s.id = ?`,
        [pay.seller_id]
      );
      if (owner) {
        await this.createNotification(
          tx,
          owner.id,
          { en: `Payout settled ($${(Number(pay.amount_usd_cents) / 100).toFixed(2)})`, ar: `تم تحويل أرباحك ($${(Number(pay.amount_usd_cents) / 100).toFixed(2)})` },
          { en: `Transfer reference: ${referenceCode.trim()}`, ar: `مرجع التحويل: ${referenceCode.trim()}` }
        );
        await queueEmail(tx, {
          to: owner.email,
          templateKey: 'payout_paid',
          locale: owner.preferred_locale === 'ar' ? 'ar' : 'en',
          vars: { amount: `$${(Number(pay.amount_usd_cents) / 100).toFixed(2)}`, reference: referenceCode.trim() },
        });
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.settle_payout',
        entityType: 'payout',
        entityId: payoutId,
        after: { referenceCode: referenceCode.trim(), amountUsdCents: pay.amount_usd_cents },
        ipAddress,
      });

      return tx.queryOne('SELECT * FROM payouts WHERE id = ?', [payoutId]);
    });
  }

  async adminUpdatePage(
    slug: string,
    actorUserId: string,
    patch: { titleEn?: string; titleAr?: string; bodyEn?: string; bodyAr?: string; published?: boolean },
    ipAddress?: string
  ) {
    const existing = await this.db.queryOne<{ id: string; title_json: string; body_json: string; published: number | boolean }>(
      'SELECT * FROM pages WHERE slug = ?',
      [slug]
    );
    if (!existing) throw new Error('Page not found.');
    const currTitle = parseJson<LocalizedText>(existing.title_json, { en: slug, ar: slug });
    const currBody = parseJson<LocalizedText>(existing.body_json, { en: '', ar: '' });
    const nextTitle = {
      en: patch.titleEn !== undefined ? patch.titleEn : currTitle.en,
      ar: patch.titleAr !== undefined ? patch.titleAr : currTitle.ar,
    };
    const nextBody = {
      en: patch.bodyEn !== undefined ? patch.bodyEn : currBody.en,
      ar: patch.bodyAr !== undefined ? patch.bodyAr : currBody.ar,
    };
    await this.db.execute(
      'UPDATE pages SET title_json = ?, body_json = ?, published = ?, updated_at = ? WHERE id = ?',
      [
        JSON.stringify(nextTitle),
        JSON.stringify(nextBody),
        patch.published !== undefined ? (patch.published ? 1 : 0) : existing.published ? 1 : 0,
        toSqlTimestamp(),
        existing.id,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_page',
      entityType: 'page',
      entityId: existing.id,
      after: { slug },
      ipAddress,
    });
    return this.getPageBySlug(slug);
  }

  // --- Home Builder v2: Sections, Page Snapshots, Templates, Chrome/SEO, Media Library ---
  private mapHomeSectionRow(row: Record<string, unknown>): HomeSection {
    const legacyAudience = String(row.audience || 'all') as HomeSectionAudience;
    const targeting = normalizeTargeting(
      row.targeting_json ? parseJson<HomeSectionTargeting | null>(row.targeting_json, null) : null,
      legacyAudience
    );
    const style = parseJson<HomeSectionStyle>(row.style_json, { surface: 'graphite', padding: 'standard' });
    return {
      id: String(row.id),
      sectionType: mapLegacySectionType(String(row.section_type)),
      title: parseJson<LocalizedText>(row.title_json, { en: '', ar: '' }),
      content: parseJson<Record<string, unknown>>(row.content_json, {}),
      sortOrder: Number(row.sort_order ?? 0),
      status: String(row.status || 'draft') as HomeSectionStatus,
      visible: row.visible === undefined || row.visible === null ? true : Boolean(row.visible),
      audience: legacyAudience,
      targeting,
      style,
      schedulePriority: Number(row.schedule_priority ?? 0),
      startsAt: row.starts_at ? String(row.starts_at) : null,
      endsAt: row.ends_at ? String(row.ends_at) : null,
      version: Number(row.version ?? 1),
      updatedByUserId: row.updated_by_user_id ? String(row.updated_by_user_id) : null,
      updatedAt: String(row.updated_at),
    };
  }

  async getSiteChrome(draft = false): Promise<SiteChromeSettings> {
    if (!draft && this.publishedChromeCache && Date.now() - this.publishedChromeCache.cachedAt < 60_000) {
      return this.publishedChromeCache.value;
    }
    const key = draft ? 'site_chrome_draft' : 'site_chrome_published';
    const row = await this.db.queryOne<{ value_json: string }>(
      `SELECT value_json FROM settings WHERE ${this.keyCol()} = ?`,
      [key]
    );
    const parsed = parseJson<SiteChromeSettings>(row?.value_json, DEFAULT_SITE_CHROME);
    const merged: SiteChromeSettings = {
      ...DEFAULT_SITE_CHROME,
      ...parsed,
      homeSeo: {
        ...DEFAULT_SITE_CHROME.homeSeo,
        ...(parsed.homeSeo || {}),
      },
    };
    if (!draft) {
      this.publishedChromeCache = { value: merged, cachedAt: Date.now() };
    }
    return merged;
  }

  async getPublicHomeSections(ctx?: {
    isLoggedIn?: boolean;
    isNewVisitor?: boolean;
    locale?: 'en' | 'ar';
    includeDrafts?: boolean;
    asOf?: string | null;
    audiencePreview?: string | null;
    device?: 'desktop' | 'mobile';
  }): Promise<HomeSection[]> {
    let allMapped: HomeSection[];
    if (!ctx?.includeDrafts && !ctx?.asOf && this.publishedHomeSectionsCache && Date.now() - this.publishedHomeSectionsCache.cachedAt < 30_000) {
      allMapped = this.publishedHomeSectionsCache.value;
    } else {
      const rows = await this.db.query<Record<string, unknown>>(
        'SELECT * FROM home_sections ORDER BY sort_order ASC, schedule_priority DESC, updated_at ASC'
      );
      allMapped = rows.map((r) => this.mapHomeSectionRow(r));
      if (!ctx?.includeDrafts && !ctx?.asOf) {
        this.publishedHomeSectionsCache = { value: allMapped, cachedAt: Date.now() };
      }
    }

    const evalMs = ctx?.asOf ? (Date.parse(ctx.asOf) || Date.now()) : Date.now();
    const visitorSim = ctx?.audiencePreview || (ctx?.isLoggedIn ? 'logged_in' : ctx?.isNewVisitor ? 'new_visitor' : 'guest');

    return allMapped.filter((s) => {
      if (s.status === 'archived') return false;
      if (!ctx?.includeDrafts) {
        if (!s.visible) return false;
        if (s.status !== 'published') return false;
      } else {
        // In builder/admin draft preview, respect eye visibility if toggled off
        if (!s.visible) return false;
      }

      if (!isWithinSchedule(s.startsAt, s.endsAt, evalMs)) return false;

      const t = s.targeting || normalizeTargeting(null, s.audience);
      if (t.locale && t.locale !== 'all' && ctx?.locale && t.locale !== ctx.locale) return false;
      if (t.device && t.device !== 'all' && ctx?.device && t.device !== ctx.device) return false;

      if (t.visitor && t.visitor !== 'all') {
        if (ctx?.audiencePreview === 'all') return true;
        if (t.visitor === 'guest' && visitorSim !== 'guest' && visitorSim !== 'new_visitor') return false;
        if (t.visitor === 'logged_in' && visitorSim !== 'logged_in' && visitorSim !== 'returning') return false;
        if (t.visitor === 'new_visitor' && visitorSim !== 'new_visitor' && visitorSim !== 'guest') return false;
        if (t.visitor === 'returning' && visitorSim !== 'returning' && visitorSim !== 'logged_in') return false;
      }
      return true;
    });
  }

  async adminListHomeSections(): Promise<{
    sections: HomeSection[];
    versionsBySectionId: Record<string, HomeSectionVersion[]>;
  }> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM home_sections ORDER BY sort_order ASC, updated_at ASC'
    );
    const sections = rows.map((r) => this.mapHomeSectionRow(r));
    const versionRows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM home_section_versions ORDER BY version DESC, created_at DESC'
    );
    const versionsBySectionId: Record<string, HomeSectionVersion[]> = {};
    for (const vr of versionRows) {
      const sid = String(vr.section_id);
      if (!versionsBySectionId[sid]) versionsBySectionId[sid] = [];
      const snapRaw = parseJson<Record<string, unknown>>(vr.snapshot_json, {});
      versionsBySectionId[sid].push({
        id: String(vr.id),
        sectionId: sid,
        version: Number(vr.version),
        changeNote: vr.change_note ? String(vr.change_note) : null,
        snapshot: {
          sectionType: mapLegacySectionType(String(snapRaw.sectionType || 'rich_block')),
          title: parseJson<LocalizedText>(snapRaw.title, { en: '', ar: '' }),
          content: (snapRaw.content as Record<string, unknown>) || {},
          status: (snapRaw.status as HomeSectionStatus) || 'draft',
          visible: snapRaw.visible === undefined ? true : Boolean(snapRaw.visible),
          audience: (snapRaw.audience as HomeSectionAudience) || 'all',
          targeting: (snapRaw.targeting as HomeSectionTargeting) || undefined,
          style: (snapRaw.style as HomeSectionStyle) || undefined,
          startsAt: snapRaw.startsAt ? String(snapRaw.startsAt) : null,
          endsAt: snapRaw.endsAt ? String(snapRaw.endsAt) : null,
        },
        editedByUserId: vr.edited_by_user_id ? String(vr.edited_by_user_id) : null,
        createdAt: String(vr.created_at),
      });
    }
    return { sections, versionsBySectionId };
  }

  async adminGetHomeBuilderState() {
    const [{ sections, versionsBySectionId }, chromeDraft, chromePublished, templates, pageSnapshots, mediaLibrary, migrationRow] =
      await Promise.all([
        this.adminListHomeSections(),
        this.getSiteChrome(true),
        this.getSiteChrome(false),
        this.adminListSectionTemplates(),
        this.adminListPageSnapshots(),
        this.adminListMediaLibrary(),
        this.db.queryOne<{ value_json: string }>(
          `SELECT value_json FROM settings WHERE ${this.keyCol()} = 'home_migration_report'`
        ),
      ]);

    const migrationReport = parseJson<HomeMigrationReport>(migrationRow?.value_json, {
      ranAt: new Date().toISOString(),
      migratedSections: [],
      migratedVersionsCount: 0,
      alreadyUpToDateCount: sections.length,
    });

    return {
      sections,
      versionsBySectionId,
      chromeDraft,
      chromePublished,
      templates,
      pageSnapshots,
      mediaLibrary,
      migrationReport,
    };
  }

  async adminCreateHomeSection(
    actorUserId: string,
    input: {
      sectionType: HomeSectionType;
      title: LocalizedText;
      content: Record<string, unknown>;
      status?: HomeSectionStatus;
      visible?: boolean;
      audience?: HomeSectionAudience;
      targeting?: HomeSectionTargeting;
      style?: HomeSectionStyle;
      schedulePriority?: number;
      startsAt?: string | null;
      endsAt?: string | null;
      insertAtIndex?: number;
    },
    ipAddress?: string
  ): Promise<HomeSection> {
    const created = await this.db.transaction(async (tx) => {
      const existingRows = await tx.query<{ id: string; sort_order: number }>(
        'SELECT id, sort_order FROM home_sections ORDER BY sort_order ASC'
      );
      const id = `hs-${crypto.randomUUID()}`;
      const status: HomeSectionStatus = input.status || 'draft';
      const visible = input.visible !== false;
      const audience: HomeSectionAudience = input.audience || 'all';
      const targeting = normalizeTargeting(input.targeting, audience);
      const style: HomeSectionStyle = input.style || { surface: 'graphite', padding: 'standard' };
      const now = toSqlTimestamp();

      let nextSort = (existingRows.length + 1) * 10;
      if (input.insertAtIndex !== undefined && input.insertAtIndex >= 0 && input.insertAtIndex <= existingRows.length) {
        const ordered = existingRows.map((r) => r.id);
        ordered.splice(input.insertAtIndex, 0, id);
        nextSort = (input.insertAtIndex + 1) * 10;
        for (let i = 0; i < ordered.length; i++) {
          if (ordered[i] !== id) {
            await tx.execute('UPDATE home_sections SET sort_order = ? WHERE id = ?', [(i + 1) * 10, ordered[i]]);
          }
        }
      }

      await tx.execute(
        `INSERT INTO home_sections (id, section_type, title_json, content_json, sort_order, status, visible, audience, targeting_json, style_json, schedule_priority, starts_at, ends_at, version, updated_by_user_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          id,
          input.sectionType,
          JSON.stringify(input.title),
          JSON.stringify(input.content || {}),
          nextSort,
          status,
          visible ? 1 : 0,
          audience,
          JSON.stringify(targeting),
          JSON.stringify(style),
          Math.trunc(input.schedulePriority ?? 0),
          input.startsAt ? toSqlTimestamp(new Date(input.startsAt)) : null,
          input.endsAt ? toSqlTimestamp(new Date(input.endsAt)) : null,
          actorUserId,
          now,
        ]
      );

      await tx.execute(
        `INSERT INTO home_section_versions (id, section_id, version, change_note, snapshot_json, edited_by_user_id, created_at)
         VALUES (?, ?, 1, 'Created block', ?, ?, ?)`,
        [
          `hsv-${crypto.randomUUID()}`,
          id,
          JSON.stringify({
            sectionType: input.sectionType,
            title: input.title,
            content: input.content || {},
            status,
            visible,
            audience,
            targeting,
            style,
            startsAt: input.startsAt || null,
            endsAt: input.endsAt || null,
          }),
          actorUserId,
          now,
        ]
      );

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.create_home_section',
        entityType: 'home_section',
        entityId: id,
        after: { sectionType: input.sectionType, status, audience },
        ipAddress,
      });

      const row = await tx.queryOne<Record<string, unknown>>('SELECT * FROM home_sections WHERE id = ?', [id]);
      return this.mapHomeSectionRow(row!);
    });
    this.invalidateHomeCache();
    return created;
  }

  async adminUpdateHomeSection(
    sectionId: string,
    actorUserId: string,
    patch: {
      sectionType?: HomeSectionType;
      title?: LocalizedText;
      content?: Record<string, unknown>;
      status?: HomeSectionStatus;
      visible?: boolean;
      audience?: HomeSectionAudience;
      targeting?: HomeSectionTargeting;
      style?: HomeSectionStyle;
      schedulePriority?: number;
      startsAt?: string | null;
      endsAt?: string | null;
      sortOrder?: number;
      changeNote?: string;
    },
    ipAddress?: string
  ): Promise<HomeSection> {
    const updated = await this.db.transaction(async (tx) => {
      const existingRow = await tx.queryOne<Record<string, unknown>>('SELECT * FROM home_sections WHERE id = ?', [sectionId]);
      if (!existingRow) throw new Error('Home section not found.');
      const existing = this.mapHomeSectionRow(existingRow);

      const nextType = patch.sectionType || existing.sectionType;
      const nextTitle = patch.title || existing.title;
      const nextContent = patch.content !== undefined ? patch.content : existing.content;
      const nextStatus = patch.status || existing.status;
      const nextVisible = patch.visible !== undefined ? patch.visible : existing.visible;
      const nextAudience = patch.audience || existing.audience;
      const nextTargeting =
        patch.targeting !== undefined ? normalizeTargeting(patch.targeting, nextAudience) : existing.targeting || normalizeTargeting(null, nextAudience);
      const nextStyle = patch.style !== undefined ? patch.style : existing.style || { surface: 'graphite', padding: 'standard' };
      const nextPriority = patch.schedulePriority !== undefined ? Math.trunc(patch.schedulePriority) : (existing.schedulePriority ?? 0);
      const nextStarts =
        patch.startsAt !== undefined
          ? patch.startsAt
            ? toSqlTimestamp(new Date(patch.startsAt))
            : null
          : existing.startsAt;
      const nextEnds =
        patch.endsAt !== undefined
          ? patch.endsAt
            ? toSqlTimestamp(new Date(patch.endsAt))
            : null
          : existing.endsAt;
      const nextSort = patch.sortOrder !== undefined ? patch.sortOrder : existing.sortOrder;
      const nextVersion = existing.version + 1;
      const now = toSqlTimestamp();

      await tx.execute(
        `UPDATE home_sections
         SET section_type = ?, title_json = ?, content_json = ?, sort_order = ?, status = ?, visible = ?, audience = ?, targeting_json = ?, style_json = ?, schedule_priority = ?, starts_at = ?, ends_at = ?, version = ?, updated_by_user_id = ?, updated_at = ?
         WHERE id = ?`,
        [
          nextType,
          JSON.stringify(nextTitle),
          JSON.stringify(nextContent),
          nextSort,
          nextStatus,
          nextVisible ? 1 : 0,
          nextAudience,
          JSON.stringify(nextTargeting),
          JSON.stringify(nextStyle),
          nextPriority,
          nextStarts,
          nextEnds,
          nextVersion,
          actorUserId,
          now,
          sectionId,
        ]
      );

      await tx.execute(
        `INSERT INTO home_section_versions (id, section_id, version, change_note, snapshot_json, edited_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `hsv-${crypto.randomUUID()}`,
          sectionId,
          nextVersion,
          patch.changeNote?.slice(0, 240) || 'Updated block settings',
          JSON.stringify({
            sectionType: nextType,
            title: nextTitle,
            content: nextContent,
            status: nextStatus,
            visible: nextVisible,
            audience: nextAudience,
            targeting: nextTargeting,
            style: nextStyle,
            startsAt: nextStarts,
            endsAt: nextEnds,
          }),
          actorUserId,
          now,
        ]
      );

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.update_home_section',
        entityType: 'home_section',
        entityId: sectionId,
        before: { version: existing.version, status: existing.status, visible: existing.visible },
        after: { version: nextVersion, status: nextStatus, visible: nextVisible, audience: nextAudience },
        ipAddress,
      });

      const row = await tx.queryOne<Record<string, unknown>>('SELECT * FROM home_sections WHERE id = ?', [sectionId]);
      return this.mapHomeSectionRow(row!);
    });
    this.invalidateHomeCache();
    return updated;
  }

  async adminDuplicateHomeSection(sectionId: string, actorUserId: string, ipAddress?: string): Promise<HomeSection> {
    const existingRow = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM home_sections WHERE id = ?', [sectionId]);
    if (!existingRow) throw new Error('Home section not found.');
    const existing = this.mapHomeSectionRow(existingRow);

    const allRows = await this.db.query<{ id: string }>('SELECT id FROM home_sections ORDER BY sort_order ASC');
    const idx = allRows.findIndex((r) => r.id === sectionId);
    const insertAt = idx >= 0 ? idx + 1 : allRows.length;

    return this.adminCreateHomeSection(
      actorUserId,
      {
        sectionType: existing.sectionType,
        title: { en: `${existing.title.en} (Copy)`, ar: `${existing.title.ar} (نسخة)` },
        content: existing.content,
        status: 'draft',
        visible: existing.visible,
        audience: existing.audience,
        targeting: existing.targeting,
        style: existing.style,
        schedulePriority: existing.schedulePriority,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        insertAtIndex: insertAt,
      },
      ipAddress
    );
  }

  async adminReorderHomeSections(orderedIds: string[], actorUserId: string, ipAddress?: string): Promise<HomeSection[]> {
    const list = await this.db.transaction(async (tx) => {
      const now = toSqlTimestamp();
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.execute('UPDATE home_sections SET sort_order = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?', [
          (i + 1) * 10,
          actorUserId,
          now,
          orderedIds[i],
        ]);
      }
      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.reorder_home_sections',
        entityType: 'home_section',
        entityId: 'order',
        after: { orderedIds },
        ipAddress,
      });
      const rows = await tx.query<Record<string, unknown>>(
        'SELECT * FROM home_sections ORDER BY sort_order ASC, updated_at ASC'
      );
      return rows.map((r) => this.mapHomeSectionRow(r));
    });
    this.invalidateHomeCache();
    return list;
  }

  async adminRollbackHomeSection(
    sectionId: string,
    versionId: string,
    actorUserId: string,
    ipAddress?: string
  ): Promise<HomeSection> {
    const restored = await this.db.transaction(async (tx) => {
      const currentRow = await tx.queryOne<Record<string, unknown>>('SELECT * FROM home_sections WHERE id = ?', [sectionId]);
      if (!currentRow) throw new Error('Home section not found.');
      const current = this.mapHomeSectionRow(currentRow);

      const verRow = await tx.queryOne<Record<string, unknown>>(
        'SELECT * FROM home_section_versions WHERE id = ? AND section_id = ?',
        [versionId, sectionId]
      );
      if (!verRow) throw new Error('Version snapshot not found.');
      const snapRaw = parseJson<Record<string, unknown>>(verRow.snapshot_json, {});
      const snapType = mapLegacySectionType(String(snapRaw.sectionType || current.sectionType));
      const snapTitle = parseJson<LocalizedText>(snapRaw.title, current.title);
      const snapContent = (snapRaw.content as Record<string, unknown>) || current.content;
      const snapStatus = (snapRaw.status as HomeSectionStatus) || current.status;
      const snapVisible = snapRaw.visible === undefined ? true : Boolean(snapRaw.visible);
      const snapAudience = (snapRaw.audience as HomeSectionAudience) || current.audience;
      const snapTargeting = normalizeTargeting(snapRaw.targeting, snapAudience);
      const snapStyle = (snapRaw.style as HomeSectionStyle) || current.style || { surface: 'graphite', padding: 'standard' };
      const snapStarts = snapRaw.startsAt ? String(snapRaw.startsAt) : null;
      const snapEnds = snapRaw.endsAt ? String(snapRaw.endsAt) : null;

      const nextVersion = current.version + 1;
      const now = toSqlTimestamp();

      await tx.execute(
        `UPDATE home_sections
         SET section_type = ?, title_json = ?, content_json = ?, status = ?, visible = ?, audience = ?, targeting_json = ?, style_json = ?, starts_at = ?, ends_at = ?, version = ?, updated_by_user_id = ?, updated_at = ?
         WHERE id = ?`,
        [
          snapType,
          JSON.stringify(snapTitle),
          JSON.stringify(snapContent),
          snapStatus,
          snapVisible ? 1 : 0,
          snapAudience,
          JSON.stringify(snapTargeting),
          JSON.stringify(snapStyle),
          snapStarts,
          snapEnds,
          nextVersion,
          actorUserId,
          now,
          sectionId,
        ]
      );

      await tx.execute(
        `INSERT INTO home_section_versions (id, section_id, version, change_note, snapshot_json, edited_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `hsv-${crypto.randomUUID()}`,
          sectionId,
          nextVersion,
          `Rolled back to v${Number(verRow.version)}`,
          JSON.stringify({
            sectionType: snapType,
            title: snapTitle,
            content: snapContent,
            status: snapStatus,
            visible: snapVisible,
            audience: snapAudience,
            targeting: snapTargeting,
            style: snapStyle,
            startsAt: snapStarts,
            endsAt: snapEnds,
          }),
          actorUserId,
          now,
        ]
      );

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.rollback_home_section',
        entityType: 'home_section',
        entityId: sectionId,
        before: { version: current.version },
        after: { restoredFromVersion: Number(verRow.version), newVersion: nextVersion },
        ipAddress,
      });

      const updated = await tx.queryOne<Record<string, unknown>>('SELECT * FROM home_sections WHERE id = ?', [sectionId]);
      return this.mapHomeSectionRow(updated!);
    });
    this.invalidateHomeCache();
    return restored;
  }

  async adminDeleteHomeSection(sectionId: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute('DELETE FROM home_section_versions WHERE section_id = ?', [sectionId]);
      await tx.execute('DELETE FROM home_sections WHERE id = ?', [sectionId]);
      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.delete_home_section',
        entityType: 'home_section',
        entityId: sectionId,
        ipAddress,
      });
    });
    this.invalidateHomeCache();
  }

  async adminListPageSnapshots(): Promise<HomePageSnapshot[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM home_page_snapshots ORDER BY version DESC, created_at DESC LIMIT 30'
    );
    return rows.map((r) => {
      const secs = parseJson<Array<Record<string, unknown>>>(r.sections_snapshot_json, []);
      return {
        id: String(r.id),
        version: Number(r.version),
        status: String(r.status || 'published') as HomePageSnapshot['status'],
        changeNote: r.change_note ? String(r.change_note) : null,
        scheduledPublishAt: r.scheduled_publish_at ? String(r.scheduled_publish_at) : null,
        publishedAt: r.published_at ? String(r.published_at) : null,
        createdByUserId: r.created_by_user_id ? String(r.created_by_user_id) : null,
        createdAt: String(r.created_at),
        sectionCount: secs.length,
      };
    });
  }

  async adminPublishHomePage(
    actorUserId: string,
    input: { changeNote?: string; scheduledPublishAt?: string | null },
    ipAddress?: string
  ): Promise<HomePageSnapshot> {
    const snap = await this.db.transaction(async (tx) => {
      const now = toSqlTimestamp();
      const maxVerRow = await tx.queryOne<{ max_v: number | null }>('SELECT MAX(version) AS max_v FROM home_page_snapshots');
      const nextVersion = Number(maxVerRow?.max_v ?? 0) + 1;
      const isScheduled = Boolean(input.scheduledPublishAt && Date.parse(input.scheduledPublishAt) > Date.now());

      if (!isScheduled) {
        // Promote non-archived draft sections to published
        await tx.execute(
          "UPDATE home_sections SET status = 'published', updated_by_user_id = ?, updated_at = ? WHERE status = 'draft'",
          [actorUserId, now]
        );
        // Copy draft chrome -> published chrome
        const kCol = this.keyCol();
        const draftChromeRow = await tx.queryOne<{ value_json: string }>(
          `SELECT value_json FROM settings WHERE ${kCol} = 'site_chrome_draft'`
        );
        if (draftChromeRow) {
          await tx.execute(
            this.db.driver === 'mysql'
              ? `INSERT INTO settings (${kCol}, value_json, updated_at) VALUES ('site_chrome_published', ?, ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = VALUES(updated_at)`
              : `INSERT INTO settings (${kCol}, value_json, updated_at) VALUES ('site_chrome_published', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
            [typeof draftChromeRow.value_json === 'string' ? draftChromeRow.value_json : JSON.stringify(draftChromeRow.value_json), now]
          );
        }
      }

      const sectionRows = await tx.query<Record<string, unknown>>(
        'SELECT * FROM home_sections WHERE status != ? ORDER BY sort_order ASC',
        ['archived']
      );
      const chrome = await this.getSiteChrome(true);
      const id = `hps-${crypto.randomUUID()}`;
      const status = isScheduled ? 'scheduled' : 'published';
      const schedSql = isScheduled && input.scheduledPublishAt ? toSqlTimestamp(new Date(input.scheduledPublishAt)) : null;

      await tx.execute(
        `INSERT INTO home_page_snapshots (id, version, status, change_note, sections_snapshot_json, chrome_snapshot_json, scheduled_publish_at, published_at, created_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          nextVersion,
          status,
          input.changeNote?.trim() || (isScheduled ? 'Scheduled publish' : 'Published Home & Chrome'),
          JSON.stringify(sectionRows),
          JSON.stringify(chrome),
          schedSql,
          isScheduled ? null : now,
          actorUserId,
          now,
        ]
      );

      await writeAuditLog(tx, {
        actorUserId,
        action: isScheduled ? 'admin.schedule_home_page' : 'admin.publish_home_page',
        entityType: 'home_page',
        entityId: id,
        after: { version: nextVersion, status, sectionCount: sectionRows.length },
        ipAddress,
      });

      return {
        id,
        version: nextVersion,
        status: status as HomePageSnapshot['status'],
        changeNote: input.changeNote?.trim() || null,
        scheduledPublishAt: schedSql,
        publishedAt: isScheduled ? null : now,
        createdByUserId: actorUserId,
        createdAt: now,
        sectionCount: sectionRows.length,
      };
    });

    this.invalidateHomeCache();
    return snap;
  }

  async adminRollbackHomePage(snapshotId: string, actorUserId: string, ipAddress?: string): Promise<HomePageSnapshot> {
    const result = await this.db.transaction(async (tx) => {
      const target = await tx.queryOne<Record<string, unknown>>('SELECT * FROM home_page_snapshots WHERE id = ?', [snapshotId]);
      if (!target) throw new Error('Home page snapshot not found.');

      const sectionsArr = parseJson<Array<Record<string, unknown>>>(target.sections_snapshot_json, []);
      const chromeObj = parseJson<SiteChromeSettings>(target.chrome_snapshot_json, DEFAULT_SITE_CHROME);
      const now = toSqlTimestamp();

      await tx.execute('DELETE FROM home_sections');
      for (let i = 0; i < sectionsArr.length; i++) {
        const sr = sectionsArr[i];
        const sid = String(sr.id || `hs-${crypto.randomUUID()}`);
        await tx.execute(
          `INSERT INTO home_sections (id, section_type, title_json, content_json, sort_order, status, visible, audience, targeting_json, style_json, schedule_priority, starts_at, ends_at, version, updated_by_user_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sid,
            mapLegacySectionType(String(sr.section_type || 'rich_block')),
            typeof sr.title_json === 'string' ? sr.title_json : JSON.stringify(sr.title_json || { en: '', ar: '' }),
            typeof sr.content_json === 'string' ? sr.content_json : JSON.stringify(sr.content_json || {}),
            Number(sr.sort_order ?? (i + 1) * 10),
            String(sr.status || 'published'),
            sr.visible === undefined ? 1 : sr.visible ? 1 : 0,
            String(sr.audience || 'all'),
            sr.targeting_json ? (typeof sr.targeting_json === 'string' ? sr.targeting_json : JSON.stringify(sr.targeting_json)) : null,
            sr.style_json ? (typeof sr.style_json === 'string' ? sr.style_json : JSON.stringify(sr.style_json)) : null,
            Number(sr.schedule_priority ?? 0),
            sr.starts_at ? String(sr.starts_at) : null,
            sr.ends_at ? String(sr.ends_at) : null,
            Number(sr.version ?? 1) + 1,
            actorUserId,
            now,
          ]
        );
      }

      const kCol = this.keyCol();
      const chromeStr = JSON.stringify(chromeObj);
      for (const settingKey of ['site_chrome_draft', 'site_chrome_published']) {
        await tx.execute(
          this.db.driver === 'mysql'
            ? `INSERT INTO settings (${kCol}, value_json, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = VALUES(updated_at)`
            : `INSERT INTO settings (${kCol}, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
          [settingKey, chromeStr, now]
        );
      }

      const maxVerRow = await tx.queryOne<{ max_v: number | null }>('SELECT MAX(version) AS max_v FROM home_page_snapshots');
      const nextVersion = Number(maxVerRow?.max_v ?? 0) + 1;
      const newId = `hps-${crypto.randomUUID()}`;
      const note = `Rolled back full page to v${Number(target.version)}`;
      await tx.execute(
        `INSERT INTO home_page_snapshots (id, version, status, change_note, sections_snapshot_json, chrome_snapshot_json, published_at, created_by_user_id, created_at)
         VALUES (?, ?, 'published', ?, ?, ?, ?, ?, ?)`,
        [newId, nextVersion, note, JSON.stringify(sectionsArr), chromeStr, now, actorUserId, now]
      );

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.rollback_home_page',
        entityType: 'home_page',
        entityId: newId,
        after: { restoredFromVersion: Number(target.version), newVersion: nextVersion },
        ipAddress,
      });

      return {
        id: newId,
        version: nextVersion,
        status: 'published' as const,
        changeNote: note,
        scheduledPublishAt: null,
        publishedAt: now,
        createdByUserId: actorUserId,
        createdAt: now,
        sectionCount: sectionsArr.length,
      };
    });

    this.invalidateHomeCache();
    return result;
  }

  async adminSaveSiteChrome(
    chrome: SiteChromeSettings,
    publishNow: boolean,
    actorUserId: string,
    ipAddress?: string
  ): Promise<SiteChromeSettings> {
    const now = toSqlTimestamp();
    const clean: SiteChromeSettings = { ...chrome, updatedAt: now };
    const kCol = this.keyCol();
    const jsonVal = JSON.stringify(clean);

    const keys = publishNow ? ['site_chrome_draft', 'site_chrome_published'] : ['site_chrome_draft'];
    for (const k of keys) {
      await this.db.execute(
        this.db.driver === 'mysql'
          ? `INSERT INTO settings (${kCol}, value_json, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = VALUES(updated_at)`
          : `INSERT INTO settings (${kCol}, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [k, jsonVal, now]
      );
    }

    await writeAuditLog(this.db, {
      actorUserId,
      action: publishNow ? 'admin.publish_site_chrome' : 'admin.save_site_chrome_draft',
      entityType: 'site_chrome',
      entityId: 'global',
      after: { publishNow, linksCount: clean.headerLinks.length },
      ipAddress,
    });
    this.invalidateHomeCache();
    return clean;
  }

  async adminListSectionTemplates(): Promise<HomeSectionTemplate[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM home_section_templates ORDER BY is_system DESC, created_at DESC'
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: parseJson<LocalizedText>(r.name_json, { en: 'Template', ar: 'قالب' }),
      description: parseJson<LocalizedText>(r.description_json, { en: '', ar: '' }),
      sectionType: mapLegacySectionType(String(r.section_type)),
      content: parseJson<Record<string, unknown>>(r.content_json, {}),
      style: parseJson<HomeSectionStyle>(r.style_json, { surface: 'graphite', padding: 'standard' }),
      isSystem: Boolean(r.is_system),
      createdAt: String(r.created_at),
    }));
  }

  async adminCreateSectionTemplate(
    actorUserId: string,
    input: {
      name: LocalizedText;
      description?: LocalizedText;
      sectionType: HomeSectionType;
      content: Record<string, unknown>;
      style?: HomeSectionStyle;
    },
    ipAddress?: string
  ): Promise<HomeSectionTemplate> {
    const id = `tmpl-${crypto.randomUUID()}`;
    const now = toSqlTimestamp();
    const desc = input.description || { en: 'Saved custom section template', ar: 'قالب قسم محفوظ' };
    await this.db.execute(
      `INSERT INTO home_section_templates (id, name_json, description_json, section_type, content_json, style_json, is_system, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        JSON.stringify(input.name),
        JSON.stringify(desc),
        input.sectionType,
        JSON.stringify(input.content || {}),
        JSON.stringify(input.style || { surface: 'graphite', padding: 'standard' }),
        actorUserId,
        now,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_home_template',
      entityType: 'home_section_template',
      entityId: id,
      after: { name: input.name, sectionType: input.sectionType },
      ipAddress,
    });
    return {
      id,
      name: input.name,
      description: desc,
      sectionType: input.sectionType,
      content: input.content || {},
      style: input.style,
      isSystem: false,
      createdAt: now,
    };
  }

  async adminDeleteSectionTemplate(templateId: string, actorUserId: string, ipAddress?: string): Promise<void> {
    const row = await this.db.queryOne<{ is_system: number | boolean }>('SELECT is_system FROM home_section_templates WHERE id = ?', [
      templateId,
    ]);
    if (!row) throw new Error('Template not found.');
    if (Boolean(row.is_system)) throw new Error('Starter system templates cannot be deleted.');
    await this.db.execute('DELETE FROM home_section_templates WHERE id = ?', [templateId]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_home_template',
      entityType: 'home_section_template',
      entityId: templateId,
      ipAddress,
    });
  }

  async adminListMediaLibrary(folderFilter?: string): Promise<MediaAsset[]> {
    const [mediaRows, sections, stores, prodMedia] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        folderFilter && folderFilter !== 'all'
          ? 'SELECT * FROM media WHERE folder = ? ORDER BY created_at DESC LIMIT 200'
          : 'SELECT * FROM media ORDER BY created_at DESC LIMIT 200',
        folderFilter && folderFilter !== 'all' ? [folderFilter] : []
      ),
      this.db.query<{ id: string; title_json: string; content_json: string }>('SELECT id, title_json, content_json FROM home_sections'),
      this.db.query<{ id: string; name_json: string; logo_media_id: string | null; banner_media_id: string | null }>(
        'SELECT id, name_json, logo_media_id, banner_media_id FROM stores'
      ),
      this.db.query<{ id: string; entity_id: string | null }>('SELECT id, entity_id FROM media WHERE entity_type = ?', ['product_image']),
    ]);

    return mediaRows.map((m) => {
      const publicUrl = String(m.public_url);
      const id = String(m.id);
      const usedIn: MediaAsset['usedIn'] = [];

      for (const sec of sections) {
        const cStr = typeof sec.content_json === 'string' ? sec.content_json : JSON.stringify(sec.content_json || {});
        if (cStr.includes(publicUrl) || cStr.includes(id)) {
          const title = parseJson<LocalizedText>(sec.title_json, { en: sec.id, ar: sec.id });
          usedIn.push({ kind: 'home_section', id: sec.id, label: title.en || sec.id });
        }
      }
      for (const st of stores) {
        if (st.logo_media_id === id || st.banner_media_id === id) {
          const name = parseJson<LocalizedText>(st.name_json, { en: st.id, ar: st.id });
          usedIn.push({ kind: 'store', id: st.id, label: name.en || st.id });
        }
      }
      for (const pm of prodMedia) {
        if (pm.id === id && pm.entity_id) {
          usedIn.push({ kind: 'product', id: pm.entity_id, label: `Product ${pm.entity_id.slice(0, 10)}` });
        }
      }

      return {
        id,
        ownerUserId: String(m.owner_user_id),
        entityType: String(m.entity_type),
        folder: String(m.folder || 'general'),
        publicUrl,
        mimeType: String(m.mime_type),
        sizeBytes: Number(m.size_bytes ?? 0),
        width: m.width === null || m.width === undefined ? null : Number(m.width),
        height: m.height === null || m.height === undefined ? null : Number(m.height),
        alt: parseJson<LocalizedText>(m.alt_json, { en: '', ar: '' }),
        focalX: Number(m.focal_x ?? 50),
        focalY: Number(m.focal_y ?? 50),
        createdAt: String(m.created_at),
        usedIn,
      };
    });
  }

  async adminUpdateMediaAsset(
    mediaId: string,
    patch: { folder?: string; alt?: LocalizedText; focalX?: number; focalY?: number }
  ): Promise<MediaAsset> {
    const existing = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM media WHERE id = ?', [mediaId]);
    if (!existing) throw new Error('Media asset not found.');
    const nextFolder = patch.folder ? patch.folder.replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'general' : String(existing.folder || 'general');
    const nextAlt = patch.alt !== undefined ? patch.alt : parseJson<LocalizedText>(existing.alt_json, { en: '', ar: '' });
    const nextFx = patch.focalX !== undefined ? Math.max(0, Math.min(100, Math.round(patch.focalX))) : Number(existing.focal_x ?? 50);
    const nextFy = patch.focalY !== undefined ? Math.max(0, Math.min(100, Math.round(patch.focalY))) : Number(existing.focal_y ?? 50);

    await this.db.execute('UPDATE media SET folder = ?, alt_json = ?, focal_x = ?, focal_y = ? WHERE id = ?', [
      nextFolder,
      JSON.stringify(nextAlt),
      nextFx,
      nextFy,
      mediaId,
    ]);
    const list = await this.adminListMediaLibrary();
    return list.find((item) => item.id === mediaId)!;
  }

  async adminDeleteMediaAsset(mediaId: string, actorUserId: string, ipAddress?: string): Promise<void> {
    const list = await this.adminListMediaLibrary();
    const target = list.find((m) => m.id === mediaId);
    if (!target) throw new Error('Media asset not found.');
    if (target.usedIn.length > 0) {
      throw new Error(`Media is in use (${target.usedIn.map((u) => u.label).join(', ')}). Replace references before deleting.`);
    }
    await this.db.execute('DELETE FROM media WHERE id = ?', [mediaId]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_media',
      entityType: 'media',
      entityId: mediaId,
      after: { publicUrl: target.publicUrl },
      ipAddress,
    });
  }

  async subscribeNewsletter(email: string, locale: 'en' | 'ar', source = 'home') {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error(locale === 'ar' ? 'أدخل بريداً إلكترونياً صحيحاً' : 'Please enter a valid email address.');
    }
    const existing = await this.db.queryOne<{ id: string; status: string; unsubscribe_token: string }>(
      'SELECT id, status, unsubscribe_token FROM newsletter_subscribers WHERE LOWER(email) = ?',
      [cleanEmail]
    );
    const now = toSqlTimestamp();
    let subscriberId: string;
    let unsubscribeToken: string;
    let alreadySubscribed = false;

    if (existing) {
      subscriberId = existing.id;
      unsubscribeToken = existing.unsubscribe_token;
      alreadySubscribed = true;
      await this.db.execute(
        "UPDATE newsletter_subscribers SET status = 'subscribed', locale = ?, source = ?, consented_at = ? WHERE id = ?",
        [locale, source.slice(0, 60), now, existing.id]
      );
    } else {
      subscriberId = `sub-${crypto.randomUUID()}`;
      unsubscribeToken = crypto.randomBytes(24).toString('hex');
      await this.db.execute(
        `INSERT INTO newsletter_subscribers (id, email, locale, source, status, unsubscribe_token, consented_at, created_at)
         VALUES (?, ?, ?, ?, 'subscribed', ?, ?, ?)`,
        [subscriberId, cleanEmail, locale, source.slice(0, 60), unsubscribeToken, now, now]
      );
    }

    // Trigger active welcome_subscriber automation flows (deduplicated per subscriber)
    const welcomeFlows = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM automation_flows WHERE trigger_type = 'welcome_subscriber' AND active = 1"
    );
    for (const flow of welcomeFlows) {
      const flowId = String(flow.id);
      const dedupKey = `welcome:${subscriberId}`;
      const dupExec = await this.db.queryOne<{ id: string }>(
        'SELECT id FROM automation_executions WHERE flow_id = ? AND dedup_key = ?',
        [flowId, dedupKey]
      );
      if (dupExec) continue;
      await this.db.execute(
        'INSERT INTO automation_executions (id, flow_id, dedup_key, recipient_email, created_at) VALUES (?, ?, ?, ?, ?)',
        [`aex-${crypto.randomUUID()}`, flowId, dedupKey, cleanEmail, now]
      );
      const subjectJson = parseJson<{ en: string; ar: string }>(flow.subject_json, { en: 'Welcome to NileLink', ar: 'أهلاً بك في نيل لينك' });
      const blocks = parseJson<EmailBlock[]>(flow.blocks_json, []);
      const delayHours = Math.max(0, Number(flow.delay_hours ?? 0));
      const runAt = delayHours > 0 ? new Date(Date.now() + delayHours * 3_600_000) : new Date();
      const payload: MarketingEmailJobPayload = {
        flowId,
        to: cleanEmail,
        locale,
        subject: subjectJson[locale] || subjectJson.en || 'Welcome to NileLink',
        blocks,
        attachCouponCode: flow.attach_coupon_code ? String(flow.attach_coupon_code) : null,
        unsubscribeToken,
      };
      await enqueueJob(this.db, 'send_marketing_email', payload as unknown as Record<string, unknown>, runAt);
      await this.db.execute(
        'UPDATE automation_flows SET total_triggered = total_triggered + 1, last_run_at = ? WHERE id = ?',
        [now, flowId]
      );
    }

    return { id: subscriberId, email: cleanEmail, status: 'subscribed' as const, alreadySubscribed };
  }

  async unsubscribeNewsletterByToken(token: string): Promise<boolean> {
    const clean = token.trim();
    if (!clean) return false;
    const row = await this.db.queryOne<{ id: string }>(
      'SELECT id FROM newsletter_subscribers WHERE unsubscribe_token = ? LIMIT 1',
      [clean]
    );
    if (!row) return false;
    await this.db.execute("UPDATE newsletter_subscribers SET status = 'unsubscribed' WHERE id = ?", [row.id]);
    return true;
  }

  async adminListNewsletterSubscribers(): Promise<NewsletterSubscriber[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT id, email, locale, source, status, consented_at FROM newsletter_subscribers ORDER BY consented_at DESC LIMIT 500'
    );
    return rows.map((r) => ({
      id: String(r.id),
      email: String(r.email),
      locale: (r.locale === 'ar' ? 'ar' : 'en') as 'en' | 'ar',
      source: String(r.source || 'home'),
      status: r.status === 'unsubscribed' ? 'unsubscribed' : 'subscribed',
      consentedAt: String(r.consented_at),
    }));
  }

  // --- Step 3: Multi-Placement Banners, Bot-Filtered Tracking, Popups & Featured Placements ---
  private mapBannerRow(row: Record<string, unknown>): OfferBanner {
    const rawTitle = parseJson<{ en: string; ar: string; ctaEn?: string; ctaAr?: string }>(row.title_json, {
      en: '',
      ar: '',
    });
    const ctaLabel =
      rawTitle.ctaEn || rawTitle.ctaAr
        ? { en: rawTitle.ctaEn || rawTitle.ctaAr || '', ar: rawTitle.ctaAr || rawTitle.ctaEn || '' }
        : undefined;

    return {
      id: String(row.id),
      title: { en: rawTitle.en || '', ar: rawTitle.ar || '' },
      ctaLabel,
      bgToken: String(row.bg_token || 'graphite') as BannerBgToken,
      targetUrl: String(row.target_url || '/catalog'),
      pages: parseJson<BannerPageScope[]>(row.pages_json, ['home']),
      placement: String(row.placement || 'page_strip') as BannerPlacementType,
      imageUrl: row.image_url ? String(row.image_url) : null,
      dismissible: row.dismissible === undefined ? true : Boolean(row.dismissible),
      audience: String(row.audience || 'all') as MarketingAudienceType,
      deviceTarget: String(row.device_target || 'all') as DeviceTargetType,
      categorySlug: row.category_slug ? String(row.category_slug) : null,
      priority: Number(row.priority ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      botFilteredCount: Number(row.bot_filtered_count ?? 0),
      startsAt: row.starts_at ? String(row.starts_at) : null,
      endsAt: row.ends_at ? String(row.ends_at) : null,
      active: Boolean(row.active),
    };
  }

  async getActiveBanners(page?: BannerPageScope): Promise<OfferBanner[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM banners WHERE active = 1 ORDER BY priority DESC'
    );
    const nowMs = Date.now();
    return rows
      .map((r) => this.mapBannerRow(r))
      .filter((b) => {
        if (!isWithinSchedule(b.startsAt, b.endsAt, nowMs)) return false;
        if (page && !b.pages.includes(page)) return false;
        return true;
      });
  }

  async adminListBanners(): Promise<OfferBanner[]> {
    const rows = await this.db.query<Record<string, unknown>>('SELECT * FROM banners ORDER BY priority DESC');
    return rows.map((r) => this.mapBannerRow(r));
  }

  async adminCreateBanner(
    actorUserId: string,
    input: {
      title: LocalizedText;
      ctaLabel?: LocalizedText;
      bgToken: BannerBgToken;
      targetUrl: string;
      pages: BannerPageScope[];
      placement?: BannerPlacementType;
      imageUrl?: string | null;
      dismissible?: boolean;
      audience?: MarketingAudienceType;
      deviceTarget?: DeviceTargetType;
      categorySlug?: string | null;
      priority?: number;
      startsAt?: string | null;
      endsAt?: string | null;
      active?: boolean;
    },
    ipAddress?: string
  ): Promise<OfferBanner> {
    const id = `bnr-${crypto.randomUUID()}`;
    const storedTitle = {
      en: input.title.en.trim(),
      ar: input.title.ar.trim(),
      ctaEn: input.ctaLabel?.en?.trim() || undefined,
      ctaAr: input.ctaLabel?.ar?.trim() || undefined,
    };
    await this.db.execute(
      `INSERT INTO banners (id, title_json, bg_token, target_url, pages_json, placement, image_url, dismissible, audience, device_target, category_slug, priority, impressions, clicks, bot_filtered_count, starts_at, ends_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
      [
        id,
        JSON.stringify(storedTitle),
        input.bgToken,
        input.targetUrl.trim() || '/catalog',
        JSON.stringify(input.pages.length > 0 ? input.pages : ['home']),
        input.placement || 'page_strip',
        input.imageUrl ? input.imageUrl.trim() : null,
        input.dismissible === false ? 0 : 1,
        input.audience || 'all',
        input.deviceTarget || 'all',
        input.categorySlug ? input.categorySlug.trim() : null,
        Math.trunc(input.priority ?? 10),
        input.startsAt ? toSqlTimestamp(new Date(input.startsAt)) : null,
        input.endsAt ? toSqlTimestamp(new Date(input.endsAt)) : null,
        input.active === false ? 0 : 1,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_banner',
      entityType: 'banner',
      entityId: id,
      after: { bgToken: input.bgToken, placement: input.placement || 'page_strip', pages: input.pages },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM banners WHERE id = ?', [id]);
    return this.mapBannerRow(row!);
  }

  async adminUpdateBanner(
    id: string,
    actorUserId: string,
    patch: {
      title?: LocalizedText;
      ctaLabel?: LocalizedText;
      bgToken?: BannerBgToken;
      targetUrl?: string;
      pages?: BannerPageScope[];
      placement?: BannerPlacementType;
      imageUrl?: string | null;
      dismissible?: boolean;
      audience?: MarketingAudienceType;
      deviceTarget?: DeviceTargetType;
      categorySlug?: string | null;
      priority?: number;
      startsAt?: string | null;
      endsAt?: string | null;
      active?: boolean;
    },
    ipAddress?: string
  ): Promise<OfferBanner> {
    const existingRow = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM banners WHERE id = ?', [id]);
    if (!existingRow) throw new Error('Banner not found.');
    const existing = this.mapBannerRow(existingRow);

    const nextTitleObj = {
      en: patch.title?.en ?? existing.title.en,
      ar: patch.title?.ar ?? existing.title.ar,
      ctaEn: patch.ctaLabel ? patch.ctaLabel.en : existing.ctaLabel?.en,
      ctaAr: patch.ctaLabel ? patch.ctaLabel.ar : existing.ctaLabel?.ar,
    };

    await this.db.execute(
      `UPDATE banners SET title_json = ?, bg_token = ?, target_url = ?, pages_json = ?, placement = ?, image_url = ?, dismissible = ?, audience = ?, device_target = ?, category_slug = ?, priority = ?, starts_at = ?, ends_at = ?, active = ? WHERE id = ?`,
      [
        JSON.stringify(nextTitleObj),
        patch.bgToken ?? existing.bgToken,
        patch.targetUrl ?? existing.targetUrl,
        JSON.stringify(patch.pages ?? existing.pages),
        patch.placement ?? existing.placement,
        patch.imageUrl !== undefined ? (patch.imageUrl ? patch.imageUrl.trim() : null) : existing.imageUrl ?? null,
        patch.dismissible !== undefined ? (patch.dismissible ? 1 : 0) : existing.dismissible ? 1 : 0,
        patch.audience ?? existing.audience,
        patch.deviceTarget ?? existing.deviceTarget,
        patch.categorySlug !== undefined ? (patch.categorySlug ? patch.categorySlug.trim() : null) : existing.categorySlug ?? null,
        patch.priority !== undefined ? Math.trunc(patch.priority) : existing.priority,
        patch.startsAt !== undefined ? (patch.startsAt ? toSqlTimestamp(new Date(patch.startsAt)) : null) : existing.startsAt,
        patch.endsAt !== undefined ? (patch.endsAt ? toSqlTimestamp(new Date(patch.endsAt)) : null) : existing.endsAt,
        patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active ? 1 : 0,
        id,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_banner',
      entityType: 'banner',
      entityId: id,
      after: patch,
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM banners WHERE id = ?', [id]);
    return this.mapBannerRow(row!);
  }

  async adminDeleteBanner(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM banners WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_banner',
      entityType: 'banner',
      entityId: id,
      ipAddress,
    });
  }

  private isBotTraffic(userAgent: string): boolean {
    const ua = (userAgent || '').trim();
    if (!ua || ua.length < 4) return true;
    return /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|bingpreview|headless|lighthouse|phantomjs|puppeteer|playwright|curl\/|wget\/|python-requests|scrapy|ahrefs|semrush|mj12bot|dotbot|bytespider|gptbot|claudebot|yandex|baidu/i.test(
      ua
    );
  }

  async trackMarketingEvent(params: {
    kind: 'banner' | 'popup' | 'featured';
    id: string;
    event: 'impression' | 'click' | 'conversion' | 'dismissal';
    ip: string;
    userAgent: string;
    sessionHint?: string;
  }): Promise<{ counted: boolean; reason: 'bot_filtered' | 'deduplicated' | null }> {
    const table =
      params.kind === 'banner'
        ? 'banners'
        : params.kind === 'popup'
          ? 'marketing_popups'
          : 'featured_placements';

    if (this.isBotTraffic(params.userAgent)) {
      await this.db.execute(`UPDATE ${table} SET bot_filtered_count = bot_filtered_count + 1 WHERE id = ?`, [params.id]);
      return { counted: false, reason: 'bot_filtered' };
    }

    const col =
      params.event === 'click'
        ? 'clicks'
        : params.event === 'conversion'
          ? 'conversions'
          : params.event === 'dismissal'
            ? 'dismissals'
            : 'impressions';

    const visitorHash = sha256Hex(`${params.ip}|${params.userAgent.slice(0, 120)}|${params.sessionHint || ''}`).slice(0, 48);
    const windowMs = params.event === 'impression' ? 10 * 60_000 : 60_000;
    const bucketKey = String(Math.floor(Date.now() / windowMs));
    const dedupSql =
      this.db.driver === 'mysql'
        ? 'INSERT IGNORE INTO marketing_events_dedup (id, entity_kind, entity_id, event_type, visitor_hash, bucket_key) VALUES (?, ?, ?, ?, ?, ?)'
        : 'INSERT OR IGNORE INTO marketing_events_dedup (id, entity_kind, entity_id, event_type, visitor_hash, bucket_key) VALUES (?, ?, ?, ?, ?, ?)';

    const dedupRes = await this.db.execute(dedupSql, [
      `mkd-${crypto.randomUUID()}`,
      params.kind,
      params.id,
      params.event,
      visitorHash,
      bucketKey,
    ]);

    if (dedupRes.affectedRows === 0) {
      return { counted: false, reason: 'deduplicated' };
    }

    await this.db.execute(`UPDATE ${table} SET ${col} = ${col} + 1 WHERE id = ?`, [params.id]);
    return { counted: true, reason: null };
  }

  async trackBannerEvent(
    id: string,
    event: 'impression' | 'click',
    meta?: { ip?: string; userAgent?: string; sessionHint?: string }
  ): Promise<{ counted: boolean; reason: 'bot_filtered' | 'deduplicated' | null }> {
    return this.trackMarketingEvent({
      kind: 'banner',
      id,
      event,
      ip: meta?.ip || 'unknown',
      userAgent: meta?.userAgent || 'Mozilla/5.0',
      sessionHint: meta?.sessionHint,
    });
  }

  // --- Marketing Popups & Frequency Caps ---
  private mapPopupRow(row: Record<string, unknown>): MarketingPopup {
    return {
      id: String(row.id),
      title: parseJson<LocalizedText>(row.title_json, { en: '', ar: '' }),
      body: parseJson<LocalizedText>(row.body_json, { en: '', ar: '' }),
      ctaLabel: parseJson<LocalizedText>(row.cta_label_json, { en: 'Shop Now', ar: 'تسوق الآن' }),
      targetUrl: String(row.target_url || '/catalog'),
      imageUrl: row.image_url ? String(row.image_url) : null,
      bgToken: String(row.bg_token || 'ember') as BannerBgToken,
      popupType: String(row.popup_type || 'promo') as PopupType,
      triggerType: String(row.trigger_type || 'delay_seconds') as PopupTrigger,
      triggerValue: Number(row.trigger_value ?? 5),
      frequencyCap: String(row.frequency_cap || 'once_per_day') as PopupFrequency,
      pages: parseJson<BannerPageScope[]>(row.pages_json, ['home']),
      audience: String(row.audience || 'all') as MarketingAudienceType,
      deviceTarget: String(row.device_target || 'all') as DeviceTargetType,
      showNewsletterForm: Boolean(row.show_newsletter_form),
      couponCode: row.coupon_code ? String(row.coupon_code) : null,
      startsAt: row.starts_at ? String(row.starts_at) : null,
      endsAt: row.ends_at ? String(row.ends_at) : null,
      active: Boolean(row.active),
      impressions: Number(row.impressions ?? 0),
      conversions: Number(row.conversions ?? 0),
      dismissals: Number(row.dismissals ?? 0),
      botFilteredCount: Number(row.bot_filtered_count ?? 0),
    };
  }

  async getActivePopups(): Promise<MarketingPopup[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM marketing_popups WHERE active = 1 ORDER BY created_at DESC'
    );
    const nowMs = Date.now();
    return rows.map((r) => this.mapPopupRow(r)).filter((p) => isWithinSchedule(p.startsAt, p.endsAt, nowMs));
  }

  async adminListPopups(): Promise<MarketingPopup[]> {
    const rows = await this.db.query<Record<string, unknown>>('SELECT * FROM marketing_popups ORDER BY created_at DESC');
    return rows.map((r) => this.mapPopupRow(r));
  }

  async adminCreatePopup(
    actorUserId: string,
    input: {
      title: LocalizedText;
      body: LocalizedText;
      ctaLabel: LocalizedText;
      targetUrl: string;
      imageUrl?: string | null;
      bgToken: BannerBgToken;
      popupType: PopupType;
      triggerType: PopupTrigger;
      triggerValue: number;
      frequencyCap: PopupFrequency;
      pages: BannerPageScope[];
      audience: MarketingAudienceType;
      deviceTarget: DeviceTargetType;
      showNewsletterForm?: boolean;
      couponCode?: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
      active?: boolean;
    },
    ipAddress?: string
  ): Promise<MarketingPopup> {
    const id = `pop-${crypto.randomUUID()}`;
    await this.db.execute(
      `INSERT INTO marketing_popups (id, title_json, body_json, cta_label_json, target_url, image_url, bg_token, popup_type, trigger_type, trigger_value, frequency_cap, pages_json, audience, device_target, show_newsletter_form, coupon_code, starts_at, ends_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        JSON.stringify(input.title),
        JSON.stringify(input.body),
        JSON.stringify(input.ctaLabel),
        input.targetUrl.trim() || '/catalog',
        input.imageUrl ? input.imageUrl.trim() : null,
        input.bgToken,
        input.popupType,
        input.triggerType,
        Math.max(0, Math.trunc(input.triggerValue)),
        input.frequencyCap,
        JSON.stringify(input.pages.length > 0 ? input.pages : ['home']),
        input.audience,
        input.deviceTarget,
        input.showNewsletterForm ? 1 : 0,
        input.couponCode ? input.couponCode.trim().toUpperCase() : null,
        input.startsAt ? toSqlTimestamp(new Date(input.startsAt)) : null,
        input.endsAt ? toSqlTimestamp(new Date(input.endsAt)) : null,
        input.active === false ? 0 : 1,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_popup',
      entityType: 'marketing_popup',
      entityId: id,
      after: { popupType: input.popupType, triggerType: input.triggerType, frequencyCap: input.frequencyCap },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM marketing_popups WHERE id = ?', [id]);
    return this.mapPopupRow(row!);
  }

  async adminUpdatePopup(
    id: string,
    actorUserId: string,
    patch: Partial<{
      title: LocalizedText;
      body: LocalizedText;
      ctaLabel: LocalizedText;
      targetUrl: string;
      imageUrl: string | null;
      bgToken: BannerBgToken;
      popupType: PopupType;
      triggerType: PopupTrigger;
      triggerValue: number;
      frequencyCap: PopupFrequency;
      pages: BannerPageScope[];
      audience: MarketingAudienceType;
      deviceTarget: DeviceTargetType;
      showNewsletterForm: boolean;
      couponCode: string | null;
      startsAt: string | null;
      endsAt: string | null;
      active: boolean;
    }>,
    ipAddress?: string
  ): Promise<MarketingPopup> {
    const existingRow = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM marketing_popups WHERE id = ?', [id]);
    if (!existingRow) throw new Error('Popup not found.');
    const existing = this.mapPopupRow(existingRow);

    await this.db.execute(
      `UPDATE marketing_popups SET title_json = ?, body_json = ?, cta_label_json = ?, target_url = ?, image_url = ?, bg_token = ?, popup_type = ?, trigger_type = ?, trigger_value = ?, frequency_cap = ?, pages_json = ?, audience = ?, device_target = ?, show_newsletter_form = ?, coupon_code = ?, starts_at = ?, ends_at = ?, active = ? WHERE id = ?`,
      [
        JSON.stringify(patch.title ?? existing.title),
        JSON.stringify(patch.body ?? existing.body),
        JSON.stringify(patch.ctaLabel ?? existing.ctaLabel),
        patch.targetUrl ?? existing.targetUrl,
        patch.imageUrl !== undefined ? (patch.imageUrl ? patch.imageUrl.trim() : null) : existing.imageUrl ?? null,
        patch.bgToken ?? existing.bgToken,
        patch.popupType ?? existing.popupType,
        patch.triggerType ?? existing.triggerType,
        patch.triggerValue !== undefined ? Math.max(0, Math.trunc(patch.triggerValue)) : existing.triggerValue,
        patch.frequencyCap ?? existing.frequencyCap,
        JSON.stringify(patch.pages ?? existing.pages),
        patch.audience ?? existing.audience,
        patch.deviceTarget ?? existing.deviceTarget,
        patch.showNewsletterForm !== undefined ? (patch.showNewsletterForm ? 1 : 0) : existing.showNewsletterForm ? 1 : 0,
        patch.couponCode !== undefined ? (patch.couponCode ? patch.couponCode.trim().toUpperCase() : null) : existing.couponCode ?? null,
        patch.startsAt !== undefined ? (patch.startsAt ? toSqlTimestamp(new Date(patch.startsAt)) : null) : existing.startsAt,
        patch.endsAt !== undefined ? (patch.endsAt ? toSqlTimestamp(new Date(patch.endsAt)) : null) : existing.endsAt,
        patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active ? 1 : 0,
        id,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_popup',
      entityType: 'marketing_popup',
      entityId: id,
      after: patch,
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM marketing_popups WHERE id = ?', [id]);
    return this.mapPopupRow(row!);
  }

  async adminDeletePopup(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM marketing_popups WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_popup',
      entityType: 'marketing_popup',
      entityId: id,
      ipAddress,
    });
  }

  // --- Featured Placements (Sponsored / Editorial Slots + Optional Ledger Fee) ---
  private mapFeaturedPlacementRow(row: Record<string, unknown>): FeaturedPlacement {
    return {
      id: String(row.id),
      slotKey: String(row.slot_key) as FeaturedSlotKey,
      targetType: String(row.target_type) as FeaturedPlacementTargetType,
      targetId: String(row.target_id),
      sellerId: String(row.seller_id),
      targetLabel: row.target_label_json ? parseJson<LocalizedText>(row.target_label_json, { en: 'Featured', ar: 'مميز' }) : null,
      sellerName: row.seller_name_json ? parseJson<LocalizedText>(row.seller_name_json, { en: 'Store', ar: 'متجر' }) : null,
      badgeText: parseJson<LocalizedText>(row.badge_json, { en: 'Featured', ar: 'مميز' }),
      priority: Number(row.priority ?? 10),
      feeUsdCents: Number(row.fee_usd_cents ?? 0),
      ledgerCharged: Boolean(row.ledger_charged),
      ledgerEntryId: row.ledger_entry_id ? String(row.ledger_entry_id) : null,
      startsAt: row.starts_at ? String(row.starts_at) : null,
      endsAt: row.ends_at ? String(row.ends_at) : null,
      active: Boolean(row.active),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      botFilteredCount: Number(row.bot_filtered_count ?? 0),
      createdAt: String(row.created_at),
    };
  }

  async getActiveFeaturedPlacements(): Promise<FeaturedPlacement[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT fp.*,
              st.name_json AS seller_name_json,
              COALESCE(p.title_json, st2.name_json) AS target_label_json
       FROM featured_placements fp
       LEFT JOIN stores st ON st.seller_id = fp.seller_id
       LEFT JOIN products p ON fp.target_type = 'product' AND p.id = fp.target_id
       LEFT JOIN stores st2 ON fp.target_type = 'store' AND st2.seller_id = fp.target_id
       WHERE fp.active = 1
       ORDER BY fp.priority DESC, fp.created_at DESC`
    );
    const nowMs = Date.now();
    return rows
      .map((r) => this.mapFeaturedPlacementRow(r))
      .filter((fp) => isWithinSchedule(fp.startsAt, fp.endsAt, nowMs));
  }

  async adminListFeaturedPlacements(): Promise<FeaturedPlacement[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT fp.*,
              st.name_json AS seller_name_json,
              COALESCE(p.title_json, st2.name_json) AS target_label_json
       FROM featured_placements fp
       LEFT JOIN stores st ON st.seller_id = fp.seller_id
       LEFT JOIN products p ON fp.target_type = 'product' AND p.id = fp.target_id
       LEFT JOIN stores st2 ON fp.target_type = 'store' AND st2.seller_id = fp.target_id
       ORDER BY fp.priority DESC, fp.created_at DESC`
    );
    return rows.map((r) => this.mapFeaturedPlacementRow(r));
  }

  async adminCreateFeaturedPlacement(
    actorUserId: string,
    input: {
      slotKey: FeaturedSlotKey;
      targetType: FeaturedPlacementTargetType;
      targetId: string;
      badgeText: LocalizedText;
      priority?: number;
      feeUsdCents?: number;
      chargeLedgerFee?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
      active?: boolean;
    },
    ipAddress?: string
  ): Promise<FeaturedPlacement> {
    return this.db.transaction(async (tx) => {
      let resolvedSellerId = '';
      if (input.targetType === 'product') {
        const prod = await tx.queryOne<{ seller_id: string }>('SELECT seller_id FROM products WHERE id = ? AND deleted_at IS NULL', [
          input.targetId,
        ]);
        if (!prod) throw new Error('Target product not found.');
        resolvedSellerId = prod.seller_id;
      } else {
        const seller = await tx.queryOne<{ id: string }>('SELECT id FROM sellers WHERE id = ? AND deleted_at IS NULL', [
          input.targetId,
        ]);
        if (!seller) throw new Error('Target seller store not found.');
        resolvedSellerId = seller.id;
      }

      const id = `fpl-${crypto.randomUUID()}`;
      const feeCents = Math.max(0, Math.trunc(input.feeUsdCents ?? 0));
      const shouldCharge = Boolean(input.chargeLedgerFee && feeCents > 0);
      const now = toSqlTimestamp();
      let ledgerEntryId: string | null = null;

      if (shouldCharge) {
        ledgerEntryId = `led-${crypto.randomUUID()}`;
        await tx.execute(
          `INSERT INTO ledger_entries (id, seller_id, entry_type, direction, amount_usd_cents, availability, note, created_at)
           VALUES (?, ?, 'FEATURED_PLACEMENT_FEE', 'debit', ?, 'settled', ?, ?)`,
          [
            ledgerEntryId,
            resolvedSellerId,
            feeCents,
            `Featured placement (${input.slotKey}) for ${input.targetType} ${input.targetId}`,
            now,
          ]
        );
      }

      await tx.execute(
        `INSERT INTO featured_placements (id, slot_key, target_type, target_id, seller_id, badge_json, priority, fee_usd_cents, ledger_charged, ledger_entry_id, starts_at, ends_at, active, created_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.slotKey,
          input.targetType,
          input.targetId,
          resolvedSellerId,
          JSON.stringify(input.badgeText),
          Math.trunc(input.priority ?? 10),
          feeCents,
          shouldCharge ? 1 : 0,
          ledgerEntryId,
          input.startsAt ? toSqlTimestamp(new Date(input.startsAt)) : null,
          input.endsAt ? toSqlTimestamp(new Date(input.endsAt)) : null,
          input.active === false ? 0 : 1,
          actorUserId,
          now,
        ]
      );

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.create_featured_placement',
        entityType: 'featured_placement',
        entityId: id,
        after: { slotKey: input.slotKey, targetType: input.targetType, targetId: input.targetId, feeUsdCents: feeCents, ledgerCharged: shouldCharge },
        ipAddress,
      });

      const row = await tx.queryOne<Record<string, unknown>>(
        `SELECT fp.*,
                st.name_json AS seller_name_json,
                COALESCE(p.title_json, st2.name_json) AS target_label_json
         FROM featured_placements fp
         LEFT JOIN stores st ON st.seller_id = fp.seller_id
         LEFT JOIN products p ON fp.target_type = 'product' AND p.id = fp.target_id
         LEFT JOIN stores st2 ON fp.target_type = 'store' AND st2.seller_id = fp.target_id
         WHERE fp.id = ?`,
        [id]
      );
      return this.mapFeaturedPlacementRow(row!);
    });
  }

  async adminUpdateFeaturedPlacement(
    id: string,
    actorUserId: string,
    patch: Partial<{
      slotKey: FeaturedSlotKey;
      badgeText: LocalizedText;
      priority: number;
      startsAt: string | null;
      endsAt: string | null;
      active: boolean;
      chargeLedgerFeeNow: boolean;
    }>,
    ipAddress?: string
  ): Promise<FeaturedPlacement> {
    return this.db.transaction(async (tx) => {
      const existingRow = await tx.queryOne<Record<string, unknown>>('SELECT * FROM featured_placements WHERE id = ?', [id]);
      if (!existingRow) throw new Error('Featured placement not found.');
      const existing = this.mapFeaturedPlacementRow(existingRow);

      let ledgerCharged = existing.ledgerCharged;
      let ledgerEntryId = existing.ledgerEntryId ?? null;
      if (patch.chargeLedgerFeeNow && !existing.ledgerCharged && existing.feeUsdCents > 0) {
        ledgerEntryId = `led-${crypto.randomUUID()}`;
        await tx.execute(
          `INSERT INTO ledger_entries (id, seller_id, entry_type, direction, amount_usd_cents, availability, note, created_at)
           VALUES (?, ?, 'FEATURED_PLACEMENT_FEE', 'debit', ?, 'settled', ?, ?)`,
          [
            ledgerEntryId,
            existing.sellerId,
            existing.feeUsdCents,
            `Featured placement (${existing.slotKey}) fee`,
            toSqlTimestamp(),
          ]
        );
        ledgerCharged = true;
      }

      await tx.execute(
        `UPDATE featured_placements SET slot_key = ?, badge_json = ?, priority = ?, ledger_charged = ?, ledger_entry_id = ?, starts_at = ?, ends_at = ?, active = ? WHERE id = ?`,
        [
          patch.slotKey ?? existing.slotKey,
          JSON.stringify(patch.badgeText ?? existing.badgeText),
          patch.priority !== undefined ? Math.trunc(patch.priority) : existing.priority,
          ledgerCharged ? 1 : 0,
          ledgerEntryId,
          patch.startsAt !== undefined ? (patch.startsAt ? toSqlTimestamp(new Date(patch.startsAt)) : null) : existing.startsAt,
          patch.endsAt !== undefined ? (patch.endsAt ? toSqlTimestamp(new Date(patch.endsAt)) : null) : existing.endsAt,
          patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active ? 1 : 0,
          id,
        ]
      );

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.update_featured_placement',
        entityType: 'featured_placement',
        entityId: id,
        after: patch,
        ipAddress,
      });

      const row = await tx.queryOne<Record<string, unknown>>(
        `SELECT fp.*,
                st.name_json AS seller_name_json,
                COALESCE(p.title_json, st2.name_json) AS target_label_json
         FROM featured_placements fp
         LEFT JOIN stores st ON st.seller_id = fp.seller_id
         LEFT JOIN products p ON fp.target_type = 'product' AND p.id = fp.target_id
         LEFT JOIN stores st2 ON fp.target_type = 'store' AND st2.seller_id = fp.target_id
         WHERE fp.id = ?`,
        [id]
      );
      return this.mapFeaturedPlacementRow(row!);
    });
  }

  async adminDeleteFeaturedPlacement(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM featured_placements WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_featured_placement',
      entityType: 'featured_placement',
      entityId: id,
      ipAddress,
    });
  }

  // --- Phase B & Marketing Hub: Offers, Conflict Check, Flash Sales & Campaigns ---
  private mapOfferRow(row: Record<string, unknown>): Offer {
    return {
      id: String(row.id),
      sellerId: row.seller_id ? String(row.seller_id) : null,
      sellerName: row.seller_name_json ? parseJson<LocalizedText>(row.seller_name_json, { en: 'Store', ar: 'متجر' }) : null,
      title: parseJson<LocalizedText>(row.title_json, { en: '', ar: '' }),
      offerType: String(row.offer_type) as OfferType,
      discountValue: Number(row.discount_value),
      targetType: String(row.target_type) as OfferTargetType,
      targetId: row.target_id ? String(row.target_id) : null,
      stackingRule: String(row.stacking_rule || 'best_only') as OfferStackingRule,
      fundingSource: String(row.funding_source || 'platform') as OfferFundingSource,
      fundingPlatformBps: Number(row.funding_platform_bps ?? 10000),
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      priority: Number(row.priority ?? 10),
      rules: row.rules_json ? parseJson<OfferRulesConfig>(row.rules_json, {}) : undefined,
      approvalStatus: String(row.approval_status || 'pending') as OfferApprovalStatus,
      startsAt: row.starts_at ? String(row.starts_at) : null,
      endsAt: row.ends_at ? String(row.ends_at) : null,
      active: Boolean(row.active),
    };
  }

  async getActiveOffers(tx: DbTx = this.db): Promise<Offer[]> {
    const rows = await tx.query<Record<string, unknown>>(
      `SELECT o.*, st.name_json AS seller_name_json
       FROM offers o
       LEFT JOIN stores st ON st.seller_id = o.seller_id
       WHERE o.approval_status = 'approved' AND o.active = 1
       ORDER BY o.priority DESC`
    );
    const nowMs = Date.now();
    return rows.map((r) => this.mapOfferRow(r)).filter((o) => isWithinSchedule(o.startsAt, o.endsAt, nowMs));
  }

  async adminListOffers(): Promise<Offer[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT o.*, st.name_json AS seller_name_json
       FROM offers o
       LEFT JOIN stores st ON st.seller_id = o.seller_id
       ORDER BY o.priority DESC, o.approval_status ASC, o.id DESC`
    );
    return rows.map((r) => this.mapOfferRow(r));
  }

  async checkOfferConflicts(input: {
    offerType: OfferType;
    targetType: OfferTargetType;
    targetId?: string | null;
    stackingRule?: OfferStackingRule;
    startsAt?: string | null;
    endsAt?: string | null;
    excludeOfferId?: string;
  }): Promise<OfferConflict[]> {
    const all = await this.adminListOffers();
    const sNew = input.startsAt ? Date.parse(input.startsAt) : -Infinity;
    const eNew = input.endsAt ? Date.parse(input.endsAt) : Infinity;
    const conflicts: OfferConflict[] = [];

    for (const existing of all) {
      if (existing.id === input.excludeOfferId) continue;
      if (!existing.active || existing.approvalStatus === 'rejected') continue;
      const sOld = existing.startsAt ? Date.parse(existing.startsAt) : -Infinity;
      const eOld = existing.endsAt ? Date.parse(existing.endsAt) : Infinity;
      const datesOverlap = sNew <= eOld && eNew >= sOld;
      if (!datesOverlap) continue;

      const sameScope =
        existing.targetType === 'all' ||
        input.targetType === 'all' ||
        (existing.targetType === input.targetType && (existing.targetId || '') === (input.targetId || ''));
      if (!sameScope) continue;

      if (existing.stackingRule === 'exclusive' || input.stackingRule === 'exclusive') {
        conflicts.push({
          conflictingOfferId: existing.id,
          conflictingTitle: existing.title.en,
          reason: `Exclusive stacking conflict on ${existing.targetType} scope during overlapping dates.`,
        });
      } else {
        conflicts.push({
          conflictingOfferId: existing.id,
          conflictingTitle: existing.title.en,
          reason: `Overlapping ${existing.offerType} promotion on ${existing.targetType} (${existing.stackingRule}).`,
        });
      }
    }
    return conflicts;
  }

  async adminCreateOffer(
    actorUserId: string,
    input: {
      title: LocalizedText;
      offerType: OfferType;
      discountValue: number;
      targetType: OfferTargetType;
      targetId?: string | null;
      stackingRule?: OfferStackingRule;
      fundingSource?: OfferFundingSource;
      fundingPlatformBps?: number;
      campaignId?: string | null;
      priority?: number;
      rules?: OfferRulesConfig;
      startsAt?: string | null;
      endsAt?: string | null;
      active?: boolean;
    },
    ipAddress?: string
  ): Promise<Offer> {
    if (
      ['percent', 'flash_percent', 'first_order', 'vip_exclusive'].includes(input.offerType) &&
      (input.discountValue < 1 || input.discountValue > 90)
    ) {
      throw new Error('Percentage discount must be between 1% and 90%.');
    }
    if (input.offerType === 'fixed_usd_cents' && input.discountValue < 1) {
      throw new Error('Fixed discount must be at least 1 USD cent.');
    }
    const id = `off-${crypto.randomUUID()}`;
    const fundingSource: OfferFundingSource = input.fundingSource || 'platform';
    const fundingPlatformBps =
      fundingSource === 'platform' ? 10000 : fundingSource === 'seller' ? 0 : Math.min(10000, Math.max(0, Math.trunc(input.fundingPlatformBps ?? 5000)));

    await this.db.execute(
      `INSERT INTO offers (id, seller_id, title_json, offer_type, discount_value, target_type, target_id, stacking_rule, funding_source, funding_platform_bps, campaign_id, priority, rules_json, approval_status, starts_at, ends_at, active)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`,
      [
        id,
        JSON.stringify(input.title),
        input.offerType,
        Math.round(input.discountValue),
        input.targetType,
        input.targetId?.trim() || null,
        input.stackingRule || 'best_only',
        fundingSource,
        fundingPlatformBps,
        input.campaignId?.trim() || null,
        Math.trunc(input.priority ?? 10),
        input.rules ? JSON.stringify(input.rules) : null,
        input.startsAt ? toSqlTimestamp(new Date(input.startsAt)) : null,
        input.endsAt ? toSqlTimestamp(new Date(input.endsAt)) : null,
        input.active === false ? 0 : 1,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_offer',
      entityType: 'offer',
      entityId: id,
      after: {
        offerType: input.offerType,
        discountValue: input.discountValue,
        targetType: input.targetType,
        stackingRule: input.stackingRule || 'best_only',
        fundingSource,
      },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM offers WHERE id = ?', [id]);
    return this.mapOfferRow(row!);
  }

  async adminUpdateOffer(
    id: string,
    actorUserId: string,
    patch: { approvalStatus?: OfferApprovalStatus; active?: boolean },
    ipAddress?: string
  ): Promise<Offer> {
    const existing = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM offers WHERE id = ?', [id]);
    if (!existing) throw new Error('Offer not found.');
    const nextStatus = patch.approvalStatus ?? String(existing.approval_status);
    const nextActive = patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active ? 1 : 0;
    await this.db.execute('UPDATE offers SET approval_status = ?, active = ? WHERE id = ?', [
      nextStatus,
      nextActive,
      id,
    ]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_offer',
      entityType: 'offer',
      entityId: id,
      before: { approvalStatus: existing.approval_status, active: Boolean(existing.active) },
      after: { approvalStatus: nextStatus, active: Boolean(nextActive) },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>(
      `SELECT o.*, st.name_json AS seller_name_json FROM offers o LEFT JOIN stores st ON st.seller_id = o.seller_id WHERE o.id = ?`,
      [id]
    );
    return this.mapOfferRow(row!);
  }

  async adminDeleteOffer(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM offers WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_offer',
      entityType: 'offer',
      entityId: id,
      ipAddress,
    });
  }

  // --- Flash Sales & Stock Caps ---
  private async hydrateFlashSales(saleRows: Array<Record<string, unknown>>, tx: DbTx = this.db): Promise<FlashSale[]> {
    const results: FlashSale[] = [];
    for (const s of saleRows) {
      const itemRows = await tx.query<Record<string, unknown>>(
        `SELECT fsi.*, p.title_json AS product_title_json, p.base_price_usd_cents AS base_price_usd_cents
         FROM flash_sale_items fsi
         LEFT JOIN products p ON p.id = fsi.product_id
         WHERE fsi.flash_sale_id = ?`,
        [String(s.id)]
      );
      const items: FlashSaleItem[] = itemRows.map((it) => ({
        id: String(it.id),
        flashSaleId: String(it.flash_sale_id),
        productId: String(it.product_id),
        productTitle: it.product_title_json ? parseJson<LocalizedText>(it.product_title_json, { en: 'Product', ar: 'منتج' }) : undefined,
        basePriceUsdCents: it.base_price_usd_cents !== null && it.base_price_usd_cents !== undefined ? Number(it.base_price_usd_cents) : undefined,
        salePriceUsdCents: Number(it.sale_price_usd_cents),
        discountPercent: Number(it.discount_percent),
        stockCap: Number(it.stock_cap),
        claimedCount: Number(it.claimed_count),
      }));
      results.push({
        id: String(s.id),
        slug: String(s.slug),
        title: parseJson<LocalizedText>(s.title_json, { en: '', ar: '' }),
        bgToken: String(s.bg_token || 'ember') as BannerBgToken,
        startsAt: String(s.starts_at),
        endsAt: String(s.ends_at),
        status: String(s.status || 'scheduled') as FlashSaleStatus,
        autoRevert: Boolean(s.auto_revert),
        items,
        createdAt: String(s.created_at),
      });
    }
    return results;
  }

  async getActiveFlashSales(tx: DbTx = this.db): Promise<FlashSale[]> {
    const rows = await tx.query<Record<string, unknown>>(
      "SELECT * FROM flash_sales WHERE status != 'ended' ORDER BY ends_at ASC"
    );
    const hydrated = await this.hydrateFlashSales(rows, tx);
    const nowMs = Date.now();
    return hydrated.filter((fs) => isWithinSchedule(fs.startsAt, fs.endsAt, nowMs));
  }

  async adminListFlashSales(): Promise<FlashSale[]> {
    const rows = await this.db.query<Record<string, unknown>>('SELECT * FROM flash_sales ORDER BY created_at DESC');
    return this.hydrateFlashSales(rows);
  }

  async adminCreateFlashSale(
    actorUserId: string,
    input: {
      slug?: string;
      title: LocalizedText;
      bgToken?: BannerBgToken;
      startsAt: string;
      endsAt: string;
      autoRevert?: boolean;
      items: Array<{ productId: string; discountPercent: number; stockCap: number }>;
    },
    ipAddress?: string
  ): Promise<FlashSale> {
    if (!input.items || input.items.length === 0) throw new Error('Select at least one product for a flash sale.');
    const startMs = Date.parse(input.startsAt);
    const endMs = Date.parse(input.endsAt);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      throw new Error('Flash sale end date must be after start date.');
    }

    return this.db.transaction(async (tx) => {
      const id = `fls-${crypto.randomUUID()}`;
      const baseSlug = (input.slug || input.title.en || 'flash-sale')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'flash';
      const slug = `${baseSlug}-${crypto.randomInt(100, 999)}`;
      const nowMs = Date.now();
      const status: FlashSaleStatus = nowMs >= startMs && nowMs < endMs ? 'active' : nowMs >= endMs ? 'ended' : 'scheduled';
      const nowSql = toSqlTimestamp();

      await tx.execute(
        `INSERT INTO flash_sales (id, slug, title_json, bg_token, starts_at, ends_at, status, auto_revert, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          slug,
          JSON.stringify(input.title),
          input.bgToken || 'ember',
          toSqlTimestamp(new Date(startMs)),
          toSqlTimestamp(new Date(endMs)),
          status,
          input.autoRevert === false ? 0 : 1,
          nowSql,
        ]
      );

      for (const item of input.items) {
        const prod = await tx.queryOne<{ id: string; base_price_usd_cents: number }>(
          'SELECT id, base_price_usd_cents FROM products WHERE id = ? AND deleted_at IS NULL',
          [item.productId]
        );
        if (!prod) throw new Error(`Product ${item.productId} not found.`);
        const pct = Math.min(90, Math.max(1, Math.round(item.discountPercent)));
        const salePrice = Math.max(1, Math.round(Number(prod.base_price_usd_cents) * (100 - pct) / 100));
        await tx.execute(
          `INSERT INTO flash_sale_items (id, flash_sale_id, product_id, sale_price_usd_cents, discount_percent, stock_cap, claimed_count)
           VALUES (?, ?, ?, ?, ?, ?, 0)`,
          [`fsi-${crypto.randomUUID()}`, id, prod.id, salePrice, pct, Math.max(0, Math.trunc(item.stockCap || 0))]
        );
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.create_flash_sale',
        entityType: 'flash_sale',
        entityId: id,
        after: { slug, status, itemCount: input.items.length },
        ipAddress,
      });

      const [created] = await this.hydrateFlashSales(
        await tx.query<Record<string, unknown>>('SELECT * FROM flash_sales WHERE id = ?', [id]),
        tx
      );
      return created;
    });
  }

  async adminUpdateFlashSaleStatus(id: string, actorUserId: string, status: FlashSaleStatus, ipAddress?: string): Promise<FlashSale> {
    await this.db.execute('UPDATE flash_sales SET status = ? WHERE id = ?', [status, id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_flash_sale',
      entityType: 'flash_sale',
      entityId: id,
      after: { status },
      ipAddress,
    });
    const [row] = await this.hydrateFlashSales(
      await this.db.query<Record<string, unknown>>('SELECT * FROM flash_sales WHERE id = ?', [id])
    );
    if (!row) throw new Error('Flash sale not found.');
    return row;
  }

  async adminDeleteFlashSale(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM flash_sale_items WHERE flash_sale_id = ?', [id]);
    await this.db.execute('DELETE FROM flash_sales WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_flash_sale',
      entityType: 'flash_sale',
      entityId: id,
      ipAddress,
    });
  }

  // --- Marketing Campaigns ---
  private mapCampaignRow(row: Record<string, unknown>): Campaign {
    return {
      id: String(row.id),
      slug: String(row.slug),
      title: parseJson<LocalizedText>(row.title_json, { en: '', ar: '' }),
      subtitle: parseJson<LocalizedText>(row.subtitle_json, { en: '', ar: '' }),
      description: parseJson<LocalizedText>(row.description_json, { en: '', ar: '' }),
      heroImageUrl: row.hero_image_url ? String(row.hero_image_url) : null,
      bgToken: String(row.bg_token || 'ember') as BannerBgToken,
      startsAt: row.starts_at ? String(row.starts_at) : null,
      endsAt: row.ends_at ? String(row.ends_at) : null,
      status: String(row.status || 'draft') as CampaignStatus,
      featuredOfferIds: parseJson<string[]>(row.featured_offer_ids_json, []),
      featuredCouponCodes: parseJson<string[]>(row.featured_coupon_codes_json, []),
      featuredFlashSaleId: row.featured_flash_sale_id ? String(row.featured_flash_sale_id) : null,
      createdAt: String(row.created_at),
    };
  }

  async getActiveCampaigns(): Promise<Campaign[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM campaigns WHERE status IN ('active', 'scheduled') ORDER BY created_at DESC"
    );
    const nowMs = Date.now();
    return rows.map((r) => this.mapCampaignRow(r)).filter((c) => c.status === 'active' && isWithinSchedule(c.startsAt, c.endsAt, nowMs));
  }

  async getPublicCampaignBySlug(slug: string): Promise<Campaign | null> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      "SELECT * FROM campaigns WHERE slug = ? AND status != 'draft' LIMIT 1",
      [slug.trim()]
    );
    return row ? this.mapCampaignRow(row) : null;
  }

  async adminListCampaigns(): Promise<Campaign[]> {
    const rows = await this.db.query<Record<string, unknown>>('SELECT * FROM campaigns ORDER BY created_at DESC');
    return rows.map((r) => this.mapCampaignRow(r));
  }

  async adminCreateCampaign(
    actorUserId: string,
    input: {
      slug: string;
      title: LocalizedText;
      subtitle: LocalizedText;
      description: LocalizedText;
      heroImageUrl?: string | null;
      bgToken?: BannerBgToken;
      startsAt?: string | null;
      endsAt?: string | null;
      status?: CampaignStatus;
      featuredOfferIds?: string[];
      featuredCouponCodes?: string[];
      featuredFlashSaleId?: string | null;
    },
    ipAddress?: string
  ): Promise<Campaign> {
    const cleanSlug =
      input.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '') || `campaign-${crypto.randomInt(100, 999)}`;
    const dup = await this.db.queryOne<{ id: string }>('SELECT id FROM campaigns WHERE slug = ?', [cleanSlug]);
    if (dup) throw new Error(`Campaign slug '${cleanSlug}' already exists.`);

    const id = `cmp-${crypto.randomUUID()}`;
    const now = toSqlTimestamp();
    await this.db.execute(
      `INSERT INTO campaigns (id, slug, title_json, subtitle_json, description_json, hero_image_url, bg_token, starts_at, ends_at, status, featured_offer_ids_json, featured_coupon_codes_json, featured_flash_sale_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        cleanSlug,
        JSON.stringify(input.title),
        JSON.stringify(input.subtitle),
        JSON.stringify(input.description),
        input.heroImageUrl ? input.heroImageUrl.trim() : null,
        input.bgToken || 'ember',
        input.startsAt ? toSqlTimestamp(new Date(input.startsAt)) : null,
        input.endsAt ? toSqlTimestamp(new Date(input.endsAt)) : null,
        input.status || 'active',
        JSON.stringify(input.featuredOfferIds || []),
        JSON.stringify((input.featuredCouponCodes || []).map((c) => c.trim().toUpperCase()).filter(Boolean)),
        input.featuredFlashSaleId || null,
        now,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_campaign',
      entityType: 'campaign',
      entityId: id,
      after: { slug: cleanSlug, status: input.status || 'active' },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM campaigns WHERE id = ?', [id]);
    return this.mapCampaignRow(row!);
  }

  async adminUpdateCampaign(
    id: string,
    actorUserId: string,
    patch: Partial<{
      title: LocalizedText;
      subtitle: LocalizedText;
      description: LocalizedText;
      heroImageUrl: string | null;
      bgToken: BannerBgToken;
      startsAt: string | null;
      endsAt: string | null;
      status: CampaignStatus;
      featuredOfferIds: string[];
      featuredCouponCodes: string[];
      featuredFlashSaleId: string | null;
    }>,
    ipAddress?: string
  ): Promise<Campaign> {
    const existingRow = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM campaigns WHERE id = ?', [id]);
    if (!existingRow) throw new Error('Campaign not found.');
    const existing = this.mapCampaignRow(existingRow);

    await this.db.execute(
      `UPDATE campaigns SET title_json = ?, subtitle_json = ?, description_json = ?, hero_image_url = ?, bg_token = ?, starts_at = ?, ends_at = ?, status = ?, featured_offer_ids_json = ?, featured_coupon_codes_json = ?, featured_flash_sale_id = ? WHERE id = ?`,
      [
        JSON.stringify(patch.title ?? existing.title),
        JSON.stringify(patch.subtitle ?? existing.subtitle),
        JSON.stringify(patch.description ?? existing.description),
        patch.heroImageUrl !== undefined ? (patch.heroImageUrl ? patch.heroImageUrl.trim() : null) : existing.heroImageUrl ?? null,
        patch.bgToken ?? existing.bgToken,
        patch.startsAt !== undefined ? (patch.startsAt ? toSqlTimestamp(new Date(patch.startsAt)) : null) : existing.startsAt,
        patch.endsAt !== undefined ? (patch.endsAt ? toSqlTimestamp(new Date(patch.endsAt)) : null) : existing.endsAt,
        patch.status ?? existing.status,
        JSON.stringify(patch.featuredOfferIds ?? existing.featuredOfferIds),
        JSON.stringify(patch.featuredCouponCodes ?? existing.featuredCouponCodes),
        patch.featuredFlashSaleId !== undefined ? patch.featuredFlashSaleId : existing.featuredFlashSaleId ?? null,
        id,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_campaign',
      entityType: 'campaign',
      entityId: id,
      after: patch,
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM campaigns WHERE id = ?', [id]);
    return this.mapCampaignRow(row!);
  }

  async adminDeleteCampaign(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM campaigns WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_campaign',
      entityType: 'campaign',
      entityId: id,
      ipAddress,
    });
  }

  async sellerListOffers(sellerId: string): Promise<Offer[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT o.*, st.name_json AS seller_name_json
       FROM offers o
       LEFT JOIN stores st ON st.seller_id = o.seller_id
       WHERE o.seller_id = ?
       ORDER BY o.id DESC`,
      [sellerId]
    );
    return rows.map((r) => this.mapOfferRow(r));
  }

  async sellerProposeOffer(
    sellerId: string,
    actorUserId: string,
    input: {
      title: LocalizedText;
      offerType: OfferType;
      discountValue: number;
      targetType: 'seller' | 'product';
      targetId?: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
    },
    ipAddress?: string
  ): Promise<Offer> {
    const rules = await this.getSellerPromoRules();
    if (!rules.sellerOffersEnabled) {
      throw new Error('Seller-submitted offers are currently paused by marketplace administration.');
    }
    if (input.offerType === 'flash_percent' && !rules.allowFlashOffersBySellers) {
      throw new Error('Flash offers are restricted to admin campaigns under current marketplace rules.');
    }
    if (input.offerType !== 'fixed_usd_cents' && (input.discountValue < 1 || input.discountValue > rules.maxDiscountPercent)) {
      throw new Error(`Seller discount percent must be between 1% and ${rules.maxDiscountPercent}%.`);
    }
    if (input.offerType === 'fixed_usd_cents' && (input.discountValue < 100 || input.discountValue > rules.maxFixedDiscountUsdCents)) {
      throw new Error(
        `Seller fixed discount must be between $1.00 and $${(rules.maxFixedDiscountUsdCents / 100).toFixed(2)}.`
      );
    }

    const activeCntRow = await this.db.queryOne<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM offers WHERE seller_id = ? AND approval_status != 'rejected' AND active = 1",
      [sellerId]
    );
    if (Number(activeCntRow?.cnt ?? 0) >= rules.maxActiveOffersPerSeller) {
      throw new Error(`Maximum ${rules.maxActiveOffersPerSeller} active/pending offers allowed per seller.`);
    }

    let resolvedTargetId = sellerId;
    if (input.targetType === 'product') {
      if (!input.targetId) throw new Error('Select a product for product-level offers.');
      const prod = await this.db.queryOne<{ id: string }>(
        'SELECT id FROM products WHERE id = ? AND seller_id = ? AND deleted_at IS NULL',
        [input.targetId, sellerId]
      );
      if (!prod) throw new Error('Product does not belong to your store.');
      resolvedTargetId = prod.id;
    }

    const approvalStatus: OfferApprovalStatus = rules.requireAdminApproval ? 'pending' : 'approved';
    const id = `off-${crypto.randomUUID()}`;
    await this.db.execute(
      `INSERT INTO offers (id, seller_id, title_json, offer_type, discount_value, target_type, target_id, approval_status, starts_at, ends_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        sellerId,
        JSON.stringify(input.title),
        input.offerType,
        Math.round(input.discountValue),
        input.targetType,
        resolvedTargetId,
        approvalStatus,
        input.startsAt ? toSqlTimestamp(new Date(input.startsAt)) : null,
        input.endsAt ? toSqlTimestamp(new Date(input.endsAt)) : null,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'seller.propose_offer',
      entityType: 'offer',
      entityId: id,
      after: { sellerId, targetType: input.targetType, resolvedTargetId, approvalStatus },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM offers WHERE id = ?', [id]);
    return this.mapOfferRow(row!);
  }

  // --- Step 5: Customer Segments, Email Block Campaigns & Automated Flows ---
  private mapSegmentRow(row: Record<string, unknown>): CustomerSegment {
    return {
      id: String(row.id),
      name: parseJson<LocalizedText>(row.name_json, { en: 'Segment', ar: 'شريحة' }),
      description: String(row.description || ''),
      rules: parseJson<CustomerSegmentRule>(row.rules_json, { audienceScope: 'all_contacts' }),
      cachedMemberCount: Number(row.cached_member_count ?? 0),
      updatedAt: String(row.updated_at),
    };
  }

  private mapEmailCampaignRow(row: Record<string, unknown>): EmailCampaign {
    return {
      id: String(row.id),
      name: String(row.name),
      subject: parseJson<LocalizedText>(row.subject_json, { en: '', ar: '' }),
      previewText: parseJson<LocalizedText>(row.preview_text_json, { en: '', ar: '' }),
      segmentId: row.segment_id ? String(row.segment_id) : null,
      blocks: parseJson<EmailBlock[]>(row.blocks_json, []),
      status: String(row.status || 'draft') as EmailCampaignStatus,
      scheduledAt: row.scheduled_at ? String(row.scheduled_at) : null,
      sentCount: Number(row.sent_count ?? 0),
      failedCount: Number(row.failed_count ?? 0),
      unsubscribedCount: Number(row.unsubscribed_count ?? 0),
      createdAt: String(row.created_at),
      sentAt: row.sent_at ? String(row.sent_at) : null,
    };
  }

  private mapAutomationFlowRow(row: Record<string, unknown>): AutomationFlow {
    return {
      id: String(row.id),
      name: parseJson<LocalizedText>(row.name_json, { en: 'Automation Flow', ar: 'سير عمل تلقائي' }),
      triggerType: String(row.trigger_type || 'welcome_subscriber') as AutomationTriggerType,
      delayHours: Number(row.delay_hours ?? 0),
      subject: parseJson<LocalizedText>(row.subject_json, { en: '', ar: '' }),
      blocks: parseJson<EmailBlock[]>(row.blocks_json, []),
      attachCouponCode: row.attach_coupon_code ? String(row.attach_coupon_code) : null,
      active: Boolean(row.active),
      totalTriggered: Number(row.total_triggered ?? 0),
      totalSent: Number(row.total_sent ?? 0),
      lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
      createdAt: String(row.created_at),
    };
  }

  async evaluateSegmentContacts(rules: CustomerSegmentRule): Promise<SegmentContact[]> {
    const [customerRows, orderRows, addressRows, subscriberRows] = await Promise.all([
      this.db.query<{ id: string; name: string; email: string; preferred_locale: string }>(
        "SELECT id, name, email, preferred_locale FROM users WHERE role_key = 'customer' AND deleted_at IS NULL AND is_blocked = 0"
      ),
      this.db.query<{ user_id: string; governorate: string; grand_total_usd_cents: number; created_at: string }>(
        'SELECT user_id, governorate, grand_total_usd_cents, created_at FROM orders WHERE user_id IS NOT NULL ORDER BY created_at DESC'
      ),
      this.db.query<{ user_id: string; governorate: string }>(
        'SELECT user_id, governorate FROM addresses WHERE is_default = 1'
      ),
      this.db.query<{ email: string; locale: string; status: string; unsubscribe_token: string }>(
        'SELECT email, locale, status, unsubscribe_token FROM newsletter_subscribers'
      ),
    ]);

    const orderStatsByUserId = new Map<
      string,
      { count: number; totalSpentUsdCents: number; latestGovernorate?: string; lastOrderAt?: string }
    >();
    for (const o of orderRows) {
      const uid = String(o.user_id);
      const prev = orderStatsByUserId.get(uid);
      if (!prev) {
        orderStatsByUserId.set(uid, {
          count: 1,
          totalSpentUsdCents: Number(o.grand_total_usd_cents || 0),
          latestGovernorate: o.governorate ? String(o.governorate) : undefined,
          lastOrderAt: String(o.created_at),
        });
      } else {
        prev.count += 1;
        prev.totalSpentUsdCents += Number(o.grand_total_usd_cents || 0);
      }
    }

    const defaultGovByUserId = new Map<string, string>();
    for (const a of addressRows) {
      if (a.governorate) defaultGovByUserId.set(String(a.user_id), String(a.governorate));
    }

    const subByEmail = new Map<string, { locale: 'en' | 'ar'; status: string; unsubscribeToken: string }>();
    const unsubscribedEmails = new Set<string>();
    for (const s of subscriberRows) {
      const emailNorm = String(s.email).trim().toLowerCase();
      subByEmail.set(emailNorm, {
        locale: s.locale === 'ar' ? 'ar' : 'en',
        status: String(s.status),
        unsubscribeToken: String(s.unsubscribe_token),
      });
      if (s.status === 'unsubscribed') {
        unsubscribedEmails.add(emailNorm);
      }
    }

    const customerByEmail = new Map<
      string,
      {
        email: string;
        name: string;
        locale: 'en' | 'ar';
        governorate?: string;
        orderCount: number;
        totalSpentUsdCents: number;
        lastOrderAt?: string;
      }
    >();
    for (const u of customerRows) {
      const emailNorm = String(u.email).trim().toLowerCase();
      const stats = orderStatsByUserId.get(String(u.id));
      const gov = stats?.latestGovernorate || defaultGovByUserId.get(String(u.id));
      customerByEmail.set(emailNorm, {
        email: emailNorm,
        name: String(u.name || emailNorm),
        locale: u.preferred_locale === 'ar' ? 'ar' : 'en',
        governorate: gov,
        orderCount: stats?.count || 0,
        totalSpentUsdCents: stats?.totalSpentUsdCents || 0,
        lastOrderAt: stats?.lastOrderAt,
      });
    }

    const contactsMap = new Map<string, SegmentContact & { _lastOrderAt?: string }>();

    if (rules.audienceScope === 'registered_customers' || rules.audienceScope === 'all_contacts') {
      for (const [emailNorm, cust] of customerByEmail.entries()) {
        if (unsubscribedEmails.has(emailNorm)) continue;
        const sub = subByEmail.get(emailNorm);
        contactsMap.set(emailNorm, {
          email: emailNorm,
          name: cust.name,
          locale: cust.locale,
          governorate: cust.governorate,
          orderCount: cust.orderCount,
          totalSpentUsdCents: cust.totalSpentUsdCents,
          source: 'customer',
          unsubscribeToken: sub?.unsubscribeToken,
          _lastOrderAt: cust.lastOrderAt,
        });
      }
    }

    if (rules.audienceScope === 'newsletter_subscribers' || rules.audienceScope === 'all_contacts') {
      for (const [emailNorm, sub] of subByEmail.entries()) {
        if (sub.status === 'unsubscribed') continue;
        if (contactsMap.has(emailNorm)) continue;
        const cust = customerByEmail.get(emailNorm);
        contactsMap.set(emailNorm, {
          email: emailNorm,
          name: cust?.name || emailNorm.split('@')[0],
          locale: cust?.locale || sub.locale,
          governorate: cust?.governorate,
          orderCount: cust?.orderCount || 0,
          totalSpentUsdCents: cust?.totalSpentUsdCents || 0,
          source: 'subscriber',
          unsubscribeToken: sub.unsubscribeToken,
          _lastOrderAt: cust?.lastOrderAt,
        });
      }
    }

    const nowMs = Date.now();
    const govFilter = rules.governorate && rules.governorate !== 'all' ? rules.governorate.trim().toLowerCase() : '';
    const minOrders = typeof rules.minOrderCount === 'number' && Number.isFinite(rules.minOrderCount) ? rules.minOrderCount : undefined;
    const maxOrders = typeof rules.maxOrderCount === 'number' && Number.isFinite(rules.maxOrderCount) ? rules.maxOrderCount : undefined;
    const minSpent =
      typeof rules.minTotalSpentUsdCents === 'number' && Number.isFinite(rules.minTotalSpentUsdCents)
        ? rules.minTotalSpentUsdCents
        : undefined;
    const minDaysInactive =
      typeof rules.daysSinceLastOrder === 'number' && Number.isFinite(rules.daysSinceLastOrder) && rules.daysSinceLastOrder > 0
        ? rules.daysSinceLastOrder
        : undefined;

    const results: SegmentContact[] = [];
    for (const c of contactsMap.values()) {
      if (govFilter && (c.governorate || '').toLowerCase() !== govFilter) continue;
      if (minOrders !== undefined && c.orderCount < minOrders) continue;
      if (maxOrders !== undefined && c.orderCount > maxOrders) continue;
      if (minSpent !== undefined && c.totalSpentUsdCents < minSpent) continue;
      if (rules.locale && rules.locale !== 'all' && c.locale !== rules.locale) continue;
      if (minDaysInactive !== undefined) {
        if (!c._lastOrderAt) continue;
        const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(c._lastOrderAt)
          ? c._lastOrderAt.replace(' ', 'T') + 'Z'
          : c._lastOrderAt;
        const orderMs = new Date(iso).getTime();
        if (Number.isNaN(orderMs)) continue;
        const days = (nowMs - orderMs) / 86_400_000;
        if (days < minDaysInactive) continue;
      }
      const { _lastOrderAt: _drop, ...clean } = c;
      results.push(clean);
    }

    return results;
  }

  async adminListSegments(): Promise<CustomerSegment[]> {
    const rows = await this.db.query<Record<string, unknown>>('SELECT * FROM customer_segments ORDER BY updated_at DESC');
    return rows.map((r) => this.mapSegmentRow(r));
  }

  async adminPreviewSegment(rules: CustomerSegmentRule): Promise<{ count: number; contacts: SegmentContact[] }> {
    const contacts = await this.evaluateSegmentContacts(rules);
    return { count: contacts.length, contacts: contacts.slice(0, 50) };
  }

  async adminCreateSegment(
    actorUserId: string,
    input: { name: LocalizedText; description?: string; rules: CustomerSegmentRule },
    ipAddress?: string
  ): Promise<CustomerSegment> {
    const contacts = await this.evaluateSegmentContacts(input.rules);
    const id = `seg-${crypto.randomUUID()}`;
    const now = toSqlTimestamp();
    await this.db.execute(
      `INSERT INTO customer_segments (id, name_json, description, rules_json, cached_member_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, JSON.stringify(input.name), (input.description || '').trim().slice(0, 400), JSON.stringify(input.rules), contacts.length, now]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_segment',
      entityType: 'customer_segment',
      entityId: id,
      after: { name: input.name.en, memberCount: contacts.length, rules: input.rules },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM customer_segments WHERE id = ?', [id]);
    return this.mapSegmentRow(row!);
  }

  async adminDeleteSegment(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM customer_segments WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_segment',
      entityType: 'customer_segment',
      entityId: id,
      ipAddress,
    });
  }

  async adminListEmailCampaigns(): Promise<EmailCampaign[]> {
    const rows = await this.db.query<Record<string, unknown>>('SELECT * FROM email_campaigns ORDER BY created_at DESC');
    return rows.map((r) => this.mapEmailCampaignRow(r));
  }

  async adminCreateEmailCampaign(
    actorUserId: string,
    input: {
      name: string;
      subject: LocalizedText;
      previewText?: LocalizedText;
      segmentId?: string | null;
      blocks: EmailBlock[];
      scheduledAt?: string | null;
    },
    ipAddress?: string
  ): Promise<EmailCampaign> {
    const id = `ecmp-${crypto.randomUUID()}`;
    const now = toSqlTimestamp();
    const scheduledSql = input.scheduledAt ? toSqlTimestamp(new Date(input.scheduledAt)) : null;
    const status: EmailCampaignStatus = scheduledSql ? 'scheduled' : 'draft';
    await this.db.execute(
      `INSERT INTO email_campaigns (id, name, subject_json, preview_text_json, segment_id, blocks_json, status, scheduled_at, sent_count, failed_count, unsubscribed_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`,
      [
        id,
        input.name.trim().slice(0, 160),
        JSON.stringify(input.subject),
        JSON.stringify(input.previewText || { en: '', ar: '' }),
        input.segmentId || null,
        JSON.stringify(input.blocks),
        status,
        scheduledSql,
        now,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_email_campaign',
      entityType: 'email_campaign',
      entityId: id,
      after: { name: input.name, status, blockCount: input.blocks.length },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM email_campaigns WHERE id = ?', [id]);
    return this.mapEmailCampaignRow(row!);
  }

  async adminDeleteEmailCampaign(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM email_campaigns WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_email_campaign',
      entityType: 'email_campaign',
      entityId: id,
      ipAddress,
    });
  }

  async enqueueEmailCampaignRecipients(campaignId: string): Promise<number> {
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM email_campaigns WHERE id = ?', [campaignId]);
    if (!row) throw new Error('Email campaign not found.');
    const campaign = this.mapEmailCampaignRow(row);

    let rules: CustomerSegmentRule = { audienceScope: 'all_contacts' };
    if (campaign.segmentId) {
      const segRow = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM customer_segments WHERE id = ?', [
        campaign.segmentId,
      ]);
      if (segRow) {
        rules = parseJson<CustomerSegmentRule>(segRow.rules_json, rules);
      }
    }

    const contacts = await this.evaluateSegmentContacts(rules);
    if (campaign.segmentId) {
      await this.db.execute('UPDATE customer_segments SET cached_member_count = ?, updated_at = ? WHERE id = ?', [
        contacts.length,
        toSqlTimestamp(),
        campaign.segmentId,
      ]);
    }

    const now = toSqlTimestamp();
    if (contacts.length === 0) {
      await this.db.execute("UPDATE email_campaigns SET status = 'sent', sent_at = COALESCE(sent_at, ?) WHERE id = ?", [
        now,
        campaign.id,
      ]);
      return 0;
    }

    await this.db.execute("UPDATE email_campaigns SET status = 'queued', sent_at = COALESCE(sent_at, ?) WHERE id = ?", [
      now,
      campaign.id,
    ]);

    for (const c of contacts) {
      const locale = c.locale === 'ar' ? 'ar' : 'en';
      const subject = (locale === 'ar' ? campaign.subject.ar : campaign.subject.en) || campaign.subject.en || campaign.name;
      const previewText =
        (locale === 'ar' ? campaign.previewText.ar : campaign.previewText.en) || campaign.previewText.en || '';
      const payload: MarketingEmailJobPayload = {
        campaignId: campaign.id,
        to: c.email,
        locale,
        subject,
        previewText,
        blocks: campaign.blocks,
        unsubscribeToken: c.unsubscribeToken || null,
      };
      await enqueueJob(this.db, 'send_marketing_email', payload as unknown as Record<string, unknown>);
    }

    return contacts.length;
  }

  async adminSendOrScheduleEmailCampaign(
    id: string,
    actorUserId: string,
    opts: { sendNow?: boolean; scheduledAt?: string | null },
    ipAddress?: string
  ): Promise<{ campaign: EmailCampaign; queuedCount: number }> {
    const existing = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM email_campaigns WHERE id = ?', [id]);
    if (!existing) throw new Error('Email campaign not found.');

    let queuedCount = 0;
    if (opts.sendNow) {
      queuedCount = await this.enqueueEmailCampaignRecipients(id);
    } else if (opts.scheduledAt) {
      await this.db.execute("UPDATE email_campaigns SET status = 'scheduled', scheduled_at = ? WHERE id = ?", [
        toSqlTimestamp(new Date(opts.scheduledAt)),
        id,
      ]);
    }

    await writeAuditLog(this.db, {
      actorUserId,
      action: opts.sendNow ? 'admin.send_email_campaign' : 'admin.schedule_email_campaign',
      entityType: 'email_campaign',
      entityId: id,
      after: { queuedCount, scheduledAt: opts.scheduledAt || null },
      ipAddress,
    });

    const updated = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM email_campaigns WHERE id = ?', [id]);
    return { campaign: this.mapEmailCampaignRow(updated!), queuedCount };
  }

  async adminListAutomationFlows(): Promise<AutomationFlow[]> {
    const rows = await this.db.query<Record<string, unknown>>('SELECT * FROM automation_flows ORDER BY created_at DESC');
    return rows.map((r) => this.mapAutomationFlowRow(r));
  }

  async adminCreateAutomationFlow(
    actorUserId: string,
    input: {
      name: LocalizedText;
      triggerType: AutomationTriggerType;
      delayHours: number;
      subject: LocalizedText;
      blocks: EmailBlock[];
      attachCouponCode?: string | null;
      active?: boolean;
    },
    ipAddress?: string
  ): Promise<AutomationFlow> {
    const id = `flow-${crypto.randomUUID()}`;
    const now = toSqlTimestamp();
    await this.db.execute(
      `INSERT INTO automation_flows (id, name_json, trigger_type, delay_hours, subject_json, blocks_json, attach_coupon_code, active, total_triggered, total_sent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [
        id,
        JSON.stringify(input.name),
        input.triggerType,
        Math.max(0, Math.round(input.delayHours)),
        JSON.stringify(input.subject),
        JSON.stringify(input.blocks),
        input.attachCouponCode ? input.attachCouponCode.trim().toUpperCase() : null,
        input.active === false ? 0 : 1,
        now,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_automation_flow',
      entityType: 'automation_flow',
      entityId: id,
      after: { triggerType: input.triggerType, delayHours: input.delayHours, active: input.active !== false },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM automation_flows WHERE id = ?', [id]);
    return this.mapAutomationFlowRow(row!);
  }

  async adminUpdateAutomationFlow(
    id: string,
    actorUserId: string,
    patch: Partial<{
      name: LocalizedText;
      delayHours: number;
      subject: LocalizedText;
      blocks: EmailBlock[];
      attachCouponCode: string | null;
      active: boolean;
    }>,
    ipAddress?: string
  ): Promise<AutomationFlow> {
    const existingRow = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM automation_flows WHERE id = ?', [id]);
    if (!existingRow) throw new Error('Automation flow not found.');
    const existing = this.mapAutomationFlowRow(existingRow);

    await this.db.execute(
      `UPDATE automation_flows SET name_json = ?, delay_hours = ?, subject_json = ?, blocks_json = ?, attach_coupon_code = ?, active = ? WHERE id = ?`,
      [
        JSON.stringify(patch.name ?? existing.name),
        patch.delayHours !== undefined ? Math.max(0, Math.round(patch.delayHours)) : existing.delayHours,
        JSON.stringify(patch.subject ?? existing.subject),
        JSON.stringify(patch.blocks ?? existing.blocks),
        patch.attachCouponCode !== undefined
          ? patch.attachCouponCode
            ? patch.attachCouponCode.trim().toUpperCase()
            : null
          : existing.attachCouponCode ?? null,
        patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active ? 1 : 0,
        id,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_automation_flow',
      entityType: 'automation_flow',
      entityId: id,
      after: patch,
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM automation_flows WHERE id = ?', [id]);
    return this.mapAutomationFlowRow(row!);
  }

  async adminDeleteAutomationFlow(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM automation_executions WHERE flow_id = ?', [id]);
    await this.db.execute('DELETE FROM automation_flows WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_automation_flow',
      entityType: 'automation_flow',
      entityId: id,
      ipAddress,
    });
  }

  // --- Step 6: Seller Promotion Rules & Marketing Attribution Analytics ---
  async getSellerPromoRules(): Promise<SellerPromoRules> {
    const kCol = this.db.driver === 'mysql' ? '`key`' : 'key';
    const row = await this.db.queryOne<{ value_json: string; updated_at: string }>(
      `SELECT value_json, updated_at FROM settings WHERE ${kCol} = 'seller_promo_rules'`
    );
    const parsed = row ? parseJson<Partial<SellerPromoRules>>(row.value_json, {}) : {};
    return {
      sellerOffersEnabled: parsed.sellerOffersEnabled !== undefined ? Boolean(parsed.sellerOffersEnabled) : true,
      requireAdminApproval: parsed.requireAdminApproval !== undefined ? Boolean(parsed.requireAdminApproval) : true,
      maxDiscountPercent: Math.max(5, Math.min(90, Math.round(Number(parsed.maxDiscountPercent ?? 60)))),
      maxFixedDiscountUsdCents: Math.max(500, Math.round(Number(parsed.maxFixedDiscountUsdCents ?? 15000))),
      maxActiveOffersPerSeller: Math.max(1, Math.min(50, Math.round(Number(parsed.maxActiveOffersPerSeller ?? 5)))),
      allowFlashOffersBySellers:
        parsed.allowFlashOffersBySellers !== undefined ? Boolean(parsed.allowFlashOffersBySellers) : true,
      updatedAt: String(row?.updated_at || toSqlTimestamp()),
    };
  }

  async adminUpdateSellerPromoRules(
    actorUserId: string,
    patch: Partial<Omit<SellerPromoRules, 'updatedAt'>>,
    ipAddress?: string
  ): Promise<SellerPromoRules> {
    const current = await this.getSellerPromoRules();
    const next: SellerPromoRules = {
      sellerOffersEnabled: patch.sellerOffersEnabled ?? current.sellerOffersEnabled,
      requireAdminApproval: patch.requireAdminApproval ?? current.requireAdminApproval,
      maxDiscountPercent: Math.max(5, Math.min(90, Math.round(Number(patch.maxDiscountPercent ?? current.maxDiscountPercent)))),
      maxFixedDiscountUsdCents: Math.max(
        500,
        Math.round(Number(patch.maxFixedDiscountUsdCents ?? current.maxFixedDiscountUsdCents))
      ),
      maxActiveOffersPerSeller: Math.max(
        1,
        Math.min(50, Math.round(Number(patch.maxActiveOffersPerSeller ?? current.maxActiveOffersPerSeller)))
      ),
      allowFlashOffersBySellers: patch.allowFlashOffersBySellers ?? current.allowFlashOffersBySellers,
      updatedAt: toSqlTimestamp(),
    };
    const kCol = this.db.driver === 'mysql' ? '`key`' : 'key';
    const jsonVal = JSON.stringify(next);
    await this.db.execute(
      this.db.driver === 'mysql'
        ? `INSERT INTO settings (${kCol}, value_json, updated_at) VALUES ('seller_promo_rules', ?, ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = VALUES(updated_at)`
        : `INSERT INTO settings (${kCol}, value_json, updated_at) VALUES ('seller_promo_rules', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [jsonVal, next.updatedAt]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_seller_promo_rules',
      entityType: 'settings',
      entityId: 'seller_promo_rules',
      before: current,
      after: next,
      ipAddress,
    });
    return next;
  }

  async getMarketingAnalytics(): Promise<MarketingAnalyticsSummary> {
    const [
      orderRows,
      orderItemRows,
      couponRows,
      offersList,
      flashSalesList,
      campaignsList,
      bannersList,
      popupsList,
      featuredList,
      emailCampaignsList,
      flowsList,
    ] = await Promise.all([
      this.db.query<{
        id: string;
        coupon_code: string | null;
        discount_total_usd_cents: number;
        grand_total_usd_cents: number;
      }>('SELECT id, coupon_code, discount_total_usd_cents, grand_total_usd_cents FROM orders'),
      this.db.query<{
        order_id: string;
        product_id: string;
        seller_id: string;
        line_total_usd_cents: number;
      }>(
        `SELECT so.order_id, oi.product_id, so.seller_id, oi.line_total_usd_cents
         FROM order_items oi
         INNER JOIN sub_orders so ON so.id = oi.sub_order_id`
      ),
      this.db.query<Record<string, unknown>>('SELECT * FROM coupons ORDER BY used_count DESC, code ASC'),
      this.adminListOffers(),
      this.adminListFlashSales(),
      this.adminListCampaigns(),
      this.adminListBanners(),
      this.adminListPopups(),
      this.adminListFeaturedPlacements(),
      this.adminListEmailCampaigns(),
      this.adminListAutomationFlows(),
    ]);

    const coupons = couponRows.map((c) => this.mapCouponRow(c));

    // Build product/seller -> order mapping for attribution
    const orderItemsByOrderId = new Map<string, Array<{ productId: string; sellerId: string; lineTotalUsdCents: number }>>();
    for (const oi of orderItemRows) {
      const list = orderItemsByOrderId.get(oi.order_id) || [];
      list.push({
        productId: String(oi.product_id),
        sellerId: String(oi.seller_id),
        lineTotalUsdCents: Number(oi.line_total_usd_cents || 0),
      });
      orderItemsByOrderId.set(oi.order_id, list);
    }

    const activeOfferTargets = new Set<string>();
    const offerTargetById = new Map<string, { targetType: string; targetId?: string | null; sellerId?: string | null }>();
    for (const off of offersList) {
      offerTargetById.set(off.id, { targetType: off.targetType, targetId: off.targetId, sellerId: off.sellerId });
      if (off.approvalStatus === 'approved' && off.active) {
        if (off.targetId) activeOfferTargets.add(`${off.targetType}:${off.targetId}`);
        else if (off.targetType === 'all') activeOfferTargets.add('all');
      }
    }

    const flashProductIds = new Set<string>();
    const flashProductsBySaleId = new Map<string, Set<string>>();
    for (const fs of flashSalesList) {
      const s = new Set<string>();
      for (const item of fs.items) {
        flashProductIds.add(item.productId);
        s.add(item.productId);
      }
      flashProductsBySaleId.set(fs.id, s);
    }

    let totalOrderGmvUsdCents = 0;
    let promoAttributedGmvUsdCents = 0;
    let totalDiscountsGrantedUsdCents = 0;
    let couponOrdersCount = 0;

    const ordersByCoupon = new Map<string, { ordersCount: number; revenueUsdCents: number; discountUsdCents: number }>();

    for (const o of orderRows) {
      const grand = Number(o.grand_total_usd_cents || 0);
      const disc = Number(o.discount_total_usd_cents || 0);
      const code = o.coupon_code ? String(o.coupon_code).trim().toUpperCase() : '';
      totalOrderGmvUsdCents += grand;
      totalDiscountsGrantedUsdCents += disc;

      if (code) {
        couponOrdersCount += 1;
        const prev = ordersByCoupon.get(code) || { ordersCount: 0, revenueUsdCents: 0, discountUsdCents: 0 };
        prev.ordersCount += 1;
        prev.revenueUsdCents += grand;
        prev.discountUsdCents += disc;
        ordersByCoupon.set(code, prev);
      }

      const items = orderItemsByOrderId.get(o.id) || [];
      const hasFlashItem = items.some((it) => flashProductIds.has(it.productId));
      const hasOfferItem =
        activeOfferTargets.has('all') ||
        items.some(
          (it) =>
            activeOfferTargets.has(`product:${it.productId}`) || activeOfferTargets.has(`seller:${it.sellerId}`)
        );

      if (code || disc > 0 || hasFlashItem || hasOfferItem) {
        promoAttributedGmvUsdCents += grand;
      }
    }

    const couponAttribution = coupons.map((c) => {
      const stats = ordersByCoupon.get(c.code.toUpperCase()) || {
        ordersCount: 0,
        revenueUsdCents: 0,
        discountUsdCents: 0,
      };
      return {
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountValue,
        usedCount: c.usedCount,
        maxUses: c.maxUses ?? null,
        ordersCount: stats.ordersCount,
        revenueUsdCents: stats.revenueUsdCents,
        discountUsdCents: stats.discountUsdCents,
      };
    });

    const campaignAttribution = campaignsList.map((cmp) => {
      const couponSet = new Set(cmp.featuredCouponCodes.map((c) => c.toUpperCase()));
      const flashSet = cmp.featuredFlashSaleId ? flashProductsBySaleId.get(cmp.featuredFlashSaleId) || new Set<string>() : new Set<string>();
      const offerTargets = cmp.featuredOfferIds.map((oid) => offerTargetById.get(oid)).filter(Boolean);

      let ordersCount = 0;
      let revenueUsdCents = 0;
      let discountUsdCents = 0;
      for (const o of orderRows) {
        const code = o.coupon_code ? String(o.coupon_code).trim().toUpperCase() : '';
        const items = orderItemsByOrderId.get(o.id) || [];
        const matchedCoupon = Boolean(code && couponSet.has(code));
        const matchedFlash = items.some((it) => flashSet.has(it.productId));
        const matchedOffer = offerTargets.some(
          (ot) =>
            ot!.targetType === 'all' ||
            items.some(
              (it) =>
                (ot!.targetType === 'product' && it.productId === ot!.targetId) ||
                (ot!.targetType === 'seller' && it.sellerId === ot!.targetId)
            )
        );
        if (matchedCoupon || matchedFlash || matchedOffer) {
          ordersCount += 1;
          revenueUsdCents += Number(o.grand_total_usd_cents || 0);
          discountUsdCents += Number(o.discount_total_usd_cents || 0);
        }
      }

      return {
        id: cmp.id,
        slug: cmp.slug,
        title: cmp.title,
        status: cmp.status,
        ordersCount,
        revenueUsdCents,
        discountUsdCents,
      };
    });

    const flashSalePerformance = flashSalesList.map((fs) => ({
      id: fs.id,
      slug: fs.slug,
      title: fs.title,
      status: fs.status,
      itemsCount: fs.items.length,
      soldCount: fs.items.reduce((s, it) => s + it.claimedCount, 0),
      stockCapTotal: fs.items.reduce((s, it) => s + it.stockCap, 0),
      estimatedRevenueUsdCents: fs.items.reduce((s, it) => s + it.salePriceUsdCents * it.claimedCount, 0),
    }));

    const bannerImpressions = bannersList.reduce((s, b) => s + b.impressions, 0);
    const bannerClicks = bannersList.reduce((s, b) => s + b.clicks, 0);
    const bannerBotFiltered = bannersList.reduce((s, b) => s + (b.botFilteredCount ?? 0), 0);
    const bannerCtrBps = bannerImpressions > 0 ? Math.round((bannerClicks * 10000) / bannerImpressions) : 0;

    const popupImpressions = popupsList.reduce((s, p) => s + p.impressions, 0);
    const popupConversions = popupsList.reduce((s, p) => s + p.conversions, 0);
    const popupDismissals = popupsList.reduce((s, p) => s + p.dismissals, 0);
    const popupConversionBps = popupImpressions > 0 ? Math.round((popupConversions * 10000) / popupImpressions) : 0;

    const emailDeliveredCount =
      emailCampaignsList.reduce((s, c) => s + c.sentCount, 0) + flowsList.reduce((s, f) => s + f.totalSent, 0);
    const emailFailedCount = emailCampaignsList.reduce((s, c) => s + c.failedCount, 0);
    const emailUnsubscribedSkipped = emailCampaignsList.reduce((s, c) => s + c.unsubscribedCount, 0);

    return {
      kpis: {
        totalOrderGmvUsdCents,
        promoAttributedGmvUsdCents,
        totalDiscountsGrantedUsdCents,
        couponOrdersCount,
        bannerImpressions,
        bannerClicks,
        bannerBotFiltered,
        bannerCtrBps,
        popupImpressions,
        popupConversions,
        popupDismissals,
        popupConversionBps,
        emailDeliveredCount,
        emailFailedCount,
        emailUnsubscribedSkipped,
      },
      couponAttribution,
      campaignAttribution,
      flashSalePerformance,
      placementsTelemetry: {
        banners: bannersList.map((b) => ({
          id: b.id,
          title: b.title,
          placement: b.placement,
          impressions: b.impressions,
          clicks: b.clicks,
          botFilteredCount: b.botFilteredCount ?? 0,
          ctrBps: b.impressions > 0 ? Math.round((b.clicks * 10000) / b.impressions) : 0,
        })),
        popups: popupsList.map((p) => ({
          id: p.id,
          title: p.title,
          popupType: p.popupType,
          impressions: p.impressions,
          conversions: p.conversions,
          dismissals: p.dismissals,
          conversionBps: p.impressions > 0 ? Math.round((p.conversions * 10000) / p.impressions) : 0,
        })),
        featuredSlots: featuredList.map((f) => ({
          id: f.id,
          slotKey: f.slotKey,
          targetType: f.targetType,
          impressions: f.impressions,
          clicks: f.clicks,
          ctrBps: f.impressions > 0 ? Math.round((f.clicks * 10000) / f.impressions) : 0,
        })),
      },
      emailPerformance: {
        campaigns: emailCampaignsList.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          sentCount: c.sentCount,
          failedCount: c.failedCount,
          unsubscribedCount: c.unsubscribedCount,
        })),
        automations: flowsList.map((f) => ({
          id: f.id,
          name: f.name,
          triggerType: f.triggerType,
          active: f.active,
          totalTriggered: f.totalTriggered,
          totalSent: f.totalSent,
        })),
      },
    };
  }

  // =========================================================================
  // PHASE C: Customer Auth, Addresses, Notifications, Cases, Support,
  //          Seller Catalog/Staff/Logistics, & Admin Moderation/Operations
  // =========================================================================

  async getBrands(): Promise<BrandItem[]> {
    const rows = await this.db.query<{ id: string; slug: string; name_json: string; active: number | boolean }>(
      'SELECT id, slug, name_json, active FROM brands WHERE active = 1 ORDER BY slug ASC'
    );
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: parseJson<LocalizedText>(r.name_json, { en: r.slug, ar: r.slug }),
      active: Boolean(r.active),
    }));
  }

  async getAttributes(): Promise<AttributeItem[]> {
    const rows = await this.db.query<{ id: string; code: string; name_json: string; values_json: string }>(
      'SELECT id, code, name_json, values_json FROM attributes ORDER BY code ASC'
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: parseJson<LocalizedText>(r.name_json, { en: r.code, ar: r.code }),
      values: parseJson<string[]>(r.values_json, []),
    }));
  }

  async createNotification(txOrDb: DbTx, userId: string, title: LocalizedText, body: LocalizedText): Promise<void> {
    await txOrDb.execute(
      'INSERT INTO notifications (id, user_id, title_json, body_json, read_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
      [`ntf-${crypto.randomUUID()}`, userId, JSON.stringify(title), JSON.stringify(body), toSqlTimestamp()]
    );
  }

  async getUserNotifications(userId: string): Promise<NotificationItem[]> {
    const rows = await this.db.query<{
      id: string;
      user_id: string;
      title_json: string;
      body_json: string;
      read_at: string | null;
      created_at: string;
    }>('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60', [userId]);

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: parseJson<LocalizedText>(r.title_json, { en: '', ar: '' }),
      body: parseJson<LocalizedText>(r.body_json, { en: '', ar: '' }),
      readAt: r.read_at ? String(r.read_at) : null,
      createdAt: String(r.created_at),
    }));
  }

  async markNotificationRead(userId: string, idOrAll: string): Promise<{ updated: number }> {
    const now = toSqlTimestamp();
    if (idOrAll === 'all') {
      const res = await this.db.execute(
        'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
        [now, userId]
      );
      return { updated: res.affectedRows };
    }
    const res = await this.db.execute(
      'UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL',
      [now, idOrAll, userId]
    );
    return { updated: res.affectedRows };
  }

  async requestPasswordReset(email: string, ipAddress?: string): Promise<{ ok: boolean; devResetToken?: string }> {
    const emailNorm = email.trim().toLowerCase();
    const user = await this.db.queryOne<{
      id: string;
      name: string;
      email: string;
      preferred_locale: string;
      deleted_at: string | null;
      is_blocked: number | boolean;
    }>('SELECT id, name, email, preferred_locale, deleted_at, is_blocked FROM users WHERE LOWER(email) = ? LIMIT 1', [
      emailNorm,
    ]);

    if (!user || user.deleted_at || user.is_blocked) {
      return { ok: true };
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = sha256Hex(rawToken);
    const now = toSqlTimestamp();
    const expiresAt = toSqlTimestamp(new Date(Date.now() + 60 * 60_000));

    await this.db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO password_resets (id, user_id, token_hash, purpose, expires_at, used_at, created_at)
         VALUES (?, ?, ?, 'password_reset', ?, NULL, ?)`,
        [`pwr-${crypto.randomUUID()}`, user.id, tokenHash, expiresAt, now]
      );

      await queueEmail(tx, {
        to: user.email,
        templateKey: 'password_reset',
        locale: user.preferred_locale === 'ar' ? 'ar' : 'en',
        vars: {
          name: user.name,
          token: rawToken,
          link: `/account?resetToken=${rawToken}`,
        },
      });

      await writeAuditLog(tx, {
        actorUserId: user.id,
        action: 'auth.password_reset_requested',
        entityType: 'user',
        entityId: user.id,
        ipAddress,
      });
    });

    const isProd = process.env.NODE_ENV === 'production';
    const hasSmtp = Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
    return !isProd && !hasSmtp ? { ok: true, devResetToken: rawToken } : { ok: true };
  }

  async confirmPasswordReset(token: string, newPassword: string, ipAddress?: string): Promise<{ ok: boolean }> {
    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) throw new Error(pwErr);

    const tokenHash = sha256Hex(token.trim());
    const now = toSqlTimestamp();

    return this.db.transaction(async (tx) => {
      const resetRow = await tx.queryOne<{
        id: string;
        user_id: string;
        expires_at: string;
        used_at: string | null;
      }>(
        "SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ? AND purpose = 'password_reset' LIMIT 1",
        [tokenHash]
      );

      if (!resetRow || resetRow.used_at || String(resetRow.expires_at) <= now) {
        throw new Error('Password reset token is invalid or expired.');
      }

      await tx.execute(
        'UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
        [hashPassword(newPassword), now, resetRow.user_id]
      );
      await tx.execute('UPDATE password_resets SET used_at = ? WHERE id = ?', [now, resetRow.id]);
      await tx.execute('DELETE FROM sessions WHERE user_id = ?', [resetRow.user_id]);

      await writeAuditLog(tx, {
        actorUserId: resetRow.user_id,
        action: 'auth.password_reset_completed',
        entityType: 'user',
        entityId: resetRow.user_id,
        ipAddress,
      });

      return { ok: true };
    });
  }

  async updateAccountProfile(
    userId: string,
    patch: { name?: string; phone?: string; preferredLocale?: 'en' | 'ar'; preferredCurrency?: 'USD' | 'LBP' }
  ) {
    const curr = await this.db.queryOne<{
      name: string;
      phone: string;
      preferred_locale: string;
      preferred_currency: string;
    }>('SELECT name, phone, preferred_locale, preferred_currency FROM users WHERE id = ?', [userId]);
    if (!curr) throw new Error('User not found.');

    const nextName = patch.name !== undefined ? patch.name.trim() : curr.name;
    const nextPhone = patch.phone !== undefined ? patch.phone.trim() : curr.phone;
    const nextLocale = patch.preferredLocale || (curr.preferred_locale === 'ar' ? 'ar' : 'en');
    const nextCurr = patch.preferredCurrency || (curr.preferred_currency === 'LBP' ? 'LBP' : 'USD');

    await this.db.execute(
      'UPDATE users SET name = ?, phone = ?, preferred_locale = ?, preferred_currency = ?, updated_at = ? WHERE id = ?',
      [nextName, nextPhone, nextLocale, nextCurr, toSqlTimestamp(), userId]
    );

    return {
      name: nextName,
      phone: nextPhone,
      preferredLocale: nextLocale as 'en' | 'ar',
      preferredCurrency: nextCurr as 'USD' | 'LBP',
    };
  }

  async getUserAddresses(userId: string): Promise<CustomerAddress[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC',
      [userId]
    );
    return rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      label: String(r.label),
      governorate: String(r.governorate),
      district: String(r.district),
      town: String(r.town),
      phone: String(r.phone),
      notes: r.notes ? String(r.notes) : '',
      isDefault: Boolean(r.is_default),
    }));
  }

  async createUserAddress(
    userId: string,
    input: { label: string; governorate: string; district: string; town: string; phone: string; notes?: string; isDefault?: boolean }
  ): Promise<CustomerAddress> {
    const id = `adr-${crypto.randomUUID()}`;
    return this.db.transaction(async (tx) => {
      if (input.isDefault) {
        await tx.execute('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
      } else {
        const cntRow = await tx.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM addresses WHERE user_id = ?', [userId]);
        if (Number(cntRow?.cnt ?? 0) === 0) input.isDefault = true;
      }

      await tx.execute(
        `INSERT INTO addresses (id, user_id, label, governorate, district, town, phone, notes, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          input.label.trim(),
          input.governorate,
          input.district,
          input.town.trim(),
          input.phone.trim(),
          (input.notes || '').trim(),
          input.isDefault ? 1 : 0,
        ]
      );

      return {
        id,
        userId,
        label: input.label.trim(),
        governorate: input.governorate,
        district: input.district,
        town: input.town.trim(),
        phone: input.phone.trim(),
        notes: (input.notes || '').trim(),
        isDefault: Boolean(input.isDefault),
      };
    });
  }

  async updateUserAddress(
    userId: string,
    addressId: string,
    patch: Partial<{ label: string; governorate: string; district: string; town: string; phone: string; notes: string; isDefault: boolean }>
  ): Promise<CustomerAddress> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.queryOne<Record<string, unknown>>(
        'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
        [addressId, userId]
      );
      if (!existing) throw new Error('Address not found.');
      if (patch.isDefault) {
        await tx.execute('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
      }

      const next = {
        label: patch.label !== undefined ? patch.label.trim() : String(existing.label),
        governorate: patch.governorate !== undefined ? patch.governorate : String(existing.governorate),
        district: patch.district !== undefined ? patch.district : String(existing.district),
        town: patch.town !== undefined ? patch.town.trim() : String(existing.town),
        phone: patch.phone !== undefined ? patch.phone.trim() : String(existing.phone),
        notes: patch.notes !== undefined ? patch.notes.trim() : String(existing.notes || ''),
        isDefault: patch.isDefault !== undefined ? patch.isDefault : Boolean(existing.is_default),
      };

      await tx.execute(
        `UPDATE addresses SET label = ?, governorate = ?, district = ?, town = ?, phone = ?, notes = ?, is_default = ?
         WHERE id = ? AND user_id = ?`,
        [next.label, next.governorate, next.district, next.town, next.phone, next.notes, next.isDefault ? 1 : 0, addressId, userId]
      );

      return { id: addressId, userId, ...next };
    });
  }

  async deleteUserAddress(userId: string, addressId: string): Promise<void> {
    await this.db.execute('DELETE FROM addresses WHERE id = ? AND user_id = ?', [addressId, userId]);
  }

  private async verifySubOrderOwnership(
    tx: DbTx,
    subOrderId: string,
    opts: { userId?: string | null; orderNumber?: string; phone?: string }
  ) {
    const row = await tx.queryOne<{
      sub_id: string;
      seller_id: string;
      subtotal_usd_cents: number;
      discount_usd_cents: number;
      order_id: string;
      order_number: string;
      order_user_id: string | null;
      customer_phone: string;
      owner_user_id: string;
    }>(
      `SELECT so.id AS sub_id, so.seller_id, so.subtotal_usd_cents, so.discount_usd_cents,
              o.id AS order_id, o.order_number, o.user_id AS order_user_id, o.customer_phone,
              sel.owner_user_id
       FROM sub_orders so
       INNER JOIN orders o ON o.id = so.order_id
       INNER JOIN sellers sel ON sel.id = so.seller_id
       WHERE so.id = ? LIMIT 1`,
      [subOrderId]
    );
    if (!row) throw new Error('Sub-order not found.');

    if (opts.userId) {
      if (row.order_user_id !== opts.userId) {
        throw new Error('You do not own this order.');
      }
      return row;
    }

    const ordNum = (opts.orderNumber || '').trim().toUpperCase();
    const normSubmitted = normalizePhone(opts.phone || '');
    if (!ordNum || normSubmitted.length < 6) {
      throw new Error('Order number and customer phone are required for guest requests.');
    }
    if (row.order_number.toUpperCase() !== ordNum || normalizePhone(row.customer_phone) !== normSubmitted) {
      throw new Error('Order verification failed.');
    }
    return row;
  }

  async createReturnRequest(input: {
    subOrderId: string;
    userId?: string | null;
    orderNumber?: string;
    phone?: string;
    reason: string;
  }): Promise<ReturnRequest> {
    return this.db.transaction(async (tx) => {
      const sub = await this.verifySubOrderOwnership(tx, input.subOrderId, {
        userId: input.userId,
        orderNumber: input.orderNumber,
        phone: input.phone,
      });

      const dup = await tx.queryOne<{ id: string }>(
        "SELECT id FROM returns WHERE sub_order_id = ? AND status IN ('requested', 'approved', 'refunded') LIMIT 1",
        [input.subOrderId]
      );
      if (dup) throw new Error('A return request already exists for this shipment.');

      const id = `ret-${crypto.randomUUID()}`;
      const now = toSqlTimestamp();
      const refundUsdCents = Math.max(0, Number(sub.subtotal_usd_cents) - Number(sub.discount_usd_cents || 0));
      const actorId = input.userId || `guest:${normalizePhone(input.phone || '')}`;

      await tx.execute(
        'INSERT INTO returns (id, sub_order_id, user_id, reason, status, refund_usd_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, input.subOrderId, actorId, input.reason.trim(), 'requested', refundUsdCents, now]
      );

      await this.createNotification(
        tx,
        sub.owner_user_id,
        { en: `Return requested on ${sub.order_number}`, ar: `طلب إرجاع على الطلب ${sub.order_number}` },
        { en: input.reason.trim().slice(0, 140), ar: input.reason.trim().slice(0, 140) }
      );

      await writeAuditLog(tx, {
        actorUserId: input.userId || null,
        action: 'customer.return_requested',
        entityType: 'return',
        entityId: id,
        after: { subOrderId: input.subOrderId, refundUsdCents },
      });

      return {
        id,
        subOrderId: input.subOrderId,
        userId: actorId,
        reason: input.reason.trim(),
        status: 'requested',
        refundUsdCents,
        createdAt: now,
        orderNumber: sub.order_number,
        sellerId: sub.seller_id,
      };
    });
  }

  async createDispute(input: {
    subOrderId: string;
    userId?: string | null;
    orderNumber?: string;
    phone?: string;
    reason: string;
  }): Promise<OrderDispute> {
    return this.db.transaction(async (tx) => {
      const sub = await this.verifySubOrderOwnership(tx, input.subOrderId, {
        userId: input.userId,
        orderNumber: input.orderNumber,
        phone: input.phone,
      });

      const id = `dsp-${crypto.randomUUID()}`;
      const now = toSqlTimestamp();
      const actorId = input.userId || `guest:${normalizePhone(input.phone || '')}`;

      await tx.execute(
        'INSERT INTO disputes (id, sub_order_id, opened_by_user_id, reason, status, resolution_note, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
        [id, input.subOrderId, actorId, input.reason.trim(), 'open', now]
      );

      await this.createNotification(
        tx,
        sub.owner_user_id,
        { en: `Dispute opened on ${sub.order_number}`, ar: `تم فتح نزاع على الطلب ${sub.order_number}` },
        { en: input.reason.trim().slice(0, 140), ar: input.reason.trim().slice(0, 140) }
      );

      await writeAuditLog(tx, {
        actorUserId: input.userId || null,
        action: 'customer.dispute_opened',
        entityType: 'dispute',
        entityId: id,
        after: { subOrderId: input.subOrderId },
      });

      return {
        id,
        subOrderId: input.subOrderId,
        openedByUserId: actorId,
        reason: input.reason.trim(),
        status: 'open',
        resolutionNote: null,
        createdAt: now,
        orderNumber: sub.order_number,
        sellerId: sub.seller_id,
      };
    });
  }

  async getUserCases(userId: string): Promise<{ returns: ReturnRequest[]; disputes: OrderDispute[] }> {
    const returnRows = await this.db.query<Record<string, unknown>>(
      `SELECT r.*, o.order_number, so.seller_id
       FROM returns r
       INNER JOIN sub_orders so ON so.id = r.sub_order_id
       INNER JOIN orders o ON o.id = so.order_id
       WHERE r.user_id = ? OR o.user_id = ?
       ORDER BY r.created_at DESC`,
      [userId, userId]
    );
    const disputeRows = await this.db.query<Record<string, unknown>>(
      `SELECT d.*, o.order_number, so.seller_id
       FROM disputes d
       INNER JOIN sub_orders so ON so.id = d.sub_order_id
       INNER JOIN orders o ON o.id = so.order_id
       WHERE d.opened_by_user_id = ? OR o.user_id = ?
       ORDER BY d.created_at DESC`,
      [userId, userId]
    );

    return {
      returns: returnRows.map((r) => ({
        id: String(r.id),
        subOrderId: String(r.sub_order_id),
        userId: String(r.user_id),
        reason: String(r.reason),
        status: String(r.status) as ReturnRequest['status'],
        refundUsdCents: Number(r.refund_usd_cents || 0),
        createdAt: String(r.created_at),
        orderNumber: r.order_number ? String(r.order_number) : undefined,
        sellerId: r.seller_id ? String(r.seller_id) : undefined,
      })),
      disputes: disputeRows.map((d) => ({
        id: String(d.id),
        subOrderId: String(d.sub_order_id),
        openedByUserId: String(d.opened_by_user_id),
        reason: String(d.reason),
        status: String(d.status) as OrderDispute['status'],
        resolutionNote: d.resolution_note ? String(d.resolution_note) : null,
        createdAt: String(d.created_at),
        orderNumber: d.order_number ? String(d.order_number) : undefined,
        sellerId: d.seller_id ? String(d.seller_id) : undefined,
      })),
    };
  }

  async getCasesForSubOrders(subOrderIds: string[]): Promise<{ returns: ReturnRequest[]; disputes: OrderDispute[] }> {
    if (subOrderIds.length === 0) return { returns: [], disputes: [] };
    const placeholders = subOrderIds.map(() => '?').join(', ');
    const [returnRows, disputeRows] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        `SELECT r.*, o.order_number, so.seller_id
         FROM returns r
         INNER JOIN sub_orders so ON so.id = r.sub_order_id
         INNER JOIN orders o ON o.id = so.order_id
         WHERE r.sub_order_id IN (${placeholders})
         ORDER BY r.created_at DESC`,
        subOrderIds
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT d.*, o.order_number, so.seller_id
         FROM disputes d
         INNER JOIN sub_orders so ON so.id = d.sub_order_id
         INNER JOIN orders o ON o.id = so.order_id
         WHERE d.sub_order_id IN (${placeholders})
         ORDER BY d.created_at DESC`,
        subOrderIds
      ),
    ]);

    return {
      returns: returnRows.map((r) => ({
        id: String(r.id),
        subOrderId: String(r.sub_order_id),
        userId: String(r.user_id),
        reason: String(r.reason),
        status: String(r.status) as ReturnRequest['status'],
        refundUsdCents: Number(r.refund_usd_cents || 0),
        createdAt: String(r.created_at),
        orderNumber: r.order_number ? String(r.order_number) : undefined,
        sellerId: r.seller_id ? String(r.seller_id) : undefined,
      })),
      disputes: disputeRows.map((d) => ({
        id: String(d.id),
        subOrderId: String(d.sub_order_id),
        openedByUserId: String(d.opened_by_user_id),
        reason: String(d.reason),
        status: String(d.status) as OrderDispute['status'],
        resolutionNote: d.resolution_note ? String(d.resolution_note) : null,
        createdAt: String(d.created_at),
        orderNumber: d.order_number ? String(d.order_number) : undefined,
        sellerId: d.seller_id ? String(d.seller_id) : undefined,
      })),
    };
  }

  async createSupportTicket(input: {
    userId: string | null;
    email: string;
    subject: string;
    message: string;
  }): Promise<SupportTicket> {
    const id = `tkt-${crypto.randomUUID()}`;
    const now = toSqlTimestamp();
    await this.db.execute(
      'INSERT INTO support_tickets (id, user_id, email, subject, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, input.userId, input.email.trim().toLowerCase(), input.subject.trim(), input.message.trim(), 'open', now]
    );
    return {
      id,
      userId: input.userId,
      email: input.email.trim().toLowerCase(),
      subject: input.subject.trim(),
      message: input.message.trim(),
      status: 'open',
      createdAt: now,
    };
  }

  async getUserSupportTickets(userId: string): Promise<SupportTicket[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    return rows.map((t) => ({
      id: String(t.id),
      userId: t.user_id ? String(t.user_id) : null,
      email: String(t.email),
      subject: String(t.subject),
      message: String(t.message),
      status: String(t.status) as SupportTicket['status'],
      createdAt: String(t.created_at),
    }));
  }

  // --- Seller Extended Catalog, Plan Upgrade, Staff & Returns ---
  async updateSellerProduct(
    sellerId: string,
    productId: string,
    actorUserId: string,
    patch: {
      titleEn?: string;
      titleAr?: string;
      subtitleEn?: string;
      subtitleAr?: string;
      descriptionEn?: string;
      descriptionAr?: string;
      basePriceUsdCents?: number;
      compareAtUsdCents?: number | null;
      department?: 'fashion' | 'electronics' | 'home-gadgets';
      categoryId?: string;
      brandId?: string | null;
      specs?: ProductSpec[];
      model3dUrl?: string | null;
      published?: boolean;
      mediaIds?: string[];
      variants?: Array<{
        id?: string;
        sku: string;
        size?: string;
        color: string;
        colorHex: string;
        stock: number;
        priceDeltaUsdCents?: number;
      }>;
    },
    ipAddress?: string
  ): Promise<Product> {
    if (patch.basePriceUsdCents !== undefined && (!Number.isInteger(patch.basePriceUsdCents) || patch.basePriceUsdCents <= 0)) {
      throw new Error('Price must be a positive integer in USD cents.');
    }

    return this.db.transaction(async (tx) => {
      const existing = await tx.queryOne<Record<string, unknown>>(
        'SELECT * FROM products WHERE id = ? AND seller_id = ? AND deleted_at IS NULL',
        [productId, sellerId]
      );
      if (!existing) throw new Error('Product not found.');

      const currTitle = parseJson<LocalizedText>(existing.title_json, { en: '', ar: '' });
      const currSub = parseJson<LocalizedText>(existing.subtitle_json, { en: '', ar: '' });
      const currDesc = parseJson<LocalizedText>(existing.description_json, { en: '', ar: '' });
      const now = toSqlTimestamp();

      const nextTitle = {
        en: patch.titleEn !== undefined ? patch.titleEn.trim() : currTitle.en,
        ar: patch.titleAr !== undefined ? patch.titleAr.trim() : currTitle.ar,
      };
      const nextSub = {
        en: patch.subtitleEn !== undefined ? patch.subtitleEn.trim() : currSub.en,
        ar: patch.subtitleAr !== undefined ? patch.subtitleAr.trim() : currSub.ar,
      };
      const nextDesc = {
        en: patch.descriptionEn !== undefined ? patch.descriptionEn.trim() : currDesc.en,
        ar: patch.descriptionAr !== undefined ? patch.descriptionAr.trim() : currDesc.ar,
      };

      await tx.execute(
        `UPDATE products
         SET category_id = COALESCE(?, category_id),
             brand_id = ?,
             department = COALESCE(?, department),
             title_json = ?,
             subtitle_json = ?,
             description_json = ?,
             specs_json = COALESCE(?, specs_json),
             base_price_usd_cents = COALESCE(?, base_price_usd_cents),
             compare_at_usd_cents = ?,
             model_3d_url = ?,
             published = COALESCE(?, published),
             updated_at = ?
         WHERE id = ?`,
        [
          patch.categoryId || null,
          patch.brandId !== undefined ? patch.brandId : existing.brand_id,
          patch.department || null,
          JSON.stringify(nextTitle),
          JSON.stringify(nextSub),
          JSON.stringify(nextDesc),
          patch.specs ? JSON.stringify(patch.specs) : null,
          patch.basePriceUsdCents ?? null,
          patch.compareAtUsdCents !== undefined ? patch.compareAtUsdCents : existing.compare_at_usd_cents,
          patch.model3dUrl !== undefined ? (patch.model3dUrl?.trim() || null) : existing.model_3d_url,
          patch.published !== undefined ? (patch.published ? 1 : 0) : null,
          now,
          productId,
        ]
      );

      if (patch.variants && patch.variants.length > 0) {
        const existingVars = await tx.query<{ id: string; stock: number }>(
          'SELECT id, stock FROM product_variants WHERE product_id = ?',
          [productId]
        );
        const existingMap = new Map(existingVars.map((v) => [v.id, Number(v.stock)]));
        const keepIds = new Set<string>();

        for (const v of patch.variants) {
          const vStock = Math.max(0, Math.trunc(v.stock));
          const deltaCents = Math.trunc(v.priceDeltaUsdCents || 0);
          if (v.id && existingMap.has(v.id)) {
            keepIds.add(v.id);
            const prevStock = existingMap.get(v.id)!;
            await tx.execute(
              `UPDATE product_variants SET sku = ?, size = ?, color = ?, color_hex = ?, stock = ?, price_delta_usd_cents = ?
               WHERE id = ? AND product_id = ?`,
              [v.sku.trim(), v.size?.trim() || null, v.color.trim(), v.colorHex || '#1C1D21', vStock, deltaCents, v.id, productId]
            );
            if (vStock !== prevStock) {
              await tx.execute(
                'INSERT INTO stock_movements (id, variant_id, delta, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [`stk-${crypto.randomUUID()}`, v.id, vStock - prevStock, 'manual_adjustment', productId, now]
              );
            }
          } else {
            const newVarId = `var-${crypto.randomUUID()}`;
            keepIds.add(newVarId);
            await tx.execute(
              `INSERT INTO product_variants (id, product_id, sku, size, color, color_hex, stock, price_delta_usd_cents)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [newVarId, productId, v.sku.trim(), v.size?.trim() || null, v.color.trim(), v.colorHex || '#1C1D21', vStock, deltaCents]
            );
            await tx.execute(
              'INSERT INTO stock_movements (id, variant_id, delta, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [`stk-${crypto.randomUUID()}`, newVarId, vStock, 'initial_stock', productId, now]
            );
          }
        }

        for (const oldVar of existingVars) {
          if (!keepIds.has(oldVar.id)) {
            const hasOrders = await tx.queryOne<{ id: string }>(
              'SELECT id FROM order_items WHERE variant_id = ? LIMIT 1',
              [oldVar.id]
            );
            if (!hasOrders) {
              await tx.execute('DELETE FROM product_variants WHERE id = ?', [oldVar.id]);
            }
          }
        }
      }

      if (patch.mediaIds && patch.mediaIds.length > 0) {
        for (const mId of patch.mediaIds) {
          await tx.execute('UPDATE media SET entity_id = ? WHERE id = ? AND owner_user_id = ?', [
            productId,
            mId,
            actorUserId,
          ]);
        }
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'seller.update_product',
        entityType: 'product',
        entityId: productId,
        after: { titleEn: nextTitle.en, basePriceUsdCents: patch.basePriceUsdCents },
        ipAddress,
      });

      const updated = await tx.queryOne<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', [productId]);
      const [mapped] = await this.mapProductRows([updated!], tx);
      return mapped;
    });
  }

  async deleteSellerProduct(sellerId: string, productId: string, actorUserId: string, ipAddress?: string): Promise<void> {
    const existing = await this.db.queryOne<{ id: string }>(
      'SELECT id FROM products WHERE id = ? AND seller_id = ? AND deleted_at IS NULL',
      [productId, sellerId]
    );
    if (!existing) throw new Error('Product not found.');
    const now = toSqlTimestamp();
    await this.db.execute('UPDATE products SET deleted_at = ?, published = 0, updated_at = ? WHERE id = ?', [
      now,
      now,
      productId,
    ]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'seller.delete_product',
      entityType: 'product',
      entityId: productId,
      ipAddress,
    });
  }

  async switchSellerPlan(sellerId: string, actorUserId: string, planTier: SubscriptionTier, ipAddress?: string) {
    return this.db.transaction(async (tx) => {
      const plan = await tx.queryOne<{ tier: string; monthly_fee_usd_cents: number }>(
        'SELECT tier, monthly_fee_usd_cents FROM subscription_plans WHERE tier = ?',
        [planTier]
      );
      if (!plan) throw new Error('Subscription plan not found.');
      const nextDue = toSqlTimestamp(new Date(Date.now() + 30 * 86_400_000));
      const now = toSqlTimestamp();

      const existingSub = await tx.queryOne<{ id: string; plan_tier: string }>(
        'SELECT id, plan_tier FROM subscriptions WHERE seller_id = ? ORDER BY created_at DESC LIMIT 1',
        [sellerId]
      );
      if (existingSub) {
        await tx.execute("UPDATE subscriptions SET plan_tier = ?, status = 'active', next_due_at = ? WHERE id = ?", [
          planTier,
          nextDue,
          existingSub.id,
        ]);
      } else {
        await tx.execute(
          "INSERT INTO subscriptions (id, seller_id, plan_tier, status, next_due_at, created_at) VALUES (?, ?, ?, 'active', ?, ?)",
          [`subp-${crypto.randomUUID()}`, sellerId, planTier, nextDue, now]
        );
      }

      if (Number(plan.monthly_fee_usd_cents) > 0 && existingSub?.plan_tier !== planTier) {
        await tx.execute(
          `INSERT INTO ledger_entries (id, seller_id, entry_type, direction, amount_usd_cents, availability, note, created_at)
           VALUES (?, ?, 'SUBSCRIPTION_FEE', 'debit', ?, 'available', ?, ?)`,
          [`led-${crypto.randomUUID()}`, sellerId, Number(plan.monthly_fee_usd_cents), `Plan upgrade to ${planTier.toUpperCase()}`, now]
        );
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'seller.switch_plan',
        entityType: 'subscription',
        entityId: sellerId,
        before: { planTier: existingSub?.plan_tier || 'free' },
        after: { planTier },
        ipAddress,
      });

      return { planTier, nextDue };
    });
  }

  async listSellerStaff(sellerId: string): Promise<SellerStaffMember[]> {
    const mapRow = await this.db.queryOne<{ value_json: string }>(
      `SELECT value_json FROM settings WHERE ${this.keyCol()} = 'seller_staff_map'`
    );
    const map = parseJson<Record<string, string>>(mapRow?.value_json, {});
    const staffIds = Object.entries(map)
      .filter(([, sid]) => sid === sellerId)
      .map(([uid]) => uid);
    if (staffIds.length === 0) return [];

    const placeholders = staffIds.map(() => '?').join(', ');
    const rows = await this.db.query<{
      id: string;
      name: string;
      email: string;
      phone: string;
      totp_enabled: number | boolean;
      created_at: string;
    }>(
      `SELECT id, name, email, phone, totp_enabled, created_at FROM users WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      staffIds
    );

    const out: SellerStaffMember[] = [];
    for (const r of rows) {
      const perms = await this.db.query<{ permission_key: string }>(
        'SELECT permission_key FROM user_permissions WHERE user_id = ?',
        [r.id]
      );
      out.push({
        userId: r.id,
        sellerId,
        name: r.name,
        email: r.email,
        phone: r.phone,
        permissions: perms.map((p) => p.permission_key),
        totpEnabled: Boolean(r.totp_enabled),
        createdAt: String(r.created_at),
      });
    }
    return out;
  }

  async createSellerStaff(
    sellerId: string,
    actorUserId: string,
    input: { name: string; email: string; phone: string; password: string; permissions: string[] },
    ipAddress?: string
  ): Promise<SellerStaffMember> {
    const pwErr = validatePasswordStrength(input.password);
    if (pwErr) throw new Error(pwErr);

    const allowedSellerPerms = new Set(['seller.catalog', 'seller.orders', 'seller.finance']);
    const cleanPerms = input.permissions.filter((p) => allowedSellerPerms.has(p));
    if (cleanPerms.length === 0) throw new Error('Select at least one valid seller permission.');

    const emailNorm = input.email.trim().toLowerCase();
    return this.db.transaction(async (tx) => {
      const dup = await tx.queryOne<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ?', [emailNorm]);
      if (dup) throw new Error('Email is already registered.');

      const userId = `usr-${crypto.randomUUID()}`;
      const now = toSqlTimestamp();
      await tx.execute(
        `INSERT INTO users (id, name, email, phone, password_hash, role_key, email_verified_at, preferred_locale, preferred_currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'seller_staff', ?, 'en', 'USD', ?, ?)`,
        [userId, input.name.trim(), emailNorm, input.phone.trim(), hashPassword(input.password), now, now, now]
      );

      for (const perm of cleanPerms) {
        await tx.execute('INSERT INTO user_permissions (id, user_id, permission_key) VALUES (?, ?, ?)', [
          `up-${crypto.randomUUID()}`,
          userId,
          perm,
        ]);
      }

      const kCol = this.keyCol();
      const mapRow = await tx.queryOne<{ value_json: string }>(
        `SELECT value_json FROM settings WHERE ${kCol} = 'seller_staff_map'`
      );
      const currMap = parseJson<Record<string, string>>(mapRow?.value_json, {});
      currMap[userId] = sellerId;
      await tx.execute(
        this.db.driver === 'mysql'
          ? `INSERT INTO settings (${kCol}, value_json, updated_at) VALUES ('seller_staff_map', ?, ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = VALUES(updated_at)`
          : `INSERT INTO settings (${kCol}, value_json, updated_at) VALUES ('seller_staff_map', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [JSON.stringify(currMap), now]
      );

      await writeAuditLog(tx, {
        actorUserId,
        action: 'seller.create_staff',
        entityType: 'user',
        entityId: userId,
        after: { sellerId, email: emailNorm, permissions: cleanPerms },
        ipAddress,
      });

      return {
        userId,
        sellerId,
        name: input.name.trim(),
        email: emailNorm,
        phone: input.phone.trim(),
        permissions: cleanPerms,
        totpEnabled: false,
        createdAt: now,
      };
    });
  }

  async removeSellerStaff(sellerId: string, staffUserId: string, actorUserId: string, ipAddress?: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      const kCol = this.keyCol();
      const mapRow = await tx.queryOne<{ value_json: string }>(
        `SELECT value_json FROM settings WHERE ${kCol} = 'seller_staff_map'`
      );
      const currMap = parseJson<Record<string, string>>(mapRow?.value_json, {});
      if (currMap[staffUserId] !== sellerId) {
        throw new Error('Staff member not found for this store.');
      }
      delete currMap[staffUserId];
      const now = toSqlTimestamp();
      await tx.execute(`UPDATE settings SET value_json = ?, updated_at = ? WHERE ${kCol} = 'seller_staff_map'`, [
        JSON.stringify(currMap),
        now,
      ]);
      await tx.execute('UPDATE users SET deleted_at = ?, is_blocked = 1, updated_at = ? WHERE id = ?', [
        now,
        now,
        staffUserId,
      ]);
      await tx.execute('DELETE FROM sessions WHERE user_id = ?', [staffUserId]);

      await writeAuditLog(tx, {
        actorUserId,
        action: 'seller.remove_staff',
        entityType: 'user',
        entityId: staffUserId,
        after: { sellerId },
        ipAddress,
      });
    });
  }

  async sellerUpdateReturn(
    sellerId: string,
    actorUserId: string,
    returnId: string,
    patch: { status: 'approved' | 'rejected' },
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const row = await tx.queryOne<{ id: string; user_id: string; status: string; order_number: string }>(
        `SELECT r.id, r.user_id, r.status, o.order_number
         FROM returns r
         INNER JOIN sub_orders so ON so.id = r.sub_order_id
         INNER JOIN orders o ON o.id = so.order_id
         WHERE r.id = ? AND so.seller_id = ? LIMIT 1`,
        [returnId, sellerId]
      );
      if (!row) throw new Error('Return request not found.');
      if (row.status === 'refunded') throw new Error('Refund already finalized.');

      await tx.execute('UPDATE returns SET status = ? WHERE id = ?', [patch.status, returnId]);
      if (!row.user_id.startsWith('guest:')) {
        await this.createNotification(
          tx,
          row.user_id,
          { en: `Return ${patch.status} (${row.order_number})`, ar: `تحديث الإرجاع: ${patch.status}` },
          { en: `Merchant marked return request as ${patch.status}.`, ar: `قام التاجر بتحديث حالة الإرجاع إلى ${patch.status}.` }
        );
      }
      await writeAuditLog(tx, {
        actorUserId,
        action: 'seller.update_return',
        entityType: 'return',
        entityId: returnId,
        before: { status: row.status },
        after: { status: patch.status },
        ipAddress,
      });
      return tx.queryOne('SELECT * FROM returns WHERE id = ?', [returnId]);
    });
  }

  // --- Admin Moderation, Categories/Brands/Attributes, KYC, Cases, Support, Zones, Plans, Templates, Menus, Users ---
  async adminModerateProduct(
    productId: string,
    actorUserId: string,
    patch: { moderationStatus?: 'pending' | 'approved' | 'rejected'; published?: boolean; featured?: boolean },
    ipAddress?: string
  ): Promise<Product> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.queryOne<Record<string, unknown>>(
        'SELECT * FROM products WHERE id = ? AND deleted_at IS NULL',
        [productId]
      );
      if (!existing) throw new Error('Product not found.');

      const nextMod = patch.moderationStatus || String(existing.moderation_status || 'pending');
      const nextPub = patch.published !== undefined ? (patch.published ? 1 : 0) : Number(existing.published);
      const nextFeat = patch.featured !== undefined ? (patch.featured ? 1 : 0) : Number(existing.featured);

      await tx.execute(
        'UPDATE products SET moderation_status = ?, published = ?, featured = ?, updated_at = ? WHERE id = ?',
        [nextMod, nextPub, nextFeat, toSqlTimestamp(), productId]
      );

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.moderate_product',
        entityType: 'product',
        entityId: productId,
        before: { moderationStatus: existing.moderation_status, published: Boolean(existing.published), featured: Boolean(existing.featured) },
        after: { moderationStatus: nextMod, published: Boolean(nextPub), featured: Boolean(nextFeat) },
        ipAddress,
      });

      const updated = await tx.queryOne<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', [productId]);
      const [mapped] = await this.mapProductRows([updated!], tx);
      return mapped;
    });
  }

  async adminCreateCategory(
    actorUserId: string,
    input: {
      slug: string;
      parentId?: string | null;
      department: 'fashion' | 'electronics' | 'home-gadgets';
      name: LocalizedText;
      commissionBps?: number | null;
      sortOrder?: number;
    },
    ipAddress?: string
  ): Promise<Category> {
    const cleanSlug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    if (cleanSlug.length < 2) throw new Error('Category slug must be at least 2 characters.');
    const dup = await this.db.queryOne<{ id: string }>('SELECT id FROM categories WHERE slug = ?', [cleanSlug]);
    if (dup) throw new Error(`Category slug "${cleanSlug}" already exists.`);

    const id = `cat-${cleanSlug}-${crypto.randomBytes(2).toString('hex')}`;
    await this.db.execute(
      `INSERT INTO categories (id, parent_id, slug, department, name_json, commission_bps, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        input.parentId || null,
        cleanSlug,
        input.department,
        JSON.stringify(input.name),
        input.commissionBps ?? null,
        Math.trunc(input.sortOrder ?? 10),
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_category',
      entityType: 'category',
      entityId: id,
      after: { slug: cleanSlug, commissionBps: input.commissionBps },
      ipAddress,
    });
    return {
      id,
      parentId: input.parentId || null,
      slug: cleanSlug,
      department: input.department,
      name: input.name,
      commissionBps: input.commissionBps ?? null,
    };
  }

  async adminUpdateCategory(
    id: string,
    actorUserId: string,
    patch: { name?: LocalizedText; commissionBps?: number | null; sortOrder?: number; active?: boolean },
    ipAddress?: string
  ): Promise<Category> {
    const existing = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM categories WHERE id = ?', [id]);
    if (!existing) throw new Error('Category not found.');
    const nextName = patch.name || parseJson<LocalizedText>(existing.name_json, { en: id, ar: id });
    await this.db.execute(
      'UPDATE categories SET name_json = ?, commission_bps = ?, sort_order = ?, active = ? WHERE id = ?',
      [
        JSON.stringify(nextName),
        patch.commissionBps !== undefined ? patch.commissionBps : existing.commission_bps,
        patch.sortOrder !== undefined ? Math.trunc(patch.sortOrder) : Number(existing.sort_order),
        patch.active !== undefined ? (patch.active ? 1 : 0) : Number(existing.active),
        id,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_category',
      entityType: 'category',
      entityId: id,
      after: patch,
      ipAddress,
    });
    return {
      id,
      parentId: existing.parent_id ? String(existing.parent_id) : null,
      slug: String(existing.slug),
      department: String(existing.department) as Category['department'],
      name: nextName,
      commissionBps: patch.commissionBps !== undefined ? patch.commissionBps : (existing.commission_bps as number | null),
    };
  }

  async adminDeleteCategory(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    if (['cat-fashion', 'cat-electronics', 'cat-home'].includes(id)) {
      throw new Error('Core department categories cannot be deleted.');
    }
    await this.db.execute('UPDATE categories SET active = 0 WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_category',
      entityType: 'category',
      entityId: id,
      ipAddress,
    });
  }

  async adminCreateBrand(actorUserId: string, input: { slug: string; name: LocalizedText }, ipAddress?: string): Promise<BrandItem> {
    const cleanSlug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    if (cleanSlug.length < 2) throw new Error('Brand slug must be at least 2 characters.');
    const dup = await this.db.queryOne<{ id: string }>('SELECT id FROM brands WHERE slug = ? AND active = 1', [cleanSlug]);
    if (dup) throw new Error(`Brand "${cleanSlug}" already exists.`);
    const id = `brd-${crypto.randomUUID()}`;
    await this.db.execute('INSERT INTO brands (id, slug, name_json, active) VALUES (?, ?, ?, 1)', [
      id,
      cleanSlug,
      JSON.stringify(input.name),
    ]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_brand',
      entityType: 'brand',
      entityId: id,
      after: { slug: cleanSlug },
      ipAddress,
    });
    return { id, slug: cleanSlug, name: input.name, active: true };
  }

  async adminDeleteBrand(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('UPDATE brands SET active = 0 WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_brand',
      entityType: 'brand',
      entityId: id,
      ipAddress,
    });
  }

  async adminCreateAttribute(
    actorUserId: string,
    input: { code: string; name: LocalizedText; values: string[] },
    ipAddress?: string
  ): Promise<AttributeItem> {
    const cleanCode = input.code.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    const cleanVals = input.values.map((v) => v.trim()).filter(Boolean);
    const id = `atr-${crypto.randomUUID()}`;
    await this.db.execute('INSERT INTO attributes (id, code, name_json, values_json) VALUES (?, ?, ?, ?)', [
      id,
      cleanCode,
      JSON.stringify(input.name),
      JSON.stringify(cleanVals),
    ]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_attribute',
      entityType: 'attribute',
      entityId: id,
      after: { code: cleanCode, values: cleanVals },
      ipAddress,
    });
    return { id, code: cleanCode, name: input.name, values: cleanVals };
  }

  async adminDeleteAttribute(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    await this.db.execute('DELETE FROM attributes WHERE id = ?', [id]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_attribute',
      entityType: 'attribute',
      entityId: id,
      ipAddress,
    });
  }

  async adminReviewSellerDocument(
    docId: string,
    actorUserId: string,
    patch: { reviewStatus: 'approved' | 'rejected'; reviewerNote?: string },
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const doc = await tx.queryOne<{ id: string; seller_id: string; doc_type: string }>(
        'SELECT id, seller_id, doc_type FROM seller_documents WHERE id = ?',
        [docId]
      );
      if (!doc) throw new Error('Document not found.');

      await tx.execute('UPDATE seller_documents SET review_status = ?, reviewer_note = ? WHERE id = ?', [
        patch.reviewStatus,
        patch.reviewerNote?.trim() || null,
        docId,
      ]);

      const seller = await tx.queryOne<{ owner_user_id: string }>('SELECT owner_user_id FROM sellers WHERE id = ?', [
        doc.seller_id,
      ]);
      if (seller) {
        await this.createNotification(
          tx,
          seller.owner_user_id,
          { en: `KYC document ${patch.reviewStatus}`, ar: `مستند التحقق: ${patch.reviewStatus}` },
          {
            en: `${doc.doc_type} marked ${patch.reviewStatus}${patch.reviewerNote ? `: ${patch.reviewerNote}` : '.'}`,
            ar: `تمت مراجعة ${doc.doc_type} كـ ${patch.reviewStatus}${patch.reviewerNote ? `: ${patch.reviewerNote}` : '.'}`,
          }
        );
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.review_seller_document',
        entityType: 'seller_document',
        entityId: docId,
        after: patch,
        ipAddress,
      });

      return tx.queryOne('SELECT * FROM seller_documents WHERE id = ?', [docId]);
    });
  }

  async adminResolveReturn(
    returnId: string,
    actorUserId: string,
    patch: { status: 'approved' | 'rejected' | 'refunded'; refundUsdCents?: number },
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const ret = await tx.queryOne<{
        id: string;
        sub_order_id: string;
        user_id: string;
        status: string;
        refund_usd_cents: number;
      }>('SELECT * FROM returns WHERE id = ?', [returnId]);
      if (!ret) throw new Error('Return request not found.');
      if (ret.status === 'refunded') throw new Error('Return is already refunded.');

      const sub = await tx.queryOne<{
        id: string;
        order_id: string;
        seller_id: string;
        subtotal_usd_cents: number;
        discount_usd_cents: number;
        order_number: string;
        owner_user_id: string;
      }>(
        `SELECT so.id, so.order_id, so.seller_id, so.subtotal_usd_cents, so.discount_usd_cents, o.order_number, sel.owner_user_id
         FROM sub_orders so
         INNER JOIN orders o ON o.id = so.order_id
         INNER JOIN sellers sel ON sel.id = so.seller_id
         WHERE so.id = ? LIMIT 1`,
        [ret.sub_order_id]
      );
      if (!sub) throw new Error('Linked sub-order not found.');

      const maxRefund = Math.max(0, Number(sub.subtotal_usd_cents) - Number(sub.discount_usd_cents || 0));
      const refundAmount =
        patch.refundUsdCents !== undefined
          ? Math.min(maxRefund, Math.max(0, Math.trunc(patch.refundUsdCents)))
          : Number(ret.refund_usd_cents || maxRefund);

      await tx.execute('UPDATE returns SET status = ?, refund_usd_cents = ? WHERE id = ?', [
        patch.status,
        refundAmount,
        returnId,
      ]);

      const now = toSqlTimestamp();
      if (patch.status === 'refunded' && refundAmount > 0) {
        const grossLed = await tx.queryOne<{ availability: string }>(
          "SELECT availability FROM ledger_entries WHERE sub_order_id = ? AND entry_type = 'ORDER_GROSS' LIMIT 1",
          [sub.id]
        );
        const availability = grossLed?.availability === 'available' ? 'available' : 'pending';

        await tx.execute(
          `INSERT INTO ledger_entries (id, seller_id, sub_order_id, order_number, entry_type, direction, amount_usd_cents, availability, note, created_at)
           VALUES (?, ?, ?, ?, 'ORDER_REFUND', 'debit', ?, ?, ?, ?)`,
          [
            `led-${crypto.randomUUID()}`,
            sub.seller_id,
            sub.id,
            sub.order_number,
            refundAmount,
            availability,
            `Customer refund for return ${returnId} (${sub.order_number})`,
            now,
          ]
        );
        await tx.execute("UPDATE orders SET payment_status = 'refunded' WHERE id = ?", [sub.order_id]);
      }

      if (!ret.user_id.startsWith('guest:')) {
        await this.createNotification(
          tx,
          ret.user_id,
          { en: `Return ${patch.status} (${sub.order_number})`, ar: `حالة الإرجاع: ${patch.status}` },
          {
            en:
              patch.status === 'refunded'
                ? `Refund of $${(refundAmount / 100).toFixed(2)} processed for ${sub.order_number}.`
                : `Your return request on ${sub.order_number} is now ${patch.status}.`,
            ar:
              patch.status === 'refunded'
                ? `تمت معالجة استرداد ${(refundAmount / 100).toFixed(2)} دولار للطلب ${sub.order_number}.`
                : `تم تحديث طلب الإرجاع للطلب ${sub.order_number} إلى ${patch.status}.`,
          }
        );
      }

      await this.createNotification(
        tx,
        sub.owner_user_id,
        { en: `Admin return update: ${patch.status}`, ar: `تحديث إداري للإرجاع: ${patch.status}` },
        {
          en: `Return on ${sub.order_number} resolved as ${patch.status} ($${(refundAmount / 100).toFixed(2)}).`,
          ar: `تم حسم طلب الإرجاع للطلب ${sub.order_number} (${patch.status}).`,
        }
      );

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.resolve_return',
        entityType: 'return',
        entityId: returnId,
        before: { status: ret.status, refundUsdCents: ret.refund_usd_cents },
        after: { status: patch.status, refundUsdCents: refundAmount },
        ipAddress,
      });

      return tx.queryOne('SELECT * FROM returns WHERE id = ?', [returnId]);
    });
  }

  async adminResolveDispute(
    disputeId: string,
    actorUserId: string,
    patch: { status: 'open' | 'investigating' | 'resolved_buyer' | 'resolved_seller' | 'closed'; resolutionNote?: string },
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const disp = await tx.queryOne<{ id: string; sub_order_id: string; opened_by_user_id: string; status: string }>(
        'SELECT * FROM disputes WHERE id = ?',
        [disputeId]
      );
      if (!disp) throw new Error('Dispute not found.');

      await tx.execute('UPDATE disputes SET status = ?, resolution_note = ? WHERE id = ?', [
        patch.status,
        patch.resolutionNote?.trim() || null,
        disputeId,
      ]);

      const sub = await tx.queryOne<{ order_number: string; owner_user_id: string }>(
        `SELECT o.order_number, sel.owner_user_id
         FROM sub_orders so
         INNER JOIN orders o ON o.id = so.order_id
         INNER JOIN sellers sel ON sel.id = so.seller_id
         WHERE so.id = ? LIMIT 1`,
        [disp.sub_order_id]
      );

      if (!disp.opened_by_user_id.startsWith('guest:')) {
        await this.createNotification(
          tx,
          disp.opened_by_user_id,
          { en: `Dispute updated (${sub?.order_number || disputeId})`, ar: `تحديث النزاع (${sub?.order_number || disputeId})` },
          { en: `Status: ${patch.status}. ${patch.resolutionNote || ''}`.trim(), ar: `الحالة: ${patch.status}. ${patch.resolutionNote || ''}`.trim() }
        );
      }
      if (sub?.owner_user_id) {
        await this.createNotification(
          tx,
          sub.owner_user_id,
          { en: `Dispute updated (${sub.order_number})`, ar: `تحديث النزاع (${sub.order_number})` },
          { en: `Status: ${patch.status}. ${patch.resolutionNote || ''}`.trim(), ar: `الحالة: ${patch.status}. ${patch.resolutionNote || ''}`.trim() }
        );
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.resolve_dispute',
        entityType: 'dispute',
        entityId: disputeId,
        before: { status: disp.status },
        after: patch,
        ipAddress,
      });

      return tx.queryOne('SELECT * FROM disputes WHERE id = ?', [disputeId]);
    });
  }

  async adminModerateReview(
    reviewId: string,
    actorUserId: string,
    status: 'approved' | 'hidden' | 'rejected',
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const rev = await tx.queryOne<{ id: string; product_id: string; seller_id: string; moderation_status: string }>(
        'SELECT id, product_id, seller_id, moderation_status FROM reviews WHERE id = ?',
        [reviewId]
      );
      if (!rev) throw new Error('Review not found.');

      await tx.execute('UPDATE reviews SET moderation_status = ? WHERE id = ?', [status, reviewId]);

      const pStats = await tx.queryOne<{ avg_r: number | null; cnt: number }>(
        "SELECT AVG(rating) AS avg_r, COUNT(*) AS cnt FROM reviews WHERE product_id = ? AND moderation_status = 'approved'",
        [rev.product_id]
      );
      await tx.execute('UPDATE products SET rating_avg_x10 = ?, review_count = ? WHERE id = ?', [
        Math.round(Number(pStats?.avg_r || 0) * 10),
        Number(pStats?.cnt || 0),
        rev.product_id,
      ]);

      const sStats = await tx.queryOne<{ avg_r: number | null; cnt: number }>(
        "SELECT AVG(rating) AS avg_r, COUNT(*) AS cnt FROM reviews WHERE seller_id = ? AND moderation_status = 'approved'",
        [rev.seller_id]
      );
      await tx.execute('UPDATE stores SET rating_avg_x10 = ?, review_count = ? WHERE seller_id = ?', [
        Math.round(Number(sStats?.avg_r || 0) * 10),
        Number(sStats?.cnt || 0),
        rev.seller_id,
      ]);

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.moderate_review',
        entityType: 'review',
        entityId: reviewId,
        before: { moderationStatus: rev.moderation_status },
        after: { moderationStatus: status },
        ipAddress,
      });

      return { id: reviewId, moderationStatus: status };
    });
  }

  async adminUpdateSupportTicket(
    ticketId: string,
    actorUserId: string,
    status: SupportTicket['status'],
    ipAddress?: string
  ) {
    const t = await this.db.queryOne<{ id: string; user_id: string | null; subject: string; status: string }>(
      'SELECT id, user_id, subject, status FROM support_tickets WHERE id = ?',
      [ticketId]
    );
    if (!t) throw new Error('Support ticket not found.');

    await this.db.execute('UPDATE support_tickets SET status = ? WHERE id = ?', [status, ticketId]);
    if (t.user_id) {
      await this.createNotification(
        this.db,
        t.user_id,
        { en: `Support ticket ${status}`, ar: `تحديث تذكرة الدعم: ${status}` },
        { en: `${t.subject} is now marked ${status}.`, ar: `تم تحديث حالة التذكرة "${t.subject}" إلى ${status}.` }
      );
    }
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_support_ticket',
      entityType: 'support_ticket',
      entityId: ticketId,
      before: { status: t.status },
      after: { status },
      ipAddress,
    });
    return this.db.queryOne('SELECT * FROM support_tickets WHERE id = ?', [ticketId]);
  }

  async adminUpdateDeliveryZone(
    governorateCode: string,
    actorUserId: string,
    patch: { platformFeeUsdCents?: number; etaDays?: string },
    ipAddress?: string
  ): Promise<DeliveryZone> {
    const existing = await this.db.queryOne<{
      governorate_code: string;
      name_json: string;
      platform_fee_usd_cents: number;
      eta_days: string;
    }>('SELECT * FROM delivery_zones WHERE governorate_code = ?', [governorateCode]);
    if (!existing) throw new Error('Delivery zone not found.');

    const nextFee =
      patch.platformFeeUsdCents !== undefined ? Math.max(0, Math.trunc(patch.platformFeeUsdCents)) : Number(existing.platform_fee_usd_cents);
    const nextEta = patch.etaDays !== undefined ? patch.etaDays.trim() : existing.eta_days;

    await this.db.execute('UPDATE delivery_zones SET platform_fee_usd_cents = ?, eta_days = ? WHERE governorate_code = ?', [
      nextFee,
      nextEta,
      governorateCode,
    ]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_delivery_zone',
      entityType: 'delivery_zone',
      entityId: governorateCode,
      after: { platformFeeUsdCents: nextFee, etaDays: nextEta },
      ipAddress,
    });
    return {
      governorateCode,
      name: parseJson<LocalizedText>(existing.name_json, { en: governorateCode, ar: governorateCode }),
      platformFeeUsdCents: nextFee,
      etaDays: nextEta,
    };
  }

  async adminUpdateSubscriptionPlan(
    tier: SubscriptionTier,
    actorUserId: string,
    patch: { monthlyFeeUsdCents?: number; productLimit?: number | null; commissionDiscountBps?: number },
    ipAddress?: string
  ): Promise<SubscriptionPlan> {
    const existing = await this.db.queryOne<{
      tier: SubscriptionTier;
      name_json: string;
      monthly_fee_usd_cents: number;
      product_limit: number | null;
      commission_discount_bps: number;
      features_json: string;
    }>('SELECT * FROM subscription_plans WHERE tier = ?', [tier]);
    if (!existing) throw new Error('Subscription plan not found.');

    const nextFee =
      patch.monthlyFeeUsdCents !== undefined ? Math.max(0, Math.trunc(patch.monthlyFeeUsdCents)) : Number(existing.monthly_fee_usd_cents);
    const nextLimit = patch.productLimit !== undefined ? patch.productLimit : existing.product_limit;
    const nextDiscount =
      patch.commissionDiscountBps !== undefined ? Math.max(0, Math.min(2000, Math.trunc(patch.commissionDiscountBps))) : Number(existing.commission_discount_bps);

    await this.db.execute(
      'UPDATE subscription_plans SET monthly_fee_usd_cents = ?, product_limit = ?, commission_discount_bps = ? WHERE tier = ?',
      [nextFee, nextLimit, nextDiscount, tier]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_subscription_plan',
      entityType: 'subscription_plan',
      entityId: tier,
      after: { monthlyFeeUsdCents: nextFee, productLimit: nextLimit, commissionDiscountBps: nextDiscount },
      ipAddress,
    });
    return {
      tier,
      name: parseJson<LocalizedText>(existing.name_json, { en: tier, ar: tier }),
      monthlyFeeUsdCents: nextFee,
      productLimit: nextLimit === null ? null : Number(nextLimit),
      commissionDiscountBps: nextDiscount,
      features: parseJson<LocalizedText[]>(existing.features_json, []),
    };
  }

  async adminUpdateEmailTemplate(
    key: string,
    actorUserId: string,
    patch: { subject: LocalizedText; body: LocalizedText },
    ipAddress?: string
  ): Promise<EmailTemplateItem> {
    const kCol = this.keyCol();
    const existing = await this.db.queryOne<{ key?: string }>(`SELECT ${kCol} FROM email_templates WHERE ${kCol} = ?`, [key]);
    if (!existing) throw new Error('Email template not found.');
    const now = toSqlTimestamp();
    await this.db.execute(
      `UPDATE email_templates SET subject_json = ?, body_json = ?, updated_at = ? WHERE ${kCol} = ?`,
      [JSON.stringify(patch.subject), JSON.stringify(patch.body), now, key]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.update_email_template',
      entityType: 'email_template',
      entityId: key,
      after: patch,
      ipAddress,
    });
    return { key, subject: patch.subject, body: patch.body, updatedAt: now };
  }

  async adminCreatePage(
    actorUserId: string,
    input: { slug: string; titleEn: string; titleAr: string; bodyEn: string; bodyAr: string; published?: boolean },
    ipAddress?: string
  ): Promise<PageContent> {
    const cleanSlug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    if (cleanSlug.length < 2) throw new Error('Page slug must be at least 2 characters.');
    const dup = await this.db.queryOne<{ id: string }>('SELECT id FROM pages WHERE slug = ?', [cleanSlug]);
    if (dup) throw new Error(`Page slug "${cleanSlug}" already exists.`);

    const id = `page-${crypto.randomUUID()}`;
    const now = toSqlTimestamp();
    const title = { en: input.titleEn.trim(), ar: input.titleAr.trim() };
    const body = { en: input.bodyEn, ar: input.bodyAr };
    const pub = input.published === false ? 0 : 1;

    await this.db.execute(
      'INSERT INTO pages (id, slug, title_json, body_json, published, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, cleanSlug, JSON.stringify(title), JSON.stringify(body), pub, now]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.create_page',
      entityType: 'page',
      entityId: id,
      after: { slug: cleanSlug, published: Boolean(pub) },
      ipAddress,
    });
    return { id, slug: cleanSlug, title, body, published: Boolean(pub), updatedAt: now };
  }

  async adminDeletePage(slug: string, actorUserId: string, ipAddress?: string): Promise<void> {
    if (['terms', 'privacy', 'returns', 'seller-agreement'].includes(slug)) {
      throw new Error('Core legal pages cannot be deleted.');
    }
    const existing = await this.db.queryOne<{ id: string }>('SELECT id FROM pages WHERE slug = ?', [slug]);
    if (!existing) throw new Error('Page not found.');
    await this.db.execute('DELETE FROM pages WHERE slug = ?', [slug]);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.delete_page',
      entityType: 'page',
      entityId: existing.id,
      after: { slug },
      ipAddress,
    });
  }

  async adminListMenus(): Promise<MenuConfig[]> {
    const rows = await this.db.query<{ id: string; location: string; items_json: string }>(
      'SELECT id, location, items_json FROM menus ORDER BY location ASC'
    );
    return rows.map((r) => ({
      id: r.id,
      location: r.location,
      items: parseJson<Array<{ label: LocalizedText; url: string }>>(r.items_json, []),
    }));
  }

  async adminSaveMenu(
    location: string,
    actorUserId: string,
    items: Array<{ label: LocalizedText; url: string }>,
    ipAddress?: string
  ): Promise<MenuConfig> {
    const existing = await this.db.queryOne<{ id: string }>('SELECT id FROM menus WHERE location = ? LIMIT 1', [location]);
    const id = existing?.id || `menu-${location}`;
    if (existing) {
      await this.db.execute('UPDATE menus SET items_json = ? WHERE id = ?', [JSON.stringify(items), id]);
    } else {
      await this.db.execute('INSERT INTO menus (id, location, items_json) VALUES (?, ?, ?)', [
        id,
        location,
        JSON.stringify(items),
      ]);
    }
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.save_menu',
      entityType: 'menu',
      entityId: id,
      after: { location, itemCount: items.length },
      ipAddress,
    });
    return { id, location, items };
  }

  async adminUpdateUserAccess(
    userId: string,
    actorUserId: string,
    patch: { isBlocked?: boolean; permissions?: string[] },
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const target = await tx.queryOne<{ id: string; role_key: string; is_blocked: number | boolean }>(
        'SELECT id, role_key, is_blocked FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      if (!target) throw new Error('User not found.');
      if (target.role_key === 'admin_super' && patch.isBlocked) {
        throw new Error('Cannot block a Super Admin account.');
      }

      if (patch.isBlocked !== undefined) {
        await tx.execute('UPDATE users SET is_blocked = ?, updated_at = ? WHERE id = ?', [
          patch.isBlocked ? 1 : 0,
          toSqlTimestamp(),
          userId,
        ]);
        if (patch.isBlocked) {
          await tx.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
        }
      }

      if (patch.permissions !== undefined) {
        await tx.execute('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
        for (const perm of patch.permissions) {
          await tx.execute('INSERT INTO user_permissions (id, user_id, permission_key) VALUES (?, ?, ?)', [
            `up-${crypto.randomUUID()}`,
            userId,
            perm,
          ]);
        }
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'admin.update_user_access',
        entityType: 'user',
        entityId: userId,
        after: patch,
        ipAddress,
      });

      return { ok: true, userId };
    });
  }

  async releaseHoldsNow(actorUserId: string, ipAddress?: string) {
    const released = await releaseEligibleEscrowHolds(this.db);
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'admin.release_holds',
      entityType: 'ledger',
      entityId: 'escrow',
      after: { releasedCount: released },
      ipAddress,
    });
    return released;
  }

  async logError(route: string, err: unknown) {
    try {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack || null : null;
      await this.db.execute(
        'INSERT INTO error_log (id, route, message, stack, created_at) VALUES (?, ?, ?, ?, ?)',
        [`err-${crypto.randomUUID()}`, route.slice(0, 200), msg.slice(0, 1000), stack?.slice(0, 4000) || null, toSqlTimestamp()]
      );
    } catch {
      // avoid throwing from error logger
    }
  }
}
