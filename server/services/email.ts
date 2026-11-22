import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import type { DbClient, DbTx } from '../db/client.ts';
import type { EmailBlock, Locale } from '../../src/shared/types.ts';
import { toSqlTimestamp } from './security.ts';

export interface EmailSendPayload {
  to: string;
  templateKey: string;
  locale?: Locale;
  vars?: Record<string, string>;
}

export interface MarketingEmailJobPayload {
  campaignId?: string | null;
  flowId?: string | null;
  to: string;
  locale: Locale;
  subject: string;
  previewText?: string;
  blocks: EmailBlock[];
  attachCouponCode?: string | null;
  unsubscribeToken?: string | null;
}

export interface EmailAdapter {
  isConfigured(): boolean;
  send(payload: { to: string; subject: string; text: string; html?: string }): Promise<{ ok: boolean; error?: string }>;
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

  async send(payload: { to: string; subject: string; text: string; html?: string }): Promise<{ ok: boolean; error?: string }> {
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
        html: payload.html,
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

export function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeEmailUrl(raw: string | undefined | null, baseUrl: string): string {
  const s = String(raw || '').trim();
  if (!s || /^\s*(javascript|data|vbscript):/i.test(s)) return baseUrl;
  if (s.startsWith('/')) return `${baseUrl}${s}`;
  if (/^https?:\/\//i.test(s)) return s;
  return baseUrl;
}

export interface EmailProductLookup {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  priceUsdCents: number;
}

export function renderEmailBlocks(
  blocks: EmailBlock[],
  opts: {
    locale: Locale;
    subject: string;
    previewText?: string;
    products?: EmailProductLookup[];
    attachCouponCode?: string | null;
    unsubscribeUrl?: string;
    appUrl?: string;
  }
): { html: string; text: string } {
  const locale = opts.locale === 'ar' ? 'ar' : 'en';
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const baseUrl = (opts.appUrl || process.env.APP_URL || 'https://nilelink.lb').replace(/\/$/, '');
  const productMap = new Map((opts.products || []).map((p) => [p.id, p]));

  const textParts: string[] = [opts.subject];
  const htmlBlocks: string[] = [];

  for (const b of blocks) {
    const title = locale === 'ar' ? b.titleAr || b.titleEn || '' : b.titleEn || b.titleAr || '';
    const body = locale === 'ar' ? b.bodyAr || b.bodyEn || '' : b.bodyEn || b.bodyAr || '';
    const btnLabel = locale === 'ar' ? b.buttonLabelAr || b.buttonLabelEn || '' : b.buttonLabelEn || b.buttonLabelAr || '';

    if (b.type === 'header') {
      textParts.push(title || 'NileLink');
      htmlBlocks.push(
        `<div style="padding:20px 24px;border-bottom:1px solid #30343B;background:#17181B;">
          <div style="font-family:monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#EA580C;">NILELINK LEBANON</div>
          ${title ? `<h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;color:#F3EFE8;">${escapeHtml(title)}</h1>` : ''}
        </div>`
      );
    } else if (b.type === 'hero_text') {
      if (title) textParts.push(title);
      if (body) textParts.push(body);
      const safeImg = b.imageUrl ? safeEmailUrl(b.imageUrl, baseUrl) : '';
      htmlBlocks.push(
        `<div style="padding:24px;border-bottom:1px solid #30343B;background:#222428;">
          ${safeImg && safeImg !== baseUrl ? `<img src="${escapeHtml(safeImg)}" alt="${escapeHtml(title)}" style="display:block;width:100%;max-height:280px;object-fit:cover;margin-bottom:16px;border:1px solid #30343B;" />` : ''}
          ${title ? `<h2 style="margin:0 0 10px;font-size:20px;color:#F3EFE8;">${escapeHtml(title)}</h2>` : ''}
          ${body ? `<p style="margin:0;font-size:14px;line-height:1.65;color:#C7C4BC;">${escapeHtml(body).replace(/\n/g, '<br/>')}</p>` : ''}
        </div>`
      );
    } else if (b.type === 'product_spotlight') {
      const ids = b.productIds || [];
      const cards: string[] = [];
      for (const pid of ids) {
        const prod = productMap.get(pid);
        if (!prod) continue;
        const pTitle = locale === 'ar' ? prod.titleAr : prod.titleEn;
        const pPrice = `$${(prod.priceUsdCents / 100).toFixed(2)}`;
        const pUrl = `${baseUrl}/product/${encodeURIComponent(prod.slug)}`;
        textParts.push(`${pTitle} — ${pPrice} (${pUrl})`);
        cards.push(
          `<div style="padding:14px;border:1px solid #30343B;background:#17181B;margin-bottom:10px;">
            <div style="font-size:14px;font-weight:bold;color:#F3EFE8;">${escapeHtml(pTitle)}</div>
            <div style="margin-top:4px;font-family:monospace;font-size:13px;color:#65A30D;">${escapeHtml(pPrice)}</div>
            <a href="${escapeHtml(pUrl)}" style="display:inline-block;margin-top:10px;padding:7px 14px;border:1px solid #EA580C;color:#EA580C;text-decoration:none;font-size:12px;font-weight:bold;text-transform:uppercase;">${locale === 'ar' ? 'عرض المنتج' : 'View Product'}</a>
          </div>`
        );
      }
      if (cards.length > 0 || title) {
        htmlBlocks.push(
          `<div style="padding:20px 24px;border-bottom:1px solid #30343B;background:#222428;">
            ${title ? `<h3 style="margin:0 0 12px;font-size:16px;color:#F3EFE8;">${escapeHtml(title)}</h3>` : ''}
            ${cards.join('')}
          </div>`
        );
      }
    } else if (b.type === 'coupon_box') {
      const code = (b.couponCode || opts.attachCouponCode || '').trim().toUpperCase();
      if (code) {
        textParts.push(`${title || 'Coupon'}: ${code}`);
        htmlBlocks.push(
          `<div style="padding:20px 24px;border-bottom:1px solid #30343B;background:#17181B;text-align:center;">
            ${title ? `<div style="font-size:12px;color:#C7C4BC;margin-bottom:6px;">${escapeHtml(title)}</div>` : ''}
            <div style="display:inline-block;padding:10px 20px;border:1px dashed #D97706;font-family:monospace;font-size:20px;font-weight:bold;letter-spacing:3px;color:#D97706;">${escapeHtml(code)}</div>
            ${body ? `<div style="font-size:12px;color:#9CA3AF;margin-top:8px;">${escapeHtml(body)}</div>` : ''}
          </div>`
        );
      }
    } else if (b.type === 'cta_button') {
      const href = safeEmailUrl(b.buttonUrl || '/catalog', baseUrl);
      const label = btnLabel || (locale === 'ar' ? 'تسوق الآن' : 'Shop Now');
      textParts.push(`${label}: ${href}`);
      htmlBlocks.push(
        `<div style="padding:22px 24px;border-bottom:1px solid #30343B;background:#222428;text-align:center;">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 28px;background:#EA580C;color:#17181B;text-decoration:none;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(label)}</a>
        </div>`
      );
    } else if (b.type === 'divider_footer') {
      if (body) textParts.push(body);
      htmlBlocks.push(
        `<div style="padding:16px 24px;background:#17181B;font-size:12px;color:#9CA3AF;line-height:1.5;">
          ${body ? escapeHtml(body) : escapeHtml(locale === 'ar' ? 'نيل لينك — سوق لبنان متعدد البائعين' : 'NileLink — Lebanese Multi-Vendor Marketplace')}
        </div>`
      );
    }
  }

  if (opts.attachCouponCode && !blocks.some((b) => b.type === 'coupon_box')) {
    const code = opts.attachCouponCode.trim().toUpperCase();
    textParts.push(`Promo Code: ${code}`);
    htmlBlocks.push(
      `<div style="padding:18px 24px;border-bottom:1px solid #30343B;background:#17181B;text-align:center;">
        <div style="display:inline-block;padding:8px 18px;border:1px dashed #D97706;font-family:monospace;font-size:18px;font-weight:bold;color:#D97706;">${escapeHtml(code)}</div>
      </div>`
    );
  }

  const unsubUrl = opts.unsubscribeUrl || `${baseUrl}/legal`;
  textParts.push(`${locale === 'ar' ? 'لإلغاء الاشتراك:' : 'Unsubscribe:'} ${unsubUrl}`);

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
  <body style="margin:0;padding:24px 12px;background:#111215;font-family:Arial,Helvetica,sans-serif;color:#F3EFE8;">
    ${opts.previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(opts.previewText)}</div>` : ''}
    <div style="max-width:600px;margin:0 auto;border:1px solid #30343B;background:#222428;">
      ${htmlBlocks.join('\n')}
      <div style="padding:16px 24px;background:#17181B;border-top:1px solid #30343B;font-size:11px;color:#9CA3AF;text-align:center;">
        <a href="${escapeHtml(unsubUrl)}" style="color:#9CA3AF;text-decoration:underline;">
          ${locale === 'ar' ? 'إلغاء الاشتراك من رسائل التسويق' : 'Unsubscribe from marketing emails'}
        </a>
      </div>
    </div>
  </body>
</html>`;

  return { html, text: textParts.join('\n\n') };
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

export async function processMarketingEmailJob(db: DbClient, payload: MarketingEmailJobPayload): Promise<void> {
  const emailNorm = String(payload.to || '').trim().toLowerCase();
  if (!emailNorm) return;

  // Enforce opt-out status before sending any marketing email
  const subRow = await db.queryOne<{ status: string; unsubscribe_token: string }>(
    'SELECT status, unsubscribe_token FROM newsletter_subscribers WHERE LOWER(email) = ? LIMIT 1',
    [emailNorm]
  );
  if (subRow && subRow.status === 'unsubscribed') {
    if (payload.campaignId) {
      await db.execute(
        'UPDATE email_campaigns SET unsubscribed_count = unsubscribed_count + 1 WHERE id = ?',
        [payload.campaignId]
      );
    }
    return;
  }

  // Hydrate referenced products for product_spotlight blocks
  const productIds = new Set<string>();
  for (const b of payload.blocks || []) {
    for (const pid of b.productIds || []) productIds.add(pid);
  }
  const products: EmailProductLookup[] = [];
  if (productIds.size > 0) {
    const placeholders = Array.from(productIds).map(() => '?').join(', ');
    const rows = await db.query<{ id: string; slug: string; title_json: string; base_price_usd_cents: number }>(
      `SELECT id, slug, title_json, base_price_usd_cents FROM products WHERE id IN (${placeholders})`,
      Array.from(productIds)
    );
    for (const r of rows) {
      const tj = typeof r.title_json === 'string' ? JSON.parse(r.title_json) : r.title_json;
      products.push({
        id: r.id,
        slug: r.slug,
        titleEn: String(tj?.en || 'Product'),
        titleAr: String(tj?.ar || tj?.en || 'منتج'),
        priceUsdCents: Number(r.base_price_usd_cents || 0),
      });
    }
  }

  const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const token = payload.unsubscribeToken || subRow?.unsubscribe_token || '';
  const unsubscribeUrl = token ? `${baseUrl}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}` : `${baseUrl}/legal`;

  const rendered = renderEmailBlocks(payload.blocks || [], {
    locale: payload.locale || 'en',
    subject: payload.subject,
    previewText: payload.previewText,
    products,
    attachCouponCode: payload.attachCouponCode,
    unsubscribeUrl,
    appUrl: baseUrl,
  });

  const res = await emailAdapter.send({
    to: emailNorm,
    subject: payload.subject,
    text: rendered.text,
    html: rendered.html,
  });

  const tplKey = payload.campaignId ? `campaign:${payload.campaignId}` : payload.flowId ? `flow:${payload.flowId}` : 'marketing';
  await db.execute(
    'INSERT INTO email_log (id, recipient_email, template_key, status, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      `eml-${crypto.randomUUID()}`,
      emailNorm,
      tplKey.slice(0, 64),
      res.ok ? 'sent' : emailAdapter.isConfigured() ? 'failed' : 'unconfigured',
      res.error || null,
      toSqlTimestamp(),
    ]
  );

  if (payload.campaignId) {
    if (res.ok) {
      await db.execute('UPDATE email_campaigns SET sent_count = sent_count + 1 WHERE id = ?', [payload.campaignId]);
    } else {
      await db.execute('UPDATE email_campaigns SET failed_count = failed_count + 1 WHERE id = ?', [payload.campaignId]);
    }
  }
  if (payload.flowId && res.ok) {
    await db.execute('UPDATE automation_flows SET total_sent = total_sent + 1 WHERE id = ?', [payload.flowId]);
  }
}
