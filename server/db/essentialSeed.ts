import crypto from 'node:crypto';
import type { DbClient } from './client.ts';
import { DEFAULT_DELIVERY_ZONES } from '../../src/shared/lebanon.ts';
import { HOME_SECTION_PRESETS } from '../../src/shared/homeSections.ts';

const ESSENTIAL_ROLES = [
  { key: 'customer', name: 'Customer', description: 'Shop, manage orders, addresses, wishlist, and verified reviews.' },
  { key: 'seller_owner', name: 'Seller Owner', description: 'Full control of merchant store, products, orders, and payouts.' },
  { key: 'seller_staff', name: 'Seller Staff', description: 'Delegated store operations based on assigned permissions.' },
  { key: 'admin_super', name: 'Super Admin', description: 'Unrestricted platform governance, finance, and staff management.' },
  { key: 'admin_staff', name: 'Admin Staff', description: 'Granular platform operations assigned by Super Admin.' },
];

const ESSENTIAL_PERMISSIONS = [
  { key: 'sellers.approve', description: 'Approve, reject, or request changes on seller applications' },
  { key: 'products.approve', description: 'Moderate and feature marketplace products' },
  { key: 'orders.manage', description: 'Manage orders, sub-orders, courier assignments, and refunds' },
  { key: 'payouts.release', description: 'Release escrow holds and settle seller payout requests' },
  { key: 'content.manage', description: 'Edit home sections, offer banners, menus, and static pages' },
  { key: 'settings.manage', description: 'Edit exchange rate, commissions, delivery zones, and SMTP/storage' },
  { key: 'users.manage', description: 'Create admin staff and assign granular permissions' },
  { key: 'seller.catalog', description: 'Create and edit store products and inventory' },
  { key: 'seller.orders', description: 'Fulfill seller sub-orders and collect COD' },
  { key: 'seller.finance', description: 'View ledger balances and request payouts' },
];

const ROLE_PERMISSION_MAP: Array<[string, string]> = [
  ['admin_super', 'sellers.approve'],
  ['admin_super', 'products.approve'],
  ['admin_super', 'orders.manage'],
  ['admin_super', 'payouts.release'],
  ['admin_super', 'content.manage'],
  ['admin_super', 'settings.manage'],
  ['admin_super', 'users.manage'],
  ['admin_staff', 'sellers.approve'],
  ['admin_staff', 'products.approve'],
  ['admin_staff', 'orders.manage'],
  ['admin_staff', 'content.manage'],
  ['seller_owner', 'seller.catalog'],
  ['seller_owner', 'seller.orders'],
  ['seller_owner', 'seller.finance'],
  ['seller_staff', 'seller.catalog'],
  ['seller_staff', 'seller.orders'],
];

const ESSENTIAL_CATEGORIES = [
  { id: 'cat-fashion', slug: 'fashion', department: 'fashion', name: { en: 'Fashion', ar: 'الأزياء' }, commissionBps: 1200, sort: 1 },
  { id: 'cat-electronics', slug: 'electronics', department: 'electronics', name: { en: 'Electronics', ar: 'الإلكترونيات' }, commissionBps: 800, sort: 2 },
  { id: 'cat-mobiles', slug: 'mobiles', department: 'electronics', name: { en: 'Mobiles & Accessories', ar: 'الهواتف وملحقاتها' }, commissionBps: 700, sort: 3 },
  { id: 'cat-home', slug: 'home-gadgets', department: 'home-gadgets', name: { en: 'Home Gadgets', ar: 'أدوات المنزل' }, commissionBps: null, sort: 4 },
];

