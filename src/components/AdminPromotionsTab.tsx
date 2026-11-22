import React, { useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import type {
  BannerBgToken,
  BannerPageScope,
  Category,
  Offer,
  OfferBanner,
  OfferTargetType,
  OfferType,
  Seller,
} from '../shared/types.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, StatusLabel } from './HairlineUI.tsx';

const BANNER_PAGES: BannerPageScope[] = ['home', 'catalog', 'checkout', 'store'];
const BANNER_TOKENS: BannerBgToken[] = ['graphite', 'ember', 'cedar', 'gold', 'cyan', 'sand'];

export function AdminPromotionsTab({
  banners,
  offers,
  categories,
  sellers,
  onReload,
}: {
  banners: OfferBanner[];
  offers: Offer[];
  categories: Category[];
  sellers: Seller[];
  onReload: () => Promise<void>;
}) {
  const { products, apiFetch, showToast, refreshBootstrap } = useMarketplace();

  // Banner creation form
  const [bTitleEn, setBTitleEn] = useState('');
  const [bTitleAr, setBTitleAr] = useState('');
  const [bCtaEn, setBCtaEn] = useState('Shop Now');
  const [bCtaAr, setBCtaAr] = useState('تصفح الآن');
  const [bTargetUrl, setBTargetUrl] = useState('/catalog?deals=true');
  const [bBgToken, setBBgToken] = useState<BannerBgToken>('ember');
  const [bPages, setBPages] = useState<BannerPageScope[]>(['home', 'catalog']);
  const [bPriority, setBPriority] = useState('10');
  const [bStartsAt, setBStartsAt] = useState('');
  const [bEndsAt, setBEndsAt] = useState('');

  // Platform Offer creation form
  const [oTitleEn, setOTitleEn] = useState('');
  const [oTitleAr, setOTitleAr] = useState('');
  const [oType, setOType] = useState<OfferType>('percent');
  const [oValue, setOValue] = useState('15');
  const [oTargetType, setOTargetType] = useState<OfferTargetType>('all');
  const [oTargetId, setOTargetId] = useState('');
  const [oStartsAt, setOStartsAt] = useState('');
  const [oEndsAt, setOEndsAt] = useState('');

  const handleCreateBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bPages.length === 0) {
      showToast('Select at least one target page for the banner.', 'error');
      return;
    }
    try {
      await apiFetch('/api/admin/banners', {
        method: 'POST',
        body: JSON.stringify({
          title: { en: bTitleEn.trim(), ar: (bTitleAr || bTitleEn).trim() },
          ctaLabel: bCtaEn.trim() || bCtaAr.trim() ? { en: bCtaEn.trim(), ar: (bCtaAr || bCtaEn).trim() } : undefined,
          bgToken: bBgToken,
          targetUrl: bTargetUrl.trim() || '/catalog',
          pages: bPages,
          priority: Number(bPriority || 10),
          startsAt: bStartsAt ? new Date(bStartsAt).toISOString() : null,
          endsAt: bEndsAt ? new Date(bEndsAt).toISOString() : null,
          active: true,
        }),
      });
      setBTitleEn('');
      setBTitleAr('');
      showToast('Offer banner published', 'success');
      await onReload();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    const numVal = Number(oValue || 0);
    const discountValue = oType === 'fixed_usd_cents' ? Math.round(numVal * 100) : Math.round(numVal);

    try {
      await apiFetch('/api/admin/offers', {
        method: 'POST',
        body: JSON.stringify({
          title: { en: oTitleEn.trim(), ar: (oTitleAr || oTitleEn).trim() },
          offerType: oType,
          discountValue,
          targetType: oTargetType,
          targetId: oTargetType === 'all' ? null : oTargetId || null,
          startsAt: oStartsAt ? new Date(oStartsAt).toISOString() : null,
          endsAt: oEndsAt ? new Date(oEndsAt).toISOString() : null,
          active: true,
        }),
      });
      setOTitleEn('');
      setOTitleAr('');
      showToast('Platform offer created and active', 'success');
      await onReload();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Small Offer Banners Engine */}
      <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
        <form onSubmit={handleCreateBanner} className="hairline-cell lg:col-span-5 p-6 space-y-3 text-xs">
          <h2 className="font-display text-xl font-bold text-[var(--bone)]">Create Small Offer Banner</h2>
          <p className="text-[var(--muted)]">
            Thin hairline strip displayed at the top of targeted pages with live impression & click tracking.
          </p>

          <input
            required
            value={bTitleEn}
            onChange={(e) => setBTitleEn(e.target.value)}
            placeholder="Banner copy (EN)"
            className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
          />
          <input
            required
            dir="rtl"
            value={bTitleAr}
            onChange={(e) => setBTitleAr(e.target.value)}
            placeholder="نص الشريط الترويجي (AR)"
            className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              value={bCtaEn}
              onChange={(e) => setBCtaEn(e.target.value)}
              placeholder="CTA Label (EN)"
              className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
            />
            <input
              dir="rtl"
              value={bCtaAr}
              onChange={(e) => setBCtaAr(e.target.value)}
              placeholder="نص الزر (AR)"
              className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input
              value={bTargetUrl}
              onChange={(e) => setBTargetUrl(e.target.value)}
              placeholder="/catalog"
              className="col-span-2 bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
            />
            <input
              type="number"
              value={bPriority}
              onChange={(e) => setBPriority(e.target.value)}
              placeholder="Priority"
              aria-label="Banner priority"
              className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="font-mono-tabular text-[var(--muted)]">Accent Token</span>
              <select
                value={bBgToken}
                onChange={(e) => setBBgToken(e.target.value as BannerBgToken)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                {BANNER_TOKENS.map((tok) => (
                  <option key={tok} value={tok}>
                    {tok}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1">
              <span className="font-mono-tabular text-[var(--muted)] block">Target Pages</span>
              <div className="flex flex-wrap gap-1.5">
                {BANNER_PAGES.map((pg) => {
                  const active = bPages.includes(pg);
                  return (
                    <button
                      key={pg}
                      type="button"
                      onClick={() =>
                        setBPages((prev) => (active ? prev.filter((p) => p !== pg) : [...prev, pg]))
                      }
                      className={`px-2 py-1 border font-mono-tabular cursor-pointer ${
                        active ? 'border-[var(--ember)] text-[var(--ember)]' : 'border-[var(--line)] text-[var(--muted)]'
                      }`}
                    >
                      {pg}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              value={bStartsAt}
              onChange={(e) => setBStartsAt(e.target.value)}
              aria-label="Banner start time"
              className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
            />
            <input
              type="datetime-local"
              value={bEndsAt}
              onChange={(e) => setBEndsAt(e.target.value)}
              aria-label="Banner end time"
              className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
          >
            Publish Offer Banner
          </button>
        </form>

        <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
          <h3 className="font-display text-xl font-bold text-[var(--bone)]">
            Active & Scheduled Banners ({banners.length})
          </h3>
          {banners.length === 0 ? (
            <EmptyState
              title="No offer banners configured"
              description="Create a thin hairline promo banner on the left to display across targeted pages."
            />
          ) : (
            <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
              {banners.map((b) => {
                const ctr = b.impressions > 0 ? ((b.clicks / b.impressions) * 100).toFixed(1) : '0.0';
                return (
                  <div key={b.id} className="p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--ink)] text-xs">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
                        <span className="text-[var(--bone)] font-semibold">[{b.bgToken}]</span>
                        <span className="text-[var(--muted)]">pages: {b.pages.join(', ')}</span>
                        <span className="text-[var(--cedar)]">
                          {b.impressions} imp · {b.clicks} clk · {ctr}% CTR
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[var(--bone)]">
                        {b.title.en} <span className="text-[var(--muted)]">({b.targetUrl})</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/banners/${b.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ active: !b.active }),
                          });
                          await onReload();
                          await refreshBootstrap();
                        }}
                        className={`px-3 py-1 border cursor-pointer ${
                          b.active ? 'border-[var(--cedar)] text-[var(--cedar)]' : 'border-[var(--line)] text-[var(--muted)]'
                        }`}
                      >
                        {b.active ? 'Active' : 'Paused'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/banners/${b.id}`, { method: 'DELETE' });
                          showToast('Banner deleted', 'info');
                          await onReload();
                          await refreshBootstrap();
                        }}
                        aria-label="Delete banner"
                        className="p-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. Offers & Seller Proposals Engine */}
      <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
        <form onSubmit={handleCreateOffer} className="hairline-cell lg:col-span-5 p-6 space-y-3 text-xs">
          <h2 className="font-display text-xl font-bold text-[var(--bone)]">Create Platform Offer</h2>
          <p className="text-[var(--muted)]">
            Automatically reduces integer USD & LBP minor-unit prices across catalog, PDP, mini-cart, and checkout.
          </p>

          <input
            required
            value={oTitleEn}
            onChange={(e) => setOTitleEn(e.target.value)}
            placeholder="Offer Title (EN)"
            className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
          />
          <input
            required
            dir="rtl"
            value={oTitleAr}
            onChange={(e) => setOTitleAr(e.target.value)}
            placeholder="عنوان العرض (AR)"
            className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              value={oType}
              onChange={(e) => setOType(e.target.value as OfferType)}
              className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              <option value="percent">Percent (%)</option>
              <option value="flash_percent">Flash Deal (%)</option>
              <option value="fixed_usd_cents">Fixed USD Off ($)</option>
            </select>
            <input
              required
              type="number"
              step={oType === 'fixed_usd_cents' ? '0.5' : '1'}
              min="1"
              value={oValue}
              onChange={(e) => setOValue(e.target.value)}
              placeholder={oType === 'fixed_usd_cents' ? 'USD off ($)' : 'Discount %'}
              className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={oTargetType}
              onChange={(e) => {
                const next = e.target.value as OfferTargetType;
                setOTargetType(next);
                if (next === 'department') setOTargetId('fashion');
                else if (next === 'category') setOTargetId(categories[0]?.id || '');
                else if (next === 'seller') setOTargetId(sellers[0]?.id || '');
                else if (next === 'product') setOTargetId(products[0]?.id || '');
                else setOTargetId('');
              }}
              className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              <option value="all">All Marketplace</option>
              <option value="department">Department</option>
              <option value="category">Category</option>
              <option value="seller">Specific Seller</option>
              <option value="product">Specific Product</option>
            </select>

            {oTargetType === 'department' && (
              <select
                value={oTargetId}
                onChange={(e) => setOTargetId(e.target.value)}
                className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                <option value="fashion">fashion</option>
                <option value="electronics">electronics</option>
                <option value="home-gadgets">home-gadgets</option>
              </select>
            )}
            {oTargetType === 'category' && (
              <select
                value={oTargetId}
                onChange={(e) => setOTargetId(e.target.value)}
                className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name.en}
                  </option>
                ))}
              </select>
            )}
            {oTargetType === 'seller' && (
              <select
                value={oTargetId}
                onChange={(e) => setOTargetId(e.target.value)}
                className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.en}
                  </option>
                ))}
              </select>
            )}
            {oTargetType === 'product' && (
              <select
                value={oTargetId}
                onChange={(e) => setOTargetId(e.target.value)}
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

          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              value={oStartsAt}
              onChange={(e) => setOStartsAt(e.target.value)}
              aria-label="Offer start time"
              className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
            />
            <input
              type="datetime-local"
              value={oEndsAt}
              onChange={(e) => setOEndsAt(e.target.value)}
              aria-label="Offer end time"
              className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
          >
            Create & Activate Offer
          </button>
        </form>

        <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
          <h3 className="font-display text-xl font-bold text-[var(--bone)]">
            Offers & Seller Moderation Queue ({offers.length})
          </h3>
          {offers.length === 0 ? (
            <EmptyState
              title="No offers created yet"
              description="Platform-wide offers and seller discount proposals will appear here."
            />
          ) : (
            <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
              {offers.map((off) => (
                <div key={off.id} className="p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--ink)] text-xs">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
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
                      <span className="text-[var(--ember)] font-bold">
                        {off.offerType === 'fixed_usd_cents'
                          ? `-$${(off.discountValue / 100).toFixed(2)}`
                          : `-${off.discountValue}%`}
                      </span>
                      <span className="text-[var(--muted)]">
                        target: {off.targetType}
                        {off.targetId ? `(${off.targetId.slice(0, 12)})` : ''}
                      </span>
                      {off.sellerName && (
                        <span className="text-[var(--cyan)]">by {off.sellerName.en}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[var(--bone)]">{off.title.en}</p>
                    {(off.startsAt || off.endsAt) && (
                      <p className="text-[11px] font-mono-tabular text-[var(--muted)]">
                        {off.startsAt || 'Now'} → {off.endsAt || 'Indefinite'}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {off.approvalStatus !== 'approved' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/offers/${off.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ approvalStatus: 'approved', active: true }),
                          });
                          showToast('Offer approved', 'success');
                          await onReload();
                          await refreshBootstrap();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--cedar)] text-[var(--cedar)] cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                    )}
                    {off.approvalStatus !== 'rejected' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/offers/${off.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ approvalStatus: 'rejected', active: false }),
                          });
                          showToast('Offer rejected', 'info');
                          await onReload();
                          await refreshBootstrap();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        <span>Reject</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/offers/${off.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ active: !off.active }),
                        });
                        await onReload();
                        await refreshBootstrap();
                      }}
                      className={`px-2.5 py-1 border cursor-pointer ${
                        off.active ? 'border-[var(--cedar)] text-[var(--cedar)]' : 'border-[var(--line)] text-[var(--muted)]'
                      }`}
                    >
                      {off.active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/offers/${off.id}`, { method: 'DELETE' });
                        showToast('Offer deleted', 'info');
                        await onReload();
                        await refreshBootstrap();
                      }}
                      aria-label="Delete offer"
                      className="p-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
