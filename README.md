# NileLink — Lebanese Multi-Vendor Marketplace

Bilingual (`AR` full RTL / `EN` LTR), dual-currency (`USD` / `LBP` using integer minor units) multi-vendor marketplace for Lebanon built on **Node.js**, **Express**, **React**, **TypeScript**, **Tailwind CSS v4**, and **MySQL** (`drizzle-orm/mysql2`).

---

## Key Architecture Highlights
- **Real MySQL Schema & Migrations**: 50 normalized tables defined in `server/db/schema.ts` with versioned Drizzle SQL migrations in `drizzle/migrations/0000_initial.sql`.
- **Non-Production Preview**: When `DATABASE_URL` is not configured and `NODE_ENV !== 'production'`, Node 22 built-in SQLite (`node:sqlite`) runs automatically outside the project build folder (`~/.nilelink-persistent`). In production (`NODE_ENV=production`), `DATABASE_URL` is strictly required.
- **Security & Auth**:
  - `HttpOnly` cookie sessions persisted in `sessions` table + `X-CSRF-Token` validation + session rotation on login + `POST /api/auth/logout-all`.
  - `scrypt` password hashing, brute-force account lockout, Helmet headers, strict CORS, and Zod request validation on all API endpoints.
  - Mandatory RFC 6238 **TOTP 2FA** for `admin_super` and `admin_staff`, plus optional 2FA enrollment for sellers and customers.
  - First-run **One-Time Admin Setup Token** logged to stdout on first boot when no `admin_super` exists.
  - Immutable `audit_log` and central `error_log`.
- **Uploads Outside Build Folder**: Files uploaded via `POST /api/uploads` are magic-byte verified, stripped of EXIF metadata and re-encoded to WebP via `sharp`, and saved under `STORAGE_DIR/uploads` (never inside `dist/`).

---

## Hostinger Cloud Startup (Node.js) Deployment Guide

1. **Create MySQL Database in hPanel**:
   - Open **hPanel → Databases → Management** and create a database + user.
2. **Important Hostinger MySQL Host Rule**:
   - In Hostinger Node.js applications (Node 17+), **always use `127.0.0.1` (port `3306`) instead of `localhost`** in `DATABASE_URL` / `DB_HOST`. Node resolves `localhost` to IPv6 `::1`, which MySQL rejects (`Access denied for user ...@'::1'`).
   - Example:
     ```env
     NODE_ENV=production
     PORT=3000
     APP_URL=https://your-domain.com
     DATABASE_URL=mysql://u123456789_nilelink:YOUR_DB_PASSWORD@127.0.0.1:3306/u123456789_nilelink
     STORAGE_DIR=/home/u123456789/nilelink-persistent
     SESSION_SECRET=replace-with-64-char-random-hex
     CRON_SECRET=replace-with-64-char-random-hex
     ```
3. **Install, Build & Migrate**:
   ```bash
   npm install
   npx drizzle-kit migrate
   npm run build
   npm start
   ```
4. **First-Run Super Admin Setup**:
   - Check Node.js startup logs for `[NILELINK FIRST-RUN SETUP] One-time Admin Setup Token: ...`
   - Open `https://your-domain.com/admin`, enter the setup token, and save the generated TOTP 2FA secret in Google Authenticator / Authy.
5. **hPanel Cron Job (Every Minute)**:
   - Configure a cron job in hPanel to trigger the DB job queue, escrow hold releases, and expired session cleanup:
     ```bash
     curl -s -X POST https://your-domain.com/api/cron/run -H "X-Cron-Secret: YOUR_CRON_SECRET" > /dev/null
     ```
6. **Database Backups & Restore**:
   ```bash
   npx tsx scripts/backup-db.ts
   npx tsx scripts/restore-db.ts /home/u123456789/nilelink-persistent/backups/nilelink-backup-TIMESTAMP.json
   ```
7. **Developer-Only Sample Data** (never run in production):
   ```bash
   DEMO_MODE=true npx tsx scripts/seed-demo.ts
   ```