const ESSENTIAL_PLANS = [
  {
    tier: 'free',
    name: { en: 'Free', ar: 'مجاني' },
    monthlyFeeUsdCents: 0,
    productLimit: 15,
    commissionDiscountBps: 0,
    features: [
      { en: 'Up to 15 active products', ar: 'حتى 15 منتجاً نشطاً' },
      { en: 'Platform courier delivery', ar: 'توصيل عبر المنصة' },
    ],
  },
  {
    tier: 'basic',
    name: { en: 'Basic', ar: 'أساسي' },
    monthlyFeeUsdCents: 2900,
    productLimit: 100,
    commissionDiscountBps: 50,
    features: [
      { en: 'Up to 100 active products', ar: 'حتى 100 منتج نشط' },
      { en: 'Self-delivery zone rates', ar: 'تسعير توصيل خاص بالمتجر' },
      { en: 'Store coupons & offers', ar: 'قسائم وعروض المتجر' },
    ],
  },
  {
    tier: 'pro',
    name: { en: 'Pro', ar: 'احترافي' },
    monthlyFeeUsdCents: 7900,
    productLimit: null,
    commissionDiscountBps: 150,
    features: [
      { en: 'Unlimited active products', ar: 'منتجات غير محدودة' },
      { en: 'Bulk CSV import & export', ar: 'استيراد وتصدير CSV' },
      { en: 'Priority support & payouts', ar: 'أولوية الدعم وتحويل الأرباح' },
    ],
  },
];

const ESSENTIAL_EMAIL_TEMPLATES = [
  {
    key: 'welcome',
    subject: { en: 'Welcome to NileLink Lebanon', ar: 'مرحباً بك في نايل لينك لبنان' },
    body: { en: 'Hello {{name}}, your NileLink account is active.', ar: 'مرحباً {{name}}، تم تفعيل حسابك في نايل لينك.' },
  },
  {
    key: 'verify_email',
    subject: { en: 'Verify your NileLink email', ar: 'تأكيد بريدك الإلكتروني في نايل لينك' },
    body: { en: 'Use verification code {{code}} or link {{link}}.', ar: 'استخدم رمز التحقق {{code}} أو الرابط {{link}}.' },
  },
  {
    key: 'order_placed',
    subject: { en: 'Order {{orderNumber}} received', ar: 'تم استلام طلبك {{orderNumber}}' },
    body: { en: 'Your order {{orderNumber}} totaling {{total}} is confirmed.', ar: 'تم تأكيد طلبك {{orderNumber}} بقيمة {{total}}.' },
  },
  {
    key: 'seller_approved',
    subject: { en: 'Your NileLink storefront is approved', ar: 'تمت الموافقة على متجرك في نايل لينك' },
    body: { en: 'Your store {{storeName}} is now live on NileLink.', ar: 'متجرك {{storeName}} أصبح متاحاً الآن على نايل لينك.' },
  },
  {
    key: 'payout_paid',
    subject: { en: 'Payout settled — {{amount}}', ar: 'تم تحويل أرباحك — {{amount}}' },
    body: { en: 'Transfer reference: {{reference}}.', ar: 'رقم مرجع التحويل: {{reference}}.' },
  },
];

const ESSENTIAL_PAGES = [
  {
    id: 'page-terms',
    slug: 'terms',
    title: { en: 'Terms of Service', ar: 'شروط الاستخدام' },
    body: {
      en: 'Draft Terms of Service. Edit and publish from Admin Console → Pages before launch.',
      ar: 'مسودة شروط الاستخدام. يُرجى المراجعة والنشر من لوحة الإدارة قبل الإطلاق.',
    },
  },
  {
    id: 'page-privacy',
    slug: 'privacy',
    title: { en: 'Privacy Policy', ar: 'سياسة الخصوصية' },
    body: {
      en: 'Draft Privacy Policy. Edit and publish from Admin Console → Pages before launch.',
      ar: 'مسودة سياسة الخصوصية. يُرجى المراجعة والنشر من لوحة الإدارة قبل الإطلاق.',
    },
  },
  {
    id: 'page-returns',
    slug: 'returns',
    title: { en: 'Return & Refund Policy', ar: 'سياسة الإرجاع والاسترداد' },
    body: {
      en: 'Draft Return Policy. Edit and publish from Admin Console → Pages before launch.',
      ar: 'مسودة سياسة الإرجاع. يُرجى المراجعة والنشر من لوحة الإدارة قبل الإطلاق.',
    },
  },
  {
    id: 'page-seller-agreement',
    slug: 'seller-agreement',
    title: { en: 'Seller Agreement', ar: 'اتفاقية البائع' },
    body: {
      en: 'Draft Seller Agreement covering commission locking, delivery SLAs, and payout holds.',
      ar: 'مسودة اتفاقية البائع المتعلقة بالعمولات والتوصيل وفترة حجز الأرباح.',
    },
  },
];

