import crypto from 'node:crypto';
import type { DbClient } from './client.ts';
import { DEFAULT_DELIVERY_ZONES } from '../../src/shared/lebanon.ts';
import {
  DEFAULT_SITE_CHROME,
  HOME_SECTION_PRESETS,
  STARTER_TEMPLATES,
  migrateLegacySectionPayload,
  normalizeTargeting,
} from '../../src/shared/homeSections.ts';
import type { HomeMigrationReport } from '../../src/shared/types.ts';

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
  { key: 'home.edit', description: 'Edit draft home sections, chrome, and templates' },
  { key: 'home.publish', description: 'Publish home page snapshots and rollback versions' },
  { key: 'marketing.manage', description: 'Create and edit banners, popups, featured placements, offers, coupons, and campaigns' },
  { key: 'marketing.view', description: 'View marketing analytics and campaign reports' },
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
  ['admin_super', 'home.edit'],
  ['admin_super', 'home.publish'],
  ['admin_super', 'marketing.manage'],
  ['admin_super', 'marketing.view'],
  ['admin_super', 'settings.manage'],
  ['admin_super', 'users.manage'],
  ['admin_staff', 'sellers.approve'],
  ['admin_staff', 'products.approve'],
  ['admin_staff', 'orders.manage'],
  ['admin_staff', 'content.manage'],
  ['admin_staff', 'home.edit'],
  ['admin_staff', 'marketing.manage'],
  ['admin_staff', 'marketing.view'],
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
  {
    key: 'password_reset',
    subject: { en: 'Reset your NileLink password', ar: 'إعادة تعيين كلمة مرور نايل لينك' },
    body: {
      en: 'Hello {{name}}, use password reset token {{token}} or open {{link}} within 60 minutes.',
      ar: 'مرحباً {{name}}، استخدم رمز إعادة تعيين كلمة المرور {{token}} أو افتح الرابط {{link}} خلال 60 دقيقة.',
    },
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

async function migrateLegacyHomeSections(db: DbClient): Promise<void> {
  const rows = await db.query<{
    id: string;
    section_type: string;
    title_json: string | Record<string, unknown>;
    content_json: string | Record<string, unknown>;
    status: string;
    audience: string;
    targeting_json: string | null;
  }>('SELECT id, section_type, title_json, content_json, status, audience, targeting_json FROM home_sections');

  if (rows.length === 0) return;

  const migratedSections: HomeMigrationReport['migratedSections'] = [];
  let alreadyUpToDateCount = 0;

  for (const row of rows) {
    const rawContent =
      typeof row.content_json === 'string'
        ? (JSON.parse(row.content_json) as Record<string, unknown>)
        : ((row.content_json || {}) as Record<string, unknown>);
    const rawTitle =
      typeof row.title_json === 'string'
        ? (JSON.parse(row.title_json) as { en?: string; ar?: string })
        : ((row.title_json || {}) as { en?: string; ar?: string });

    const { toType, content, changed } = migrateLegacySectionPayload(row.section_type, rawContent);
    const targeting = normalizeTargeting(
      row.targeting_json ? (typeof row.targeting_json === 'string' ? JSON.parse(row.targeting_json) : row.targeting_json) : null,
      row.audience
    );

    if (changed || !row.targeting_json) {
      await db.execute(
        'UPDATE home_sections SET section_type = ?, content_json = ?, targeting_json = ? WHERE id = ?',
        [toType, JSON.stringify(content), JSON.stringify(targeting), row.id]
      );
    }

    if (changed) {
      migratedSections.push({
        id: row.id,
        fromType: row.section_type,
        toType,
        titleEn: rawTitle.en || row.id,
        status: row.status,
      });
    } else {
      alreadyUpToDateCount++;
    }
  }

  let migratedVersionsCount = 0;
  const versionRows = await db.query<{ id: string; snapshot_json: string | Record<string, unknown> }>(
    'SELECT id, snapshot_json FROM home_section_versions'
  );
  for (const vr of versionRows) {
    const snap =
      typeof vr.snapshot_json === 'string'
        ? (JSON.parse(vr.snapshot_json) as Record<string, unknown>)
        : ((vr.snapshot_json || {}) as Record<string, unknown>);
    const rawType = String(snap.sectionType || '');
    const rawContent = (snap.content || {}) as Record<string, unknown>;
    const { toType, content, changed } = migrateLegacySectionPayload(rawType, rawContent);
    if (changed) {
      const nextSnap = { ...snap, sectionType: toType, content };
      await db.execute('UPDATE home_section_versions SET snapshot_json = ? WHERE id = ?', [
        JSON.stringify(nextSnap),
        vr.id,
      ]);
      migratedVersionsCount++;
    }
  }

  if (migratedSections.length > 0 || migratedVersionsCount > 0) {
    const report: HomeMigrationReport = {
      ranAt: new Date().toISOString(),
      migratedSections,
      migratedVersionsCount,
      alreadyUpToDateCount,
    };
    const keyCol = db.driver === 'mysql' ? '`key`' : 'key';
    await db.execute(
      db.driver === 'mysql'
        ? `INSERT INTO settings (${keyCol}, value_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)`
        : `INSERT INTO settings (${keyCol}, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
      ['home_migration_report', JSON.stringify(report)]
    );
    console.log(
      `[NILELINK HOME MIGRATION] Migrated ${migratedSections.length} home sections and ${migratedVersionsCount} version snapshots from 15->18 practical blocks.`
    );
  }
}

async function ensureDefaultHomeSections(db: DbClient): Promise<void> {
  await migrateLegacyHomeSections(db);

  const countRow = await db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM home_sections');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (!countRow || Number(countRow.cnt) === 0) {
    const starterTypes = ['hero', 'trust_cells', 'category_tiles', 'product_grid', 'featured_stores'] as const;

    for (let i = 0; i < starterTypes.length; i++) {
      const preset = HOME_SECTION_PRESETS.find((p) => p.type === starterTypes[i]);
      if (!preset) continue;
      const id = `hs-${starterTypes[i]}`;
      const verId = `hsv-${crypto.randomUUID()}`;
      const targeting = normalizeTargeting(null, 'all');
      const style = { surface: 'graphite', padding: 'standard' };
      const snapshot = {
        sectionType: preset.type,
        title: preset.defaultTitle,
        content: preset.defaultContent,
        status: 'published',
        visible: true,
        audience: 'all',
        targeting,
        style,
        startsAt: null,
        endsAt: null,
      };

      await db.execute(
        `INSERT INTO home_sections (id, section_type, title_json, content_json, sort_order, status, visible, audience, targeting_json, style_json, schedule_priority, starts_at, ends_at, version, updated_at)
         VALUES (?, ?, ?, ?, ?, 'published', 1, 'all', ?, ?, 0, NULL, NULL, 1, ?)`,
        [
          id,
          preset.type,
          JSON.stringify(preset.defaultTitle),
          JSON.stringify(preset.defaultContent),
          (i + 1) * 10,
          JSON.stringify(targeting),
          JSON.stringify(style),
          now,
        ]
      );
      await db.execute(
        `INSERT INTO home_section_versions (id, section_id, version, change_note, snapshot_json, edited_by_user_id, created_at)
         VALUES (?, ?, 1, 'Initial default section', ?, NULL, ?)`,
        [verId, id, JSON.stringify(snapshot), now]
      );
    }
  }

  // Seed system starter templates if none exist
  const tplCount = await db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM home_section_templates');
  if (!tplCount || Number(tplCount.cnt) === 0) {
    for (const tmpl of STARTER_TEMPLATES) {
      await db.execute(
        `INSERT INTO home_section_templates (id, name_json, description_json, section_type, content_json, style_json, is_system, created_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?)`,
        [
          tmpl.id,
          JSON.stringify(tmpl.name),
          JSON.stringify(tmpl.description),
          tmpl.sectionType,
          JSON.stringify(tmpl.content),
          JSON.stringify({ surface: 'graphite', padding: 'standard' }),
          now,
        ]
      );
    }
  }

  // Seed initial page-level published snapshot if none exists
  const snapCount = await db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM home_page_snapshots');
  if (!snapCount || Number(snapCount.cnt) === 0) {
    const allSecs = await db.query<Record<string, unknown>>('SELECT * FROM home_sections ORDER BY sort_order ASC');
    await db.execute(
      `INSERT INTO home_page_snapshots (id, version, status, change_note, sections_snapshot_json, chrome_snapshot_json, published_at, created_by_user_id, created_at)
       VALUES (?, 1, 'published', 'Initial page snapshot', ?, ?, ?, NULL, ?)`,
      [
        `hps-${crypto.randomUUID()}`,
        JSON.stringify(allSecs),
        JSON.stringify(DEFAULT_SITE_CHROME),
        now,
        now,
      ]
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

  const menuCount = await db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM menus');
  if (!menuCount || Number(menuCount.cnt) === 0) {
    await db.execute('INSERT INTO menus (id, location, items_json) VALUES (?, ?, ?)', [
      'menu-header',
      'header',
      JSON.stringify(DEFAULT_SITE_CHROME.headerLinks.map((l) => ({ label: l.label, url: l.url }))),
    ]);
    await db.execute('INSERT INTO menus (id, location, items_json) VALUES (?, ?, ?)', [
      'menu-footer',
      'footer',
      JSON.stringify(DEFAULT_SITE_CHROME.footerColumns.flatMap((c) => c.links)),
    ]);
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
    site_chrome_draft: DEFAULT_SITE_CHROME,
    site_chrome_published: DEFAULT_SITE_CHROME,
    home_migration_report: {
      ranAt: new Date().toISOString(),
      migratedSections: [],
      migratedVersionsCount: 0,
      alreadyUpToDateCount: 0,
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
