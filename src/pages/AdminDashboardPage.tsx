import React, { useCallback, useEffect, useState } from 'react';
import { Download, KeyRound, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import type {
  AuditLogEntry,
  Category,
  Coupon,
  DeliveryZone,
  FeaturedPlacement,
  HomeSection,
  HomeSectionVersion,
  LedgerEntry,
  MarketingPopup,
  Offer,
  OfferBanner,
  Order,
  PageContent,
  PaymentConfig,
  PayoutRequest,
  PlatformSettings,
  Seller,
  SubscriptionPlan,
} from '../shared/types.ts';
import { formatBpsAsPercent } from '../shared/money.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, PriceDisplay, SectionHeading, StatusLabel } from '../components/HairlineUI.tsx';
import { AdminHomeBuilderTab } from '../components/AdminHomeBuilderTab.tsx';
import { AdminPromotionsTab } from '../components/AdminPromotionsTab.tsx';

interface AdminOverviewPayload {
  metrics: {
    totalGmvUsdCents: number;
    totalCommissionUsdCents: number;
    activeSubsUsdCents: number;
    ordersCount: number;
    sellersCount: number;
    productsCount: number;
  };
  settings: PlatformSettings;
  paymentsConfig: PaymentConfig;
  categories: Category[];
  sellers: Seller[];
  orders: Order[];
  payouts: PayoutRequest[];
  coupons: Coupon[];
  deliveryZones: DeliveryZone[];
  subscriptionPlans: SubscriptionPlan[];
  ledger: LedgerEntry[];
  pages: PageContent[];
  homeSections: HomeSection[];
  homeSectionVersions: Record<string, HomeSectionVersion[]>;
  banners: OfferBanner[];
  popups: MarketingPopup[];
  featuredPlacements: FeaturedPlacement[];
  offers: Offer[];
  auditLog: AuditLogEntry[];
  staffUsers: Array<{
    id: string;
    name: string;
    email: string;
    roleKey: string;
    totpEnabled: boolean;
    permissions: string[];
  }>;
  recentJobs: Array<{ id: string; job_type: string; status: string; attempts: number; last_error: string | null }>;
  emailLog: Array<{ id: string; recipient_email: string; template_key: string; status: string; error_message: string | null }>;
  errorLog: Array<{ id: string; route: string; message: string; created_at: string }>;
}

const ALL_ADMIN_PERMS = [
  'sellers.approve',
  'products.approve',
  'orders.manage',
  'payouts.release',
  'content.manage',
  'home.edit',
  'home.publish',
  'marketing.manage',
  'marketing.view',
  'settings.manage',
  'users.manage',
];

export function AdminDashboardPage() {
  const { authUser, refreshAuth, apiFetch, showToast, refreshBootstrap } = useMarketplace();

  const [authStatus, setAuthStatus] = useState<{ hasSuperAdmin: boolean; setupTokenPending: boolean } | null>(null);
  const [setupToken, setSetupToken] = useState('');
  const [setupName, setSetupName] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPhone, setSetupPhone] = useState('+961 ');
  const [setupPassword, setSetupPassword] = useState('');
  const [enrolledTotp, setEnrolledTotp] = useState<{ secret: string; otpauthUri: string } | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginTotp, setLoginTotp] = useState('');

  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null);
  const [tab, setTab] = useState<
    'sellers' | 'orders' | 'payouts' | 'home-builder' | 'promotions' | 'pages' | 'settings' | 'security'
  >('sellers');

  const [rateInput, setRateInput] = useState('89500');
  const [defaultCommPct, setDefaultCommPct] = useState('10');
  const [codFeeUsd, setCodFeeUsd] = useState('1.50');
  const [annEn, setAnnEn] = useState('');
  const [annAr, setAnnAr] = useState('');
  const [whishAcc, setWhishAcc] = useState('');
  const [whishInstrEn, setWhishInstrEn] = useState('');
  const [whishInstrAr, setWhishInstrAr] = useState('');

  const [payoutRefs, setPayoutRefs] = useState<Record<string, string>>({});
  const [sellerCommDrafts, setSellerCommDrafts] = useState<Record<string, string>>({});
  const [pageDrafts, setPageDrafts] = useState<Record<string, { bodyEn: string; bodyAr: string }>>({});

  // Staff creator state
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('+961 ');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffPerms, setStaffPerms] = useState<string[]>(['sellers.approve', 'orders.manage']);
  const [staffTotpResult, setStaffTotpResult] = useState<{ email: string; secret: string } | null>(null);

  const isAdminAccount = authUser && (authUser.roleKey === 'admin_super' || authUser.roleKey === 'admin_staff');

  useEffect(() => {
    fetch('/api/admin/auth-status', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setAuthStatus(d))
      .catch(() => {});
  }, []);

  const loadOverview = useCallback(async () => {
    if (!isAdminAccount) return;
    try {
      const data = await apiFetch<AdminOverviewPayload>('/api/admin/overview');
      setOverview(data);
      setRateInput(String(data.settings.exchangeRateLbpPerUsd));
      setDefaultCommPct(String(data.settings.defaultCommissionBps / 100));
      setCodFeeUsd((data.settings.codFeeUsdCents / 100).toFixed(2));
      setAnnEn(data.settings.announcement?.en || '');
      setAnnAr(data.settings.announcement?.ar || '');
      setWhishAcc(data.paymentsConfig.whishAccountNumber || '');
      setWhishInstrEn(data.paymentsConfig.whishInstructions?.en || '');
      setWhishInstrAr(data.paymentsConfig.whishInstructions?.ar || '');
      const pgMap: Record<string, { bodyEn: string; bodyAr: string }> = {};
      for (const p of data.pages) {
        pgMap[p.slug] = { bodyEn: p.body.en, bodyAr: p.body.ar };
      }
      setPageDrafts(pgMap);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [isAdminAccount, apiFetch, showToast]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ totpSecret: string; otpauthUri: string }>('/api/admin/initial-setup', {
        method: 'POST',
        body: JSON.stringify({
          setupToken,
          name: setupName,
          email: setupEmail,
          phone: setupPhone,
          password: setupPassword,
        }),
      });
      setEnrolledTotp({ secret: res.totpSecret, otpauthUri: res.otpauthUri });
      await refreshAuth();
      showToast('Super Admin created with mandatory 2FA', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword, totpCode: loginTotp }),
      });
      await refreshAuth();
      showToast('Admin console unlocked', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  if (!isAdminAccount) {
    return (
      <div className="max-w-lg mx-auto px-4 md:px-8 py-14">
        <div className="border border-[var(--line)] bg-[var(--graphite)] p-8 space-y-5">
          <div className="flex items-center gap-2.5 text-[var(--ember)]">
            <Lock className="w-5 h-5" />
            <span className="text-xs font-mono-tabular uppercase tracking-wider">Platform Governance · 2FA Enforced</span>
          </div>

          {authStatus && !authStatus.hasSuperAdmin ? (
            <>
              <h1 className="font-display text-3xl font-bold text-[var(--bone)]">First-Run Super Admin Setup</h1>
              <p className="text-sm text-[var(--muted)]">
                Enter the one-time setup token printed to the server startup logs to create the initial Super Admin with mandatory TOTP 2FA.
              </p>
              <form onSubmit={handleInitialSetup} className="space-y-3 text-xs">
                <input
                  required
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  placeholder="One-Time Setup Token (from server log)"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm font-mono-tabular text-[var(--bone)]"
                />
                <input
                  required
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  placeholder="Admin Full Name"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                />
                <input
                  required
                  type="email"
                  value={setupEmail}
                  onChange={(e) => setSetupEmail(e.target.value)}
                  placeholder="Admin Email"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                />
                <input
                  required
                  value={setupPhone}
                  onChange={(e) => setSetupPhone(e.target.value)}
                  placeholder="Phone (+961 ...)"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm font-mono-tabular text-[var(--bone)]"
                />
                <input
                  required
                  type="password"
                  minLength={8}
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  placeholder="Strong Password (8+ chars, letters + numbers)"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                />
                <button
                  type="submit"
                  className="w-full py-3 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Create Super Admin & Generate 2FA Secret
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold text-[var(--bone)]">Admin Console Sign-In</h1>
              <p className="text-sm text-[var(--muted)]">
                Enter your email, password, and 6-digit Authenticator 2FA code.
              </p>
              <form onSubmit={handleAdminLogin} className="space-y-3">
                <input
                  required
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Admin Email"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                />
                <input
                  required
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                />
                <input
                  required
                  value={loginTotp}
                  onChange={(e) => setLoginTotp(e.target.value)}
                  placeholder="6-Digit 2FA Code"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm font-mono-tabular text-[var(--bone)]"
                />
                <button
                  type="submit"
                  className="w-full py-3 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Verify 2FA & Unlock Console
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-12">
        <div className="hairline-cell h-64 animate-pulse border border-[var(--line)]" />
      </div>
    );
  }

  const handleDownloadCsv = async () => {
    const res = await fetch('/api/admin/reports/export', { credentials: 'include' });
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nilelink-gmv-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-6">
      {enrolledTotp && (
        <div className="border border-[var(--cedar)] bg-[var(--graphite)] p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono-tabular uppercase text-[var(--cedar)] inline-flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" /> Save Your 2FA Authenticator Key Now
            </p>
            <button
              type="button"
              onClick={() => setEnrolledTotp(null)}
              className="text-xs text-[var(--muted)] underline cursor-pointer"
            >
              I saved it
            </button>
          </div>
          <p className="text-xs text-[var(--bone)] font-mono-tabular break-all">
            Secret: <strong>{enrolledTotp.secret}</strong>
          </p>
          <p className="text-[11px] text-[var(--muted)] font-mono-tabular break-all">{enrolledTotp.otpauthUri}</p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          title="NileLink Admin Console"
          subtitle={`Signed in as ${authUser.name} (${authUser.roleKey}) · All mutations logged to audit_log.`}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              const res = await apiFetch<{ releasedCount: number }>('/api/admin/ledger/release-holds', {
                method: 'POST',
              });
              showToast(`Released ${res.releasedCount} delivered ledger hold(s)`, 'success');
              await loadOverview();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[var(--cedar)] text-xs font-semibold text-[var(--cedar)] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Release Delivered Holds</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadCsv()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[var(--line)] text-xs font-semibold text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export GMV CSV</span>
          </button>
        </div>
      </div>

      <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className="hairline-cell p-5">
          <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">Gross Merchandise Value</p>
          <div className="mt-2">
            <PriceDisplay usdCents={overview.metrics.totalGmvUsdCents} size="lg" />
          </div>
        </div>
        <div className="hairline-cell p-5">
          <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">Platform Commission Earned</p>
          <div className="mt-2">
            <PriceDisplay usdCents={overview.metrics.totalCommissionUsdCents} size="lg" />
          </div>
        </div>
        <div className="hairline-cell p-5">
          <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">Monthly Subscription MRR</p>
          <div className="mt-2">
            <PriceDisplay usdCents={overview.metrics.activeSubsUsdCents} size="lg" />
          </div>
        </div>
        <div className="hairline-cell p-5">
          <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">Orders · Sellers · SKUs</p>
          <p className="mt-2 font-mono-tabular text-2xl font-bold text-[var(--bone)]">
            {overview.metrics.ordersCount} · {overview.metrics.sellersCount} · {overview.metrics.productsCount}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'sellers' as const, label: `Sellers (${overview.sellers.length})` },
          { id: 'orders' as const, label: `Orders (${overview.orders.length})` },
          { id: 'payouts' as const, label: `Payouts (${overview.payouts.length})` },
          { id: 'home-builder' as const, label: `Home Builder (${overview.homeSections.length})` },
          {
            id: 'promotions' as const,
            label: `Marketing Hub (${
              overview.banners.length +
              (overview.popups?.length || 0) +
              (overview.featuredPlacements?.length || 0) +
              overview.offers.length
            })`,
          },
          { id: 'pages' as const, label: `Legal & Pages (${overview.pages.length})` },
          { id: 'settings' as const, label: 'Rates & Payments' },
          { id: 'security' as const, label: 'RBAC, Audit & Logs' },
        ].map((tItem) => (
          <button
            key={tItem.id}
            type="button"
            onClick={() => setTab(tItem.id)}
            className={`px-4 py-2 text-xs font-semibold border cursor-pointer ${
              tab === tItem.id
                ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                : 'border-[var(--line)] text-[var(--bone)]'
            }`}
          >
            {tItem.label}
          </button>
        ))}
      </div>

      {tab === 'sellers' && (
        <div className="border border-[var(--line)] bg-[var(--graphite)] divide-y divide-[var(--line)]">
          {overview.sellers.length === 0 ? (
            <EmptyState title="No seller applications yet" description="Applications submitted in Seller Hub will appear here for approval." />
          ) : (
            overview.sellers.map((s) => (
              <div key={s.id} className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold text-[var(--bone)]">{s.name.en}</h3>
                    <StatusLabel status={s.status} tone={s.status === 'approved' ? 'cedar' : 'gold'} />
                    {s.verified && (
                      <span className="inline-flex items-center gap-1 text-xs font-mono-tabular text-[var(--cedar)]">
                        <ShieldCheck className="w-3.5 h-3.5" /> Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-mono-tabular text-[var(--muted)]">
                    CR: {s.commercialRegRef} · Plan: {s.subscriptionTier.toUpperCase()} · Custom Rate:{' '}
                    {s.customCommissionBps !== null && s.customCommissionBps !== undefined
                      ? formatBpsAsPercent(s.customCommissionBps)
                      : 'Inherit Category/Default'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={s.status}
                    onChange={async (e) => {
                      await apiFetch(`/api/admin/sellers/${s.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: e.target.value, verified: e.target.value === 'approved' }),
                      });
                      await loadOverview();
                      await refreshBootstrap();
                    }}
                    aria-label="Seller status"
                    className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
                  >
                    <option value="pending">pending</option>
                    <option value="approved">approved</option>
                    <option value="suspended">suspended</option>
                    <option value="rejected">rejected</option>
                  </select>

                  <select
                    value={s.subscriptionTier}
                    onChange={async (e) => {
                      await apiFetch(`/api/admin/sellers/${s.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ subscriptionTier: e.target.value }),
                      });
                      await loadOverview();
                    }}
                    aria-label="Seller subscription tier"
                    className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
                  >
                    <option value="free">Free</option>
                    <option value="basic">Basic ($29/mo)</option>
                    <option value="pro">Pro ($79/mo)</option>
                  </select>

                  <input
                    type="number"
                    step="0.5"
                    placeholder="Custom %"
                    value={sellerCommDrafts[s.id] ?? (s.customCommissionBps != null ? String(s.customCommissionBps / 100) : '')}
                    onChange={(e) => setSellerCommDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                    className="w-24 bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const raw = sellerCommDrafts[s.id];
                      const bps = raw === '' || raw === undefined ? null : Math.round(parseFloat(raw) * 100);
                      await apiFetch(`/api/admin/sellers/${s.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ customCommissionBps: bps }),
                      });
                      showToast('Seller commission updated', 'success');
                      await loadOverview();
                    }}
                    className="px-3 py-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                  >
                    Save %
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          {overview.orders.length === 0 ? (
            <EmptyState title="No orders yet" description="Orders placed through checkout will appear here." />
          ) : (
            overview.orders.map((order) => (
              <div key={order.id} className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="font-mono-tabular text-sm font-bold text-[var(--bone)]">{order.orderNumber}</span>
                    <span className="ms-3 text-xs font-mono-tabular text-[var(--muted)]">
                      {order.paymentMethod.toUpperCase()} · {order.paymentStatus}
                      {order.transferReference ? ` · Ref: ${order.transferReference}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <PriceDisplay usdCents={order.grandTotalUsdCents} size="sm" />
                    {order.paymentStatus === 'pending_verification' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/orders/${order.id}/verify-payment`, {
                            method: 'POST',
                            body: JSON.stringify({ status: 'paid' }),
                          });
                          showToast('Whish/OMT payment verified', 'success');
                          await loadOverview();
                        }}
                        className="px-3 py-1.5 bg-[var(--cedar)] text-[#17181B] text-xs font-bold uppercase cursor-pointer"
                      >
                        Verify Transfer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'payouts' && (
        <div className="border border-[var(--line)] bg-[var(--graphite)] divide-y divide-[var(--line)]">
          {overview.payouts.length === 0 ? (
            <EmptyState title="No payout requests" description="Seller withdrawal requests appear here for manual settlement." />
          ) : (
            overview.payouts.map((pay) => (
              <div key={pay.id} className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-[var(--bone)]">
                    {pay.sellerName.en} · ${(pay.amountUsdCents / 100).toFixed(2)}
                  </p>
                  <p className="text-xs font-mono-tabular text-[var(--muted)]">
                    {pay.method.toUpperCase()} · {pay.accountDetails} · {pay.status}
                  </p>
                </div>
                {pay.status === 'pending' ? (
                  <div className="flex gap-2">
                    <input
                      value={payoutRefs[pay.id] || ''}
                      onChange={(e) => setPayoutRefs((r) => ({ ...r, [pay.id]: e.target.value }))}
                      placeholder="Transfer Ref Code"
                      className="bg-[var(--ink)] border border-[var(--line)] px-3 py-1.5 text-xs font-mono-tabular text-[var(--bone)]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/admin/payouts/${pay.id}/settle`, {
                            method: 'POST',
                            body: JSON.stringify({ referenceCode: payoutRefs[pay.id] || '' }),
                          });
                          showToast('Payout marked as settled', 'success');
                          await loadOverview();
                        } catch (err) {
                          showToast((err as Error).message, 'error');
                        }
                      }}
                      className="px-4 py-1.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
                    >
                      Mark Paid
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-mono-tabular text-[var(--cedar)]">
                    Settled · {pay.referenceCode}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'home-builder' && (
        <AdminHomeBuilderTab
          sections={overview.homeSections}
          versionsBySectionId={overview.homeSectionVersions}
          onReload={loadOverview}
        />
      )}

      {tab === 'promotions' && (
        <AdminPromotionsTab
          banners={overview.banners}
          popups={overview.popups || []}
          featuredPlacements={overview.featuredPlacements || []}
          offers={overview.offers}
          categories={overview.categories}
          sellers={overview.sellers}
          onReload={loadOverview}
        />
      )}

      {tab === 'pages' && (
        <div className="space-y-4">
          {overview.pages.map((pg) => (
            <div key={pg.id} className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-[var(--bone)]">
                  {pg.title.en} (/legal?tab={pg.slug === 'seller-agreement' ? 'seller' : pg.slug})
                </h3>
                <button
                  type="button"
                  onClick={async () => {
                    const draft = pageDrafts[pg.slug];
                    await apiFetch(`/api/admin/pages/${pg.slug}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ bodyEn: draft.bodyEn, bodyAr: draft.bodyAr }),
                    });
                    showToast(`Saved ${pg.slug}`, 'success');
                    await loadOverview();
                  }}
                  className="px-4 py-1.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
                >
                  Save Page
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <textarea
                  rows={4}
                  value={pageDrafts[pg.slug]?.bodyEn || ''}
                  onChange={(e) =>
                    setPageDrafts((m) => ({ ...m, [pg.slug]: { ...m[pg.slug], bodyEn: e.target.value } }))
                  }
                  className="bg-[var(--ink)] border border-[var(--line)] p-3 text-[var(--bone)]"
                />
                <textarea
                  rows={4}
                  dir="rtl"
                  value={pageDrafts[pg.slug]?.bodyAr || ''}
                  onChange={(e) =>
                    setPageDrafts((m) => ({ ...m, [pg.slug]: { ...m[pg.slug], bodyAr: e.target.value } }))
                  }
                  className="bg-[var(--ink)] border border-[var(--line)] p-3 text-[var(--bone)]"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'settings' && (
        <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch('/api/admin/settings', {
                method: 'PATCH',
                body: JSON.stringify({
                  platform: {
                    exchangeRateLbpPerUsd: Number(rateInput),
                    defaultCommissionBps: Math.round(parseFloat(defaultCommPct) * 100),
                    codFeeUsdCents: Math.round(parseFloat(codFeeUsd || '0') * 100),
                    announcement: { en: annEn, ar: annAr },
                  },
                  payments: {
                    whishAccountNumber: whishAcc,
                    whishInstructions: { en: whishInstrEn, ar: whishInstrAr },
                  },
                }),
              });
              showToast('Platform & payment settings saved', 'success');
              await loadOverview();
              await refreshBootstrap();
            }}
            className="hairline-cell lg:col-span-6 p-6 space-y-4"
          >
            <h2 className="font-display text-xl font-bold text-[var(--bone)]">Monetary & Payment Settings</h2>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <label className="block space-y-1">
                <span className="font-mono-tabular text-[var(--muted)]">USD→LBP Rate</span>
                <input
                  type="number"
                  min="1500"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm font-mono-tabular text-[var(--bone)]"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-mono-tabular text-[var(--muted)]">Default Comm %</span>
                <input
                  type="number"
                  step="0.5"
                  value={defaultCommPct}
                  onChange={(e) => setDefaultCommPct(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm font-mono-tabular text-[var(--bone)]"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-mono-tabular text-[var(--muted)]">COD Fee USD</span>
                <input
                  type="number"
                  step="0.25"
                  value={codFeeUsd}
                  onChange={(e) => setCodFeeUsd(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm font-mono-tabular text-[var(--bone)]"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <input
                value={annEn}
                onChange={(e) => setAnnEn(e.target.value)}
                placeholder="Header announcement (EN, optional)"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
              <input
                dir="rtl"
                value={annAr}
                onChange={(e) => setAnnAr(e.target.value)}
                placeholder="شريط الإعلان (عربي - اختياري)"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
            </div>
            <div className="pt-2 border-t border-[var(--line)] space-y-2 text-xs">
              <p className="font-mono-tabular uppercase text-[var(--muted)]">Whish Money / OMT Receiving Account</p>
              <input
                value={whishAcc}
                onChange={(e) => setWhishAcc(e.target.value)}
                placeholder="Live Whish / OMT account number (required to enable Whish checkout)"
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
              />
              <input
                value={whishInstrEn}
                onChange={(e) => setWhishInstrEn(e.target.value)}
                placeholder="Whish instructions (EN)"
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
              <input
                dir="rtl"
                value={whishInstrAr}
                onChange={(e) => setWhishInstrAr(e.target.value)}
                placeholder="تعليمات Whish (AR)"
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
              <p className="text-[11px] font-mono-tabular text-[var(--muted)]">
                Card Gateway Status:{' '}
                {overview.paymentsConfig.cardGatewayConfigured
                  ? 'Configured via environment secrets'
                  : 'Needs my input (set CARD_GATEWAY_PROVIDER / MERCHANT_ID / SECRET_KEY in .env)'}
              </p>
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
            >
              Save Platform Settings
            </button>
          </form>

          <div className="hairline-cell lg:col-span-6 p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-[var(--bone)]">Platform Courier Zones (Lebanon)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono-tabular">
              {overview.deliveryZones.map((z) => (
                <div key={z.governorateCode} className="border border-[var(--line)] bg-[var(--ink)] p-3 flex justify-between">
                  <span className="text-[var(--bone)]">{z.name.en}</span>
                  <span className="text-[var(--muted)]">
                    ${(z.platformFeeUsdCents / 100).toFixed(2)} · {z.etaDays}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-6">
          <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await apiFetch<{ email: string; totpSecret: string }>('/api/admin/staff', {
                    method: 'POST',
                    body: JSON.stringify({
                      name: staffName,
                      email: staffEmail,
                      phone: staffPhone,
                      password: staffPassword,
                      permissions: staffPerms,
                    }),
                  });
                  setStaffTotpResult({ email: res.email, secret: res.totpSecret });
                  setStaffName('');
                  setStaffEmail('');
                  setStaffPassword('');
                  showToast('Admin staff user created with 2FA', 'success');
                  await loadOverview();
                } catch (err) {
                  showToast((err as Error).message, 'error');
                }
              }}
              className="hairline-cell lg:col-span-5 p-6 space-y-3 text-xs"
            >
              <h2 className="font-display text-xl font-bold text-[var(--bone)]">Add Admin Staff (Granular RBAC)</h2>
              <input
                required
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Staff Name"
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
              <input
                required
                type="email"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="Staff Email"
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
              <input
                required
                value={staffPhone}
                onChange={(e) => setStaffPhone(e.target.value)}
                placeholder="Phone (+961 ...)"
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
              />
              <input
                required
                type="password"
                minLength={8}
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="Password (8+ chars, letters + numbers)"
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {ALL_ADMIN_PERMS.map((perm) => {
                  const checked = staffPerms.includes(perm);
                  return (
                    <button
                      key={perm}
                      type="button"
                      onClick={() =>
                        setStaffPerms((list) => (checked ? list.filter((p) => p !== perm) : [...list, perm]))
                      }
                      className={`px-2.5 py-1 border font-mono-tabular cursor-pointer ${
                        checked ? 'border-[var(--cedar)] text-[var(--cedar)]' : 'border-[var(--line)] text-[var(--muted)]'
                      }`}
                    >
                      {perm}
                    </button>
                  );
                })}
              </div>
              {staffTotpResult && (
                <p className="p-2 border border-[var(--cedar)] font-mono-tabular text-[var(--cedar)]">
                  2FA Secret for {staffTotpResult.email}: {staffTotpResult.secret}
                </p>
              )}
              <button
                type="submit"
                className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
              >
                Create Admin Staff
              </button>
            </form>

            <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
              <h2 className="font-display text-xl font-bold text-[var(--bone)]">Immutable Audit Log</h2>
              <div className="max-h-80 overflow-y-auto divide-y divide-[var(--line)] border border-[var(--line)] text-xs font-mono-tabular">
                {overview.auditLog.map((a) => (
                  <div key={a.id} className="p-3 flex flex-wrap justify-between gap-2">
                    <span className="text-[var(--bone)]">
                      {a.action} · {a.entityType}:{a.entityId.slice(0, 14)}
                    </span>
                    <span className="text-[var(--muted)]">{a.createdAt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="hairline-grid grid-cols-1 md:grid-cols-2">
            <div className="hairline-cell p-5 space-y-2">
              <h3 className="text-sm font-bold text-[var(--bone)]">Background Jobs & Email Log</h3>
              <div className="max-h-48 overflow-y-auto text-xs font-mono-tabular space-y-1 text-[var(--muted)]">
                {overview.emailLog.length === 0 ? (
                  <p>No queued email dispatches logged yet.</p>
                ) : (
                  overview.emailLog.map((e) => (
                    <div key={e.id} className="flex justify-between gap-2">
                      <span>{e.template_key} → {e.recipient_email}</span>
                      <span className={e.status === 'sent' ? 'text-[var(--cedar)]' : 'text-[var(--gold)]'}>{e.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="hairline-cell p-5 space-y-2">
              <h3 className="text-sm font-bold text-[var(--bone)]">Server Error Log</h3>
              <div className="max-h-48 overflow-y-auto text-xs font-mono-tabular space-y-1 text-[var(--muted)]">
                {overview.errorLog.length === 0 ? (
                  <p className="text-[var(--cedar)]">No unhandled server errors recorded.</p>
                ) : (
                  overview.errorLog.map((er) => (
                    <div key={er.id}>
                      <span className="text-[var(--ember)]">{er.route}</span>: {er.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
