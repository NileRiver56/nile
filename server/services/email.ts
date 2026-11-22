import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import type { DbClient, DbTx } from '../db/client.ts';
import { toSqlTimestamp } from './security.ts';

export interface EmailSendPayload {
  to: string;
  templateKey: string;
  locale?: 'en' | 'ar';
  vars?: Record<string, string>;
}

export interface EmailAdapter {
  isConfigured(): boolean;
  send(payload: { to: string; subject: string; text: string }): Promise<{ ok: boolean; error?: string }>;
}

function getSmtpConfig() {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS || '';
  const from = (process.env.SMTP_FROM || 'no-reply@nilelink.lb').trim();
  return { host, port, user, pass, from };
}

class SmtpEmailAdapter implements EmailAdapter {
  isConfigured(): boolean {
    const cfg = getSmtpConfig();
    return Boolean(cfg.host && cfg.user && cfg.pass);
  }

  async send(payload: { to: string; subject: string; text: string }): Promise<{ ok: boolean; error?: string }> {
    const cfg = getSmtpConfig();
    if (!this.isConfigured()) {
      return { ok: false, error: 'Needs my input: configure SMTP_HOST, SMTP_USER, and SMTP_PASS.' };
    }
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: { user: cfg.user, pass: cfg.pass },
      });
      await transporter.sendMail({
        from: cfg.from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

export const emailAdapter = new SmtpEmailAdapter();

function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_match, k: string) => vars[k] ?? '');
}

export async function queueEmail(db: DbTx, payload: EmailSendPayload): Promise<void> {
  await db.execute(
    'INSERT INTO jobs (id, job_type, payload_json, status, attempts, run_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    [
      `job-${crypto.randomUUID()}`,
      'send_email',
      JSON.stringify(payload),
      'queued',
      toSqlTimestamp(),
      toSqlTimestamp(),
    ]
  );
}

export async function processEmailJob(db: DbClient, payload: EmailSendPayload): Promise<void> {
  const keyCol = db.driver === 'mysql' ? '`key`' : 'key';
  const tplRow = await db.queryOne<{ subject_json: string; body_json: string }>(
    `SELECT subject_json, body_json FROM email_templates WHERE ${keyCol} = ?`,
    [payload.templateKey]
  );

  const locale = payload.locale === 'ar' ? 'ar' : 'en';
  const vars = payload.vars || {};
  let subject = `NileLink Notification (${payload.templateKey})`;
  let body = '';

  if (tplRow) {
    const subJson = typeof tplRow.subject_json === 'string' ? JSON.parse(tplRow.subject_json) : tplRow.subject_json;
    const bodJson = typeof tplRow.body_json === 'string' ? JSON.parse(tplRow.body_json) : tplRow.body_json;
    subject = interpolate(String(subJson?.[locale] || subJson?.en || subject), vars);
    body = interpolate(String(bodJson?.[locale] || bodJson?.en || ''), vars);
  }

  const res = await emailAdapter.send({ to: payload.to, subject, text: body });
  await db.execute(
    'INSERT INTO email_log (id, recipient_email, template_key, status, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      `eml-${crypto.randomUUID()}`,
      payload.to,
      payload.templateKey,
      res.ok ? 'sent' : emailAdapter.isConfigured() ? 'failed' : 'unconfigured',
      res.error || null,
      toSqlTimestamp(),
    ]
  );
}
