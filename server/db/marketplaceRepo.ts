import crypto from 'node:crypto';
import type {
  AuditLogEntry,
  BannerBgToken,
  BannerPageScope,
  BannerPlacementType,
  Category,
  Coupon,
  DeliveryMode,
  DeliveryZone,
  DeviceTargetType,
  FeaturedPlacement,
  FeaturedPlacementTargetType,
  FeaturedSlotKey,
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
  MarketingPopup,
  MediaAsset,
  Offer,
  OfferApprovalStatus,
  OfferBanner,
  OfferTargetType,
  OfferType,
  Order,
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
  Review,
  Seller,
  SellerStatus,
  SiteChromeSettings,
  StorefrontThemeId,
  SubOrder,
  SubOrderStatus,
  SubscriptionPlan,
  SubscriptionTier,
} from '../../src/shared/types.ts';
import {
  DEFAULT_SITE_CHROME,
  HOME_SECTION_PRESETS,
  mapLegacySectionType,
  normalizeTargeting,
} from '../../src/shared/homeSections.ts';
import { isWithinSchedule, resolveUnitOfferPrice } from '../../src/shared/offers.ts';
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
import { queueEmail } from '../services/email.ts';
import { releaseEligibleEscrowHolds } from '../services/jobs.ts';

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
              ss.delivery_mode, ss.self_delivery_fees_json
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
              ss.delivery_mode, ss.self_delivery_fees_json
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
              ss.delivery_mode, ss.self_delivery_fees_json
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
       WHERE p.published = 1 AND p.deleted_at IS NULL AND sel.status = 'approved' AND sel.deleted_at IS NULL
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
       WHERE (p.slug = ? OR p.id = ?) AND p.published = 1 AND p.deleted_at IS NULL AND sel.status = 'approved'
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
      'SELECT * FROM products WHERE seller_id = ? AND published = 1 AND deleted_at IS NULL ORDER BY created_at DESC',
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
      sellers,
      products,
      subscriptionPlans,
      deliveryZones,
      homeSections,
      banners,
      popups,
      featuredPlacements,
      offers,
      siteChrome,
    ] = await Promise.all([
      this.getPlatformSettings(),
      this.getPaymentConfig(),
      this.getCategories(),
      this.getPublicSellers(),
      this.getPublicProducts(),
      this.getSubscriptionPlans(),
      this.getDeliveryZones(),
      this.getPublicHomeSections(ctx),
      this.getActiveBanners(),
      this.getActivePopups(),
      this.getActiveFeaturedPlacements(),
      this.getActiveOffers(),
      this.getSiteChrome(Boolean(ctx?.includeDrafts)),
    ]);

    return {
      settings,
      paymentsConfig,
      categories,
      sellers,
      products,
      subscriptionPlans,
      deliveryZones,
      homeSections,
      banners,
      popups,
      featuredPlacements,
      offers,
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

  async validateCoupon(code: string, subtotalUsdCents: number, sellerIds: string[]) {
    const clean = code.trim().toUpperCase();
    const row = await this.db.queryOne<{
      id: string;
      code: string;
      seller_id: string | null;
      discount_type: string;
      discount_value: number;
      min_order_usd_cents: number;
      max_uses: number | null;
      used_count: number;
      active: number | boolean;
    }>('SELECT * FROM coupons WHERE UPPER(code) = ? AND active = 1 LIMIT 1', [clean]);

    if (!row) throw new Error('Invalid or expired coupon code.');
    if (row.max_uses !== null && Number(row.used_count) >= Number(row.max_uses)) {
      throw new Error('This coupon has reached its redemption limit.');
    }
    if (subtotalUsdCents < Number(row.min_order_usd_cents)) {
      throw new Error(`Minimum order for ${row.code} is $${(Number(row.min_order_usd_cents) / 100).toFixed(2)}.`);
    }
    if (row.seller_id && !sellerIds.includes(row.seller_id)) {
      throw new Error(`Coupon ${row.code} applies only to items from its issuing store.`);
    }

    return {
      id: row.id,
      code: row.code,
      sellerId: row.seller_id,
      discountPercent: Number(row.discount_value),
      minOrderUsdCents: Number(row.min_order_usd_cents),
      active: Boolean(row.active),
    };
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

    return this.db.transaction(async (tx) => {
      const activeOffers = await this.getActiveOffers(tx);
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
            commBps: number;
            commSource: string;
            commCents: number;
          }>;
        }
      >();

      let subtotalUsdCents = 0;

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

        // Atomic stock deduction + stock_movements log
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

        const baseUnit = product.basePriceUsdCents + variant.priceDeltaUsdCents;
        const unitPrice = resolveUnitOfferPrice(baseUnit, product, activeOffers).effectiveUsdCents;
        const lineTotal = unitPrice * reqItem.quantity;
        const comm = await this.resolveCommissionBps(seller.id, product.categoryId, tx);
        const commCents = Math.round((lineTotal * comm.bps) / 10000);
        subtotalUsdCents += lineTotal;

        const bucket = grouped.get(seller.id) || { seller, items: [] };
        bucket.items.push({
          product,
          variant,
          quantity: reqItem.quantity,
          unitPrice,
          lineTotal,
          commBps: comm.bps,
          commSource: comm.source,
          commCents,
        });
        grouped.set(seller.id, bucket);
      }

      let couponRecord: { id: string; code: string; sellerId: string | null; discountPercent: number } | null = null;
      if (input.couponCode && input.couponCode.trim()) {
        const c = await this.validateCoupon(input.couponCode, subtotalUsdCents, Array.from(grouped.keys()));
        couponRecord = c;
        await tx.execute('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [c.id]);
      }

      const zoneRow = await tx.queryOne<{ platform_fee_usd_cents: number }>(
        'SELECT platform_fee_usd_cents FROM delivery_zones WHERE governorate_code = ?',
        [input.governorate]
      );
      const platformZoneFee = Number(zoneRow?.platform_fee_usd_cents ?? 500);

      let deliveryTotalUsdCents = 0;
      let discountTotalUsdCents = 0;
      const orderId = `ord-${crypto.randomUUID()}`;
      const createdAt = toSqlTimestamp();
      const builtSubOrders: SubOrder[] = [];

      for (const [sellerId, bucket] of grouped.entries()) {
        const subSubtotal = bucket.items.reduce((s, i) => s + i.lineTotal, 0);
        const subComm = bucket.items.reduce((s, i) => s + i.commCents, 0);
        const subDiscount =
          couponRecord && (!couponRecord.sellerId || couponRecord.sellerId === sellerId)
            ? Math.round((subSubtotal * couponRecord.discountPercent) / 100)
            : 0;

        const deliveryFee =
          bucket.seller.deliveryMode === 'self'
            ? Number(bucket.seller.selfDeliveryFeesUsdCents[input.governorate] ?? platformZoneFee)
            : platformZoneFee;

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

        // Double-entry ledger entries (held until delivery + holdPeriodDays)
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
                  ss.delivery_mode, ss.self_delivery_fees_json
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
    const coupons: Coupon[] = couponRows.map((c) => ({
      id: String(c.id),
      code: String(c.code),
      sellerId: c.seller_id ? String(c.seller_id) : null,
      discountPercent: Number(c.discount_value),
      minOrderUsdCents: Number(c.min_order_usd_cents),
      active: Boolean(c.active),
    }));

    const docs = await this.db.query<{
      id: string;
      doc_type: string;
      review_status: string;
      public_url: string;
      created_at: string;
    }>(
      `SELECT d.id, d.doc_type, d.review_status, m.public_url, d.created_at
       FROM seller_documents d INNER JOIN media m ON m.id = d.media_id
       WHERE d.seller_id = ? ORDER BY d.created_at DESC`,
      [sellerId]
    );

    const reviews = await this.getReviewsForSeller(sellerId);
    const catId = `cat-${seller.department === 'home-gadgets' ? 'home' : seller.department}`;
    const commissionInfo = await this.resolveCommissionBps(seller.id, catId);
    const [subscriptionPlans, deliveryZones, sellerOffers] = await Promise.all([
      this.getSubscriptionPlans(),
      this.getDeliveryZones(),
      this.sellerListOffers(sellerId),
    ]);

    return {
      seller,
      products,
      subOrders,
      balance,
      payouts,
      coupons,
      offers: sellerOffers,
      reviews,
      documents: docs,
      commissionInfo,
      subscriptionPlans,
      deliveryZones,
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
      storefrontTheme?: StorefrontThemeId;
      deliveryMode?: DeliveryMode;
      bannerMediaId?: string;
      logoMediaId?: string;
    },
    ipAddress?: string
  ) {
    return this.db.transaction(async (tx) => {
      const storeRow = await tx.queryOne<{ id: string; tagline_json: string; about_json: string }>(
        'SELECT id, tagline_json, about_json FROM stores WHERE seller_id = ?',
        [sellerId]
      );
      if (!storeRow) throw new Error('Store not found.');

      const currTagline = parseJson<LocalizedText>(storeRow.tagline_json, { en: '', ar: '' });
      const currAbout = parseJson<LocalizedText>(storeRow.about_json, { en: '', ar: '' });
      const nextTagline = {
        en: patch.taglineEn !== undefined ? patch.taglineEn : currTagline.en,
        ar: patch.taglineAr !== undefined ? patch.taglineAr : currTagline.ar,
      };
      const nextAbout = {
        en: patch.aboutEn !== undefined ? patch.aboutEn : currAbout.en,
        ar: patch.aboutAr !== undefined ? patch.aboutAr : currAbout.ar,
      };

      await tx.execute(
        `UPDATE stores SET tagline_json = ?, about_json = ?,
         theme_id = COALESCE(?, theme_id),
         banner_media_id = COALESCE(?, banner_media_id),
         logo_media_id = COALESCE(?, logo_media_id),
         updated_at = ?
         WHERE id = ?`,
        [
          JSON.stringify(nextTagline),
          JSON.stringify(nextAbout),
          patch.storefrontTheme || null,
          patch.bannerMediaId || null,
          patch.logoMediaId || null,
          toSqlTimestamp(),
          storeRow.id,
        ]
      );

      if (patch.deliveryMode) {
        await tx.execute('UPDATE store_settings SET delivery_mode = ? WHERE store_id = ?', [
          patch.deliveryMode,
          storeRow.id,
        ]);
      }

      await writeAuditLog(tx, {
        actorUserId,
        action: 'seller.update_storefront',
        entityType: 'store',
        entityId: storeRow.id,
        after: patch,
        ipAddress,
      });

      return this.getSellerById(sellerId);
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
      sku: string;
      size?: string;
      color?: string;
      colorHex?: string;
      stock: number;
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
      const varId = `var-${crypto.randomUUID()}`;
      const slugBase = input.titleEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
      const slug = `${slugBase}-${crypto.randomInt(1000, 9999)}`;
      const dept = input.department || seller.department;
      const categoryId = `cat-${dept === 'home-gadgets' ? 'home' : dept}`;
      const now = toSqlTimestamp();

      await tx.execute(
        `INSERT INTO products (id, seller_id, category_id, department, slug, title_json, subtitle_json, description_json, specs_json, base_price_usd_cents, compare_at_usd_cents, seller_currency, moderation_status, published, featured, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, 'USD', 'approved', ?, 0, ?, ?)`,
        [
          prodId,
          sellerId,
          categoryId,
          dept,
          slug,
          JSON.stringify({ en: input.titleEn.trim(), ar: (input.titleAr || input.titleEn).trim() }),
          JSON.stringify({ en: (input.subtitleEn || '').trim(), ar: (input.subtitleAr || input.subtitleEn || '').trim() }),
          JSON.stringify({ en: (input.descriptionEn || input.titleEn).trim(), ar: (input.descriptionAr || input.titleAr || input.titleEn).trim() }),
          input.basePriceUsdCents,
          input.compareAtUsdCents || null,
          input.published === false ? 0 : 1,
          now,
          now,
        ]
      );

      await tx.execute(
        `INSERT INTO product_variants (id, product_id, sku, size, color, color_hex, stock, price_delta_usd_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [varId, prodId, input.sku.trim(), input.size || null, input.color || 'Default', input.colorHex || '#1C1D21', Math.max(0, Math.trunc(input.stock))]
      );

      await tx.execute(
        'INSERT INTO stock_movements (id, variant_id, delta, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [`stk-${crypto.randomUUID()}`, varId, Math.max(0, Math.trunc(input.stock)), 'initial_stock', prodId, now]
      );

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
    input: { code: string; discountPercent: number; minOrderUsdCents?: number },
    ipAddress?: string
  ) {
    const clean = input.code.trim().toUpperCase();
    if (clean.length < 3) throw new Error('Coupon code must be at least 3 characters.');
    if (input.discountPercent < 1 || input.discountPercent > 80) throw new Error('Discount percent must be 1–80%.');
    const id = `cpn-${crypto.randomUUID()}`;
    await this.db.execute(
      `INSERT INTO coupons (id, code, seller_id, discount_type, discount_value, min_order_usd_cents, active)
       VALUES (?, ?, ?, 'percent', ?, ?, 1)`,
      [id, clean, sellerId, Math.round(input.discountPercent), Math.max(0, Math.trunc(input.minOrderUsdCents || 0))]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'coupon.created',
      entityType: 'coupon',
      entityId: id,
      after: { code: clean, discountPercent: input.discountPercent, sellerId },
      ipAddress,
    });
    return {
      id,
      code: clean,
      sellerId,
      discountPercent: Math.round(input.discountPercent),
      minOrderUsdCents: Math.max(0, Math.trunc(input.minOrderUsdCents || 0)),
      active: true,
    };
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
    const [settings, paymentsConfig, categories, deliveryZones, subscriptionPlans, pages] = await Promise.all([
      this.getPlatformSettings(),
      this.getPaymentConfig(),
      this.getCategories(),
      this.getDeliveryZones(),
      this.getSubscriptionPlans(),
      this.getAllPages(),
    ]);

    const sellerRows = await this.db.query<Record<string, unknown>>(
      `SELECT sel.*, st.slug, st.name_json, st.tagline_json, st.about_json, st.announcement_json,
              st.department_slug, st.theme_id, st.logo_media_id, st.banner_media_id, st.rating_avg_x10, st.review_count,
              ss.delivery_mode, ss.self_delivery_fees_json
       FROM sellers sel
       INNER JOIN stores st ON st.seller_id = sel.id
       LEFT JOIN store_settings ss ON ss.store_id = st.id
       WHERE sel.deleted_at IS NULL ORDER BY sel.created_at DESC`
    );
    const sellers: Seller[] = [];
    for (const r of sellerRows) sellers.push(await this.mapSellerRow(r));

    const orderRows = await this.db.query<Record<string, unknown>>('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
    const orders = await this.hydrateOrders(orderRows);

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

    const couponRows = await this.db.query<Record<string, unknown>>('SELECT * FROM coupons');
    const coupons: Coupon[] = couponRows.map((c) => ({
      id: String(c.id),
      code: String(c.code),
      sellerId: c.seller_id ? String(c.seller_id) : null,
      discountPercent: Number(c.discount_value),
      minOrderUsdCents: Number(c.min_order_usd_cents),
      active: Boolean(c.active),
    }));

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

    const [homeBuilderData, bannersList, popupsList, featuredPlacementsList, offersList] = await Promise.all([
      this.adminListHomeSections(),
      this.adminListBanners(),
      this.adminListPopups(),
      this.adminListFeaturedPlacements(),
      this.adminListOffers(),
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
      sellers,
      orders,
      payouts,
      coupons,
      deliveryZones,
      subscriptionPlans,
      ledger,
      pages,
      homeSections: homeBuilderData.sections,
      homeSectionVersions: homeBuilderData.versionsBySectionId,
      banners: bannersList,
      popups: popupsList,
      featuredPlacements: featuredPlacementsList,
      offers: offersList,
      auditLog,
      staffUsers,
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

      return this.getSellerById(sellerId);
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

      const owner = await tx.queryOne<{ email: string; preferred_locale: string }>(
        `SELECT u.email, u.preferred_locale FROM sellers s INNER JOIN users u ON u.id = s.owner_user_id WHERE s.id = ?`,
        [pay.seller_id]
      );
      if (owner) {
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
    const existing = await this.db.queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM newsletter_subscribers WHERE LOWER(email) = ?',
      [cleanEmail]
    );
    const now = toSqlTimestamp();
    if (existing) {
      await this.db.execute(
        "UPDATE newsletter_subscribers SET status = 'subscribed', locale = ?, source = ?, consented_at = ? WHERE id = ?",
        [locale, source.slice(0, 60), now, existing.id]
      );
      return { id: existing.id, email: cleanEmail, status: 'subscribed' as const, alreadySubscribed: true };
    }
    const id = `sub-${crypto.randomUUID()}`;
    const token = crypto.randomBytes(24).toString('hex');
    await this.db.execute(
      `INSERT INTO newsletter_subscribers (id, email, locale, source, status, unsubscribe_token, consented_at, created_at)
       VALUES (?, ?, ?, ?, 'subscribed', ?, ?, ?)`,
      [id, cleanEmail, locale, source.slice(0, 60), token, now, now]
    );
    return { id, email: cleanEmail, status: 'subscribed' as const, alreadySubscribed: false };
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

  // --- Phase B: Offers & Promotions Engine ---
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
       WHERE o.approval_status = 'approved' AND o.active = 1`
    );
    const nowMs = Date.now();
    return rows.map((r) => this.mapOfferRow(r)).filter((o) => isWithinSchedule(o.startsAt, o.endsAt, nowMs));
  }

  async adminListOffers(): Promise<Offer[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT o.*, st.name_json AS seller_name_json
       FROM offers o
       LEFT JOIN stores st ON st.seller_id = o.seller_id
       ORDER BY o.approval_status ASC, o.id DESC`
    );
    return rows.map((r) => this.mapOfferRow(r));
  }

  async adminCreateOffer(
    actorUserId: string,
    input: {
      title: LocalizedText;
      offerType: OfferType;
      discountValue: number;
      targetType: OfferTargetType;
      targetId?: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
      active?: boolean;
    },
    ipAddress?: string
  ): Promise<Offer> {
    if (input.offerType !== 'fixed_usd_cents' && (input.discountValue < 1 || input.discountValue > 90)) {
      throw new Error('Percentage discount must be between 1% and 90%.');
    }
    if (input.offerType === 'fixed_usd_cents' && input.discountValue < 1) {
      throw new Error('Fixed discount must be at least 1 USD cent.');
    }
    const id = `off-${crypto.randomUUID()}`;
    await this.db.execute(
      `INSERT INTO offers (id, seller_id, title_json, offer_type, discount_value, target_type, target_id, approval_status, starts_at, ends_at, active)
       VALUES (?, NULL, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`,
      [
        id,
        JSON.stringify(input.title),
        input.offerType,
        Math.round(input.discountValue),
        input.targetType,
        input.targetId?.trim() || null,
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
      after: { offerType: input.offerType, discountValue: input.discountValue, targetType: input.targetType },
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
    if (input.offerType !== 'fixed_usd_cents' && (input.discountValue < 1 || input.discountValue > 85)) {
      throw new Error('Seller discount percent must be between 1% and 85%.');
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

    const id = `off-${crypto.randomUUID()}`;
    await this.db.execute(
      `INSERT INTO offers (id, seller_id, title_json, offer_type, discount_value, target_type, target_id, approval_status, starts_at, ends_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 1)`,
      [
        id,
        sellerId,
        JSON.stringify(input.title),
        input.offerType,
        Math.round(input.discountValue),
        input.targetType,
        resolvedTargetId,
        input.startsAt ? toSqlTimestamp(new Date(input.startsAt)) : null,
        input.endsAt ? toSqlTimestamp(new Date(input.endsAt)) : null,
      ]
    );
    await writeAuditLog(this.db, {
      actorUserId,
      action: 'seller.propose_offer',
      entityType: 'offer',
      entityId: id,
      after: { sellerId, targetType: input.targetType, resolvedTargetId, approvalStatus: 'pending' },
      ipAddress,
    });
    const row = await this.db.queryOne<Record<string, unknown>>('SELECT * FROM offers WHERE id = ?', [id]);
    return this.mapOfferRow(row!);
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
