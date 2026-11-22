import React, { useEffect, useState } from 'react';
import { Check, Pause, Play, Save, ShieldCheck, X } from 'lucide-react';
import type { Coupon, Offer, Seller, SellerPromoRules } from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState, StatusLabel } from '../HairlineUI.tsx';

export function SellerModerationPanel({
  offers,
  coupons,
  sellers,
  sellerPromoRules,
  onReload,
}: {
  offers: Offer[];
  coupons: Coupon[];
  sellers: Seller[];
  sellerPromoRules?: SellerPromoRules;
  onReload: () => Promise<void>;
}) {
  const { apiFetch, showToast } = useMarketplace();

  const [sellerOffersEnabled, setSellerOffersEnabled] = useState(sellerPromoRules?.sellerOffersEnabled ?? true);
  const [requireAdminApproval, setRequireAdminApproval] = useState(sellerPromoRules?.requireAdminApproval ?? true);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(String(sellerPromoRules?.maxDiscountPercent ?? 60));
  const [maxFixedUsd, setMaxFixedUsd] = useState(String(((sellerPromoRules?.maxFixedDiscountUsdCents ?? 15000) / 100).toFixed(0)));
  const [maxActiveOffersPerSeller, setMaxActiveOffersPerSeller] = useState(String(sellerPromoRules?.maxActiveOffersPerSeller ?? 5));
  const [allowFlashOffersBySellers, setAllowFlashOffersBySellers] = useState(
    sellerPromoRules?.allowFlashOffersBySellers ?? true
  );
  const [savingRules, setSavingRules] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    if (!sellerPromoRules) return;
    setSellerOffersEnabled(sellerPromoRules.sellerOffersEnabled);
    setRequireAdminApproval(sellerPromoRules.requireAdminApproval);
    setMaxDiscountPercent(String(sellerPromoRules.maxDiscountPercent));
    setMaxFixedUsd(String(Math.round(sellerPromoRules.maxFixedDiscountUsdCents / 100)));
    setMaxActiveOffersPerSeller(String(sellerPromoRules.maxActiveOffersPerSeller));
    setAllowFlashOffersBySellers(sellerPromoRules.allowFlashOffersBySellers);
  }, [sellerPromoRules]);

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRules(true);
    try {
      await apiFetch('/api/admin/marketing/seller-rules', {
        method: 'PUT',
        body: JSON.stringify({
          sellerOffersEnabled,
          requireAdminApproval,
          maxDiscountPercent: Math.max(5, Math.min(90, Math.round(Number(maxDiscountPercent) || 60))),
          maxFixedDiscountUsdCents: Math.max(500, Math.round((Number(maxFixedUsd) || 150) * 100)),
          maxActiveOffersPerSeller: Math.max(1, Math.min(50, Math.round(Number(maxActiveOffersPerSeller) || 5))),
          allowFlashOffersBySellers,
        }),
      });
      showToast('Seller promotion rules updated.', 'success');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingRules(false);
    }
  };

  const sellerOffers = offers.filter((o) => Boolean(o.sellerId));
  const filteredOffers = sellerOffers.filter((o) => (filterStatus === 'all' ? true : o.approvalStatus === filterStatus));
  const sellerCoupons = coupons.filter((c) => Boolean(c.sellerId));
  const pendingCount = sellerOffers.filter((o) => o.approvalStatus === 'pending').length;

  const getSellerName = (sellerId?: string | null) => {
    if (!sellerId) return 'Platform';
    const sel = sellers.find((s) => s.id === sellerId);
    return sel ? sel.name.en : sellerId;
  };

  return (
    <div className="space-y-6">
      {/* Global Marketplace Rules for Seller Promotions */}
      <form onSubmit={handleSaveRules} className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono-tabular uppercase text-[var(--ember)]">
              <ShieldCheck className="w-4 h-4" />
              <span>Seller Promotions Governance &amp; Guardrails</span>
            </div>
            <h3 className="font-display text-lg font-bold text-[var(--bone)] mt-1">
              Marketplace Seller Promo Rules
            </h3>
          </div>
          <button
            type="submit"
            disabled={savingRules}
            className="inline-flex items-center gap-2 bg-[var(--ember)] text-[var(--ember-fg)] px-4 py-2 text-xs font-bold uppercase cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingRules ? 'Saving...' : 'Save Rules'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <label className="flex items-center gap-2.5 border border-[var(--line)] bg-[var(--ink)] p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sellerOffersEnabled}
              onChange={(e) => setSellerOffersEnabled(e.target.checked)}
            />
            <span className="text-[var(--bone)]">Allow Sellers to Propose Store/Product Offers</span>
          </label>

          <label className="flex items-center gap-2.5 border border-[var(--line)] bg-[var(--ink)] p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={requireAdminApproval}
              onChange={(e) => setRequireAdminApproval(e.target.checked)}
            />
            <span className="text-[var(--bone)]">Require Admin Approval Before Going Live</span>
          </label>

          <label className="flex items-center gap-2.5 border border-[var(--line)] bg-[var(--ink)] p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowFlashOffersBySellers}
              onChange={(e) => setAllowFlashOffersBySellers(e.target.checked)}
            />
            <span className="text-[var(--bone)]">Allow Sellers to Propose Flash Offers</span>
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Max Seller Discount (%)</span>
            <input
              type="number"
              min="5"
              max="90"
              value={maxDiscountPercent}
              onChange={(e) => setMaxDiscountPercent(e.target.value)}
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Max Fixed Discount (USD $)</span>
            <input
              type="number"
              min="5"
              step="1"
              value={maxFixedUsd}
              onChange={(e) => setMaxFixedUsd(e.target.value)}
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Max Active Offers Per Seller</span>
            <input
              type="number"
              min="1"
              max="50"
              value={maxActiveOffersPerSeller}
              onChange={(e) => setMaxActiveOffersPerSeller(e.target.value)}
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </label>
        </div>
      </form>

      {/* Seller Offers Moderation Queue */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-[var(--bone)]">
              Seller Offers Moderation Queue ({sellerOffers.length})
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {pendingCount} pending review · Approve, reject, or pause vendor-submitted promotions.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`border px-3 py-1.5 font-mono-tabular uppercase cursor-pointer ${
                  filterStatus === st
                    ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                    : 'border-[var(--line)] bg-[var(--ink)] text-[var(--bone)]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {filteredOffers.length === 0 ? (
          <EmptyState
            title="No seller-submitted offers in this filter"
            description="When approved sellers propose storewide or product-level promotions, they appear here for moderation."
          />
        ) : (
          <div className="space-y-2.5">
            {filteredOffers.map((off) => (
              <div
                key={off.id}
                className="border border-[var(--line)] bg-[var(--ink)] p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold text-[var(--bone)]">{off.title.en}</span>
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
                    <span className="border border-[var(--line)] px-2 py-0.5 text-[11px] font-mono-tabular text-[var(--cyan)]">
                      {getSellerName(off.sellerId)}
                    </span>
                    {!off.active && (
                      <span className="border border-[var(--muted)] px-2 py-0.5 text-[11px] font-mono-tabular text-[var(--muted)]">
                        PAUSED
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono-tabular text-[var(--muted)]">
                    {off.offerType === 'fixed_usd_cents'
                      ? `-$${(off.discountValue / 100).toFixed(2)}`
                      : `-${off.discountValue}%`}{' '}
                    · {off.offerType} · Target: {off.targetType} ({off.targetId || 'store'})
                  </div>
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
                        showToast('Seller offer approved.', 'success');
                        await onReload();
                      }}
                      className="inline-flex items-center gap-1 border border-[var(--cedar)] px-3 py-1.5 text-xs font-bold uppercase text-[var(--cedar)] hover:bg-[var(--cedar)] hover:text-[#17181B] cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
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
                        showToast('Seller offer rejected.', 'info');
                        await onReload();
                      }}
                      className="inline-flex items-center gap-1 border border-[var(--crimson)] px-3 py-1.5 text-xs font-bold uppercase text-[var(--crimson)] hover:bg-[var(--crimson)] hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
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
                      showToast(off.active ? 'Offer paused.' : 'Offer resumed.', 'info');
                      await onReload();
                    }}
                    className="inline-flex items-center gap-1 border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                  >
                    {off.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{off.active ? 'Pause' : 'Resume'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Seller-Created Coupons Oversight */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-3">
        <h3 className="font-display text-base font-bold text-[var(--bone)]">
          Seller-Scoped Coupons Oversight ({sellerCoupons.length})
        </h3>
        {sellerCoupons.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No seller-specific coupons configured yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--muted)] font-mono-tabular uppercase">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Seller</th>
                  <th className="py-2 pr-3">Discount</th>
                  <th className="py-2 pr-3">Uses</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {sellerCoupons.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--line)]/50">
                    <td className="py-2 pr-3 font-mono-tabular font-bold text-[var(--bone)]">{c.code}</td>
                    <td className="py-2 pr-3 text-[var(--muted)]">{getSellerName(c.sellerId)}</td>
                    <td className="py-2 pr-3 font-mono-tabular text-[var(--gold)]">
                      {c.discountType === 'percent'
                        ? `${c.discountValue}%`
                        : c.discountType === 'free_shipping'
                          ? 'Free Shipping'
                          : `$${(c.discountValue / 100).toFixed(2)}`}
                    </td>
                    <td className="py-2 pr-3 font-mono-tabular">
                      {c.usedCount}
                      {c.maxUses ? ` / ${c.maxUses}` : ''}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/coupons/${c.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ active: !c.active }),
                          });
                          showToast(c.active ? 'Seller coupon paused.' : 'Seller coupon enabled.', 'info');
                          await onReload();
                        }}
                        className={`border px-2 py-0.5 text-[11px] font-mono-tabular uppercase cursor-pointer ${
                          c.active
                            ? 'border-[var(--cedar)] text-[var(--cedar)]'
                            : 'border-[var(--crimson)] text-[var(--crimson)]'
                        }`}
                      >
                        {c.active ? 'Active · Pause' : 'Paused · Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
