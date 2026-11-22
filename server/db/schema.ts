import {
  bigint,
  boolean,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

// 1. Users & Granular RBAC
export const users = mysqlTable(
  'users',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 160 }).notNull(),
    email: varchar('email', { length: 190 }).notNull(),
    phone: varchar('phone', { length: 40 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    roleKey: varchar('role_key', { length: 40 }).notNull().default('customer'),
    emailVerifiedAt: timestamp('email_verified_at'),
    phoneVerifiedAt: timestamp('phone_verified_at'),
    totpSecret: varchar('totp_secret', { length: 128 }),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    preferredLocale: varchar('preferred_locale', { length: 5 }).notNull().default('en'),
    preferredCurrency: varchar('preferred_currency', { length: 5 }).notNull().default('USD'),
    failedLoginAttempts: int('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until'),
    isBlocked: boolean('is_blocked').notNull().default(false),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_users_email').on(t.email), index('idx_users_role').on(t.roleKey)]
);

export const roles = mysqlTable('roles', {
  key: varchar('key', { length: 40 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
});

export const permissions = mysqlTable('permissions', {
  key: varchar('key', { length: 80 }).primaryKey(),
  description: varchar('description', { length: 255 }).notNull(),
});

export const rolePermissions = mysqlTable(
  'role_permissions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    roleKey: varchar('role_key', { length: 40 }).notNull(),
    permissionKey: varchar('permission_key', { length: 80 }).notNull(),
  },
  (t) => [uniqueIndex('uq_role_perm').on(t.roleKey, t.permissionKey)]
);

export const userPermissions = mysqlTable(
  'user_permissions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    permissionKey: varchar('permission_key', { length: 80 }).notNull(),
  },
  (t) => [uniqueIndex('uq_user_perm').on(t.userId, t.permissionKey)]
);

export const sessions = mysqlTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    csrfToken: varchar('csrf_token', { length: 128 }).notNull(),
    userAgent: varchar('user_agent', { length: 255 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_sessions_token_hash').on(t.tokenHash), index('idx_sessions_user').on(t.userId)]
);

export const passwordResets = mysqlTable('password_resets', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull(),
  purpose: varchar('purpose', { length: 32 }).notNull().default('password_reset'),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 2. Sellers, Stores & KYC Documents
export const sellers = mysqlTable(
  'sellers',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    ownerUserId: varchar('owner_user_id', { length: 64 }).notNull(),
    businessType: varchar('business_type', { length: 32 }).notNull().default('individual'),
    legalName: varchar('legal_name', { length: 190 }).notNull(),
    commercialRegRef: varchar('commercial_reg_ref', { length: 120 }).notNull(),
    governorate: varchar('governorate', { length: 64 }).notNull(),
    district: varchar('district', { length: 64 }).notNull(),
    cityAddress: varchar('city_address', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 40 }).notNull(),
    whatsappPhone: varchar('whatsapp_phone', { length: 40 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    statusReason: text('status_reason'),
    verified: boolean('verified').notNull().default(false),
    customCommissionBps: int('custom_commission_bps'),
    payoutMethod: varchar('payout_method', { length: 24 }).notNull().default('whish'),
    payoutAccount: varchar('payout_account', { length: 190 }).notNull(),
    onboardingStep: int('onboarding_step').notNull().default(1),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('idx_sellers_status').on(t.status), index('idx_sellers_owner').on(t.ownerUserId)]
);

export const stores = mysqlTable(
  'stores',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    sellerId: varchar('seller_id', { length: 64 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    nameJson: json('name_json').$type<{ en: string; ar: string }>().notNull(),
    taglineJson: json('tagline_json').$type<{ en: string; ar: string }>().notNull(),
    aboutJson: json('about_json').$type<{ en: string; ar: string }>().notNull(),
    announcementJson: json('announcement_json').$type<{ en: string; ar: string } | null>(),
    departmentSlug: varchar('department_slug', { length: 40 }).notNull(),
    themeId: varchar('theme_id', { length: 40 }).notNull().default('obsidian-ember'),
    logoMediaId: varchar('logo_media_id', { length: 64 }),
    bannerMediaId: varchar('banner_media_id', { length: 64 }),
    ratingAvg: int('rating_avg_x10').notNull().default(0),
    reviewCount: int('review_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_stores_slug').on(t.slug), uniqueIndex('uq_stores_seller').on(t.sellerId)]
);

export const storeSettings = mysqlTable('store_settings', {
  storeId: varchar('store_id', { length: 64 }).primaryKey(),
  deliveryMode: varchar('delivery_mode', { length: 24 }).notNull().default('platform'),
  selfDeliveryFeesJson: json('self_delivery_fees_json').$type<Record<string, number>>().notNull(),
  processingHours: int('processing_hours').notNull().default(24),
  vacationMode: boolean('vacation_mode').notNull().default(false),
  workingHoursJson: json('working_hours_json').$type<Record<string, string>>(),
  returnPolicyJson: json('return_policy_json').$type<{ en: string; ar: string } | null>(),
  socialLinksJson: json('social_links_json').$type<Record<string, string>>(),
  seoTitle: varchar('seo_title', { length: 190 }),
  seoDescription: text('seo_description'),
});

export const sellerDocuments = mysqlTable('seller_documents', {
  id: varchar('id', { length: 64 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 64 }).notNull(),
  docType: varchar('doc_type', { length: 40 }).notNull(),
  mediaId: varchar('media_id', { length: 64 }).notNull(),
  reviewStatus: varchar('review_status', { length: 32 }).notNull().default('pending'),
  reviewerNote: text('reviewer_note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 3. Catalog: Categories, Attributes, Brands, Products, Variants, Media, Stock
export const categories = mysqlTable(
  'categories',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    parentId: varchar('parent_id', { length: 64 }),
    slug: varchar('slug', { length: 100 }).notNull(),
    department: varchar('department', { length: 40 }).notNull(),
    nameJson: json('name_json').$type<{ en: string; ar: string }>().notNull(),
    commissionBps: int('commission_bps'),
    sortOrder: int('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('uq_categories_slug').on(t.slug)]
);

export const attributes = mysqlTable('attributes', {
  id: varchar('id', { length: 64 }).primaryKey(),
  code: varchar('code', { length: 64 }).notNull(),
  nameJson: json('name_json').$type<{ en: string; ar: string }>().notNull(),
  valuesJson: json('values_json').$type<string[]>().notNull(),
});

export const brands = mysqlTable('brands', {
  id: varchar('id', { length: 64 }).primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull(),
  nameJson: json('name_json').$type<{ en: string; ar: string }>().notNull(),
  active: boolean('active').notNull().default(true),
});

export const products = mysqlTable(
  'products',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    sellerId: varchar('seller_id', { length: 64 }).notNull(),
    categoryId: varchar('category_id', { length: 64 }).notNull(),
    brandId: varchar('brand_id', { length: 64 }),
    department: varchar('department', { length: 40 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull(),
    titleJson: json('title_json').$type<{ en: string; ar: string }>().notNull(),
    subtitleJson: json('subtitle_json').$type<{ en: string; ar: string }>().notNull(),
    descriptionJson: json('description_json').$type<{ en: string; ar: string }>().notNull(),
    specsJson: json('specs_json').$type<Array<{ key: { en: string; ar: string }; value: { en: string; ar: string } }>>().notNull(),
    basePriceUsdCents: int('base_price_usd_cents').notNull(),
    compareAtUsdCents: int('compare_at_usd_cents'),
    sellerCurrency: varchar('seller_currency', { length: 5 }).notNull().default('USD'),
    moderationStatus: varchar('moderation_status', { length: 32 }).notNull().default('pending'),
    published: boolean('published').notNull().default(false),
    featured: boolean('featured').notNull().default(false),
    model3dUrl: varchar('model_3d_url', { length: 255 }),
    ratingAvgX10: int('rating_avg_x10').notNull().default(0),
    reviewCount: int('review_count').notNull().default(0),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_products_slug').on(t.slug),
    index('idx_products_seller').on(t.sellerId),
    index('idx_products_dept').on(t.department),
  ]
);

export const productVariants = mysqlTable(
  'product_variants',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    productId: varchar('product_id', { length: 64 }).notNull(),
    sku: varchar('sku', { length: 80 }).notNull(),
    size: varchar('size', { length: 40 }),
    color: varchar('color', { length: 64 }).notNull(),
    colorHex: varchar('color_hex', { length: 16 }).notNull(),
    stock: int('stock').notNull().default(0),
    priceDeltaUsdCents: int('price_delta_usd_cents').notNull().default(0),
  },
  (t) => [index('idx_variants_product').on(t.productId)]
);

export const media = mysqlTable('media', {
  id: varchar('id', { length: 64 }).primaryKey(),
  ownerUserId: varchar('owner_user_id', { length: 64 }).notNull(),
  entityType: varchar('entity_type', { length: 40 }).notNull(),
  entityId: varchar('entity_id', { length: 64 }),
  folder: varchar('folder', { length: 64 }).notNull().default('general'),
  storageDriver: varchar('storage_driver', { length: 24 }).notNull().default('local'),
  storageKey: varchar('storage_key', { length: 255 }).notNull(),
  publicUrl: varchar('public_url', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 80 }).notNull(),
  sizeBytes: int('size_bytes').notNull(),
  width: int('width'),
  height: int('height'),
  altJson: json('alt_json').$type<{ en: string; ar: string } | null>(),
  focalX: int('focal_x').notNull().default(50),
  focalY: int('focal_y').notNull().default(50),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const stockMovements = mysqlTable('stock_movements', {
  id: varchar('id', { length: 64 }).primaryKey(),
  variantId: varchar('variant_id', { length: 64 }).notNull(),
  delta: int('delta').notNull(),
  reason: varchar('reason', { length: 64 }).notNull(),
  referenceId: varchar('reference_id', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 4. Carts, Orders, Sub-Orders, Payments, Ledger & Payouts
export const carts = mysqlTable('carts', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }),
  guestToken: varchar('guest_token', { length: 128 }),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const cartItems = mysqlTable('cart_items', {
  id: varchar('id', { length: 64 }).primaryKey(),
  cartId: varchar('cart_id', { length: 64 }).notNull(),
  productId: varchar('product_id', { length: 64 }).notNull(),
  variantId: varchar('variant_id', { length: 64 }).notNull(),
  quantity: int('quantity').notNull(),
});

export const orders = mysqlTable(
  'orders',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    orderNumber: varchar('order_number', { length: 40 }).notNull(),
    userId: varchar('user_id', { length: 64 }),
    customerName: varchar('customer_name', { length: 160 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 40 }).notNull(),
    governorate: varchar('governorate', { length: 64 }).notNull(),
    district: varchar('district', { length: 64 }).notNull(),
    town: varchar('town', { length: 120 }).notNull(),
    addressNotes: text('address_notes').notNull(),
    paymentMethod: varchar('payment_method', { length: 32 }).notNull(),
    paymentStatus: varchar('payment_status', { length: 32 }).notNull().default('pending'),
    couponCode: varchar('coupon_code', { length: 64 }),
    exchangeRateSnapshot: bigint('exchange_rate_snapshot', { mode: 'number' }).notNull(),
    subtotalUsdCents: int('subtotal_usd_cents').notNull(),
    deliveryTotalUsdCents: int('delivery_total_usd_cents').notNull(),
    codFeeUsdCents: int('cod_fee_usd_cents').notNull().default(0),
    discountTotalUsdCents: int('discount_total_usd_cents').notNull().default(0),
    grandTotalUsdCents: int('grand_total_usd_cents').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_orders_number').on(t.orderNumber), index('idx_orders_user').on(t.userId)]
);

export const subOrders = mysqlTable(
  'sub_orders',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    orderId: varchar('order_id', { length: 64 }).notNull(),
    sellerId: varchar('seller_id', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    deliveryMode: varchar('delivery_mode', { length: 24 }).notNull(),
    deliveryFeeUsdCents: int('delivery_fee_usd_cents').notNull(),
    subtotalUsdCents: int('subtotal_usd_cents').notNull(),
    discountUsdCents: int('discount_usd_cents').notNull().default(0),
    commissionUsdCents: int('commission_usd_cents').notNull(),
    sellerNetUsdCents: int('seller_net_usd_cents').notNull(),
    codCollected: boolean('cod_collected').notNull().default(false),
    courierName: varchar('courier_name', { length: 120 }),
    trackingCode: varchar('tracking_code', { length: 120 }),
    deliveredAt: timestamp('delivered_at'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('idx_sub_orders_order').on(t.orderId), index('idx_sub_orders_seller').on(t.sellerId)]
);

export const orderItems = mysqlTable('order_items', {
  id: varchar('id', { length: 64 }).primaryKey(),
  subOrderId: varchar('sub_order_id', { length: 64 }).notNull(),
  productId: varchar('product_id', { length: 64 }).notNull(),
  variantId: varchar('variant_id', { length: 64 }).notNull(),
  titleSnapshotJson: json('title_snapshot_json').$type<{ en: string; ar: string }>().notNull(),
  variantLabel: varchar('variant_label', { length: 120 }).notNull(),
  sku: varchar('sku', { length: 80 }).notNull(),
  quantity: int('quantity').notNull(),
  unitPriceUsdCents: int('unit_price_usd_cents').notNull(),
  lineTotalUsdCents: int('line_total_usd_cents').notNull(),
  commissionBpsSnapshot: int('commission_bps_snapshot').notNull(),
  commissionUsdCents: int('commission_usd_cents').notNull(),
});

export const payments = mysqlTable('payments', {
  id: varchar('id', { length: 64 }).primaryKey(),
  orderId: varchar('order_id', { length: 64 }).notNull(),
  method: varchar('method', { length: 32 }).notNull(),
  gatewayName: varchar('gateway_name', { length: 120 }).notNull(),
  reference: varchar('reference', { length: 160 }),
  amountUsdCents: int('amount_usd_cents').notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  verifiedByUserId: varchar('verified_by_user_id', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const ledgerEntries = mysqlTable(
  'ledger_entries',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    sellerId: varchar('seller_id', { length: 64 }).notNull(),
    subOrderId: varchar('sub_order_id', { length: 64 }),
    orderNumber: varchar('order_number', { length: 40 }),
    entryType: varchar('entry_type', { length: 40 }).notNull(),
    direction: varchar('direction', { length: 10 }).notNull(),
    amountUsdCents: int('amount_usd_cents').notNull(),
    availability: varchar('availability', { length: 24 }).notNull().default('pending'),
    note: text('note').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_ledger_seller').on(t.sellerId)]
);

export const payouts = mysqlTable('payouts', {
  id: varchar('id', { length: 64 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 64 }).notNull(),
  amountUsdCents: int('amount_usd_cents').notNull(),
  method: varchar('method', { length: 24 }).notNull(),
  accountDetails: varchar('account_details', { length: 190 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('pending'),
  referenceCode: varchar('reference_code', { length: 120 }),
  settledByUserId: varchar('settled_by_user_id', { length: 64 }),
  settledAt: timestamp('settled_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const commissionsLog = mysqlTable('commissions_log', {
  id: varchar('id', { length: 64 }).primaryKey(),
  orderItemId: varchar('order_item_id', { length: 64 }).notNull(),
  sellerId: varchar('seller_id', { length: 64 }).notNull(),
  appliedBps: int('applied_bps').notNull(),
  sourceRule: varchar('source_rule', { length: 40 }).notNull(),
  amountUsdCents: int('amount_usd_cents').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 5. Subscriptions, Offers, Coupons, Home Sections, Banners, Pages & Menus
export const subscriptionPlans = mysqlTable('subscription_plans', {
  tier: varchar('tier', { length: 32 }).primaryKey(),
  nameJson: json('name_json').$type<{ en: string; ar: string }>().notNull(),
  monthlyFeeUsdCents: int('monthly_fee_usd_cents').notNull(),
  productLimit: int('product_limit'),
  commissionDiscountBps: int('commission_discount_bps').notNull().default(0),
  featuresJson: json('features_json').$type<Array<{ en: string; ar: string }>>().notNull(),
});

export const subscriptions = mysqlTable('subscriptions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 64 }).notNull(),
  planTier: varchar('plan_tier', { length: 32 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('active'),
  nextDueAt: timestamp('next_due_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const coupons = mysqlTable(
  'coupons',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    code: varchar('code', { length: 64 }).notNull(),
    sellerId: varchar('seller_id', { length: 64 }),
    discountType: varchar('discount_type', { length: 24 }).notNull().default('percent'),
    discountValue: int('discount_value').notNull(),
    maxDiscountUsdCents: int('max_discount_usd_cents'),
    minOrderUsdCents: int('min_order_usd_cents').notNull().default(0),
    targetType: varchar('target_type', { length: 32 }).notNull().default('all'),
    targetId: varchar('target_id', { length: 64 }),
    campaignId: varchar('campaign_id', { length: 64 }),
    maxUses: int('max_uses'),
    perCustomerLimit: int('per_customer_limit').notNull().default(1),
    usedCount: int('used_count').notNull().default(0),
    firstOrderOnly: boolean('first_order_only').notNull().default(false),
    autoGeneratedBatch: varchar('auto_generated_batch', { length: 64 }),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('uq_coupons_code').on(t.code)]
);

export const couponRedemptions = mysqlTable(
  'coupon_redemptions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    couponId: varchar('coupon_id', { length: 64 }).notNull(),
    userId: varchar('user_id', { length: 64 }),
    customerPhoneNorm: varchar('customer_phone_norm', { length: 40 }).notNull(),
    orderId: varchar('order_id', { length: 64 }).notNull(),
    discountUsdCents: int('discount_usd_cents').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_coupon_redemptions_lookup').on(t.couponId, t.userId, t.customerPhoneNorm)]
);

export const offers = mysqlTable('offers', {
  id: varchar('id', { length: 64 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 64 }),
  titleJson: json('title_json').$type<{ en: string; ar: string }>().notNull(),
  offerType: varchar('offer_type', { length: 32 }).notNull(),
  discountValue: int('discount_value').notNull(),
  targetType: varchar('target_type', { length: 32 }).notNull(),
  targetId: varchar('target_id', { length: 64 }),
  stackingRule: varchar('stacking_rule', { length: 24 }).notNull().default('best_only'),
  fundingSource: varchar('funding_source', { length: 24 }).notNull().default('platform'),
  fundingPlatformBps: int('funding_platform_bps').notNull().default(10000),
  campaignId: varchar('campaign_id', { length: 64 }),
  priority: int('priority').notNull().default(10),
  rulesJson: json('rules_json').$type<Record<string, unknown> | null>(),
  approvalStatus: varchar('approval_status', { length: 24 }).notNull().default('pending'),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  active: boolean('active').notNull().default(true),
});

export const flashSales = mysqlTable(
  'flash_sales',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    slug: varchar('slug', { length: 120 }).notNull(),
    titleJson: json('title_json').$type<{ en: string; ar: string }>().notNull(),
    bgToken: varchar('bg_token', { length: 32 }).notNull().default('ember'),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('scheduled'),
    autoRevert: boolean('auto_revert').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_flash_sales_slug').on(t.slug)]
);

export const flashSaleItems = mysqlTable(
  'flash_sale_items',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    flashSaleId: varchar('flash_sale_id', { length: 64 }).notNull(),
    productId: varchar('product_id', { length: 64 }).notNull(),
    salePriceUsdCents: int('sale_price_usd_cents').notNull(),
    discountPercent: int('discount_percent').notNull(),
    stockCap: int('stock_cap').notNull().default(0),
    claimedCount: int('claimed_count').notNull().default(0),
  },
  (t) => [index('idx_flash_items_sale').on(t.flashSaleId)]
);

export const campaigns = mysqlTable(
  'campaigns',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    slug: varchar('slug', { length: 120 }).notNull(),
    titleJson: json('title_json').$type<{ en: string; ar: string }>().notNull(),
    subtitleJson: json('subtitle_json').$type<{ en: string; ar: string }>().notNull(),
    descriptionJson: json('description_json').$type<{ en: string; ar: string }>().notNull(),
    heroImageUrl: varchar('hero_image_url', { length: 500 }),
    bgToken: varchar('bg_token', { length: 32 }).notNull().default('ember'),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    status: varchar('status', { length: 24 }).notNull().default('draft'),
    featuredOfferIdsJson: json('featured_offer_ids_json').$type<string[]>().notNull(),
    featuredCouponCodesJson: json('featured_coupon_codes_json').$type<string[]>().notNull(),
    featuredFlashSaleId: varchar('featured_flash_sale_id', { length: 64 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_campaigns_slug').on(t.slug)]
);

export const banners = mysqlTable('banners', {
  id: varchar('id', { length: 64 }).primaryKey(),
  titleJson: json('title_json').$type<{ en: string; ar: string }>().notNull(),
  bgToken: varchar('bg_token', { length: 32 }).notNull().default('graphite'),
  targetUrl: varchar('target_url', { length: 255 }).notNull(),
  pagesJson: json('pages_json').$type<string[]>().notNull(),
  placement: varchar('placement', { length: 32 }).notNull().default('page_strip'),
  imageUrl: varchar('image_url', { length: 500 }),
  dismissible: boolean('dismissible').notNull().default(true),
  audience: varchar('audience', { length: 32 }).notNull().default('all'),
  deviceTarget: varchar('device_target', { length: 24 }).notNull().default('all'),
  categorySlug: varchar('category_slug', { length: 120 }),
  priority: int('priority').notNull().default(0),
  impressions: int('impressions').notNull().default(0),
  clicks: int('clicks').notNull().default(0),
  botFilteredCount: int('bot_filtered_count').notNull().default(0),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  active: boolean('active').notNull().default(true),
});

export const marketingPopups = mysqlTable('marketing_popups', {
  id: varchar('id', { length: 64 }).primaryKey(),
  titleJson: json('title_json').$type<{ en: string; ar: string }>().notNull(),
  bodyJson: json('body_json').$type<{ en: string; ar: string }>().notNull(),
  ctaLabelJson: json('cta_label_json').$type<{ en: string; ar: string }>().notNull(),
  targetUrl: varchar('target_url', { length: 255 }).notNull().default('/catalog'),
  imageUrl: varchar('image_url', { length: 500 }),
  bgToken: varchar('bg_token', { length: 32 }).notNull().default('ember'),
  popupType: varchar('popup_type', { length: 32 }).notNull().default('promo'),
  triggerType: varchar('trigger_type', { length: 32 }).notNull().default('delay_seconds'),
  triggerValue: int('trigger_value').notNull().default(5),
  frequencyCap: varchar('frequency_cap', { length: 32 }).notNull().default('once_per_day'),
  pagesJson: json('pages_json').$type<string[]>().notNull(),
  audience: varchar('audience', { length: 32 }).notNull().default('all'),
  deviceTarget: varchar('device_target', { length: 24 }).notNull().default('all'),
  showNewsletterForm: boolean('show_newsletter_form').notNull().default(false),
  couponCode: varchar('coupon_code', { length: 64 }),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  active: boolean('active').notNull().default(true),
  impressions: int('impressions').notNull().default(0),
  conversions: int('conversions').notNull().default(0),
  dismissals: int('dismissals').notNull().default(0),
  botFilteredCount: int('bot_filtered_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const featuredPlacements = mysqlTable('featured_placements', {
  id: varchar('id', { length: 64 }).primaryKey(),
  slotKey: varchar('slot_key', { length: 64 }).notNull(),
  targetType: varchar('target_type', { length: 24 }).notNull(),
  targetId: varchar('target_id', { length: 64 }).notNull(),
  sellerId: varchar('seller_id', { length: 64 }).notNull(),
  badgeJson: json('badge_json').$type<{ en: string; ar: string }>().notNull(),
  priority: int('priority').notNull().default(10),
  feeUsdCents: int('fee_usd_cents').notNull().default(0),
  ledgerCharged: boolean('ledger_charged').notNull().default(false),
  ledgerEntryId: varchar('ledger_entry_id', { length: 64 }),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  active: boolean('active').notNull().default(true),
  impressions: int('impressions').notNull().default(0),
  clicks: int('clicks').notNull().default(0),
  botFilteredCount: int('bot_filtered_count').notNull().default(0),
  createdByUserId: varchar('created_by_user_id', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const marketingEventsDedup = mysqlTable(
  'marketing_events_dedup',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    entityKind: varchar('entity_kind', { length: 24 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }).notNull(),
    eventType: varchar('event_type', { length: 24 }).notNull(),
    visitorHash: varchar('visitor_hash', { length: 64 }).notNull(),
    bucketKey: varchar('bucket_key', { length: 32 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_mkt_event_dedup').on(t.entityKind, t.entityId, t.eventType, t.visitorHash, t.bucketKey),
  ]
);


export const homeSections = mysqlTable('home_sections', {
  id: varchar('id', { length: 64 }).primaryKey(),
  sectionType: varchar('section_type', { length: 40 }).notNull(),
  titleJson: json('title_json').$type<{ en: string; ar: string }>().notNull(),
  contentJson: json('content_json').$type<Record<string, unknown>>().notNull(),
  sortOrder: int('sort_order').notNull().default(0),
  status: varchar('status', { length: 24 }).notNull().default('draft'),
  visible: boolean('visible').notNull().default(true),
  audience: varchar('audience', { length: 32 }).notNull().default('all'),
  targetingJson: json('targeting_json').$type<Record<string, unknown> | null>(),
  styleJson: json('style_json').$type<Record<string, unknown> | null>(),
  schedulePriority: int('schedule_priority').notNull().default(0),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  version: int('version').notNull().default(1),
  updatedByUserId: varchar('updated_by_user_id', { length: 64 }),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const homeSectionVersions = mysqlTable('home_section_versions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  sectionId: varchar('section_id', { length: 64 }).notNull(),
  version: int('version').notNull(),
  changeNote: varchar('change_note', { length: 255 }),
  snapshotJson: json('snapshot_json').$type<Record<string, unknown>>().notNull(),
  editedByUserId: varchar('edited_by_user_id', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const homeSectionTemplates = mysqlTable('home_section_templates', {
  id: varchar('id', { length: 64 }).primaryKey(),
  nameJson: json('name_json').$type<{ en: string; ar: string }>().notNull(),
  descriptionJson: json('description_json').$type<{ en: string; ar: string }>().notNull(),
  sectionType: varchar('section_type', { length: 40 }).notNull(),
  contentJson: json('content_json').$type<Record<string, unknown>>().notNull(),
  styleJson: json('style_json').$type<Record<string, unknown> | null>(),
  isSystem: boolean('is_system').notNull().default(false),
  createdByUserId: varchar('created_by_user_id', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const homePageSnapshots = mysqlTable('home_page_snapshots', {
  id: varchar('id', { length: 64 }).primaryKey(),
  version: int('version').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('published'),
  changeNote: varchar('change_note', { length: 255 }),
  sectionsSnapshotJson: json('sections_snapshot_json').$type<Array<Record<string, unknown>>>().notNull(),
  chromeSnapshotJson: json('chrome_snapshot_json').$type<Record<string, unknown>>().notNull(),
  scheduledPublishAt: timestamp('scheduled_publish_at'),
  publishedAt: timestamp('published_at'),
  createdByUserId: varchar('created_by_user_id', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const newsletterSubscribers = mysqlTable(
  'newsletter_subscribers',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    email: varchar('email', { length: 190 }).notNull(),
    locale: varchar('locale', { length: 5 }).notNull().default('en'),
    source: varchar('source', { length: 64 }).notNull().default('home'),
    status: varchar('status', { length: 24 }).notNull().default('subscribed'),
    unsubscribeToken: varchar('unsubscribe_token', { length: 96 }).notNull(),
    consentedAt: timestamp('consented_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_newsletter_email').on(t.email)]
);

export const pages = mysqlTable(
  'pages',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    slug: varchar('slug', { length: 120 }).notNull(),
    titleJson: json('title_json').$type<{ en: string; ar: string }>().notNull(),
    bodyJson: json('body_json').$type<{ en: string; ar: string }>().notNull(),
    published: boolean('published').notNull().default(true),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_pages_slug').on(t.slug)]
);

export const menus = mysqlTable('menus', {
  id: varchar('id', { length: 64 }).primaryKey(),
  location: varchar('location', { length: 32 }).notNull(),
  itemsJson: json('items_json').$type<Array<{ label: { en: string; ar: string }; url: string }>>().notNull(),
});

// 6. Customer Interactions, Messaging, Returns, Support, Audit, Settings & Jobs
export const reviews = mysqlTable('reviews', {
  id: varchar('id', { length: 64 }).primaryKey(),
  productId: varchar('product_id', { length: 64 }).notNull(),
  sellerId: varchar('seller_id', { length: 64 }).notNull(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  rating: int('rating').notNull(),
  comment: text('comment').notNull(),
  verifiedBuyer: boolean('verified_buyer').notNull().default(true),
  sellerReply: text('seller_reply'),
  moderationStatus: varchar('moderation_status', { length: 24 }).notNull().default('approved'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const wishlists = mysqlTable(
  'wishlists',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    productId: varchar('product_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_wishlist_user_prod').on(t.userId, t.productId)]
);

export const addresses = mysqlTable('addresses', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  label: varchar('label', { length: 80 }).notNull(),
  governorate: varchar('governorate', { length: 64 }).notNull(),
  district: varchar('district', { length: 64 }).notNull(),
  town: varchar('town', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 40 }).notNull(),
  notes: text('notes'),
  isDefault: boolean('is_default').notNull().default(false),
});

export const notifications = mysqlTable('notifications', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  titleJson: json('title_json').$type<{ en: string; ar: string }>().notNull(),
  bodyJson: json('body_json').$type<{ en: string; ar: string }>().notNull(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const emailTemplates = mysqlTable('email_templates', {
  key: varchar('key', { length: 64 }).primaryKey(),
  subjectJson: json('subject_json').$type<{ en: string; ar: string }>().notNull(),
  bodyJson: json('body_json').$type<{ en: string; ar: string }>().notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const emailLog = mysqlTable('email_log', {
  id: varchar('id', { length: 64 }).primaryKey(),
  recipientEmail: varchar('recipient_email', { length: 190 }).notNull(),
  templateKey: varchar('template_key', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const supportTickets = mysqlTable('support_tickets', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }),
  email: varchar('email', { length: 190 }).notNull(),
  subject: varchar('subject', { length: 190 }).notNull(),
  message: text('message').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('open'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const disputes = mysqlTable('disputes', {
  id: varchar('id', { length: 64 }).primaryKey(),
  subOrderId: varchar('sub_order_id', { length: 64 }).notNull(),
  openedByUserId: varchar('opened_by_user_id', { length: 64 }).notNull(),
  reason: text('reason').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('open'),
  resolutionNote: text('resolution_note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const returnsTable = mysqlTable('returns', {
  id: varchar('id', { length: 64 }).primaryKey(),
  subOrderId: varchar('sub_order_id', { length: 64 }).notNull(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  reason: text('reason').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('requested'),
  refundUsdCents: int('refund_usd_cents').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const auditLog = mysqlTable('audit_log', {
  id: varchar('id', { length: 64 }).primaryKey(),
  actorUserId: varchar('actor_user_id', { length: 64 }),
  action: varchar('action', { length: 80 }).notNull(),
  entityType: varchar('entity_type', { length: 64 }).notNull(),
  entityId: varchar('entity_id', { length: 64 }).notNull(),
  beforeJson: json('before_json'),
  afterJson: json('after_json'),
  ipAddress: varchar('ip_address', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  valueJson: json('value_json').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const translations = mysqlTable('translations', {
  key: varchar('key', { length: 120 }).primaryKey(),
  en: text('en').notNull(),
  ar: text('ar').notNull(),
});

export const deliveryZones = mysqlTable('delivery_zones', {
  governorateCode: varchar('governorate_code', { length: 64 }).primaryKey(),
  nameJson: json('name_json').$type<{ en: string; ar: string }>().notNull(),
  platformFeeUsdCents: int('platform_fee_usd_cents').notNull(),
  etaDays: varchar('eta_days', { length: 32 }).notNull(),
});

export const jobs = mysqlTable('jobs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  jobType: varchar('job_type', { length: 64 }).notNull(),
  payloadJson: json('payload_json').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('queued'),
  attempts: int('attempts').notNull().default(0),
  runAt: timestamp('run_at').notNull().defaultNow(),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const errorLog = mysqlTable('error_log', {
  id: varchar('id', { length: 64 }).primaryKey(),
  route: varchar('route', { length: 190 }).notNull(),
  message: text('message').notNull(),
  stack: text('stack'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const customerSegments = mysqlTable('customer_segments', {
  id: varchar('id', { length: 64 }).primaryKey(),
  nameJson: json('name_json').$type<{ en: string; ar: string }>().notNull(),
  description: varchar('description', { length: 400 }).notNull().default(''),
  rulesJson: json('rules_json').$type<Record<string, unknown>>().notNull(),
  cachedMemberCount: int('cached_member_count').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const emailCampaigns = mysqlTable('email_campaigns', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  subjectJson: json('subject_json').$type<{ en: string; ar: string }>().notNull(),
  previewTextJson: json('preview_text_json').$type<{ en: string; ar: string }>().notNull(),
  segmentId: varchar('segment_id', { length: 64 }),
  blocksJson: json('blocks_json').$type<Array<Record<string, unknown>>>().notNull(),
  status: varchar('status', { length: 24 }).notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at'),
  sentCount: int('sent_count').notNull().default(0),
  failedCount: int('failed_count').notNull().default(0),
  unsubscribedCount: int('unsubscribed_count').notNull().default(0),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const automationFlows = mysqlTable('automation_flows', {
  id: varchar('id', { length: 64 }).primaryKey(),
  nameJson: json('name_json').$type<{ en: string; ar: string }>().notNull(),
  triggerType: varchar('trigger_type', { length: 40 }).notNull(),
  delayHours: int('delay_hours').notNull().default(0),
  subjectJson: json('subject_json').$type<{ en: string; ar: string }>().notNull(),
  blocksJson: json('blocks_json').$type<Array<Record<string, unknown>>>().notNull(),
  attachCouponCode: varchar('attach_coupon_code', { length: 64 }),
  active: boolean('active').notNull().default(true),
  totalTriggered: int('total_triggered').notNull().default(0),
  totalSent: int('total_sent').notNull().default(0),
  lastRunAt: timestamp('last_run_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const automationExecutions = mysqlTable(
  'automation_executions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    flowId: varchar('flow_id', { length: 64 }).notNull(),
    dedupKey: varchar('dedup_key', { length: 160 }).notNull(),
    recipientEmail: varchar('recipient_email', { length: 190 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_automation_flow_dedup').on(t.flowId, t.dedupKey)]
);

