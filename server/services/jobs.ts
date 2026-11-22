import crypto from 'node:crypto';
import type { DbClient } from '../db/client.ts';
import { processEmailJob, type EmailSendPayload } from './email.ts';
import { toSqlTimestamp } from './security.ts';

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

export async function processPendingJobs(db: DbClient, limit = 20): Promise<{
  processed: number;
  failed: number;
  releasedHolds: number;
  cleanedSessions: number;
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
  const sessRes = await db.execute('DELETE FROM sessions WHERE expires_at <= ?', [now]);

  return {
    processed,
    failed,
    releasedHolds,
    cleanedSessions: sessRes.affectedRows,
  };
}
