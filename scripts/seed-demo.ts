import 'dotenv/config';
import crypto from 'node:crypto';
import { getDb } from '../server/db/client.ts';
import { ensureEssentialSeed } from '../server/db/essentialSeed.ts';
import { hashPassword, toSqlTimestamp } from '../server/services/security.ts';

/**
 * Developer-only seed script.
 * Never imported by server.ts or bundled into production builds.
 * Runs ONLY when DEMO_MODE=true and NODE_ENV !== 'production'.
 */
async function runDemoSeed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[REFUSED] DEMO_MODE seed cannot run when NODE_ENV=production.');
    process.exit(1);
  }
  if (process.env.DEMO_MODE !== 'true') {
    console.error('[REFUSED] Set DEMO_MODE=true to execute the developer sample seed script.');
    process.exit(1);
  }

  const db = await getDb();
  await ensureEssentialSeed(db);

  const now = toSqlTimestamp();
  const devPass = hashPassword('NileLinkDev123');

  const demoSellerUserId = `usr-dev-seller-1`;
  const demoSellerId = `sel-dev-1`;
  const demoStoreId = `str-dev-1`;

  const existing = await db.queryOne<{ id: string }>('SELECT id FROM sellers WHERE id = ?', [demoSellerId]);
  if (existing) {
    console.log('[DEMO_MODE] Sample developer merchant already present.');
    await db.close();
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(
      `INSERT INTO users (id, name, email, phone, password_hash, role_key, email_verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'seller_owner', ?, ?, ?)`,
      [demoSellerUserId, 'Dev Merchant', 'merchant@example.local', '+96170000001', devPass, now, now, now]
    );
    await tx.execute(
      `INSERT INTO sellers (id, owner_user_id, business_type, legal_name, commercial_reg_ref, governorate, district, city_address, phone, whatsapp_phone, status, verified, payout_method, payout_account, onboarding_step, created_at, updated_at)
       VALUES (?, ?, 'business', 'Dev Atelier', 'DEV-CR-001', 'beirut', 'achrafieh', 'Gemmayze', '+96170000001', '96170000001', 'approved', 1, 'whish', '70000001', 9, ?, ?)`,
      [demoSellerId, demoSellerUserId, now, now]
    );
    await tx.execute(
      `INSERT INTO stores (id, seller_id, slug, name_json, tagline_json, about_json, department_slug, theme_id, created_at, updated_at)
       VALUES (?, ?, 'dev-atelier', ?, ?, ?, 'fashion', 'sand-atelier', ?, ?)`,
      [
        demoStoreId,
        demoSellerId,
        JSON.stringify({ en: 'Dev Atelier', ar: 'اتيليه تجريبي' }),
        JSON.stringify({ en: 'Sample developer storefront', ar: 'متجر تجريبي للمطورين' }),
        JSON.stringify({ en: 'Created by scripts/seed-demo.ts', ar: 'تم إنشاؤه عبر سكربت التطوير' }),
        now,
        now,
      ]
    );
    await tx.execute(
      `INSERT INTO store_settings (store_id, delivery_mode, self_delivery_fees_json, processing_hours, vacation_mode)
       VALUES (?, 'platform', '{}', 24, 0)`,
      [demoStoreId]
    );
    await tx.execute(
      `INSERT INTO subscriptions (id, seller_id, plan_tier, status, next_due_at, created_at)
       VALUES (?, ?, 'free', 'active', ?, ?)`,
      [`subp-${crypto.randomUUID()}`, demoSellerId, now, now]
    );
  });

  console.log('[DEMO_MODE] Developer test merchant created (merchant@example.local / NileLinkDev123).');
  await db.close();
}

runDemoSeed().catch((err) => {
  console.error(err);
  process.exit(1);
});
