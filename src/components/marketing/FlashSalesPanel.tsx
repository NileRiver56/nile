import React, { useState } from 'react';
import { Clock, Play, Plus, Square, Trash2, Zap } from 'lucide-react';
import type { BannerBgToken, FlashSale } from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState, PriceDisplay, StatusLabel } from '../HairlineUI.tsx';

export function FlashSalesPanel({
  flashSales,
  onReload,
}: {
  flashSales: FlashSale[];
  onReload: () => Promise<void>;
}) {
  const { products, apiFetch, showToast, refreshBootstrap } = useMarketplace();
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [bgToken, setBgToken] = useState<BannerBgToken>('ember');
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 16);
  });
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [autoRevert, setAutoRevert] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Array<{ productId: string; discountPercent: number; stockCap: number }>>([]);
  const [pickProductId, setPickProductId] = useState('');
  const [pickPct, setPickPct] = useState('25');
  const [pickCap, setPickCap] = useState('20');

  const addProductRow = () => {
    const targetId = pickProductId || products[0]?.id;
    if (!targetId) return;
    if (selectedItems.some((i) => i.productId === targetId)) {
      showToast('Product already added to this flash sale', 'info');
      return;
    }
    setSelectedItems((prev) => [
      ...prev,
      {
        productId: targetId,
        discountPercent: Math.min(90, Math.max(1, Math.round(Number(pickPct || 25)))),
        stockCap: Math.max(0, Math.round(Number(pickCap || 0))),
      },
    ]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      showToast('Add at least one product to the flash sale.', 'error');
      return;
    }
    try {
      await apiFetch('/api/admin/flash-sales', {
        method: 'POST',
        body: JSON.stringify({
          title: { en: titleEn.trim(), ar: (titleAr || titleEn).trim() },
          bgToken,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          autoRevert,
          items: selectedItems,
        }),
      });
      setTitleEn('');
      setTitleAr('');
      setSelectedItems([]);
      showToast('Flash sale created with atomic stock caps', 'success');
      await onReload();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
      <form onSubmit={handleCreate} className="hairline-cell lg:col-span-5 p-6 space-y-4 text-xs">
        <div className="flex items-center gap-2 text-[var(--ember)]">
          <Zap className="w-4 h-4" />
          <h3 className="font-display text-xl font-bold text-[var(--bone)]">Schedule Flash Sale</h3>
        </div>
        <p className="text-[var(--muted)]">
          Enforces atomic stock caps on checkout and auto-reverts prices cleanly when the timer expires.
        </p>

        <input
          required
          value={titleEn}
          onChange={(e) => setTitleEn(e.target.value)}
          placeholder="Flash Sale Title (EN)"
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
        />
        <input
          required
          dir="rtl"
          value={titleAr}
          onChange={(e) => setTitleAr(e.target.value)}
          placeholder="عنوان عرض الفلاش (AR)"
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
        />

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="font-mono-tabular uppercase text-[var(--muted)]">Starts At</span>
            <input
              required
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </label>
          <label className="space-y-1">
            <span className="font-mono-tabular uppercase text-[var(--muted)]">Ends At</span>
            <input
              required
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 items-center">
          <select
            value={bgToken}
            onChange={(e) => setBgToken(e.target.value as BannerBgToken)}
            className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
          >
            <option value="ember">Ember Surface</option>
            <option value="gold">Gold Surface</option>
            <option value="cedar">Cedar Surface</option>
            <option value="cyan">Cyan Surface</option>
          </select>
          <label className="flex items-center gap-2 text-[var(--bone)] cursor-pointer">
            <input type="checkbox" checked={autoRevert} onChange={(e) => setAutoRevert(e.target.checked)} />
            <span>Auto-revert on expiry</span>
          </label>
        </div>

        {/* Product Picker */}
        <div className="border border-[var(--line)] bg-[var(--ink)] p-3 space-y-3">
          <p className="font-mono-tabular uppercase text-[var(--muted)]">Add Stock-Capped Products</p>
          <select
            value={pickProductId || products[0]?.id || ''}
            onChange={(e) => setPickProductId(e.target.value)}
            className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title.en} (${(p.basePriceUsdCents / 100).toFixed(2)})
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              min="1"
              max="90"
              value={pickPct}
              onChange={(e) => setPickPct(e.target.value)}
              placeholder="% Off"
              className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1.5 font-mono-tabular text-[var(--bone)]"
            />
            <input
              type="number"
              min="0"
              value={pickCap}
              onChange={(e) => setPickCap(e.target.value)}
              placeholder="Stock Cap"
              className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1.5 font-mono-tabular text-[var(--bone)]"
            />
            <button
              type="button"
              onClick={addProductRow}
              className="inline-flex items-center justify-center gap-1 border border-[var(--cedar)] text-[var(--cedar)] font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {selectedItems.length > 0 && (
            <div className="divide-y divide-[var(--line)] border-t border-[var(--line)] pt-2">
              {selectedItems.map((it) => {
                const prod = products.find((p) => p.id === it.productId);
                return (
                  <div key={it.productId} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[var(--bone)]">{prod?.title.en || it.productId}</span>
                    <div className="flex items-center gap-2 shrink-0 font-mono-tabular">
                      <span className="text-[var(--ember)]">-{it.discountPercent}%</span>
                      <span className="text-[var(--muted)]">cap: {it.stockCap || '∞'}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedItems((p) => p.filter((x) => x.productId !== it.productId))}
                        className="text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
        >
          Launch Flash Sale
        </button>
      </form>

      {/* Right: Flash Sales List */}
      <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
        <h3 className="font-display text-xl font-bold text-[var(--bone)]">
          Flash Sales &amp; Claim Telemetry ({flashSales.length})
        </h3>
        {flashSales.length === 0 ? (
          <EmptyState
            title="No flash sales scheduled"
            description="Create a time-boxed flash sale with per-SKU stock caps and automated price revert."
          />
        ) : (
          <div className="space-y-4">
            {flashSales.map((fs) => (
              <div key={fs.id} className="border border-[var(--line)] bg-[var(--ink)] p-4 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-mono-tabular">
                      <StatusLabel
                        status={fs.status}
                        tone={fs.status === 'active' ? 'cedar' : fs.status === 'scheduled' ? 'gold' : 'muted'}
                      />
                      <span className="text-[var(--muted)]">
                        <Clock className="w-3 h-3 inline me-1" />
                        {fs.startsAt} → {fs.endsAt}
                      </span>
                      {fs.autoRevert && <span className="text-[var(--cyan)]">auto-revert</span>}
                    </div>
                    <h4 className="font-display text-lg font-bold text-[var(--bone)] mt-1">{fs.title.en}</h4>
                  </div>

                  <div className="flex items-center gap-2">
                    {fs.status !== 'active' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/flash-sales/${fs.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'active' }),
                          });
                          await onReload();
                          await refreshBootstrap();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--cedar)] text-[var(--cedar)] cursor-pointer"
                      >
                        <Play className="w-3 h-3" /> Activate
                      </button>
                    )}
                    {fs.status !== 'ended' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/flash-sales/${fs.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'ended' }),
                          });
                          await onReload();
                          await refreshBootstrap();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                      >
                        <Square className="w-3 h-3" /> End Now
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/flash-sales/${fs.id}`, { method: 'DELETE' });
                        showToast('Flash sale deleted', 'info');
                        await onReload();
                        await refreshBootstrap();
                      }}
                      aria-label="Delete flash sale"
                      className="p-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--graphite)]">
                  {fs.items.map((it) => {
                    const pctClaimed = it.stockCap > 0 ? Math.min(100, Math.round((it.claimedCount / it.stockCap) * 100)) : 0;
                    return (
                      <div key={it.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[var(--bone)] font-medium">{it.productTitle?.en || it.productId}</span>
                        <div className="flex items-center gap-3 font-mono-tabular">
                          <span className="text-[var(--ember)] font-bold">-{it.discountPercent}%</span>
                          <PriceDisplay usdCents={it.salePriceUsdCents} compareAtUsdCents={it.basePriceUsdCents} size="sm" />
                          <span className="text-[var(--muted)]">
                            Claimed {it.claimedCount}/{it.stockCap || '∞'}
                          </span>
                          {it.stockCap > 0 && (
                            <div className="w-16 h-1.5 bg-[var(--ink)] overflow-hidden">
                              <div className="h-full bg-[var(--ember)]" style={{ width: `${pctClaimed}%` }} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
