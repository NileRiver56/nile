import crypto from 'node:crypto';
import type { DbClient } from '../db/client.ts';
import { mapLegacySectionType } from '../../src/shared/homeSections.ts';
import type { EmailBlock, LocalizedText } from '../../src/shared/types.ts';
import {
  processEmailJob,
  processMarketingEmailJob,
  type EmailSendPayload,
  type MarketingEmailJobPayload,
} from './email.ts';
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

export async function syncFlashSalesAndCampaigns(db: DbClient): Promise<{
  activatedFlashSales: number;
  endedFlashSales: number;
  syncedCampaigns: number;
}> {
  const now = toSqlTimestamp();
  const actRes = await db.execute(
    "UPDATE flash_sales SET status = 'active' WHERE status = 'scheduled' AND starts_at <= ? AND ends_at > ?",
    [now, now]
  );

  const expiredFlash = await db.query<{ id: string; slug: string }>(
    "SELECT id, slug FROM flash_sales WHERE status IN ('scheduled', 'active') AND ends_at <= ? AND auto_revert = 1",
    [now]
  );
  let endedFlashSales = 0;
  for (const fsRow of expiredFlash) {
    const res = await db.execute("UPDATE flash_sales SET status = 'ended' WHERE id = ?", [fsRow.id]);
    if (res.affectedRows > 0) {
      endedFlashSales += res.affectedRows;
      await writeAuditLog(db, {
        actorUserId: null,
        action: 'cron.flash_sale_reverted',
        entityType: 'flash_sale',
        entityId: fsRow.id,
        after: { slug: fsRow.slug, status: 'ended', revertedAt: now },
      });
    }
  }

  const c1 = await db.execute(
    "UPDATE campaigns SET status = 'active' WHERE status = 'scheduled' AND starts_at IS NOT NULL AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)",
    [now, now]
  );
  const c2 = await db.execute(
    "UPDATE campaigns SET status = 'ended' WHERE status IN ('scheduled', 'active') AND ends_at IS NOT NULL AND ends_at <= ?",
    [now]
  );

  return {
    activatedFlashSales: actRes.affectedRows,
    endedFlashSales,
    syncedCampaigns: c1.affectedRows + c2.affectedRows,
  };
}

export async function dispatchDueEmailCampaignsAndFlows(db: DbClient): Promise<{
  campaignsDispatched: number;
  automationJobsQueued: number;
}> {
  const now = toSqlTimestamp();
  let campaignsDispatched = 0;
  let automationJobsQueued = 0;

  // 1. Evaluate due scheduled email_campaigns -> mark 'queued' & enqueue jobs for recipients
  const dueCampaigns = await db.query<Record<string, unknown>>(
    "SELECT * FROM email_campaigns WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?",
    [now]
  );
  if (dueCampaigns.length > 0) {
    const { MarketplaceRepo } = await import('../db/marketplaceRepo.ts');
    const repo = new MarketplaceRepo(db);
    for (const cmp of dueCampaigns) {
      const queuedCount = await repo.enqueueEmailCampaignRecipients(String(cmp.id));
      if (queuedCount >= 0) campaignsDispatched++;
    }
  }

  // 2. Evaluate active automation_flows (abandoned_cart, post_purchase, winback_30d)
  const activeFlows = await db.query<Record<string, unknown>>(
    'SELECT * FROM automation_flows WHERE active = 1'
  );
  for (const flow of activeFlows) {
    const flowId = String(flow.id);
    const triggerType = String(flow.trigger_type);
    const delayHours = Math.max(0, Number(flow.delay_hours ?? 0));
    const cutoffSql = toSqlTimestamp(new Date(Date.now() - delayHours * 3_600_000));
    const subjectJson: LocalizedText =
      typeof flow.subject_json === 'string' ? JSON.parse(flow.subject_json) : (flow.subject_json as LocalizedText);
    const blocks: EmailBlock[] =
      typeof flow.blocks_json === 'string' ? JSON.parse(flow.blocks_json) : (flow.blocks_json as EmailBlock[]);
    const attachCouponCode = flow.attach_coupon_code ? String(flow.attach_coupon_code) : null;

    const recordAndEnqueue = async (dedupKey: string, email: string, locale: 'en' | 'ar', unsubToken?: string | null) => {
      const existing = await db.queryOne<{ id: string }>(
        'SELECT id FROM automation_executions WHERE flow_id = ? AND dedup_key = ?',
        [flowId, dedupKey]
      );
      if (existing) return;
      await db.execute(
        'INSERT INTO automation_executions (id, flow_id, dedup_key, recipient_email, created_at) VALUES (?, ?, ?, ?, ?)',
        [`aex-${crypto.randomUUID()}`, flowId, dedupKey, email.toLowerCase(), now]
      );
      const payload: MarketingEmailJobPayload = {
        flowId,
        to: email.toLowerCase(),
        locale,
        subject: subjectJson[locale] || subjectJson.en,
        blocks,
        attachCouponCode,
        unsubscribeToken: unsubToken || null,
      };
      await enqueueJob(db, 'send_marketing_email', payload as unknown as Record<string, unknown>);
      await db.execute(
        'UPDATE automation_flows SET total_triggered = total_triggered + 1, last_run_at = ? WHERE id = ?',
        [now, flowId]
      );
      automationJobsQueued++;
    };

    if (triggerType === 'abandoned_cart') {
      const carts = await db.query<{
        cart_id: string;
        user_id: string;
        updated_at: string;
        email: string;
        preferred_locale: string;
      }>(
        `SELECT c.id AS cart_id, c.user_id, c.updated_at, u.email, u.preferred_locale
         FROM carts c
         INNER JOIN users u ON u.id = c.user_id
         WHERE c.updated_at <= ?
           AND EXISTS (SELECT 1 FROM cart_items ci WHERE ci.cart_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = c.user_id AND o.created_at >= c.updated_at)`,
        [cutoffSql]
      );
      for (const c of carts) {
        const dedupKey = `cart:${c.cart_id}:${String(c.updated_at).slice(0, 16)}`;
        await recordAndEnqueue(dedupKey, c.email, c.preferred_locale === 'ar' ? 'ar' : 'en');
      }
    } else if (triggerType === 'post_purchase') {
      const minWindow = toSqlTimestamp(new Date(Date.now() - 14 * 86_400_000));
      const orders = await db.query<{
        order_id: string;
        email: string;
        preferred_locale: string;
      }>(
        `SELECT o.id AS order_id, u.email, u.preferred_locale
         FROM orders o
         INNER JOIN users u ON u.id = o.user_id
         WHERE o.created_at <= ? AND o.created_at >= ?`,
        [cutoffSql, minWindow]
      );
      for (const o of orders) {
        await recordAndEnqueue(`order:${o.order_id}`, o.email, o.preferred_locale === 'ar' ? 'ar' : 'en');
      }
    } else if (triggerType === 'winback_30d') {
      const daysAgo = Math.max(30, Math.round(delayHours / 24));
      const staleCutoff = toSqlTimestamp(new Date(Date.now() - daysAgo * 86_400_000));
      const monthBucket = now.slice(0, 7);
      const staleUsers = await db.query<{ id: string; email: string; preferred_locale: string }>(
        `SELECT u.id, u.email, u.preferred_locale
         FROM users u
         WHERE u.role_key = 'customer' AND u.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.created_at > ?)`,
        [staleCutoff]
      );
      for (const u of staleUsers) {
        await recordAndEnqueue(`winback:${u.id}:${monthBucket}`, u.email, u.preferred_locale === 'ar' ? 'ar' : 'en');
      }
    }
  }

  return { campaignsDispatched, automationJobsQueued };
}

