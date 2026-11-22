import crypto from 'node:crypto';
import type { DbClient } from '../db/client.ts';
import { mapLegacySectionType } from '../../src/shared/homeSections.ts';
import { processEmailJob, type EmailSendPayload } from './email.ts';
import { toSqlTimestamp, writeAuditLog } from './security.ts';

export async function enqueueJob(
  db: DbClient,
  jobType: string,
  payload: Record<string, unknown>,
  runAt = new Date()
): Promise<string> {
  const id = `job-${crypto.randomUUID()}`;
  await db.execute(
    'INSERT INTO jobs (id, job_type, payload_json, status, attempts, run_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    [id, jobType, JSON.stringify(payload), 'queued', toSqlTimestamp(runAt), toSqlTimestamp()]
  );
  return id;
}

export async function releaseEligibleEscrowHolds(db: DbClient): Promise<number> {
  const keyCol = db.driver === 'mysql' ? '`key`' : 'key';
  const platRow = await db.queryOne<{ value_json: string }>(
    `SELECT value_json FROM settings WHERE ${keyCol} = 'platform'`
  );
  const plat = platRow
    ? typeof platRow.value_json === 'string'
      ? JSON.parse(platRow.value_json)
      : platRow.value_json
    : { holdPeriodDays: 3 };
  const holdDays = Number(plat?.holdPeriodDays ?? 3);
  const cutoff = toSqlTimestamp(new Date(Date.now() - holdDays * 86_400_000));

  return db.transaction(async (tx) => {
    const eligibleSubs = await tx.query<{ id: string }>(
      "SELECT id FROM sub_orders WHERE status = 'delivered' AND delivered_at IS NOT NULL AND delivered_at <= ?",
      [cutoff]
    );
    let released = 0;
    for (const sub of eligibleSubs) {
      const res = await tx.execute(
        "UPDATE ledger_entries SET availability = 'available' WHERE sub_order_id = ? AND availability = 'pending'",
        [sub.id]
      );
      released += res.affectedRows;
    }
    return released;
  });
}

export async function publishDueHomePageSnapshots(db: DbClient): Promise<number> {
  const now = toSqlTimestamp();
  const due = await db.query<Record<string, unknown>>(
    "SELECT * FROM home_page_snapshots WHERE status = 'scheduled' AND scheduled_publish_at IS NOT NULL AND scheduled_publish_at <= ? ORDER BY scheduled_publish_at ASC",
    [now]
  );
  if (due.length === 0) return 0;

  const keyCol = db.driver === 'mysql' ? '`key`' : 'key';
  let publishedCount = 0;

  for (const snap of due) {
    await db.transaction(async (tx) => {
      const sectionsArr =
        typeof snap.sections_snapshot_json === 'string'
          ? (JSON.parse(snap.sections_snapshot_json) as Array<Record<string, unknown>>)
          : ((snap.sections_snapshot_json as Array<Record<string, unknown>>) || []);
      const chromeStr =
        typeof snap.chrome_snapshot_json === 'string'
          ? snap.chrome_snapshot_json
          : JSON.stringify(snap.chrome_snapshot_json || {});

      await tx.execute('DELETE FROM home_sections');
      for (let i = 0; i < sectionsArr.length; i++) {
        const sr = sectionsArr[i];
        const sid = String(sr.id || `hs-${crypto.randomUUID()}`);
        const statusVal = sr.status === 'archived' ? 'archived' : 'published';
        await tx.execute(
          `INSERT INTO home_sections (id, section_type, title_json, content_json, sort_order, status, visible, audience, targeting_json, style_json, schedule_priority, starts_at, ends_at, version, updated_by_user_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sid,
            mapLegacySectionType(String(sr.section_type || 'rich_block')),
            typeof sr.title_json === 'string' ? sr.title_json : JSON.stringify(sr.title_json || { en: '', ar: '' }),
            typeof sr.content_json === 'string' ? sr.content_json : JSON.stringify(sr.content_json || {}),
            Number(sr.sort_order ?? (i + 1) * 10),
            statusVal,
            sr.visible === undefined ? 1 : sr.visible ? 1 : 0,
            String(sr.audience || 'all'),
            sr.targeting_json ? (typeof sr.targeting_json === 'string' ? sr.targeting_json : JSON.stringify(sr.targeting_json)) : null,
            sr.style_json ? (typeof sr.style_json === 'string' ? sr.style_json : JSON.stringify(sr.style_json)) : null,
            Number(sr.schedule_priority ?? 0),
            sr.starts_at ? String(sr.starts_at) : null,
            sr.ends_at ? String(sr.ends_at) : null,
            Number(sr.version ?? 1),
            snap.created_by_user_id ? String(snap.created_by_user_id) : null,
            now,
          ]
        );
      }

      for (const settingKey of ['site_chrome_draft', 'site_chrome_published']) {
        await tx.execute(
          db.driver === 'mysql'
            ? `INSERT INTO settings (${keyCol}, value_json, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = VALUES(updated_at)`
            : `INSERT INTO settings (${keyCol}, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
          [settingKey, chromeStr, now]
        );
      }

      await tx.execute("UPDATE home_page_snapshots SET status = 'published', published_at = ? WHERE id = ?", [
        now,
        String(snap.id),
      ]);

      await writeAuditLog(tx, {
        actorUserId: snap.created_by_user_id ? String(snap.created_by_user_id) : null,
        action: 'cron.publish_scheduled_home',
        entityType: 'home_page',
        entityId: String(snap.id),
        after: { version: Number(snap.version), sectionCount: sectionsArr.length },
      });

      publishedCount++;
    });
  }

  return publishedCount;
}

export async function processPendingJobs(db: DbClient, limit = 20): Promise<{
  processed: number;
  failed: number;
  releasedHolds: number;
  cleanedSessions: number;
  publishedHomeSnapshots: number;
}> {
  const now = toSqlTimestamp();
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const queued = await db.query<{
    id: string;
    job_type: string;
    payload_json: string;
    attempts: number;
  }>(
    `SELECT id, job_type, payload_json, attempts FROM jobs WHERE status = 'queued' AND run_at <= ? ORDER BY created_at ASC LIMIT ${safeLimit}`,
    [now]
  );

  let processed = 0;
  let failed = 0;

  for (const job of queued) {
    try {
      const payload = typeof job.payload_json === 'string' ? JSON.parse(job.payload_json) : job.payload_json;
      if (job.job_type === 'send_email') {
        await processEmailJob(db, payload as EmailSendPayload);
      }
      await db.execute("UPDATE jobs SET status = 'completed', attempts = attempts + 1 WHERE id = ?", [job.id]);
      processed++;
    } catch (err) {
      failed++;
      const nextStatus = job.attempts + 1 >= 3 ? 'failed' : 'queued';
      await db.execute(
        'UPDATE jobs SET status = ?, attempts = attempts + 1, last_error = ? WHERE id = ?',
        [nextStatus, (err as Error).message.slice(0, 500), job.id]
      );
    }
  }

  const releasedHolds = await releaseEligibleEscrowHolds(db);
  const publishedHomeSnapshots = await publishDueHomePageSnapshots(db);
  const sessRes = await db.execute('DELETE FROM sessions WHERE expires_at <= ?', [now]);

  return {
    processed,
    failed,
    releasedHolds,
    cleanedSessions: sessRes.affectedRows,
    publishedHomeSnapshots,
  };
}