async function ensureDefaultHomeSections(db: DbClient): Promise<void> {
  const countRow = await db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM home_sections');
  if (countRow && Number(countRow.cnt) > 0) return;

  const starterTypes = [
    'hero_split',
    'trust_strip',
    'departments_bento',
    'dynamic_products_grid',
    'verified_stores_grid',
  ] as const;

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  for (let i = 0; i < starterTypes.length; i++) {
    const preset = HOME_SECTION_PRESETS.find((p) => p.type === starterTypes[i]);
    if (!preset) continue;
    const id = `hs-${starterTypes[i]}`;
    const verId = `hsv-${crypto.randomUUID()}`;
    const snapshot = {
      sectionType: preset.type,
      title: preset.defaultTitle,
      content: preset.defaultContent,
      status: 'published',
      audience: 'all',
      startsAt: null,
      endsAt: null,
    };

    await db.execute(
      `INSERT INTO home_sections (id, section_type, title_json, content_json, sort_order, status, audience, starts_at, ends_at, version, updated_at)
       VALUES (?, ?, ?, ?, ?, 'published', 'all', NULL, NULL, 1, ?)`,
      [id, preset.type, JSON.stringify(preset.defaultTitle), JSON.stringify(preset.defaultContent), (i + 1) * 10, now]
    );
    await db.execute(
      `INSERT INTO home_section_versions (id, section_id, version, snapshot_json, edited_by_user_id, created_at)
       VALUES (?, ?, 1, ?, NULL, ?)`,
      [verId, id, JSON.stringify(snapshot), now]
    );
  }
}

