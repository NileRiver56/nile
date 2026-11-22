import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import * as schema from './schema.ts';

export interface DbTx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number }>;
}

export interface DbClient extends DbTx {
  driver: 'mysql' | 'sqlite-preview';
  init(): Promise<void>;
  transaction<T>(fn: (tx: DbTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function getPersistentStorageDir(): string {
  const configured = (process.env.STORAGE_DIR || '').trim();
  if (configured) return path.resolve(configured);
  // Always outside the deployed project build folder
  return path.resolve(os.homedir(), '.nilelink-persistent');
}

function buildMysqlConnectionUri(): string | null {
  const direct = (process.env.DATABASE_URL || '').trim();
  if (direct && !direct.includes('u123456789_user:password@')) {
    return direct;
  }
  const host = (process.env.DB_HOST || '').trim();
  const user = (process.env.DB_USER || '').trim();
  const password = process.env.DB_PASSWORD || '';
  const database = (process.env.DB_NAME || '').trim();
  const port = (process.env.DB_PORT || '3306').trim();
  if (host && user && database) {
    const safeHost = host === 'localhost' ? '127.0.0.1' : host;
    return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${safeHost}:${port}/${encodeURIComponent(database)}`;
  }
  return null;
}

class MysqlClient implements DbClient {
  readonly driver = 'mysql' as const;
  private pool: mysql.Pool;

  constructor(private readonly uri: string) {
    this.pool = mysql.createPool({
      uri,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: false,
    });
  }

  async init(): Promise<void> {
    const orm = drizzle(this.pool, { schema, mode: 'default' });
    const migrationsFolder = path.resolve(process.cwd(), 'drizzle/migrations');
    if (fs.existsSync(migrationsFolder)) {
      await migrate(orm, { migrationsFolder });
    }
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool.execute(sql, params as never[]);
    return rows as T[];
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ affectedRows: number }> {
    const [res] = await this.pool.execute(sql, params as never[]);
    const header = res as mysql.ResultSetHeader;
    return { affectedRows: header.affectedRows ?? 0 };
  }

  async transaction<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const tx: DbTx = {
        async query<R = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<R[]> {
          const [rows] = await conn.execute(sql, params as never[]);
          return rows as R[];
        },
        async queryOne<R = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<R | null> {
          const [rows] = await conn.execute(sql, params as never[]);
          const list = rows as R[];
          return list[0] ?? null;
        },
        async execute(sql: string, params: unknown[] = []): Promise<{ affectedRows: number }> {
          const [res] = await conn.execute(sql, params as never[]);
          const header = res as mysql.ResultSetHeader;
          return { affectedRows: header.affectedRows ?? 0 };
        },
      };
      const result = await fn(tx);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Non-production SQLite preview adapter using Node 22 built-in node:sqlite,
 * storing data outside the project build directory so redeploys/restarts persist.
 */
class SqlitePreviewClient implements DbClient {
  readonly driver = 'sqlite-preview' as const;
  private sqliteDb: import('node:sqlite').DatabaseSync | null = null;
  private txLock: Promise<void> = Promise.resolve();

  async init(): Promise<void> {
    const { DatabaseSync } = await import('node:sqlite');
    const dir = getPersistentStorageDir();
    fs.mkdirSync(dir, { recursive: true });
    const dbFile = path.join(dir, 'nilelink-preview.sqlite');
    const sqlite = new DatabaseSync(dbFile);
    sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.createSqliteTables(sqlite);
    this.sqliteDb = sqlite;
  }

  private createSqliteTables(sqlite: import('node:sqlite').DatabaseSync) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL,
        password_hash TEXT NOT NULL, role_key TEXT NOT NULL DEFAULT 'customer',
        email_verified_at TEXT, phone_verified_at TEXT, totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0,
        preferred_locale TEXT NOT NULL DEFAULT 'en', preferred_currency TEXT NOT NULL DEFAULT 'USD',
        failed_login_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
        is_blocked INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS roles (key TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS permissions (key TEXT PRIMARY KEY, description TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS role_permissions (id TEXT PRIMARY KEY, role_key TEXT NOT NULL, permission_key TEXT NOT NULL, UNIQUE(role_key, permission_key));
      CREATE TABLE IF NOT EXISTS user_permissions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, permission_key TEXT NOT NULL, UNIQUE(user_id, permission_key));
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, csrf_token TEXT NOT NULL,
        user_agent TEXT, ip_address TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT 'password_reset',
        expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sellers (
        id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, business_type TEXT NOT NULL DEFAULT 'individual',
        legal_name TEXT NOT NULL, commercial_reg_ref TEXT NOT NULL, governorate TEXT NOT NULL, district TEXT NOT NULL,
        city_address TEXT NOT NULL, phone TEXT NOT NULL, whatsapp_phone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft', status_reason TEXT, verified INTEGER NOT NULL DEFAULT 0,
        custom_commission_bps INTEGER, payout_method TEXT NOT NULL DEFAULT 'whish', payout_account TEXT NOT NULL,
        onboarding_step INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS stores (
        id TEXT PRIMARY KEY, seller_id TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE,
        name_json TEXT NOT NULL, tagline_json TEXT NOT NULL, about_json TEXT NOT NULL, announcement_json TEXT,
        department_slug TEXT NOT NULL, theme_id TEXT NOT NULL DEFAULT 'obsidian-ember',
        logo_media_id TEXT, banner_media_id TEXT, rating_avg_x10 INTEGER NOT NULL DEFAULT 0, review_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS store_settings (
        store_id TEXT PRIMARY KEY, delivery_mode TEXT NOT NULL DEFAULT 'platform',
        self_delivery_fees_json TEXT NOT NULL, processing_hours INTEGER NOT NULL DEFAULT 24,
        vacation_mode INTEGER NOT NULL DEFAULT 0, working_hours_json TEXT, return_policy_json TEXT,
        social_links_json TEXT, seo_title TEXT, seo_description TEXT
      );
      CREATE TABLE IF NOT EXISTS seller_documents (
        id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, doc_type TEXT NOT NULL, media_id TEXT NOT NULL,
        review_status TEXT NOT NULL DEFAULT 'pending', reviewer_note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY, parent_id TEXT, slug TEXT NOT NULL UNIQUE, department TEXT NOT NULL,
        name_json TEXT NOT NULL, commission_bps INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS attributes (id TEXT PRIMARY KEY, code TEXT NOT NULL, name_json TEXT NOT NULL, values_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS brands (id TEXT PRIMARY KEY, slug TEXT NOT NULL, name_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, category_id TEXT NOT NULL, brand_id TEXT,
        department TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, title_json TEXT NOT NULL, subtitle_json TEXT NOT NULL,
        description_json TEXT NOT NULL, specs_json TEXT NOT NULL, base_price_usd_cents INTEGER NOT NULL,
        compare_at_usd_cents INTEGER, seller_currency TEXT NOT NULL DEFAULT 'USD',
        moderation_status TEXT NOT NULL DEFAULT 'pending', published INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0, model_3d_url TEXT, rating_avg_x10 INTEGER NOT NULL DEFAULT 0,
        review_count INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS product_variants (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL, sku TEXT NOT NULL, size TEXT,
        color TEXT NOT NULL, color_hex TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 0, price_delta_usd_cents INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT,
        folder TEXT NOT NULL DEFAULT 'general',
        storage_driver TEXT NOT NULL DEFAULT 'local', storage_key TEXT NOT NULL, public_url TEXT NOT NULL,
        mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, width INTEGER, height INTEGER,
        alt_json TEXT, focal_x INTEGER NOT NULL DEFAULT 50, focal_y INTEGER NOT NULL DEFAULT 50,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY, variant_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL,
        reference_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS carts (id TEXT PRIMARY KEY, user_id TEXT, guest_token TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS cart_items (id TEXT PRIMARY KEY, cart_id TEXT NOT NULL, product_id TEXT NOT NULL, variant_id TEXT NOT NULL, quantity INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, user_id TEXT,
        customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, governorate TEXT NOT NULL,
        district TEXT NOT NULL, town TEXT NOT NULL, address_notes TEXT NOT NULL,
        payment_method TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending', coupon_code TEXT,
        exchange_rate_snapshot INTEGER NOT NULL, subtotal_usd_cents INTEGER NOT NULL,
        delivery_total_usd_cents INTEGER NOT NULL, cod_fee_usd_cents INTEGER NOT NULL DEFAULT 0,
        discount_total_usd_cents INTEGER NOT NULL DEFAULT 0, grand_total_usd_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sub_orders (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, seller_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        delivery_mode TEXT NOT NULL, delivery_fee_usd_cents INTEGER NOT NULL, subtotal_usd_cents INTEGER NOT NULL,
        discount_usd_cents INTEGER NOT NULL DEFAULT 0, commission_usd_cents INTEGER NOT NULL,
        seller_net_usd_cents INTEGER NOT NULL, cod_collected INTEGER NOT NULL DEFAULT 0,
        courier_name TEXT, tracking_code TEXT, delivered_at TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY, sub_order_id TEXT NOT NULL, product_id TEXT NOT NULL, variant_id TEXT NOT NULL,
        title_snapshot_json TEXT NOT NULL, variant_label TEXT NOT NULL, sku TEXT NOT NULL,
        quantity INTEGER NOT NULL, unit_price_usd_cents INTEGER NOT NULL, line_total_usd_cents INTEGER NOT NULL,
        commission_bps_snapshot INTEGER NOT NULL, commission_usd_cents INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, method TEXT NOT NULL, gateway_name TEXT NOT NULL,
        reference TEXT, amount_usd_cents INTEGER NOT NULL, status TEXT NOT NULL, verified_by_user_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, sub_order_id TEXT, order_number TEXT,
        entry_type TEXT NOT NULL, direction TEXT NOT NULL, amount_usd_cents INTEGER NOT NULL,
        availability TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS payouts (
        id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, amount_usd_cents INTEGER NOT NULL,
        method TEXT NOT NULL, account_details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        reference_code TEXT, settled_by_user_id TEXT, settled_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS commissions_log (
        id TEXT PRIMARY KEY, order_item_id TEXT NOT NULL, seller_id TEXT NOT NULL, applied_bps INTEGER NOT NULL,
        source_rule TEXT NOT NULL, amount_usd_cents INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS subscription_plans (
        tier TEXT PRIMARY KEY, name_json TEXT NOT NULL, monthly_fee_usd_cents INTEGER NOT NULL,
        product_limit INTEGER, commission_discount_bps INTEGER NOT NULL DEFAULT 0, features_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, plan_tier TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
        next_due_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, seller_id TEXT, discount_type TEXT NOT NULL DEFAULT 'percent',
        discount_value INTEGER NOT NULL, max_discount_usd_cents INTEGER, min_order_usd_cents INTEGER NOT NULL DEFAULT 0,
        target_type TEXT NOT NULL DEFAULT 'all', target_id TEXT, campaign_id TEXT,
        max_uses INTEGER, per_customer_limit INTEGER NOT NULL DEFAULT 1, used_count INTEGER NOT NULL DEFAULT 0,
        first_order_only INTEGER NOT NULL DEFAULT 0, auto_generated_batch TEXT,
        starts_at TEXT, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id TEXT PRIMARY KEY, coupon_id TEXT NOT NULL, user_id TEXT, customer_phone_norm TEXT NOT NULL,
        order_id TEXT NOT NULL, discount_usd_cents INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY, seller_id TEXT, title_json TEXT NOT NULL, offer_type TEXT NOT NULL,
        discount_value INTEGER NOT NULL, target_type TEXT NOT NULL, target_id TEXT,
        stacking_rule TEXT NOT NULL DEFAULT 'best_only', funding_source TEXT NOT NULL DEFAULT 'platform',
        funding_platform_bps INTEGER NOT NULL DEFAULT 10000, campaign_id TEXT,
        priority INTEGER NOT NULL DEFAULT 10, rules_json TEXT,
        approval_status TEXT NOT NULL DEFAULT 'pending', starts_at TEXT, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS flash_sales (
        id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title_json TEXT NOT NULL, bg_token TEXT NOT NULL DEFAULT 'ember',
        starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled',
        auto_revert INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS flash_sale_items (
        id TEXT PRIMARY KEY, flash_sale_id TEXT NOT NULL, product_id TEXT NOT NULL,
        sale_price_usd_cents INTEGER NOT NULL, discount_percent INTEGER NOT NULL,
        stock_cap INTEGER NOT NULL DEFAULT 0, claimed_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title_json TEXT NOT NULL,
        subtitle_json TEXT NOT NULL, description_json TEXT NOT NULL, hero_image_url TEXT,
        bg_token TEXT NOT NULL DEFAULT 'ember', starts_at TEXT, ends_at TEXT,
        status TEXT NOT NULL DEFAULT 'draft', featured_offer_ids_json TEXT NOT NULL,
        featured_coupon_codes_json TEXT NOT NULL, featured_flash_sale_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS banners (
        id TEXT PRIMARY KEY, title_json TEXT NOT NULL, bg_token TEXT NOT NULL DEFAULT 'graphite',
        target_url TEXT NOT NULL, pages_json TEXT NOT NULL, placement TEXT NOT NULL DEFAULT 'page_strip',
        image_url TEXT, dismissible INTEGER NOT NULL DEFAULT 1, audience TEXT NOT NULL DEFAULT 'all',
        device_target TEXT NOT NULL DEFAULT 'all', category_slug TEXT,
        priority INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
        bot_filtered_count INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS marketing_popups (
        id TEXT PRIMARY KEY, title_json TEXT NOT NULL, body_json TEXT NOT NULL, cta_label_json TEXT NOT NULL,
        target_url TEXT NOT NULL DEFAULT '/catalog', image_url TEXT, bg_token TEXT NOT NULL DEFAULT 'ember',
        popup_type TEXT NOT NULL DEFAULT 'promo', trigger_type TEXT NOT NULL DEFAULT 'delay_seconds',
        trigger_value INTEGER NOT NULL DEFAULT 5, frequency_cap TEXT NOT NULL DEFAULT 'once_per_day',
        pages_json TEXT NOT NULL, audience TEXT NOT NULL DEFAULT 'all', device_target TEXT NOT NULL DEFAULT 'all',
        show_newsletter_form INTEGER NOT NULL DEFAULT 0, coupon_code TEXT, starts_at TEXT, ends_at TEXT,
        active INTEGER NOT NULL DEFAULT 1, impressions INTEGER NOT NULL DEFAULT 0, conversions INTEGER NOT NULL DEFAULT 0,
        dismissals INTEGER NOT NULL DEFAULT 0, bot_filtered_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS featured_placements (
        id TEXT PRIMARY KEY, slot_key TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
        seller_id TEXT NOT NULL, badge_json TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 10,
        fee_usd_cents INTEGER NOT NULL DEFAULT 0, ledger_charged INTEGER NOT NULL DEFAULT 0,
        ledger_entry_id TEXT, starts_at TEXT, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1,
        impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
        bot_filtered_count INTEGER NOT NULL DEFAULT 0, created_by_user_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS marketing_events_dedup (
        id TEXT PRIMARY KEY, entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, event_type TEXT NOT NULL,
        visitor_hash TEXT NOT NULL, bucket_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(entity_kind, entity_id, event_type, visitor_hash, bucket_key)
      );
      CREATE TABLE IF NOT EXISTS home_sections (
        id TEXT PRIMARY KEY, section_type TEXT NOT NULL, title_json TEXT NOT NULL, content_json TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', visible INTEGER NOT NULL DEFAULT 1,
        audience TEXT NOT NULL DEFAULT 'all', targeting_json TEXT, style_json TEXT,
        schedule_priority INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, version INTEGER NOT NULL DEFAULT 1,
        updated_by_user_id TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS home_section_versions (
        id TEXT PRIMARY KEY, section_id TEXT NOT NULL, version INTEGER NOT NULL, change_note TEXT,
        snapshot_json TEXT NOT NULL, edited_by_user_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS home_section_templates (
        id TEXT PRIMARY KEY, name_json TEXT NOT NULL, description_json TEXT NOT NULL,
        section_type TEXT NOT NULL, content_json TEXT NOT NULL, style_json TEXT,
        is_system INTEGER NOT NULL DEFAULT 0, created_by_user_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS home_page_snapshots (
        id TEXT PRIMARY KEY, version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'published',
        change_note TEXT, sections_snapshot_json TEXT NOT NULL, chrome_snapshot_json TEXT NOT NULL,
        scheduled_publish_at TEXT, published_at TEXT, created_by_user_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, locale TEXT NOT NULL DEFAULT 'en',
        source TEXT NOT NULL DEFAULT 'home', status TEXT NOT NULL DEFAULT 'subscribed',
        unsubscribe_token TEXT NOT NULL, consented_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title_json TEXT NOT NULL, body_json TEXT NOT NULL,
        published INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS menus (id TEXT PRIMARY KEY, location TEXT NOT NULL, items_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL, seller_id TEXT NOT NULL, user_id TEXT NOT NULL,
        rating INTEGER NOT NULL, comment TEXT NOT NULL, verified_buyer INTEGER NOT NULL DEFAULT 1,
        seller_reply TEXT, moderation_status TEXT NOT NULL DEFAULT 'approved', created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS wishlists (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, product_id)
      );
      CREATE TABLE IF NOT EXISTS addresses (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, label TEXT NOT NULL, governorate TEXT NOT NULL,
        district TEXT NOT NULL, town TEXT NOT NULL, phone TEXT NOT NULL, notes TEXT, is_default INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title_json TEXT NOT NULL, body_json TEXT NOT NULL,
        read_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS email_templates (
        key TEXT PRIMARY KEY, subject_json TEXT NOT NULL, body_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS email_log (
        id TEXT PRIMARY KEY, recipient_email TEXT NOT NULL, template_key TEXT NOT NULL,
        status TEXT NOT NULL, error_message TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY, user_id TEXT, email TEXT NOT NULL, subject TEXT NOT NULL,
        message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS disputes (
        id TEXT PRIMARY KEY, sub_order_id TEXT NOT NULL, opened_by_user_id TEXT NOT NULL,
        reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', resolution_note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS returns (
        id TEXT PRIMARY KEY, sub_order_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested', refund_usd_cents INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL, before_json TEXT, after_json TEXT, ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS translations (key TEXT PRIMARY KEY, en TEXT NOT NULL, ar TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS delivery_zones (
        governorate_code TEXT PRIMARY KEY, name_json TEXT NOT NULL, platform_fee_usd_cents INTEGER NOT NULL, eta_days TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, job_type TEXT NOT NULL, payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
        run_at TEXT NOT NULL DEFAULT (datetime('now')), last_error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS error_log (
        id TEXT PRIMARY KEY, route TEXT NOT NULL, message TEXT NOT NULL, stack TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS customer_segments (
        id TEXT PRIMARY KEY, name_json TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        rules_json TEXT NOT NULL, cached_member_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, subject_json TEXT NOT NULL, preview_text_json TEXT NOT NULL,
        segment_id TEXT, blocks_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
        scheduled_at TEXT, sent_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0,
        unsubscribed_count INTEGER NOT NULL DEFAULT 0, sent_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS automation_flows (
        id TEXT PRIMARY KEY, name_json TEXT NOT NULL, trigger_type TEXT NOT NULL,
        delay_hours INTEGER NOT NULL DEFAULT 0, subject_json TEXT NOT NULL, blocks_json TEXT NOT NULL,
        attach_coupon_code TEXT, active INTEGER NOT NULL DEFAULT 1,
        total_triggered INTEGER NOT NULL DEFAULT 0, total_sent INTEGER NOT NULL DEFAULT 0,
        last_run_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS automation_executions (
        id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, dedup_key TEXT NOT NULL,
        recipient_email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(flow_id, dedup_key)
      );
    `);

    const ensureCol = (table: string, col: string, defSql: string) => {
      const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      if (!cols.some((c) => c.name === col)) {
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${defSql}`);
      }
    };
    ensureCol('media', 'folder', "TEXT NOT NULL DEFAULT 'general'");
    ensureCol('media', 'alt_json', 'TEXT');
    ensureCol('media', 'focal_x', 'INTEGER NOT NULL DEFAULT 50');
    ensureCol('media', 'focal_y', 'INTEGER NOT NULL DEFAULT 50');
    ensureCol('home_sections', 'visible', 'INTEGER NOT NULL DEFAULT 1');
    ensureCol('home_sections', 'targeting_json', 'TEXT');
    ensureCol('home_sections', 'style_json', 'TEXT');
    ensureCol('home_sections', 'schedule_priority', 'INTEGER NOT NULL DEFAULT 0');
    ensureCol('home_sections', 'updated_by_user_id', 'TEXT');
    ensureCol('home_section_versions', 'change_note', 'TEXT');
    ensureCol('banners', 'placement', "TEXT NOT NULL DEFAULT 'page_strip'");
    ensureCol('banners', 'image_url', 'TEXT');
    ensureCol('banners', 'dismissible', 'INTEGER NOT NULL DEFAULT 1');
    ensureCol('banners', 'audience', "TEXT NOT NULL DEFAULT 'all'");
    ensureCol('banners', 'device_target', "TEXT NOT NULL DEFAULT 'all'");
    ensureCol('banners', 'category_slug', 'TEXT');
    ensureCol('banners', 'bot_filtered_count', 'INTEGER NOT NULL DEFAULT 0');
    ensureCol('coupons', 'max_discount_usd_cents', 'INTEGER');
    ensureCol('coupons', 'target_type', "TEXT NOT NULL DEFAULT 'all'");
    ensureCol('coupons', 'target_id', 'TEXT');
    ensureCol('coupons', 'campaign_id', 'TEXT');
    ensureCol('coupons', 'first_order_only', 'INTEGER NOT NULL DEFAULT 0');
    ensureCol('coupons', 'auto_generated_batch', 'TEXT');
    ensureCol('offers', 'stacking_rule', "TEXT NOT NULL DEFAULT 'best_only'");
    ensureCol('offers', 'funding_source', "TEXT NOT NULL DEFAULT 'platform'");
    ensureCol('offers', 'funding_platform_bps', 'INTEGER NOT NULL DEFAULT 10000');
    ensureCol('offers', 'campaign_id', 'TEXT');
    ensureCol('offers', 'priority', 'INTEGER NOT NULL DEFAULT 10');
    ensureCol('offers', 'rules_json', 'TEXT');
  }

  private getDb() {
    if (!this.sqliteDb) throw new Error('Database not initialized.');
    return this.sqliteDb;
  }

  private normalizeParams(params: unknown[]): (string | number | null | Uint8Array)[] {
    return params.map((p) => {
      if (p === undefined || p === null) return null;
      if (typeof p === 'boolean') return p ? 1 : 0;
      if (p instanceof Date) return p.toISOString();
      if (typeof p === 'object' && !(p instanceof Uint8Array)) return JSON.stringify(p);
      return p as string | number;
    });
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.getDb().prepare(sql);
    return stmt.all(...this.normalizeParams(params)) as T[];
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const stmt = this.getDb().prepare(sql);
    const row = stmt.get(...this.normalizeParams(params));
    return (row as T | undefined) ?? null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ affectedRows: number }> {
    const stmt = this.getDb().prepare(sql);
    const info = stmt.run(...this.normalizeParams(params));
    return { affectedRows: Number(info.changes ?? 0) };
  }

  async transaction<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
    let release!: () => void;
    const prev = this.txLock;
    this.txLock = new Promise<void>((res) => {
      release = res;
    });
    await prev;
    const db = this.getDb();
    try {
      db.exec('BEGIN IMMEDIATE');
      const result = await fn(this);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      release();
    }
  }

  async close(): Promise<void> {
    this.sqliteDb?.close();
    this.sqliteDb = null;
  }
}

let activeDb: DbClient | null = null;

export async function getDb(): Promise<DbClient> {
  if (activeDb) return activeDb;

  const mysqlUri = buildMysqlConnectionUri();
  if (mysqlUri) {
    const client = new MysqlClient(mysqlUri);
    await client.init();
    activeDb = client;
    console.log('[DB] Connected to MySQL database via Drizzle/mysql2.');
    return client;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL (or DB_HOST/DB_USER/DB_NAME) is required in production for MySQL.');
  }

  const previewClient = new SqlitePreviewClient();
  await previewClient.init();
  activeDb = previewClient;
  console.log(
    `[DB] Preview mode: using SQLite at ${getPersistentStorageDir()} (configure DATABASE_URL=mysql://... for Hostinger MySQL).`
  );
  return previewClient;
}
