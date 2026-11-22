import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { getDb, type DbClient } from './server/db/client.ts';
import { ensureEssentialSeed } from './server/db/essentialSeed.ts';
import { MarketplaceRepo } from './server/db/marketplaceRepo.ts';
import { isCardGatewayConfigured } from './server/paymentAdapters.ts';
import { emailAdapter } from './server/services/email.ts';
import { processPendingJobs } from './server/services/jobs.ts';
import {
  clearSessionCookies,
  createSession,
  getClientIp,
  getSessionUser,
  hasPermission,
  isAdminRole,
  isSellerRole,
  revokeAllUserSessions,
  revokeSession,
  rotateSession,
  SESSION_COOKIE_NAME,
  setSessionCookies,
  timingSafeStringMatch,
  type AuthContextUser,
} from './server/services/security.ts';
import { smsAdapter } from './server/services/sms.ts';
import { getStorageAdapter, getStorageStatus, saveUploadedMedia } from './server/services/storage.ts';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthContextUser;
      requestId?: string;
    }
  }
}

const startedAtMs = Date.now();
const rateBucket = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${getClientIp(req)}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const record = rateBucket.get(key);
    if (!record || record.resetAt < now) {
      rateBucket.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (record.count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    record.count++;
    return next();
  };
}

function validateBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid request payload.');
  }
  return parsed.data;
}

