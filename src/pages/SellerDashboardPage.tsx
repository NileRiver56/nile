import React, { useCallback, useEffect, useState } from 'react';
import { Download, Printer, ShieldCheck, Upload } from 'lucide-react';
import type {
  Coupon,
  DeliveryZone,
  LedgerEntry,
  Offer,
  OfferType,
  PayoutRequest,
  Product,
  Review,
  Seller,
  SellerPromoRules,
  StorefrontThemeId,
  SubOrder,
  SubOrderStatus,
  SubscriptionPlan,
} from '../shared/types.ts';
import { APPROVED_STOREFRONT_THEMES } from '../shared/themes.ts';
import { LEBANON_GOVERNORATES } from '../shared/lebanon.ts';
import { formatBpsAsPercent } from '../shared/money.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, PriceDisplay, SectionHeading, StampBadge, StatusLabel } from '../components/HairlineUI.tsx';

interface SellerSubOrderView extends SubOrder {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  governorate: string;
  district: string;
  town: string;
  paymentMethod: string;
  paymentStatus: string;
}

interface WorkspacePayload {
  seller: Seller;
  products: Product[];
  subOrders: SellerSubOrderView[];
  balance: {
    pendingUsdCents: number;
    availableUsdCents: number;
    reservedForPayoutsUsdCents: number;
    totalGrossUsdCents: number;
    totalCommissionUsdCents: number;
    totalPaidOutUsdCents: number;
    entries: LedgerEntry[];
  };
  payouts: PayoutRequest[];
  coupons: Coupon[];
  offers: Offer[];
  sellerPromoRules?: SellerPromoRules;
  reviews: Review[];
  documents: Array<{ id: string; doc_type: string; review_status: string; public_url: string; created_at: string }>;
  commissionInfo: { bps: number; source: string };
  subscriptionPlans: SubscriptionPlan[];
  deliveryZones: DeliveryZone[];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export function SellerDashboardPage() {
  const { authUser, refreshAuth, apiFetch, showToast, locale, t, navigate, refreshBootstrap } =
    useMarketplace();

  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [tab, setTab] = useState<'overview' | 'products' | 'orders' | 'storefront' | 'coupons'>('overview');
  const [loading, setLoading] = useState(false);

  // Seller Sign-In state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginTotp, setLoginTotp] = useState('');

  // Registration form
  const [regOwner, setRegOwner] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('+961 ');
  const [regPassword, setRegPassword] = useState('');
  const [regStoreEn, setRegStoreEn] = useState('');
  const [regStoreAr, setRegStoreAr] = useState('');
  const [regDept, setRegDept] = useState<'fashion' | 'electronics' | 'home-gadgets'>('fashion');
  const [regGov, setRegGov] = useState('beirut');
  const [regRegRef, setRegRegRef] = useState('');
  const [regPayoutMethod, setRegPayoutMethod] = useState<'whish' | 'omt' | 'bank'>('whish');
  const [regPayoutAcct, setRegPayoutAcct] = useState('');

  // New Product form
  const [pTitleEn, setPTitleEn] = useState('');
  const [pTitleAr, setPTitleAr] = useState('');
  const [pSubEn, setPSubEn] = useState('');
  const [pPriceUsd, setPPriceUsd] = useState('45.00');
  const [pSku, setPSku] = useState('');
  const [pSize, setPSize] = useState('M');
  const [pColor, setPColor] = useState('Charcoal');
  const [pStock, setPStock] = useState('10');
  const [uploadedProductMediaIds, setUploadedProductMediaIds] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Payout & Coupon & Offer & Reply inputs
  const [payoutDollars, setPayoutDollars] = useState('50');
  const [couponCode, setCouponCode] = useState('');
  const [couponPct, setCouponPct] = useState('15');
  const [offerTitleEn, setOfferTitleEn] = useState('');
  const [offerTitleAr, setOfferTitleAr] = useState('');
  const [offerType, setOfferType] = useState<OfferType>('percent');
  const [offerDiscountInput, setOfferDiscountInput] = useState('15');
  const [offerTargetType, setOfferTargetType] = useState<'seller' | 'product'>('seller');
  const [offerTargetProductId, setOfferTargetProductId] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // Storefront edit state
  const [taglineEn, setTaglineEn] = useState('');
  const [aboutEn, setAboutEn] = useState('');
  const [themeId, setThemeId] = useState<StorefrontThemeId>('obsidian-ember');
  const [deliveryMode, setDeliveryMode] = useState<'platform' | 'self'>('platform');

  const isSellerAccount = authUser && (authUser.roleKey === 'seller_owner' || authUser.roleKey === 'seller_staff');

  const loadWorkspace = useCallback(async () => {
    if (!isSellerAccount) return;
    setLoading(true);
    try {
      const data = await apiFetch<WorkspacePayload>('/api/seller/workspace');
      setWorkspace(data);
      setTaglineEn(data.seller.tagline.en);
      setAboutEn(data.seller.about.en);
      setThemeId(data.seller.storefrontTheme);
      setDeliveryMode(data.seller.deliveryMode);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [isSellerAccount, apiFetch, showToast]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSellerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          totpCode: loginTotp.trim() || undefined,
        }),
      });
      await refreshAuth();
      showToast('Signed in to Seller Hub', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleRegisterSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/sellers/register', {
        method: 'POST',
        body: JSON.stringify({
          ownerName: regOwner,
          email: regEmail,
          phone: regPhone,
          password: regPassword,
          storeNameEn: regStoreEn,
          storeNameAr: regStoreAr,
          department: regDept,
          governorate: regGov,
          district: 'achrafieh',
          commercialRegRef: regRegRef,
          payoutMethod: regPayoutMethod,
          payoutAccount: regPayoutAcct,
        }),
      });
      await refreshAuth();
      showToast('Seller application submitted (Pending Admin Approval)', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleMediaUpload = async (
    file: File,
    entityType: 'product_image' | 'seller_document' | 'store_banner'
  ) => {
    setUploadingMedia(true);
    try {
      const base64Data = await readFileAsDataUrl(file);
      const res = await apiFetch<{ media: { mediaId: string; publicUrl: string } }>('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({
          base64Data,
          mimeType: file.type,
          entityType,
          docType: entityType === 'seller_document' ? 'commercial_registration' : undefined,
        }),
      });
      if (entityType === 'product_image') {
        setUploadedProductMediaIds((ids) => [...ids, res.media.mediaId]);
      } else if (entityType === 'store_banner') {
        await apiFetch('/api/seller/profile', {
          method: 'PATCH',
          body: JSON.stringify({ bannerMediaId: res.media.mediaId }),
        });
      }
      showToast('File validated and uploaded securely', 'success');
      if (entityType !== 'product_image') {
        await loadWorkspace();
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploadingMedia(false);
    }
  };

  if (!isSellerAccount) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-8">
        <SectionHeading
          title={t.sellerDashboard}
          subtitle="Sign in to an existing merchant account or apply to launch a verified Lebanese storefront."
        />

        <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
          <form onSubmit={handleSellerLogin} className="hairline-cell lg:col-span-5 p-6 space-y-4">
            <h2 className="font-display text-2xl font-bold text-[var(--bone)]">Merchant Sign-In</h2>
            <p className="text-xs text-[var(--muted)]">
              Access your store workspace, inventory, sub-order fulfillment, and financial ledger.
            </p>
            <input
              required
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="Merchant Email"
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
              type="text"
              value={loginTotp}
              onChange={(e) => setLoginTotp(e.target.value)}
              placeholder="2FA Code (if enabled)"
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm font-mono-tabular text-[var(--bone)]"
            />
            <button
              type="submit"
              className="w-full py-3 bg-[var(--graphite)] border border-[var(--line)] hover:border-[var(--ember)] text-xs font-bold uppercase tracking-wider text-[var(--bone)] cursor-pointer"
            >
              Sign In to Seller Hub
            </button>
          </form>

          <form onSubmit={handleRegisterSeller} className="hairline-cell lg:col-span-7 p-6 space-y-4">
            <h2 className="font-display text-2xl font-bold text-[var(--bone)]">Apply as a Lebanese Seller</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <input
                required
                value={regOwner}
                onChange={(e) => setRegOwner(e.target.value)}
                placeholder="Owner Full Name"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              />
              <input
                required
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="Business Email"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              />
              <input
                required
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                placeholder="Phone (+961)"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)] font-mono-tabular"
              />
              <input
                required
                type="password"
                minLength={8}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Password (min 8 chars, letters + numbers)"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              />
              <input
                required
                value={regStoreEn}
                onChange={(e) => setRegStoreEn(e.target.value)}
                placeholder="Store Name (English)"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              />
              <input
                value={regStoreAr}
                onChange={(e) => setRegStoreAr(e.target.value)}
                placeholder="اسم المتجر (بالعربية)"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              />
              <select
                value={regDept}
                onChange={(e) => setRegDept(e.target.value as 'fashion' | 'electronics' | 'home-gadgets')}
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              >
                <option value="fashion">Fashion</option>
                <option value="electronics">Electronics & Mobiles</option>
                <option value="home-gadgets">Home Gadgets</option>
              </select>
              <select
                value={regGov}
                onChange={(e) => setRegGov(e.target.value)}
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              >
                {LEBANON_GOVERNORATES.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name.en}
                  </option>
                ))}
              </select>
              <input
                required
                value={regRegRef}
                onChange={(e) => setRegRegRef(e.target.value)}
                placeholder="Commercial Registration / ID Ref"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)] font-mono-tabular"
              />
              <div className="flex gap-2">
                <select
                  value={regPayoutMethod}
                  onChange={(e) => setRegPayoutMethod(e.target.value as 'whish' | 'omt' | 'bank')}
                  className="bg-[var(--ink)] border border-[var(--line)] px-2 py-2.5 text-sm text-[var(--bone)]"
                >
                  <option value="whish">Whish</option>
                  <option value="omt">OMT</option>
                  <option value="bank">Bank IBAN</option>
                </select>
                <input
                  required
                  value={regPayoutAcct}
                  onChange={(e) => setRegPayoutAcct(e.target.value)}
                  placeholder="Payout Account / Wallet #"
                  className="flex-1 min-w-0 bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)] font-mono-tabular"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Submit Seller Application
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading || !workspace) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-12">
        <div className="hairline-cell h-64 animate-pulse border border-[var(--line)]" />
      </div>
    );
  }

  const { seller, products, subOrders, balance, payouts, coupons, offers = [], reviews, documents, commissionInfo } =
    workspace;

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cents = Math.round(parseFloat(pPriceUsd || '0') * 100);
      await apiFetch('/api/seller/products', {
        method: 'POST',
        body: JSON.stringify({
          titleEn: pTitleEn,
          titleAr: pTitleAr || pTitleEn,
          subtitleEn: pSubEn,
          subtitleAr: pSubEn,
          descriptionEn: pSubEn || pTitleEn,
          descriptionAr: pTitleAr || pTitleEn,
          basePriceUsdCents: cents,
          department: seller.department,
          sku: pSku,
          size: pSize,
          color: pColor,
          stock: Number(pStock || 10),
          mediaIds: uploadedProductMediaIds,
          published: true,
        }),
      });
      setPTitleEn('');
      setPTitleAr('');
      setPSubEn('');
      setPSku('');
      setUploadedProductMediaIds([]);
      showToast('Product published to catalog', 'success');
      await loadWorkspace();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSubOrderUpdate = async (id: string, patch: { status?: SubOrderStatus; codCollected?: boolean }) => {
    try {
      await apiFetch(`/api/seller/sub-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      showToast('Sub-order updated', 'success');
      await loadWorkspace();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cents = Math.round(parseFloat(payoutDollars || '0') * 100);
      await apiFetch('/api/seller/payouts', {
        method: 'POST',
        body: JSON.stringify({ amountUsdCents: cents }),
      });
      showToast('Payout request submitted', 'success');
      await loadWorkspace();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSaveStorefront = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/seller/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          taglineEn,
          aboutEn,
          storefrontTheme: themeId,
          deliveryMode,
        }),
      });
      showToast('Storefront & delivery settings saved', 'success');
      await loadWorkspace();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleExportProductsCsv = () => {
    const rows = [
      ['ID', 'SKU', 'Title', 'PriceUSD', 'Published'],
      ...products.map((p) => [
        p.id,
        p.variants[0]?.sku || '',
        `"${p.title.en}"`,
        (p.basePriceUsdCents / 100).toFixed(2),
        String(p.published),
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${seller.slug}-products.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-[var(--bone)]">{seller.name[locale]}</h1>
            {seller.verified && <StampBadge label={t.verifiedSeller} tone="cedar" />}
            <StatusLabel status={seller.status} tone={seller.status === 'approved' ? 'cedar' : 'gold'} />
          </div>
          <p className="mt-1 text-xs font-mono-tabular text-[var(--muted)]">
            Plan: {seller.subscriptionTier.toUpperCase()} · Commission: {formatBpsAsPercent(commissionInfo.bps)} (
            {commissionInfo.source})
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/store/${seller.slug}`)}
          className="px-4 py-2 border border-[var(--line)] text-xs font-semibold text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
        >
          {t.viewStore}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview' as const, label: 'Earnings, KYC & Ledger' },
          { id: 'products' as const, label: `Products (${products.length})` },
          { id: 'orders' as const, label: `Sub-Orders (${subOrders.length})` },
          { id: 'storefront' as const, label: 'Storefront & Delivery' },
          { id: 'coupons' as const, label: 'Coupons, Offers & Reviews' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 text-xs font-semibold border whitespace-nowrap cursor-pointer ${
              tab === item.id
                ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                : 'border-[var(--line)] text-[var(--bone)] hover:border-[var(--bone)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="hairline-cell p-5">
              <p className="text-xs font-mono-tabular text-[var(--muted)] uppercase">Available Balance</p>
              <div className="mt-2">
                <PriceDisplay usdCents={balance.availableUsdCents} size="lg" />
              </div>
            </div>
            <div className="hairline-cell p-5">
              <p className="text-xs font-mono-tabular text-[var(--muted)] uppercase">Pending Escrow Hold</p>
              <div className="mt-2">
                <PriceDisplay usdCents={balance.pendingUsdCents} size="lg" />
              </div>
            </div>
            <div className="hairline-cell p-5">
              <p className="text-xs font-mono-tabular text-[var(--muted)] uppercase">Gross Sales</p>
              <div className="mt-2">
                <PriceDisplay usdCents={balance.totalGrossUsdCents} size="lg" />
              </div>
            </div>
            <div className="hairline-cell p-5">
              <p className="text-xs font-mono-tabular text-[var(--muted)] uppercase">Commission Deducted</p>
              <div className="mt-2">
                <PriceDisplay usdCents={balance.totalCommissionUsdCents} size="lg" />
              </div>
            </div>
          </div>

          <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
            <div className="hairline-cell lg:col-span-4 p-6 space-y-6">
              <form onSubmit={handleRequestPayout} className="space-y-3">
                <h2 className="font-display text-xl font-bold text-[var(--bone)]">Request Payout</h2>
                <p className="text-xs text-[var(--muted)]">
                  Destination: {seller.payoutMethod.toUpperCase()} ({seller.payoutAccount})
                </p>
                <input
                  type="number"
                  min="10"
                  step="1"
                  value={payoutDollars}
                  onChange={(e) => setPayoutDollars(e.target.value)}
                  aria-label="Payout amount USD"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm font-mono-tabular text-[var(--bone)]"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
                >
                  Submit Withdrawal
                </button>
              </form>

              <div className="pt-4 border-t border-[var(--line)] space-y-3">
                <h3 className="text-xs font-mono-tabular uppercase text-[var(--muted)]">KYC Verification Upload</h3>
                <label className="inline-flex items-center gap-2 px-3.5 py-2 border border-[var(--line)] text-xs text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingMedia ? 'Uploading...' : 'Upload Commercial Reg / ID (PDF/Image)'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleMediaUpload(f, 'seller_document');
                    }}
                  />
                </label>
                {documents.length > 0 && (
                  <div className="space-y-1 text-xs font-mono-tabular">
                    {documents.map((d) => (
                      <div key={d.id} className="flex justify-between text-[var(--muted)]">
                        <span>{d.doc_type}</span>
                        <span className="text-[var(--gold)]">{d.review_status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {payouts.length > 0 && (
                <div className="pt-3 border-t border-[var(--line)] space-y-2 text-xs">
                  {payouts.map((p) => (
                    <div key={p.id} className="flex justify-between font-mono-tabular">
                      <span className="text-[var(--bone)]">${(p.amountUsdCents / 100).toFixed(2)}</span>
                      <span className={p.status === 'paid' ? 'text-[var(--cedar)]' : 'text-[var(--gold)]'}>
                        {p.status} {p.referenceCode ? `· ${p.referenceCode}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="hairline-cell lg:col-span-8 p-6 overflow-x-auto">
              <h2 className="font-display text-xl font-bold text-[var(--bone)] mb-4">Double-Entry Ledger</h2>
              {balance.entries.length === 0 ? (
                <EmptyState
                  title="No ledger transactions yet"
                  description="Completed sub-orders and payout settlements appear here automatically."
                />
              ) : (
                <table className="w-full text-xs font-mono-tabular border-collapse">
                  <thead className="border-b border-[var(--line)] text-[var(--muted)]">
                    <tr>
                      <th className="py-2 text-start">Type</th>
                      <th className="py-2 text-start">Order</th>
                      <th className="py-2 text-start">Availability</th>
                      <th className="py-2 text-end">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {balance.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-2.5 text-[var(--bone)]">{entry.type}</td>
                        <td className="py-2.5 text-[var(--muted)]">{entry.orderNumber || '—'}</td>
                        <td className="py-2.5 text-[var(--muted)]">{entry.availability}</td>
                        <td
                          className={`py-2.5 text-end ${
                            entry.direction === 'credit' ? 'text-[var(--cedar)]' : 'text-[var(--ember)]'
                          }`}
                        >
                          {entry.direction === 'credit' ? '+' : '-'}${(entry.amountUsdCents / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'products' && (
        <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
          <form onSubmit={handleCreateProduct} className="hairline-cell lg:col-span-4 p-6 space-y-3">
            <h2 className="font-display text-xl font-bold text-[var(--bone)]">Add New SKU</h2>
            <input
              required
              value={pTitleEn}
              onChange={(e) => setPTitleEn(e.target.value)}
              placeholder="Title (English)"
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
            />
            <input
              value={pTitleAr}
              onChange={(e) => setPTitleAr(e.target.value)}
              placeholder="اسم المنتج (بالعربية)"
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
            />
            <input
              value={pSubEn}
              onChange={(e) => setPSubEn(e.target.value)}
              placeholder="Short Specification Line"
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                type="number"
                step="0.01"
                value={pPriceUsd}
                onChange={(e) => setPPriceUsd(e.target.value)}
                placeholder="Price USD"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm font-mono-tabular text-[var(--bone)]"
              />
              <input
                required
                value={pSku}
                onChange={(e) => setPSku(e.target.value)}
                placeholder="SKU"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm font-mono-tabular text-[var(--bone)]"
              />
              <input
                value={pSize}
                onChange={(e) => setPSize(e.target.value)}
                placeholder="Size"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
              />
              <input
                type="number"
                value={pStock}
                onChange={(e) => setPStock(e.target.value)}
                placeholder="Stock"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm font-mono-tabular text-[var(--bone)]"
              />
            </div>
            <input
              value={pColor}
              onChange={(e) => setPColor(e.target.value)}
              placeholder="Color"
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
            />
            <label className="flex items-center justify-between border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-xs text-[var(--bone)] cursor-pointer">
              <span className="inline-flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                {uploadingMedia ? 'Processing...' : `Upload Product Image (${uploadedProductMediaIds.length})`}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleMediaUpload(f, 'product_image');
                }}
              />
            </label>
            <button
              type="submit"
              className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
            >
              Publish Product
            </button>
          </form>

          <div className="hairline-cell lg:col-span-8 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-[var(--bone)]">Catalog Inventory</h2>
              <button
                type="button"
                onClick={handleExportProductsCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[var(--line)] text-xs text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
            {products.length === 0 ? (
              <EmptyState title="No products yet" description="Use the form on the left to add your first SKU." />
            ) : (
              <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
                {products.map((p) => (
                  <div key={p.id} className="p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-semibold text-[var(--bone)]">{p.title[locale]}</p>
                      <p className="text-xs font-mono-tabular text-[var(--muted)]">
                        {p.variants[0]?.sku} · Stock: {p.variants.reduce((s, v) => s + v.stock, 0)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <PriceDisplay usdCents={p.basePriceUsdCents} size="sm" />
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/seller/products/${p.id}/toggle`, { method: 'PATCH' });
                          await loadWorkspace();
                          await refreshBootstrap();
                        }}
                        className={`px-3 py-1 text-xs border cursor-pointer ${
                          p.published ? 'border-[var(--cedar)] text-[var(--cedar)]' : 'border-[var(--line)] text-[var(--muted)]'
                        }`}
                      >
                        {p.published ? 'Published' : 'Draft'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          {subOrders.length === 0 ? (
            <EmptyState title="No orders yet" description="Sub-orders for your store will appear here once buyers check out." />
          ) : (
            subOrders.map((sub) => (
              <div key={sub.id} className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-mono-tabular text-sm font-bold text-[var(--bone)]">
                      {sub.orderNumber} · {sub.id}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {sub.customerName} ({sub.customerPhone}) · {sub.governorate} / {sub.district}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={sub.status}
                      onChange={(e) => void handleSubOrderUpdate(sub.id, { status: e.target.value as SubOrderStatus })}
                      aria-label="Sub-order status"
                      className="bg-[var(--ink)] border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--bone)]"
                    >
                      {['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'].map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>

                    {sub.paymentMethod === 'cod' && (
                      <button
                        type="button"
                        onClick={() => void handleSubOrderUpdate(sub.id, { codCollected: !sub.codCollected })}
                        className={`px-3 py-1.5 text-xs border cursor-pointer ${
                          sub.codCollected ? 'border-[var(--cedar)] text-[var(--cedar)]' : 'border-[var(--gold)] text-[var(--gold)]'
                        }`}
                      >
                        {sub.codCollected ? 'COD Collected' : 'Mark COD Collected'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-1.5 border border-[var(--line)] text-xs text-[var(--bone)] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Packing Slip</span>
                    </button>
                  </div>
                </div>

                <div className="text-xs font-mono-tabular text-[var(--muted)] flex flex-wrap gap-4 pt-2 border-t border-[var(--line)]">
                  <span>Subtotal: ${(sub.subtotalUsdCents / 100).toFixed(2)}</span>
                  <span>Commission: -${(sub.commissionUsdCents / 100).toFixed(2)}</span>
                  <span className="text-[var(--cedar)]">Seller Net: ${(sub.sellerNetUsdCents / 100).toFixed(2)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'storefront' && (
        <form onSubmit={handleSaveStorefront} className="border border-[var(--line)] bg-[var(--graphite)] p-6 space-y-5 max-w-3xl">
          <h2 className="font-display text-xl font-bold text-[var(--bone)]">Branded Storefront & Logistics</h2>
          <div className="space-y-3">
            <label className="block space-y-1 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Store Tagline (EN)</span>
              <input
                value={taglineEn}
                onChange={(e) => setTaglineEn(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">About Storefront</span>
              <textarea
                rows={3}
                value={aboutEn}
                onChange={(e) => setAboutEn(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
              />
            </label>
            <label className="inline-flex items-center gap-2 px-3.5 py-2 border border-[var(--line)] text-xs text-[var(--bone)] cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Storefront Banner Image</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleMediaUpload(f, 'store_banner');
                }}
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">
              Approved Accessible Storefront Theme (WCAG Verified)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.values(APPROVED_STOREFRONT_THEMES).map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setThemeId(th.id)}
                  className={`p-3 border text-start text-xs cursor-pointer ${
                    themeId === th.id ? 'border-[var(--ember)] text-[var(--bone)]' : 'border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  <span className="block w-4 h-4 mb-1.5" style={{ backgroundColor: th.accentHexDark }} />
                  {th.name[locale]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">Fulfillment Mode</p>
            <div className="flex gap-3">
              {(['platform', 'self'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDeliveryMode(mode)}
                  className={`px-4 py-2 text-xs border cursor-pointer ${
                    deliveryMode === mode ? 'border-[var(--cedar)] text-[var(--cedar)]' : 'border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  {mode === 'platform' ? 'Platform Courier' : 'Self-Delivery Fleet'}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
          >
            Save Storefront Settings
          </button>
        </form>
      )}

      {tab === 'coupons' && (
        <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
          <div className="hairline-cell lg:col-span-5 p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-[var(--bone)]">Seller Coupons</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/seller/coupons', {
                    method: 'POST',
                    body: JSON.stringify({ code: couponCode, discountPercent: Number(couponPct), minOrderUsdCents: 2500 }),
                  });
                  setCouponCode('');
                  showToast('Seller coupon created', 'success');
                  await loadWorkspace();
                } catch (err) {
                  showToast((err as Error).message, 'error');
                }
              }}
              className="flex gap-2"
            >
              <input
                required
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="STORE15"
                className="flex-1 bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-xs font-mono-tabular uppercase text-[var(--bone)]"
              />
              <input
                type="number"
                value={couponPct}
                onChange={(e) => setCouponPct(e.target.value)}
                className="w-20 bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-xs font-mono-tabular text-[var(--bone)]"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
              >
                Create
              </button>
            </form>
            <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
              {coupons.map((c) => (
                <div key={c.id} className="p-3 flex justify-between text-xs font-mono-tabular">
                  <span className="text-[var(--bone)]">{c.code}</span>
                  <span className="text-[var(--cedar)]">{c.discountPercent}% OFF</span>
                </div>
              ))}
            </div>

            <div className="pt-5 border-t border-[var(--line)] space-y-3">
              <h3 className="font-display text-lg font-bold text-[var(--bone)]">
                Propose Store / Product Offer
              </h3>
              <p className="text-xs text-[var(--muted)]">
                {workspace.sellerPromoRules ? (
                  <>
                    Marketplace Rules: Max {workspace.sellerPromoRules.maxDiscountPercent}% off · Max $
                    {(workspace.sellerPromoRules.maxFixedDiscountUsdCents / 100).toFixed(0)} fixed · Up to{' '}
                    {workspace.sellerPromoRules.maxActiveOffersPerSeller} active/pending offers ·{' '}
                    {workspace.sellerPromoRules.requireAdminApproval ? 'Admin approval required' : 'Auto-approved'}
                  </>
                ) : (
                  'Seller offers enter Admin moderation queue and apply across product & checkout pricing once approved.'
                )}
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const num = Number(offerDiscountInput || 0);
                  const discountValue =
                    offerType === 'fixed_usd_cents' ? Math.round(num * 100) : Math.round(num);
                  try {
                    await apiFetch('/api/seller/offers', {
                      method: 'POST',
                      body: JSON.stringify({
                        titleEn: offerTitleEn.trim(),
                        titleAr: (offerTitleAr || offerTitleEn).trim(),
                        offerType,
                        discountValue,
                        targetType: offerTargetType,
                        targetId: offerTargetType === 'product' ? offerTargetProductId || products[0]?.id : null,
                      }),
                    });
                    setOfferTitleEn('');
                    setOfferTitleAr('');
                    showToast('Offer proposal submitted for Admin approval', 'success');
                    await loadWorkspace();
                  } catch (err) {
                    showToast((err as Error).message, 'error');
                  }
                }}
                className="space-y-2 text-xs"
              >
                <input
                  required
                  value={offerTitleEn}
                  onChange={(e) => setOfferTitleEn(e.target.value)}
                  placeholder="Offer Title (EN)"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
                />
                <input
                  dir="rtl"
                  value={offerTitleAr}
                  onChange={(e) => setOfferTitleAr(e.target.value)}
                  placeholder="عنوان العرض (AR)"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value as OfferType)}
                    className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
                  >
                    <option value="percent">Percent (%)</option>
                    <option value="flash_percent">Flash (%)</option>
                    <option value="fixed_usd_cents">Fixed USD ($)</option>
                  </select>
                  <input
                    required
                    type="number"
                    min="1"
                    step={offerType === 'fixed_usd_cents' ? '0.5' : '1'}
                    value={offerDiscountInput}
                    onChange={(e) => setOfferDiscountInput(e.target.value)}
                    placeholder={offerType === 'fixed_usd_cents' ? 'USD Off ($)' : '% Off'}
                    className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={offerTargetType}
                    onChange={(e) => {
                      const next = e.target.value as 'seller' | 'product';
                      setOfferTargetType(next);
                      if (next === 'product' && !offerTargetProductId && products[0]) {
                        setOfferTargetProductId(products[0].id);
                      }
                    }}
                    className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
                  >
                    <option value="seller">Entire Store</option>
                    <option value="product" disabled={products.length === 0}>
                      Specific Product
                    </option>
                  </select>
                  {offerTargetType === 'product' && products.length > 0 && (
                    <select
                      value={offerTargetProductId || products[0].id}
                      onChange={(e) => setOfferTargetProductId(e.target.value)}
                      className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title.en}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-[var(--graphite)] border border-[var(--line)] hover:border-[var(--ember)] text-[var(--bone)] font-bold uppercase cursor-pointer"
                >
                  Submit Offer Proposal
                </button>
              </form>

              {offers.length > 0 && (
                <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
                  {offers.map((off) => (
                    <div key={off.id} className="p-3 flex items-center justify-between text-xs font-mono-tabular">
                      <div>
                        <p className="text-[var(--bone)]">{off.title.en}</p>
                        <p className="text-[var(--muted)]">
                          {off.offerType === 'fixed_usd_cents'
                            ? `-$${(off.discountValue / 100).toFixed(2)}`
                            : `-${off.discountValue}%`}{' '}
                          · {off.targetType}
                        </p>
                      </div>
                      <StatusLabel
                        status={off.approvalStatus}
                        tone={
                          off.approvalStatus === 'approved'
                            ? 'cedar'
                            : off.approvalStatus === 'pending'
                              ? 'gold'
                              : 'ember'
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-[var(--bone)]">Buyer Reviews & Replies</h2>
            {reviews.length === 0 ? (
              <EmptyState title="No buyer reviews yet" description="Verified buyer reviews will appear here." />
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {reviews.map((rev) => (
                  <div key={rev.id} className="py-4 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-[var(--bone)] inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[var(--cedar)]" />
                        {rev.authorName}
                      </span>
                      <span className="font-mono-tabular text-[var(--gold)]">{'★'.repeat(rev.rating)}</span>
                    </div>
                    <p className="text-sm text-[var(--muted)]">{rev.comment}</p>
                    {rev.sellerReply ? (
                      <p className="text-xs text-[var(--bone)] ps-3 border-s border-[var(--cedar)]">
                        Reply: {rev.sellerReply}
                      </p>
                    ) : (
                      <div className="flex gap-2 pt-1">
                        <input
                          value={replyDrafts[rev.id] || ''}
                          onChange={(e) => setReplyDrafts((d) => ({ ...d, [rev.id]: e.target.value }))}
                          placeholder="Write public seller reply..."
                          className="flex-1 bg-[var(--ink)] border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--bone)]"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const text = replyDrafts[rev.id] || '';
                            if (!text.trim()) return;
                            await apiFetch(`/api/seller/reviews/${rev.id}/reply`, {
                              method: 'POST',
                              body: JSON.stringify({ reply: text }),
                            });
                            await loadWorkspace();
                          }}
                          className="px-3 py-1.5 border border-[var(--line)] text-xs text-[var(--bone)] cursor-pointer"
                        >
                          Reply
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
