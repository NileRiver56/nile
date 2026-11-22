import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, getPersistentStorageDir } from '../server/db/client.ts';

const TABLES = [
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'user_permissions',
  'sellers',
  'stores',
  'store_settings',
  'seller_documents',
  'categories',
  'attributes',
  'brands',
  'products',
  'product_variants',
  'media',
  'stock_movements',
  'orders',
  'sub_orders',
  'order_items',
  'payments',
  'ledger_entries',
  'payouts',
  'commissions_log',
  'subscription_plans',
  'subscriptions',
  'coupons',
  'offers',
  'banners',
  'home_sections',
  'home_section_versions',
  'pages',
  'menus',
  'reviews',
  'wishlists',
  'addresses',
  'notifications',
  'email_templates',
  'email_log',
  'support_tickets',
  'disputes',
  'returns',
  'audit_log',
  'settings',
  'translations',
  'delivery_zones',
];

async function runBackup() {
  const db = await getDb();
  const backupDir = path.join(getPersistentStorageDir(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const dump: Record<string, unknown[]> = {};
  for (const tbl of TABLES) {
    dump[tbl] = await db.query(`SELECT * FROM ${tbl}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(backupDir, `nilelink-backup-${stamp}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify({ exportedAt: new Date().toISOString(), driver: db.driver, tables: dump }, null, 2)
  );
  console.log(`[BACKUP] Wrote database snapshot to ${outFile}`);
  await db.close();
}

runBackup().catch((err) => {
  console.error('[BACKUP FAILED]', err);
  process.exit(1);
});
