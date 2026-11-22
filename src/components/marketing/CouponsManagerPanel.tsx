import React, { useState } from 'react';
import { Copy, Download, FileSpreadsheet, Layers, Plus, Trash2, Upload } from 'lucide-react';
import type { Campaign, Coupon, CouponDiscountType } from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState } from '../HairlineUI.tsx';

export function CouponsManagerPanel({
  coupons,
  campaigns = [],
  onReload,
}: {
  coupons: Coupon[];
  campaigns?: Campaign[];
  onReload: () => Promise<void>;
}) {
  const { apiFetch, showToast } = useMarketplace();
  const [mode, setMode] = useState<'single' | 'bulk' | 'csv'>('single');

  // Single coupon state
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<CouponDiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('15');
  const [maxDiscUsd, setMaxDiscUsd] = useState('');
  const [minOrderUsd, setMinOrderUsd] = useState('0');
  const [maxUses, setMaxUses] = useState('');
  const [perCustomerLimit, setPerCustomerLimit] = useState('1');
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);
  const [campaignId, setCampaignId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // Bulk generator state
  const [bulkPrefix, setBulkPrefix] = useState('VIP');
  const [bulkCount, setBulkCount] = useState('10');
  const [bulkType, setBulkType] = useState<CouponDiscountType>('percent');
  const [bulkValue, setBulkValue] = useState('15');
  const [bulkPerCust, setBulkPerCust] = useState('1');

  // CSV Import state
  const [csvText, setCsvText] = useState('code,discount_type,discount_value,min_order_usd,max_uses,per_customer_limit\nBEIRUT20,percent,20,30,100,1');

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericVal = Number(discountValue || 0);
    const valInt =
      discountType === 'fixed_usd_cents'
        ? Math.round(numericVal * 100)
        : discountType === 'free_shipping'
          ? 0
          : Math.round(numericVal);
    try {
      await apiFetch('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim(),
          discountType,
          discountValue: valInt,
          maxDiscountUsdCents: maxDiscUsd ? Math.round(Number(maxDiscUsd) * 100) : null,
          minOrderUsdCents: Math.max(0, Math.round(Number(minOrderUsd || 0) * 100)),
          maxUses: maxUses ? Math.max(1, Math.round(Number(maxUses))) : null,
          perCustomerLimit: Math.max(1, Math.round(Number(perCustomerLimit || 1))),
          firstOrderOnly,
          campaignId: campaignId || null,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          active: true,
        }),
      });
      setCode('');
      showToast('Coupon created', 'success');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleBulkGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericVal = Number(bulkValue || 0);
    const valInt =
      bulkType === 'fixed_usd_cents'
        ? Math.round(numericVal * 100)
        : bulkType === 'free_shipping'
          ? 0
          : Math.round(numericVal);
    try {
      const res = await apiFetch<{ batchId: string; created: Coupon[] }>('/api/admin/coupons/bulk', {
        method: 'POST',
        body: JSON.stringify({
          prefix: bulkPrefix.trim(),
          count: Math.min(200, Math.max(1, Math.round(Number(bulkCount || 5)))),
          discountType: bulkType,
          discountValue: valInt,
          perCustomerLimit: Math.max(1, Math.round(Number(bulkPerCust || 1))),
          maxUsesPerCode: 1,
        }),
      });
      showToast(`Generated ${res.created.length} unique coupons (${res.batchId})`, 'success');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ imported: number; skipped: string[] }>('/api/admin/coupons/import-csv', {
        method: 'POST',
        body: JSON.stringify({ csvText }),
      });
      showToast(`Imported ${res.imported} coupons (${res.skipped.length} skipped)`, 'success');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await fetch('/api/admin/coupons/export-csv', { credentials: 'include' });
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nilelink-coupons.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
      {/* Left: Single / Bulk / CSV Import */}
      <div className="hairline-cell lg:col-span-5 p-6 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl font-bold text-[var(--bone)]">Coupons &amp; Bulk Engine</h3>
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>

        <div className="grid grid-cols-3 border border-[var(--line)] divide-x divide-[var(--line)]">
          {[
            { id: 'single' as const, label: 'Single Code', icon: Plus },
            { id: 'bulk' as const, label: 'Bulk Batch', icon: Layers },
            { id: 'csv' as const, label: 'Import CSV', icon: FileSpreadsheet },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`py-2 px-2 inline-flex items-center justify-center gap-1.5 font-semibold cursor-pointer ${
                  mode === m.id ? 'bg-[var(--ember)] text-[var(--ember-fg)]' : 'bg-[var(--ink)] text-[var(--muted)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {mode === 'single' && (
          <form onSubmit={handleCreateSingle} className="space-y-3">
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Coupon Code (e.g. CEDAR25)"
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular uppercase text-[var(--bone)]"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}
                className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                <option value="percent">Percent (%)</option>
                <option value="fixed_usd_cents">Fixed USD Off ($)</option>
                <option value="free_shipping">Free Shipping</option>
              </select>
              {discountType !== 'free_shipping' && (
                <input
                  required
                  type="number"
                  step={discountType === 'fixed_usd_cents' ? '0.5' : '1'}
                  min="1"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'fixed_usd_cents' ? 'USD Off' : 'Percent %'}
                  className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="font-mono-tabular text-[var(--muted)]">Min Order ($)</span>
                <input
                  type="number"
                  min="0"
                  value={minOrderUsd}
                  onChange={(e) => setMinOrderUsd(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
                />
              </label>
              <label className="space-y-1">
                <span className="font-mono-tabular text-[var(--muted)]">Max Discount Cap ($)</span>
                <input
                  type="number"
                  min="1"
                  value={maxDiscUsd}
                  onChange={(e) => setMaxDiscUsd(e.target.value)}
                  placeholder="Unlimited"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="font-mono-tabular text-[var(--muted)]">Global Max Uses</span>
                <input
                  type="number"
                  min="1"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
                />
              </label>
              <label className="space-y-1">
                <span className="font-mono-tabular text-[var(--muted)]">Per Customer Limit</span>
                <input
                  type="number"
                  min="1"
                  value={perCustomerLimit}
                  onChange={(e) => setPerCustomerLimit(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                aria-label="Coupon start"
                className="bg-[var(--ink)] border border-[var(--line)] px-2 py-2 font-mono-tabular text-[var(--bone)]"
              />
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                aria-label="Coupon end"
                className="bg-[var(--ink)] border border-[var(--line)] px-2 py-2 font-mono-tabular text-[var(--bone)]"
              />
            </div>

            {campaigns.length > 0 && (
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                <option value="">No Linked Campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title.en}
                  </option>
                ))}
              </select>
            )}

            <label className="flex items-center gap-2 text-[var(--bone)] cursor-pointer">
              <input
                type="checkbox"
                checked={firstOrderOnly}
                onChange={(e) => setFirstOrderOnly(e.target.checked)}
              />
              <span>Restrict to first-time orders only</span>
            </label>

            <button
              type="submit"
              className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
            >
              Create Coupon
            </button>
          </form>
        )}

        {mode === 'bulk' && (
          <form onSubmit={handleBulkGenerate} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="font-mono-tabular text-[var(--muted)]">Prefix</span>
                <input
                  required
                  value={bulkPrefix}
                  onChange={(e) => setBulkPrefix(e.target.value.toUpperCase())}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular uppercase text-[var(--bone)]"
                />
              </label>
              <label className="space-y-1">
                <span className="font-mono-tabular text-[var(--muted)]">Count (1–200)</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="200"
                  value={bulkCount}
                  onChange={(e) => setBulkCount(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={bulkType}
                onChange={(e) => setBulkType(e.target.value as CouponDiscountType)}
                className="bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[var(--bone)]"
              >
                <option value="percent">Percent %</option>
                <option value="fixed_usd_cents">USD Off $</option>
                <option value="free_shipping">Free Ship</option>
              </select>
              <input
                type="number"
                min="1"
                disabled={bulkType === 'free_shipping'}
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                className="bg-[var(--ink)] border border-[var(--line)] px-2 py-2 font-mono-tabular text-[var(--bone)] disabled:opacity-40"
              />
              <input
                type="number"
                min="1"
                value={bulkPerCust}
                onChange={(e) => setBulkPerCust(e.target.value)}
                placeholder="Per user"
                className="bg-[var(--ink)] border border-[var(--line)] px-2 py-2 font-mono-tabular text-[var(--bone)]"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
            >
              Generate Unique Batch
            </button>
          </form>
        )}

        {mode === 'csv' && (
          <form onSubmit={handleImportCsv} className="space-y-3">
            <p className="text-[var(--muted)]">
              Columns: <code className="text-[var(--bone)]">code,discount_type,discount_value,min_order_usd,max_uses,per_customer_limit</code>
            </p>
            <textarea
              rows={7}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] p-3 font-mono-tabular text-[11px] text-[var(--bone)]"
            />
            <button
              type="submit"
              className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV Coupons
            </button>
          </form>
        )}
      </div>

      {/* Right: Coupons List */}
      <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
        <h3 className="font-display text-xl font-bold text-[var(--bone)]">Active &amp; Scheduled Coupons ({coupons.length})</h3>
        {coupons.length === 0 ? (
          <EmptyState
            title="No coupons created yet"
            description="Create a single promo code, generate a unique VIP batch, or import from CSV."
          />
        ) : (
          <div className="divide-y divide-[var(--line)] border border-[var(--line)] max-h-[620px] overflow-y-auto">
            {coupons.map((c) => {
              const pctUsed = c.maxUses ? Math.min(100, Math.round((c.usedCount / c.maxUses) * 100)) : null;
              return (
                <div key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--ink)] text-xs">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
                      <span className="text-sm font-bold text-[var(--gold)]">{c.code}</span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(c.code);
                          showToast(`Copied ${c.code}`, 'info');
                        }}
                        aria-label={`Copy ${c.code}`}
                        className="text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <span className="text-[var(--ember)] font-bold">
                        {c.discountType === 'free_shipping'
                          ? 'FREE SHIPPING'
                          : c.discountType === 'fixed_usd_cents'
                            ? `-$${(c.discountValue / 100).toFixed(2)}`
                            : `-${c.discountValue}%`}
                      </span>
                      {c.firstOrderOnly && <span className="text-[var(--cyan)]">1st Order</span>}
                      {c.autoGeneratedBatch && <span className="text-[var(--muted)]">{c.autoGeneratedBatch}</span>}
                    </div>
                    <p className="text-[11px] font-mono-tabular text-[var(--muted)]">
                      Min ${(c.minOrderUsdCents / 100).toFixed(2)} · Used {c.usedCount}
                      {c.maxUses ? `/${c.maxUses}` : ''} · Per Customer: {c.perCustomerLimit}
                    </p>
                    {pctUsed !== null && (
                      <div className="w-48 h-1 bg-[var(--graphite)] overflow-hidden">
                        <div className="h-full bg-[var(--cedar)]" style={{ width: `${pctUsed}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/coupons/${c.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ active: !c.active }),
                        });
                        await onReload();
                      }}
                      className={`px-2.5 py-1 border cursor-pointer ${
                        c.active ? 'border-[var(--cedar)] text-[var(--cedar)]' : 'border-[var(--line)] text-[var(--muted)]'
                      }`}
                    >
                      {c.active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/coupons/${c.id}`, { method: 'DELETE' });
                        showToast('Coupon deleted', 'info');
                        await onReload();
                      }}
                      aria-label="Delete coupon"
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