export async function processPendingJobs(db: DbClient, limit = 20): Promise<{
  processed: number;
  failed: number;
  releasedHolds: number;
  cleanedSessions: number;
  publishedHomeSnapshots: number;
  flashSalesEnded: number;
  campaignsDispatched: number;
  automationJobsQueued: number;
}> {
  const autoDispatch = await dispatchDueEmailCampaignsAndFlows(db);

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
      } else if (job.job_type === 'send_marketing_email') {
        await processMarketingEmailJob(db, payload as MarketingEmailJobPayload);
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

  // Finalize any queued email_campaigns that have no remaining queued send_marketing_email jobs
  const queuedCampaigns = await db.query<{ id: string }>("SELECT id FROM email_campaigns WHERE status = 'queued'");
  if (queuedCampaigns.length > 0) {
    const pendingJobs = await db.query<{ payload_json: string }>(
      "SELECT payload_json FROM jobs WHERE job_type = 'send_marketing_email' AND status = 'queued'"
    );
    const activeCampaignIds = new Set<string>();
    for (const pj of pendingJobs) {
      const p = typeof pj.payload_json === 'string' ? JSON.parse(pj.payload_json) : pj.payload_json;
      if (p?.campaignId) activeCampaignIds.add(String(p.campaignId));
    }
    for (const qc of queuedCampaigns) {
      if (!activeCampaignIds.has(qc.id)) {
        await db.execute("UPDATE email_campaigns SET status = 'sent', sent_at = COALESCE(sent_at, ?) WHERE id = ?", [
          now,
          qc.id,
        ]);
      }
    }
  }

  const releasedHolds = await releaseEligibleEscrowHolds(db);
  const publishedHomeSnapshots = await publishDueHomePageSnapshots(db);
  const flashSync = await syncFlashSalesAndCampaigns(db);
  const sessRes = await db.execute('DELETE FROM sessions WHERE expires_at <= ?', [now]);

  return {
    processed,
    failed,
    releasedHolds,
    cleanedSessions: sessRes.affectedRows,
    publishedHomeSnapshots,
    flashSalesEnded: flashSync.endedFlashSales,
    campaignsDispatched: autoDispatch.campaignsDispatched,
    automationJobsQueued: autoDispatch.automationJobsQueued,
  };
}



