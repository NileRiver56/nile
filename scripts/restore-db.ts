import 'dotenv/config';
import fs from 'node:fs';
import { getDb } from '../server/db/client.ts';

async function runRestore() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: npx tsx scripts/restore-db.ts <path-to-backup.json>');
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
    tables: Record<string, Record<string, unknown>[]>;
  };
  const db = await getDb();

  await db.transaction(async (tx) => {
    for (const [table, rows] of Object.entries(payload.tables || {})) {
      if (!/^[a-z_]+$/.test(table)) continue;
      if (!Array.isArray(rows) || rows.length === 0) continue;
      await tx.execute(`DELETE FROM ${table}`);
      for (const row of rows) {
        const cols = Object.keys(row);
        const colSql = cols.map((c) => (c === 'key' && db.driver === 'mysql' ? '`key`' : c)).join(', ');
        const placeholders = cols.map(() => '?').join(', ');
        const vals = cols.map((c) => row[c]);
        await tx.execute(`INSERT INTO ${table} (${colSql}) VALUES (${placeholders})`, vals);
      }
    }
  });

  console.log(`[RESTORE] Restored backup from ${filePath}`);
  await db.close();
}

runRestore().catch((err) => {
  console.error('[RESTORE FAILED]', err);
  process.exit(1);
});