export async function ensureEssentialSeed(db: DbClient): Promise<{ firstRunSetupToken: string | null }> {
  // 1. Roles & Permissions
  for (const r of ESSENTIAL_ROLES) {
    await db.execute(
      `INSERT INTO roles (\`key\`, name, description) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`.replace(
        'ON CONFLICT DO NOTHING',
        db.driver === 'mysql' ? 'ON DUPLICATE KEY UPDATE name = VALUES(name)' : 'ON CONFLICT(key) DO NOTHING'
      ),
      [r.key, r.name, r.description]
    );
  }
  for (const p of ESSENTIAL_PERMISSIONS) {
    await db.execute(
      db.driver === 'mysql'
        ? 'INSERT INTO permissions (`key`, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = VALUES(description)'
        : 'INSERT OR IGNORE INTO permissions (key, description) VALUES (?, ?)',
      [p.key, p.description]
    );
  }
  for (const [roleKey, permKey] of ROLE_PERMISSION_MAP) {
    const id = `rp-${roleKey}-${permKey}`;
    await db.execute(
      db.driver === 'mysql'
        ? 'INSERT IGNORE INTO role_permissions (id, role_key, permission_key) VALUES (?, ?, ?)'
        : 'INSERT OR IGNORE INTO role_permissions (id, role_key, permission_key) VALUES (?, ?, ?)',
      [id, roleKey, permKey]
    );
  }

  // 2. Delivery Zones (All 8 Lebanese Governorates)
  for (const z of DEFAULT_DELIVERY_ZONES) {
    await db.execute(
      db.driver === 'mysql'
        ? 'INSERT IGNORE INTO delivery_zones (governorate_code, name_json, platform_fee_usd_cents, eta_days) VALUES (?, ?, ?, ?)'
        : 'INSERT OR IGNORE INTO delivery_zones (governorate_code, name_json, platform_fee_usd_cents, eta_days) VALUES (?, ?, ?, ?)',
      [z.governorateCode, JSON.stringify(z.name), z.platformFeeUsdCents, z.etaDays]
    );
  }

  // 3. Default Categories
  const catCount = await db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM categories');
  if (!catCount || Number(catCount.cnt) === 0) {
    for (const c of ESSENTIAL_CATEGORIES) {
      await db.execute(
        'INSERT INTO categories (id, parent_id, slug, department, name_json, commission_bps, sort_order, active) VALUES (?, NULL, ?, ?, ?, ?, ?, 1)',
        [c.id, c.slug, c.department, JSON.stringify(c.name), c.commissionBps, c.sort]
      );
    }
  }

  // 4. Default Subscription Plans
  for (const pl of ESSENTIAL_PLANS) {
    await db.execute(
      db.driver === 'mysql'
        ? 'INSERT IGNORE INTO subscription_plans (tier, name_json, monthly_fee_usd_cents, product_limit, commission_discount_bps, features_json) VALUES (?, ?, ?, ?, ?, ?)'
        : 'INSERT OR IGNORE INTO subscription_plans (tier, name_json, monthly_fee_usd_cents, product_limit, commission_discount_bps, features_json) VALUES (?, ?, ?, ?, ?, ?)',
      [pl.tier, JSON.stringify(pl.name), pl.monthlyFeeUsdCents, pl.productLimit, pl.commissionDiscountBps, JSON.stringify(pl.features)]
    );
  }

  // 5. Default Email Templates & Legal Draft Pages
  for (const tpl of ESSENTIAL_EMAIL_TEMPLATES) {
    await db.execute(
      db.driver === 'mysql'
        ? 'INSERT IGNORE INTO email_templates (`key`, subject_json, body_json) VALUES (?, ?, ?)'
        : 'INSERT OR IGNORE INTO email_templates (key, subject_json, body_json) VALUES (?, ?, ?)',
      [tpl.key, JSON.stringify(tpl.subject), JSON.stringify(tpl.body)]
    );
  }
  for (const pg of ESSENTIAL_PAGES) {
    await db.execute(
      db.driver === 'mysql'
        ? 'INSERT IGNORE INTO pages (id, slug, title_json, body_json, published) VALUES (?, ?, ?, ?, 1)'
        : 'INSERT OR IGNORE INTO pages (id, slug, title_json, body_json, published) VALUES (?, ?, ?, ?, 1)',
      [pg.id, pg.slug, JSON.stringify(pg.title), JSON.stringify(pg.body)]
    );
  }

  // 6. Platform Settings (no demo announcement, clean production defaults)
  const defaultSettings: Record<string, unknown> = {
    platform: {
      siteName: 'NileLink',
      exchangeRateLbpPerUsd: 89500,
      defaultCommissionBps: 1000,
      codFeeUsdCents: 150,
      holdPeriodDays: 3,
      maintenanceMode: false,
      announcement: { en: '', ar: '' },
    },
    payments: {
      codEnabled: true,
      whishManualEnabled: true,
      whishInstructions: {
        en: 'Configure your live Whish / OMT receiving number in Admin Console → Settings before enabling.',
        ar: 'قم بتعيين رقم استلام Whish / OMT في لوحة الإدارة → الإعدادات قبل التفعيل.',
      },
      whishAccountNumber: '',
      cardEnabled: false,
    },
  };

  for (const [key, val] of Object.entries(defaultSettings)) {
    await db.execute(
      db.driver === 'mysql'
        ? 'INSERT IGNORE INTO settings (`key`, value_json) VALUES (?, ?)'
        : 'INSERT OR IGNORE INTO settings (key, value_json) VALUES (?, ?)',
      [key, JSON.stringify(val)]
    );
  }

  // 7. Structural Default Home Sections (configurable in Admin Console Home Builder; zero fake products/banners)
  await ensureDefaultHomeSections(db);

  // 8. One-Time Admin Setup Token (server-log only, expires on first use)
  const adminRow = await db.queryOne<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM users WHERE role_key = 'admin_super' AND deleted_at IS NULL"
  );
  if (!adminRow || Number(adminRow.cnt) === 0) {
    const existingToken = await db.queryOne<{ value_json: string }>(
      "SELECT value_json FROM settings WHERE " + (db.driver === 'mysql' ? '`key`' : 'key') + " = 'admin_setup_token_hash'"
    );
    if (!existingToken) {
      const rawToken = crypto.randomBytes(24).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await db.execute(
        db.driver === 'mysql'
          ? 'INSERT INTO settings (`key`, value_json) VALUES (?, ?)'
          : 'INSERT INTO settings (key, value_json) VALUES (?, ?)',
        ['admin_setup_token_hash', JSON.stringify({ hash: tokenHash, createdAt: new Date().toISOString() })]
      );
      console.log('====================================================================');
      console.log('[NILELINK FIRST-RUN SETUP] No super admin exists yet.');
      console.log(`[NILELINK FIRST-RUN SETUP] One-time Admin Setup Token: ${rawToken}`);
      console.log('[NILELINK FIRST-RUN SETUP] Open /admin to complete initial setup.');
      console.log('====================================================================');
      return { firstRunSetupToken: rawToken };
    }
  }

  return { firstRunSetupToken: null };
}