async function createApp() {
  const db: DbClient = await getDb();
  await ensureEssentialSeed(db);
  const repo = new MarketplaceRepo(db);

  // Process any due jobs on startup and every 60 seconds
  void processPendingJobs(db).catch(() => {});
  const jobTimer = setInterval(() => {
    void processPendingJobs(db).catch(() => {});
  }, 60_000);
  jobTimer.unref();

  const app = express();
  app.set('trust proxy', 1);

  // Security headers (CSP & frameguard disabled to support preview iframe & Vite styles)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // Strict CORS checking allowed origins
  const configuredOrigin = (process.env.APP_URL || '').trim();
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (configuredOrigin && origin === configuredOrigin) return callback(null, true);
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return callback(null, true);
        if (/^https:\/\/[a-z0-9-]+\.(aistudio\.google\.com|run\.app|googleusercontent\.com)$/i.test(origin)) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '8mb' }));

  // PII-free request logging
  app.use((req, res, next) => {
    const reqId = crypto.randomBytes(6).toString('hex');
    req.requestId = reqId;
    const t0 = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api')) {
        console.log(`[HTTP] ${reqId} ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - t0}ms)`);
      }
    });
    next();
  });

  // Safe static route for uploaded media stored OUTSIDE project build folder
  app.get('/uploads/*', (req, res) => {
    const rel = String((req.params as Record<string, string>)[0] || '');
    const absPath = getStorageAdapter().resolveLocalPath(rel);
    if (!absPath || !fs.existsSync(absPath)) {
      return res.status(404).json({ error: 'File not found.' });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.sendFile(absPath);
  });

  // Attach DB-backed session user on /api/*
  app.use('/api', async (req, _res, next) => {
    try {
      const rawToken = String(req.cookies?.[SESSION_COOKIE_NAME] || '').trim();
      if (rawToken) {
        const user = await getSessionUser(db, rawToken);
        if (user) req.authUser = user;
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  // CSRF check for authenticated mutating requests
  app.use('/api', (req, res, next) => {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
    if (req.path === '/cron/run') return next();
    if (req.authUser) {
      const csrfHeader = String(req.headers['x-csrf-token'] || '');
      if (!csrfHeader || !timingSafeStringMatch(csrfHeader, req.authUser.csrfToken)) {
        return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
      }
    }
    return next();
  });

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.authUser) return res.status(401).json({ error: 'Authentication required.' });
    next();
  }

  function requireSeller(req: Request, res: Response, next: NextFunction) {
    if (!req.authUser || (!isSellerRole(req.authUser.roleKey) && !isAdminRole(req.authUser.roleKey))) {
      return res.status(403).json({ error: 'Seller authorization required.' });
    }
    next();
  }

  function requireAdminPerm(permission?: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.authUser || !isAdminRole(req.authUser.roleKey)) {
        return res.status(403).json({ error: 'Admin authorization required.' });
      }
      if (permission && !hasPermission(req.authUser, permission)) {
        return res.status(403).json({ error: `Missing permission: ${permission}` });
      }
      next();
    };
  }

  // --- Health & Sitemap ---
  app.get('/api/health', async (_req, res) => {
    let dbHealthy = false;
    try {
      await db.queryOne('SELECT 1 AS ok');
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }
    const storage = getStorageStatus();
    res.status(dbHealthy ? 200 : 503).json({
      status: dbHealthy ? 'ok' : 'degraded',
      service: 'NileLink Marketplace',
      dbDriver: db.driver,
      dbHealthy,
      storageDriver: storage.activeDriver,
      s3Configured: storage.s3Configured,
      emailConfigured: emailAdapter.isConfigured(),
      smsConfigured: smsAdapter.isConfigured(),
      cardGatewayConfigured: isCardGatewayConfigured(),
      uptimeSeconds: Math.round((Date.now() - startedAtMs) / 1000),
    });
  });

  app.get('/sitemap.xml', async (_req, res, next) => {
    try {
      const [products, sellers] = await Promise.all([repo.getPublicProducts(), repo.getPublicSellers()]);
      const urls = [
        '/',
        '/catalog',
        '/styleguide',
        ...sellers.map((s) => `/store/${s.slug}`),
        ...products.map((p) => `/product/${p.slug}`),
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `  <url><loc>${u}</loc></url>`)
        .join('\n')}\n</urlset>`;
      res.type('application/xml').send(xml);
    } catch (err) {
      next(err);
    }
  });

  // --- Cron Job Endpoint (Hostinger hPanel Cron) ---
  app.post('/api/cron/run', async (req, res, next) => {
    try {
      const expected = (process.env.CRON_SECRET || '').trim();
      const provided = String(req.headers['x-cron-secret'] || '');
      const adminAllowed = req.authUser && req.authUser.roleKey === 'admin_super';
      if (!adminAllowed && (!expected || !provided || !timingSafeStringMatch(expected, provided))) {
        return res.status(403).json({ error: 'Invalid cron authorization.' });
      }
      const summary = await processPendingJobs(db);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  // --- Public Marketplace Bootstrap, Catalog, Storefronts & Pages ---
  app.get('/api/bootstrap', async (req, res, next) => {
    try {
      const locale = req.query.locale === 'ar' ? 'ar' : 'en';
      const wantsDrafts = req.query.includeDrafts === 'true' || req.query.includeDrafts === '1';
      const includeDrafts = Boolean(wantsDrafts && req.authUser && isAdminRole(req.authUser.roleKey));
      const data = await repo.getBootstrapData({
        isLoggedIn: Boolean(req.authUser),
        locale,
        includeDrafts,
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/banners/:id/track', rateLimit(120, 60_000), async (req, res) => {
    try {
      const body = validateBody(z.object({ event: z.enum(['impression', 'click']) }), req.body);
      await repo.trackBannerEvent(req.params.id, body.event);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/products', async (req, res, next) => {
    try {
      const result = await repo.searchPublicProducts({
        q: String(req.query.q || ''),
        department: String(req.query.department || ''),
        sellerId: String(req.query.sellerId || ''),
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
        inStockOnly: req.query.inStock === 'true',
        dealsOnly: req.query.deals === 'true',
        sort: String(req.query.sort || 'featured'),
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/products/:slug', async (req, res, next) => {
    try {
      const detail = await repo.getProductDetail(req.params.slug);
      if (!detail) return res.status(404).json({ error: 'Product not found.' });
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/stores/:slug', async (req, res, next) => {
    try {
      const detail = await repo.getStorefrontDetail(req.params.slug);
      if (!detail) return res.status(404).json({ error: 'Storefront not found.' });
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pages/:slug', async (req, res, next) => {
    try {
      const page = await repo.getPageBySlug(req.params.slug);
      if (!page) return res.status(404).json({ error: 'Page not found.' });
      res.json({ page });
    } catch (err) {
      next(err);
    }
  });

  // --- Production Auth & Session Endpoints (Cookie + CSRF + 2FA) ---
  app.get('/api/auth/me', async (req, res, next) => {
    try {
      if (!req.authUser) return res.json({ user: null });
      const [cart, wishlist] = await Promise.all([
        repo.getUserCart(req.authUser.id),
        repo.getUserWishlist(req.authUser.id),
      ]);
      res.json({
        user: {
          id: req.authUser.id,
          name: req.authUser.name,
          email: req.authUser.email,
          phone: req.authUser.phone,
          roleKey: req.authUser.roleKey,
          sellerId: req.authUser.sellerId,
          totpEnabled: req.authUser.totpEnabled,
          preferredLocale: req.authUser.preferredLocale,
          preferredCurrency: req.authUser.preferredCurrency,
          permissions: req.authUser.permissions,
        },
        cart,
        wishlist,
      });
    } catch (err) {
      next(err);
    }
  });

  const RegisterSchema = z.object({
    name: z.string().min(2).max(140),
    email: z.string().email().max(180),
    phone: z.string().min(7).max(40),
    password: z.string().min(8).max(128),
    locale: z.enum(['en', 'ar']).optional(),
  });

  app.post('/api/auth/register', rateLimit(15, 60_000), async (req, res) => {
    try {
      const body = validateBody(RegisterSchema, req.body);
      const user = await repo.registerCustomer({ ...body, ipAddress: getClientIp(req) });
      const ses = await createSession(db, user.id, req);
      setSessionCookies(req, res, ses.rawToken, ses.csrfToken);
      res.status(201).json({
        user: { ...user, totpEnabled: false, preferredLocale: body.locale || 'en', preferredCurrency: 'USD', permissions: [] },
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    totpCode: z.string().optional(),
  });

  app.post('/api/auth/login', rateLimit(20, 60_000), async (req, res) => {
    try {
      const body = validateBody(LoginSchema, req.body);
      const logged = await repo.loginUser({ ...body, ipAddress: getClientIp(req) });
      const ses = await rotateSession(db, req.authUser?.sessionId, logged.id, req);
      setSessionCookies(req, res, ses.rawToken, ses.csrfToken);
      const fullUser = await getSessionUser(db, ses.rawToken);
      res.json({ user: fullUser });
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    if (req.authUser) {
      await revokeSession(db, req.authUser.sessionId);
    }
    clearSessionCookies(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout-all', requireAuth, async (req, res) => {
    await revokeAllUserSessions(db, req.authUser!.id);
    clearSessionCookies(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/2fa/enroll', requireAuth, async (req, res) => {
    try {
      const result = await repo.startTotpEnrollment(req.authUser!.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/2fa/verify', requireAuth, async (req, res) => {
    try {
      const { code } = validateBody(z.object({ code: z.string().min(6).max(10) }), req.body);
      const result = await repo.confirmTotpEnrollment(req.authUser!.id, code);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- First-Run Super Admin Setup (One-Time Token from Server Logs) ---
  app.get('/api/admin/auth-status', async (_req, res, next) => {
    try {
      res.json(await repo.getAdminSetupStatus());
    } catch (err) {
      next(err);
    }
  });

  const InitialAdminSetupSchema = z.object({
    setupToken: z.string().min(16),
    name: z.string().min(2).max(140),
    email: z.string().email(),
    phone: z.string().min(7).max(40),
    password: z.string().min(8).max(128),
  });

  app.post('/api/admin/initial-setup', rateLimit(10, 60_000), async (req, res) => {
    try {
      const body = validateBody(InitialAdminSetupSchema, req.body);
      const created = await repo.setupInitialAdmin({ ...body, ipAddress: getClientIp(req) });
      const ses = await createSession(db, created.userId, req);
      setSessionCookies(req, res, ses.rawToken, ses.csrfToken);
      const fullUser = await getSessionUser(db, ses.rawToken);
      res.status(201).json({
        user: fullUser,
        totpSecret: created.totpSecret,
        otpauthUri: created.otpauthUri,
      });
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  });

  // --- Protected Media Uploads ---
  const UploadSchema = z.object({
    base64Data: z.string().min(10),
    mimeType: z.string().min(5).max(80),
    entityType: z.enum(['product_image', 'store_logo', 'store_banner', 'seller_document', 'editorial_image']),
    entityId: z.string().optional(),
    docType: z.string().optional(),
  });

  app.post('/api/uploads', requireAuth, rateLimit(30, 60_000), async (req, res) => {
    try {
      const body = validateBody(UploadSchema, req.body);
      const saved = await saveUploadedMedia(db, {
        base64Data: body.base64Data,
        mimeType: body.mimeType,
        entityType: body.entityType,
        entityId: body.entityId,
        ownerUserId: req.authUser!.id,
      });
      if (body.entityType === 'seller_document' && req.authUser!.sellerId) {
        await repo.attachSellerDocument(req.authUser!.sellerId, body.docType || 'commercial_registration', saved.mediaId);
      }
      res.status(201).json({ media: saved });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Customer Cart & Wishlist Persistence ---
  app.put('/api/account/cart', requireAuth, async (req, res, next) => {
    try {
      const body = validateBody(
        z.object({
          items: z.array(
            z.object({
              productId: z.string().min(1),
              variantId: z.string().min(1),
              quantity: z.number().int().min(1).max(99),
            })
          ),
        }),
        req.body
      );
      await repo.saveUserCart(req.authUser!.id, body.items);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/account/wishlist/toggle', requireAuth, async (req, res) => {
    try {
      const body = validateBody(z.object({ productId: z.string().min(1) }), req.body);
      const result = await repo.toggleUserWishlist(req.authUser!.id, body.productId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Cart Coupon Validation, Checkout & Order Tracking ---
  app.post('/api/coupons/validate', async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          code: z.string().min(2),
          subtotalUsdCents: z.number().int().nonnegative(),
          sellerIds: z.array(z.string()),
        }),
        req.body
      );
      const coupon = await repo.validateCoupon(body.code, body.subtotalUsdCents, body.sellerIds);
      res.json({ coupon });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const OrderCreateSchema = z.object({
    customerName: z.string().min(2).max(140),
    customerPhone: z.string().min(7).max(40),
    governorate: z.string().min(2).max(60),
    district: z.string().min(2).max(60),
    town: z.string().min(1).max(100),
    addressNotes: z.string().max(500).default(''),
    paymentMethod: z.enum(['cod', 'whish_manual', 'card']),
    transferReference: z.string().optional(),
    couponCode: z.string().optional(),
    items: z.array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      })
    ).min(1),
  });

  app.post('/api/orders', rateLimit(15, 60_000), async (req, res) => {
    try {
      const body = validateBody(OrderCreateSchema, req.body);
      const order = await repo.createOrder(
        {
          userId: req.authUser?.id || null,
          ...body,
        },
        getClientIp(req)
      );
      res.status(201).json({ order });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/orders/lookup', async (req, res, next) => {
    try {
      const orders = await repo.lookupOrders({
        user: req.authUser,
        orderNumber: String(req.query.orderNumber || ''),
        phone: String(req.query.phone || ''),
      });
      res.json({ orders });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/reviews', requireAuth, async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          productId: z.string().min(1),
          rating: z.number().int().min(1).max(5),
          comment: z.string().min(4).max(1000),
        }),
        req.body
      );
      const review = await repo.addVerifiedReview({
        productId: body.productId,
        userId: req.authUser!.id,
        rating: body.rating,
        comment: body.comment,
      });
      res.status(201).json({ review });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Seller Registration & Seller Dashboard ---
  const SellerRegisterSchema = z.object({
    ownerName: z.string().min(2).max(140),
    email: z.string().email(),
    phone: z.string().min(7).max(40),
    password: z.string().min(8).max(128),
    storeNameEn: z.string().min(2).max(140),
    storeNameAr: z.string().optional(),
    department: z.enum(['fashion', 'electronics', 'home-gadgets']),
    governorate: z.string().min(2),
    district: z.string().min(2),
    commercialRegRef: z.string().min(3).max(120),
    payoutMethod: z.enum(['whish', 'omt', 'bank']),
    payoutAccount: z.string().min(4).max(180),
  });

  app.post('/api/sellers/register', rateLimit(10, 60_000), async (req, res) => {
    try {
      const body = validateBody(SellerRegisterSchema, req.body);
      const result = await repo.registerSeller({ ...body, ipAddress: getClientIp(req) });
      const ses = await createSession(db, result.user.id, req);
      setSessionCookies(req, res, ses.rawToken, ses.csrfToken);
      const fullUser = await getSessionUser(db, ses.rawToken);
      res.status(201).json({ user: fullUser, seller: result.seller });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/seller/workspace', requireSeller, async (req, res, next) => {
    try {
      const targetSellerId =
        isAdminRole(req.authUser!.roleKey) && req.query.sellerId
          ? String(req.query.sellerId)
          : req.authUser!.sellerId;
      if (!targetSellerId) return res.status(400).json({ error: 'Seller ID required.' });
      res.json(await repo.getSellerWorkspace(targetSellerId));
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/seller/profile', requireSeller, async (req, res) => {
    try {
      const sellerId = req.authUser!.sellerId!;
      const body = validateBody(
        z.object({
          taglineEn: z.string().max(190).optional(),
          taglineAr: z.string().max(190).optional(),
          aboutEn: z.string().max(1500).optional(),
          aboutAr: z.string().max(1500).optional(),
          storefrontTheme: z.enum(['obsidian-ember', 'sand-atelier', 'cyan-lab', 'sage-studio']).optional(),
          deliveryMode: z.enum(['platform', 'self']).optional(),
          bannerMediaId: z.string().optional(),
          logoMediaId: z.string().optional(),
        }),
        req.body
      );
      const seller = await repo.updateSellerProfile(sellerId, req.authUser!.id, body, getClientIp(req));
      res.json({ seller });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/seller/products', requireSeller, async (req, res) => {
    try {
      const sellerId = req.authUser!.sellerId!;
      const body = validateBody(
        z.object({
          titleEn: z.string().min(2).max(180),
          titleAr: z.string().optional(),
          subtitleEn: z.string().optional(),
          subtitleAr: z.string().optional(),
          descriptionEn: z.string().optional(),
          descriptionAr: z.string().optional(),
          basePriceUsdCents: z.number().int().positive(),
          compareAtUsdCents: z.number().int().positive().nullable().optional(),
          department: z.enum(['fashion', 'electronics', 'home-gadgets']).optional(),
          sku: z.string().min(2).max(80),
          size: z.string().optional(),
          color: z.string().optional(),
          colorHex: z.string().optional(),
          stock: z.number().int().min(0).max(100000),
          mediaIds: z.array(z.string()).optional(),
          published: z.boolean().optional(),
        }),
        req.body
      );
      const product = await repo.createSellerProduct(sellerId, req.authUser!.id, body, getClientIp(req));
      res.status(201).json({ product });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/seller/products/:id/toggle', requireSeller, async (req, res) => {
    try {
      const product = await repo.toggleProductPublished(
        req.authUser!.sellerId!,
        req.params.id,
        req.authUser!.id,
        getClientIp(req)
      );
      res.json({ product });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/seller/sub-orders/:id', requireSeller, async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          status: z.enum(['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled']).optional(),
          codCollected: z.boolean().optional(),
          courierName: z.string().optional(),
          trackingCode: z.string().optional(),
        }),
        req.body
      );
      const subOrder = await repo.updateSubOrderStatus(req.params.id, req.authUser!, body, getClientIp(req));
      res.json({ subOrder });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/seller/coupons', requireSeller, async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          code: z.string().min(3).max(40),
          discountPercent: z.number().int().min(1).max(80),
          minOrderUsdCents: z.number().int().min(0).optional(),
        }),
        req.body
      );
      const coupon = await repo.createCoupon(req.authUser!.sellerId!, req.authUser!.id, body, getClientIp(req));
      res.status(201).json({ coupon });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/seller/payouts', requireSeller, async (req, res) => {
    try {
      const body = validateBody(z.object({ amountUsdCents: z.number().int().min(1000) }), req.body);
      const payout = await repo.requestPayout(
        req.authUser!.sellerId!,
        req.authUser!.id,
        body.amountUsdCents,
        getClientIp(req)
      );
      res.status(201).json({ payout });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/seller/reviews/:id/reply', requireSeller, async (req, res) => {
    try {
      const body = validateBody(z.object({ reply: z.string().min(2).max(1000) }), req.body);
      const review = await repo.replyToReview(req.authUser!.sellerId!, req.params.id, body.reply);
      res.json({ review });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/seller/offers', requireSeller, async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          titleEn: z.string().min(2).max(140),
          titleAr: z.string().max(140).optional(),
          offerType: z.enum(['percent', 'fixed_usd_cents', 'flash_percent']),
          discountValue: z.number().int().positive(),
          targetType: z.enum(['seller', 'product']),
          targetId: z.string().nullable().optional(),
          startsAt: z.string().nullable().optional(),
          endsAt: z.string().nullable().optional(),
        }),
        req.body
      );
      const offer = await repo.sellerProposeOffer(
        req.authUser!.sellerId!,
        req.authUser!.id,
        {
          title: { en: body.titleEn.trim(), ar: (body.titleAr || body.titleEn).trim() },
          offerType: body.offerType,
          discountValue: body.discountValue,
          targetType: body.targetType,
          targetId: body.targetId ?? null,
          startsAt: body.startsAt ?? null,
          endsAt: body.endsAt ?? null,
        },
        getClientIp(req)
      );
      res.status(201).json({ offer });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Admin Console Endpoints (Granular Permissions Enforced) ---
  app.get('/api/admin/overview', requireAdminPerm(), async (_req, res, next) => {
    try {
      res.json(await repo.getAdminOverview());
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/admin/sellers/:id', requireAdminPerm('sellers.approve'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          status: z.enum(['draft', 'pending', 'approved', 'rejected', 'suspended']).optional(),
          verified: z.boolean().optional(),
          customCommissionBps: z.number().int().min(0).max(5000).nullable().optional(),
          subscriptionTier: z.enum(['free', 'basic', 'pro']).optional(),
        }),
        req.body
      );
      const seller = await repo.adminUpdateSeller(req.params.id, req.authUser!.id, body, getClientIp(req));
      res.json({ seller });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/admin/settings', requireAdminPerm('settings.manage'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          platform: z
            .object({
              exchangeRateLbpPerUsd: z.number().int().min(1500).optional(),
              defaultCommissionBps: z.number().int().min(0).max(5000).optional(),
              codFeeUsdCents: z.number().int().min(0).optional(),
              holdPeriodDays: z.number().int().min(0).max(30).optional(),
              announcement: z.object({ en: z.string().max(240), ar: z.string().max(240) }).optional(),
            })
            .optional(),
          payments: z
            .object({
              codEnabled: z.boolean().optional(),
              whishManualEnabled: z.boolean().optional(),
              whishAccountNumber: z.string().max(80).optional(),
              whishInstructions: z.object({ en: z.string().max(400), ar: z.string().max(400) }).optional(),
              cardEnabled: z.boolean().optional(),
            })
            .optional(),
        }),
        req.body
      );
      const updated = await repo.adminUpdateSettings(req.authUser!.id, body, getClientIp(req));
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/payouts/:id/settle', requireAdminPerm('payouts.release'), async (req, res) => {
    try {
      const body = validateBody(z.object({ referenceCode: z.string().min(3).max(100) }), req.body);
      const payout = await repo.adminSettlePayout(req.params.id, req.authUser!.id, body.referenceCode, getClientIp(req));
      res.json({ payout });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/ledger/release-holds', requireAdminPerm('payouts.release'), async (req, res) => {
    const releasedCount = await repo.releaseHoldsNow(req.authUser!.id, getClientIp(req));
    res.json({ releasedCount });
  });

  app.post('/api/admin/orders/:id/verify-payment', requireAdminPerm('orders.manage'), async (req, res) => {
    try {
      const body = validateBody(z.object({ status: z.enum(['paid', 'failed']) }), req.body);
      const order = await repo.adminVerifyOrderPayment(req.params.id, req.authUser!.id, body.status, getClientIp(req));
      res.json({ order });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/coupons', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          code: z.string().min(3).max(40),
          discountPercent: z.number().int().min(1).max(80),
          minOrderUsdCents: z.number().int().min(0).optional(),
        }),
        req.body
      );
      const coupon = await repo.createCoupon(null, req.authUser!.id, body, getClientIp(req));
      res.status(201).json({ coupon });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/admin/pages/:slug', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          titleEn: z.string().min(2).max(160).optional(),
          titleAr: z.string().min(2).max(160).optional(),
          bodyEn: z.string().min(2).max(20000).optional(),
          bodyAr: z.string().min(2).max(20000).optional(),
          published: z.boolean().optional(),
        }),
        req.body
      );
      const page = await repo.adminUpdatePage(req.params.slug, req.authUser!.id, body, getClientIp(req));
      res.json({ page });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Phase B: Admin Home Sections Builder, Offer Banners & Promotions ---
  const HomeSectionTypeSchema = z.enum([
    'hero_split',
    'trust_strip',
    'departments_bento',
    'dynamic_products_grid',
    'verified_stores_grid',
    'category_spotlight',
    'flash_deals_countdown',
    'promo_announcement_split',
    'brand_manifesto_band',
    'seller_recruitment_cta',
    'governorates_coverage_grid',
    'comparison_table',
    'newsletter_dispatch',
    'faq_accordion',
    'custom_rich_editorial',
  ]);
  const HomeSectionStatusSchema = z.enum(['draft', 'published', 'archived']);
  const HomeSectionAudienceSchema = z.enum(['all', 'guest', 'logged_in', 'arabic', 'english']);

  app.get('/api/admin/home-sections', requireAdminPerm('content.manage'), async (_req, res, next) => {
    try {
      res.json(await repo.adminListHomeSections());
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/admin/home-sections', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          sectionType: HomeSectionTypeSchema,
          title: z.object({ en: z.string().min(1).max(200), ar: z.string().min(1).max(200) }),
          content: z.record(z.string(), z.unknown()).default({}),
          status: HomeSectionStatusSchema.optional(),
          audience: HomeSectionAudienceSchema.optional(),
          startsAt: z.string().nullable().optional(),
          endsAt: z.string().nullable().optional(),
        }),
        req.body
      );
      const section = await repo.adminCreateHomeSection(req.authUser!.id, body, getClientIp(req));
      res.status(201).json({ section });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/home-sections/reorder', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      const body = validateBody(z.object({ orderedIds: z.array(z.string().min(1)).min(1) }), req.body);
      const sections = await repo.adminReorderHomeSections(body.orderedIds, req.authUser!.id, getClientIp(req));
      res.json({ sections });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/admin/home-sections/:id', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          sectionType: HomeSectionTypeSchema.optional(),
          title: z.object({ en: z.string().min(1).max(200), ar: z.string().min(1).max(200) }).optional(),
          content: z.record(z.string(), z.unknown()).optional(),
          status: HomeSectionStatusSchema.optional(),
          audience: HomeSectionAudienceSchema.optional(),
          startsAt: z.string().nullable().optional(),
          endsAt: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
        }),
        req.body
      );
      const section = await repo.adminUpdateHomeSection(req.params.id, req.authUser!.id, body, getClientIp(req));
      res.json({ section });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/home-sections/:id/rollback', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      const body = validateBody(z.object({ versionId: z.string().min(1) }), req.body);
      const section = await repo.adminRollbackHomeSection(req.params.id, body.versionId, req.authUser!.id, getClientIp(req));
      res.json({ section });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/admin/home-sections/:id', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      await repo.adminDeleteHomeSection(req.params.id, req.authUser!.id, getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const BannerPagesSchema = z.array(z.enum(['home', 'catalog', 'checkout', 'store'])).min(1);
  const BannerBgSchema = z.enum(['graphite', 'ember', 'cedar', 'gold', 'cyan', 'sand']);

  app.post('/api/admin/banners', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          title: z.object({ en: z.string().min(2).max(240), ar: z.string().min(1).max(240) }),
          ctaLabel: z.object({ en: z.string().max(80), ar: z.string().max(80) }).optional(),
          bgToken: BannerBgSchema.default('graphite'),
          targetUrl: z.string().min(1).max(400).default('/catalog'),
          pages: BannerPagesSchema.default(['home']),
          priority: z.number().int().min(0).max(1000).optional(),
          startsAt: z.string().nullable().optional(),
          endsAt: z.string().nullable().optional(),
          active: z.boolean().optional(),
        }),
        req.body
      );
      const banner = await repo.adminCreateBanner(req.authUser!.id, body, getClientIp(req));
      res.status(201).json({ banner });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/admin/banners/:id', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          title: z.object({ en: z.string().min(2).max(240), ar: z.string().min(1).max(240) }).optional(),
          ctaLabel: z.object({ en: z.string().max(80), ar: z.string().max(80) }).optional(),
          bgToken: BannerBgSchema.optional(),
          targetUrl: z.string().min(1).max(400).optional(),
          pages: BannerPagesSchema.optional(),
          priority: z.number().int().min(0).max(1000).optional(),
          startsAt: z.string().nullable().optional(),
          endsAt: z.string().nullable().optional(),
          active: z.boolean().optional(),
        }),
        req.body
      );
      const banner = await repo.adminUpdateBanner(req.params.id, req.authUser!.id, body, getClientIp(req));
      res.json({ banner });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/admin/banners/:id', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      await repo.adminDeleteBanner(req.params.id, req.authUser!.id, getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/offers', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          title: z.object({ en: z.string().min(2).max(160), ar: z.string().min(1).max(160) }),
          offerType: z.enum(['percent', 'fixed_usd_cents', 'flash_percent']),
          discountValue: z.number().int().positive(),
          targetType: z.enum(['all', 'department', 'category', 'seller', 'product']),
          targetId: z.string().nullable().optional(),
          startsAt: z.string().nullable().optional(),
          endsAt: z.string().nullable().optional(),
          active: z.boolean().optional(),
        }),
        req.body
      );
      const offer = await repo.adminCreateOffer(req.authUser!.id, body, getClientIp(req));
      res.status(201).json({ offer });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/admin/offers/:id', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
          active: z.boolean().optional(),
        }),
        req.body
      );
      const offer = await repo.adminUpdateOffer(req.params.id, req.authUser!.id, body, getClientIp(req));
      res.json({ offer });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/admin/offers/:id', requireAdminPerm('content.manage'), async (req, res) => {
    try {
      await repo.adminDeleteOffer(req.params.id, req.authUser!.id, getClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/staff', requireAdminPerm('users.manage'), async (req, res) => {
    try {
      const body = validateBody(
        z.object({
          name: z.string().min(2).max(140),
          email: z.string().email(),
          phone: z.string().min(7).max(40),
          password: z.string().min(8).max(128),
          permissions: z.array(z.string()).min(1),
        }),
        req.body
      );
      const created = await repo.createAdminStaff({
        actorUserId: req.authUser!.id,
        ...body,
        ipAddress: getClientIp(req),
      });
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/admin/reports/export', requireAdminPerm('orders.manage'), async (_req, res, next) => {
    try {
      const overview = await repo.getAdminOverview();
      const rows = [
        ['OrderNumber', 'Date', 'Governorate', 'PaymentMethod', 'PaymentStatus', 'SubtotalUSD', 'CommissionUSD', 'DeliveryUSD'],
        ...overview.orders.map((o) => {
          const commission = o.subOrders.reduce((sum, s) => sum + s.commissionUsdCents, 0);
          return [
            o.orderNumber,
            o.createdAt,
            o.governorate,
            o.paymentMethod,
            o.paymentStatus,
            (o.subtotalUsdCents / 100).toFixed(2),
            (commission / 100).toFixed(2),
            (o.deliveryTotalUsdCents / 100).toFixed(2),
          ];
        }),
      ];
      res.type('text/csv').send(rows.map((r) => r.join(',')).join('\n'));
    } catch (err) {
      next(err);
    }
  });

  // Central Error Logger & Clean Error Envelope (no stack traces to client)
  app.use(async (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    await repo.logError(req.path, err);
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error.' : (err as Error).message || 'Server error';
    res.status(500).json({ error: message, requestId: req.requestId });
  });

  const port = Number(process.env.PORT || 3000);
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`NileLink production server running on http://0.0.0.0:${port}`);
  });
}

createApp().catch((err) => {
  console.error('[FATAL] Failed to start NileLink server:', err);
  process.exit(1);
});
