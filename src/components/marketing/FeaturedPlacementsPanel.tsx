import React, { useState } from 'react';
import { DollarSign, Sparkles, Trash2 } from 'lucide-react';
import type {
  FeaturedPlacement,
  FeaturedPlacementTargetType,
  FeaturedSlotKey,
  Seller,
} from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState } from '../HairlineUI.tsx';

const FEATURED_SLOTS: Array<{ id: FeaturedSlotKey; label: string }> = [
  { id: 'home_hero_spotlight', label: 'Home Page · Hero Spotlight' },
  { id: 'home_trending_top', label: 'Home Page · Trending Top' },
  { id: 'catalog_top_sponsored', label: 'Catalog · Top Sponsored' },
  { id: 'category_top_spotlight', label: 'Category · Top Spotlight' },
  { id: 'search_promoted', label: 'Search Results · Promoted' },
];

export function FeaturedPlacementsPanel({
  placements,
  sellers,
  onReload,
}: {
  placements: FeaturedPlacement[];
  sellers: Seller[];
  onReload: () => Promise<void>;
}) {
  const { products, apiFetch, showToast, refreshBootstrap } = useMarketplace();

  const [slotKey, setSlotKey] = useState<FeaturedSlotKey>('home_hero_spotlight');
  const [targetType, setTargetType] = useState<FeaturedPlacementTargetType>('product');
  const [targetId, setTargetId] = useState('');
  const [badgeEn, setBadgeEn] = useState('Featured');
  const [badgeAr, setBadgeAr] = useState('مميز');
  const [priority, setPriority] = useState('20');
  const [feeUsd, setFeeUsd] = useState('0');
  const [chargeLedgerFee, setChargeLedgerFee] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const approvedSellers = sellers.filter((s) => s.status === 'approved');
  const effectiveTargetId =
    targetId || (targetType === 'product' ? products[0]?.id || '' : approvedSellers[0]?.id || '');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveTargetId) {
      showToast(`No ${targetType} available to feature yet.`, 'error');
      return;
    }
    const feeUsdCents = Math.max(0, Math.round(parseFloat(feeUsd || '0') * 100));

    try {
      await apiFetch('/api/admin/featured-placements', {
        method: 'POST',
        body: JSON.stringify({
          slotKey,
          targetType,
          targetId: effectiveTargetId,
          badgeText: { en: badgeEn.trim() || 'Featured', ar: badgeAr.trim() || 'مميز' },
          priority: Number(priority || 20),
          feeUsdCents,
          chargeLedgerFee: chargeLedgerFee && feeUsdCents > 0,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          active: true,
        }),
      });
      showToast(
        chargeLedgerFee && feeUsdCents > 0
          ? `Featured placement created & $${(feeUsdCents / 100).toFixed(2)} debited from seller ledger`
          : 'Featured placement created',
        'success'
      );
      setFeeUsd('0');
      setChargeLedgerFee(false);
      await onReload();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
      <form onSubmit={handleCreate} className="hairline-cell lg:col-span-5 p-6 space-y-3 text-xs">
        <h3 className="font-display text-xl font-bold text-[var(--bone)]">
          Featured Placements &amp; Sponsored Slots
        </h3>
        <p className="text-[var(--muted)]">
          Pin verified stores or products into Home, Catalog, Category, or Search slots with optional integer USD seller ledger billing.
        </p>

        <label className="block space-y-1">
          <span className="font-mono-tabular text-[var(--muted)]">Placement Slot</span>
          <select
            value={slotKey}
            onChange={(e) => setSlotKey(e.target.value as FeaturedSlotKey)}
            className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
          >
            {FEATURED_SLOTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Target Type</span>
            <select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value as FeaturedPlacementTargetType);
                setTargetId('');
              }}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              <option value="product">Product</option>
              <option value="store">Seller Store</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Priority</span>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="font-mono-tabular text-[var(--muted)]">
            {targetType === 'product' ? 'Select Product' : 'Select Approved Store'}
          </span>
          <select
            value={effectiveTargetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
          >
            {targetType === 'product' ? (
              products.length === 0 ? (
                <option value="">No products created yet</option>
              ) : (
                products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title.en} (${(p.basePriceUsdCents / 100).toFixed(2)})
                  </option>
                ))
              )
            ) : approvedSellers.length === 0 ? (
              <option value="">No approved sellers yet</option>
            ) : (
              approvedSellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name.en} (@{s.slug})
                </option>
              ))
            )}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <input
            required
            value={badgeEn}
            onChange={(e) => setBadgeEn(e.target.value)}
            placeholder="Badge Label (EN)"
            className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
          />
          <input
            required
            dir="rtl"
            value={badgeAr}
            onChange={(e) => setBadgeAr(e.target.value)}
            placeholder="الوسم (AR)"
            className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
          />
        </div>

        <div className="border border-[var(--line)] bg-[var(--ink)] p-3 space-y-2">
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Placement Fee (USD, optional)</span>
            <input
              type="number"
              min="0"
              step="0.50"
              value={feeUsd}
              onChange={(e) => setFeeUsd(e.target.value)}
              className="w-full bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--gold)]">
            <input
              type="checkbox"
              checked={chargeLedgerFee}
              onChange={(e) => setChargeLedgerFee(e.target.checked)}
              className="accent-[var(--gold)]"
            />
            <span>Debit fee directly from seller ledger (`FEATURED_PLACEMENT_FEE`)</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            aria-label="Placement start"
            className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
          />
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            aria-label="Placement end"
            className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
        >
          Create Featured Placement
        </button>
      </form>

      <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
        <h3 className="font-display text-xl font-bold text-[var(--bone)]">
          Active &amp; Scheduled Featured Placements ({placements.length})
        </h3>
        {placements.length === 0 ? (
          <EmptyState
            title="No featured placements yet"
            description="Assign a product or approved seller store to a sponsored or editorial spotlight slot on the left."
          />
        ) : (
          <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
            {placements.map((fp) => {
              const ctr = fp.impressions > 0 ? ((fp.clicks / fp.impressions) * 100).toFixed(1) : '0.0';
              return (
                <div key={fp.id} className="p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--ink)] text-xs">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-[var(--gold)] text-[var(--gold)] text-[10px]">
                        <Sparkles className="w-3 h-3" /> {fp.badgeText.en}
                      </span>
                      <span className="text-[var(--cyan)]">{fp.slotKey}</span>
                      {fp.feeUsdCents > 0 && (
                        <span className={fp.ledgerCharged ? 'text-[var(--cedar)]' : 'text-[var(--gold)]'}>
                          ${(fp.feeUsdCents / 100).toFixed(2)} {fp.ledgerCharged ? '· Ledger Charged' : '· Unbilled'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[var(--bone)] truncate">
                      {fp.targetLabel?.en || fp.targetId}
                      {fp.sellerName && (
                        <span className="text-xs text-[var(--muted)]"> · {fp.sellerName.en}</span>
                      )}
                    </p>
                    <p className="font-mono-tabular text-[11px] text-[var(--cedar)]">
                      {fp.impressions} imp · {fp.clicks} clk · {ctr}% CTR
                      {(fp.botFilteredCount ?? 0) > 0 && (
                        <span className="ms-2 text-[var(--gold)]">· {fp.botFilteredCount} bot-filtered</span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {fp.feeUsdCents > 0 && !fp.ledgerCharged && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/featured-placements/${fp.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ chargeLedgerFeeNow: true }),
                          });
                          showToast('Ledger fee debited from seller', 'success');
                          await onReload();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--gold)] text-[var(--gold)] cursor-pointer"
                      >
                        <DollarSign className="w-3 h-3" />
                        <span>Charge Fee</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/featured-placements/${fp.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ active: !fp.active }),
                        });
                        await onReload();
                        await refreshBootstrap();
                      }}
                      className={`px-3 py-1 border cursor-pointer ${
                        fp.active ? 'border-[var(--cedar)] text-[var(--cedar)]' : 'border-[var(--line)] text-[var(--muted)]'
                      }`}
                    >
                      {fp.active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/featured-placements/${fp.id}`, { method: 'DELETE' });
                        showToast('Featured placement removed', 'info');
                        await onReload();
                        await refreshBootstrap();
                      }}
                      aria-label="Delete placement"
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
  );
}
