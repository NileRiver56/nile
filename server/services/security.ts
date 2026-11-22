import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { DbClient, DbTx } from '../db/client.ts';

export interface AuthContextUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleKey: string;
  sellerId?: string;
  totpEnabled: boolean;
  preferredLocale: 'en' | 'ar';
  preferredCurrency: 'USD' | 'LBP';
  permissions: string[];
  sessionId: string;
  csrfToken: string;
}

export const SESSION_COOKIE_NAME = 'nl_session';
export const CSRF_COOKIE_NAME = 'nl_csrf';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function toSqlTimestamp(date = new Date()): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function timingSafeStringMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

// --- RFC 6238 TOTP 2FA (Zero External Dependency) ---
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function buildOtpAuthUri(email: string, secret: string, issuer = 'NileLink'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

export function computeTotpCode(secret: string, counterOffset = 0, nowMs = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(nowMs / 1000 / 30) + counterOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, submittedCode: string): boolean {
  const clean = submittedCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  for (const offset of [-1, 0, 1]) {
    if (timingSafeStringMatch(computeTotpCode(secret, offset), clean)) {
      return true;
    }
  }
  return false;
}

// --- DB Sessions & Adaptive Iframe-Safe Cookies ---
export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim().slice(0, 64);
  }
  return (req.ip || 'unknown').slice(0, 64);
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (proto.includes('https')) return true;
  return process.env.NODE_ENV === 'production';
}

export function setSessionCookies(req: Request, res: Response, rawToken: string, csrfToken: string) {
  const https = isHttpsRequest(req);
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const common = https
    ? `Path=/; Max-Age=${maxAgeSec}; SameSite=None; Secure; Partitioned`
    : `Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;

  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; HttpOnly; ${common}`,
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${common}`,
  ]);
}

export function clearSessionCookies(req: Request, res: Response) {
  const https = isHttpsRequest(req);
  const common = https
    ? 'Path=/; Max-Age=0; SameSite=None; Secure; Partitioned'
    : 'Path=/; Max-Age=0; SameSite=Lax';
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=; HttpOnly; ${common}`,
    `${CSRF_COOKIE_NAME}=; ${common}`,
  ]);
}

export async function createSession(
  txOrDb: DbTx,
  userId: string,
  req: Request
): Promise<{ sessionId: string; rawToken: string; csrfToken: string; expiresAt: string }> {
  const sessionId = `ses-${crypto.randomUUID()}`;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = toSqlTimestamp(new Date(Date.now() + SESSION_TTL_MS));
  const ua = String(req.headers['user-agent'] || '').slice(0, 250);
  const ip = getClientIp(req);

  await txOrDb.execute(
    'INSERT INTO sessions (id, user_id, token_hash, csrf_token, user_agent, ip_address, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [sessionId, userId, tokenHash, csrfToken, ua, ip, expiresAt, toSqlTimestamp()]
  );

  return { sessionId, rawToken, csrfToken, expiresAt };
}

export async function rotateSession(
  db: DbClient,
  oldSessionId: string | undefined,
  userId: string,
  req: Request
) {
  return db.transaction(async (tx) => {
    if (oldSessionId) {
      await tx.execute('DELETE FROM sessions WHERE id = ?', [oldSessionId]);
    }
    return createSession(tx, userId, req);
  });
}

export async function revokeSession(db: DbTx, sessionId: string): Promise<void> {
  await db.execute('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

export async function revokeAllUserSessions(db: DbTx, userId: string): Promise<void> {
  await db.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

export async function getSessionUser(db: DbClient, rawToken: string): Promise<AuthContextUser | null> {
  if (!rawToken) return null;
  const tokenHash = sha256Hex(rawToken);
  const now = toSqlTimestamp();

  const row = await db.queryOne<{
    session_id: string;
    csrf_token: string;
    user_id: string;
    name: string;
    email: string;
    phone: string;
    role_key: string;
    totp_enabled: number | boolean;
    preferred_locale: string;
    preferred_currency: string;
    is_blocked: number | boolean;
    deleted_at: string | null;
  }>(
    `SELECT s.id AS session_id, s.csrf_token, u.id AS user_id, u.name, u.email, u.phone,
            u.role_key, u.totp_enabled, u.preferred_locale, u.preferred_currency,
            u.is_blocked, u.deleted_at
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [tokenHash, now]
  );

  if (!row || row.is_blocked || row.deleted_at) return null;

  const sellerRow = await db.queryOne<{ id: string }>(
    'SELECT id FROM sellers WHERE owner_user_id = ? AND deleted_at IS NULL LIMIT 1',
    [row.user_id]
  );

  const rolePerms = await db.query<{ permission_key: string }>(
    'SELECT permission_key FROM role_permissions WHERE role_key = ?',
    [row.role_key]
  );
  const userPerms = await db.query<{ permission_key: string }>(
    'SELECT permission_key FROM user_permissions WHERE user_id = ?',
    [row.user_id]
  );

  const permSet = new Set<string>([
    ...rolePerms.map((p) => p.permission_key),
    ...userPerms.map((p) => p.permission_key),
  ]);

  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    roleKey: row.role_key,
    sellerId: sellerRow?.id,
    totpEnabled: Boolean(row.totp_enabled),
    preferredLocale: row.preferred_locale === 'ar' ? 'ar' : 'en',
    preferredCurrency: row.preferred_currency === 'LBP' ? 'LBP' : 'USD',
    permissions: Array.from(permSet),
    sessionId: row.session_id,
    csrfToken: row.csrf_token,
  };
}

export function hasPermission(user: AuthContextUser | undefined, permission: string): boolean {
  if (!user) return false;
  if (user.roleKey === 'admin_super') return true;
  return user.permissions.includes(permission);
}

export function isAdminRole(roleKey: string | undefined): boolean {
  return roleKey === 'admin_super' || roleKey === 'admin_staff';
}

export function isSellerRole(roleKey: string | undefined): boolean {
  return roleKey === 'seller_owner' || roleKey === 'seller_staff';
}

export async function writeAuditLog(
  txOrDb: DbTx,
  input: {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    ipAddress?: string;
  }
): Promise<void> {
  await txOrDb.execute(
    'INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, before_json, after_json, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      `aud-${crypto.randomUUID()}`,
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      input.before !== undefined ? JSON.stringify(input.before) : null,
      input.after !== undefined ? JSON.stringify(input.after) : null,
      input.ipAddress || null,
      toSqlTimestamp(),
    ]
  );
}
