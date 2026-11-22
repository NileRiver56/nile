import React, { useState } from 'react';
import { Eye, Mail, Plus, Trash2, Users } from 'lucide-react';
import type {
  CustomerSegment,
  CustomerSegmentRule,
  NewsletterSubscriber,
  SegmentContact,
} from '../../shared/types.ts';
import { LEBANON_GOVERNORATES } from '../../shared/lebanon.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState } from '../HairlineUI.tsx';

export function SegmentsPanel({
  segments,
  subscribers,
  onReload,
}: {
  segments: CustomerSegment[];
  subscribers: NewsletterSubscriber[];
  onReload: () => Promise<void>;
}) {
  const { apiFetch, showToast } = useMarketplace();

  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [description, setDescription] = useState('');
  const [audienceScope, setAudienceScope] = useState<CustomerSegmentRule['audienceScope']>('all_contacts');
  const [governorate, setGovernorate] = useState('all');
  const [localeFilter, setLocaleFilter] = useState<'all' | 'en' | 'ar'>('all');
  const [minOrders, setMinOrders] = useState('');
  const [maxOrders, setMaxOrders] = useState('');
  const [minSpentUsd, setMinSpentUsd] = useState('');
  const [daysSinceLastOrder, setDaysSinceLastOrder] = useState('');

  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<{ count: number; contacts: SegmentContact[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const buildRules = (): CustomerSegmentRule => {
    const rules: CustomerSegmentRule = {
      audienceScope,
      locale: localeFilter,
    };
    if (governorate && governorate !== 'all') rules.governorate = governorate;
    if (minOrders.trim() !== '') rules.minOrderCount = Math.max(0, Math.trunc(Number(minOrders) || 0));
    if (maxOrders.trim() !== '') rules.maxOrderCount = Math.max(0, Math.trunc(Number(maxOrders) || 0));
    if (minSpentUsd.trim() !== '' && Number(minSpentUsd) > 0) {
      rules.minTotalSpentUsdCents = Math.round(Number(minSpentUsd) * 100);
    }
    if (daysSinceLastOrder.trim() !== '' && Number(daysSinceLastOrder) > 0) {
      rules.daysSinceLastOrder = Math.max(1, Math.trunc(Number(daysSinceLastOrder)));
    }
    return rules;
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await apiFetch<{ count: number; contacts: SegmentContact[] }>('/api/admin/segments/preview', {
        method: 'POST',
        body: JSON.stringify(buildRules()),
      });
      setPreviewResult(res);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const handleCreate = async () => {
    if (!nameEn.trim() || !nameAr.trim()) {
      showToast('Enter both English and Arabic segment names.', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/admin/segments', {
        method: 'POST',
        body: JSON.stringify({
          name: { en: nameEn.trim(), ar: nameAr.trim() },
          description: description.trim(),
          rules: buildRules(),
        }),
      });
      showToast('Customer segment saved.', 'success');
      setNameEn('');
      setNameAr('');
      setDescription('');
      setPreviewResult(null);
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/admin/segments/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      showToast('Segment deleted.', 'info');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const subscribedCount = subscribers.filter((s) => s.status === 'subscribed').length;
  const unsubscribedCount = subscribers.filter((s) => s.status === 'unsubscribed').length;

  return (
    <div className="space-y-6">
      {/* Segment Rule Builder */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-[var(--bone)]">
              Dynamic Customer Segment Builder
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Target shoppers and newsletter contacts by governorate, order frequency, total spend (USD), inactivity, and language.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={previewing}
              onClick={handlePreview}
              className="inline-flex items-center gap-2 border border-[var(--cyan)] px-4 py-2 text-xs font-bold uppercase text-[var(--cyan)] hover:bg-[var(--ink)] cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{previewing ? 'Evaluating...' : 'Preview Matching Audience'}</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleCreate}
              className="inline-flex items-center gap-2 bg-[var(--ember)] text-[var(--ember-fg)] px-4 py-2 text-xs font-bold uppercase cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Segment'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Segment Name (EN)</span>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="Beirut VIP Shoppers"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Segment Name (AR)</span>
            <input
              dir="rtl"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="متسوقو بيروت المميزون"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Customers with >= $100 spend in Beirut"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2 border-t border-[var(--line)]">
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Audience Scope</span>
            <select
              value={audienceScope}
              onChange={(e) => setAudienceScope(e.target.value as CustomerSegmentRule['audienceScope'])}
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            >
              <option value="all_contacts">All Customers + Subscribers</option>
              <option value="registered_customers">Registered Customers Only</option>
              <option value="newsletter_subscribers">Newsletter Subscribers Only</option>
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Governorate</span>
            <select
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            >
              <option value="all">All Governorates</option>
              {LEBANON_GOVERNORATES.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.name.en} ({g.name.ar})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Preferred Language</span>
            <select
              value={localeFilter}
              onChange={(e) => setLocaleFilter(e.target.value as 'all' | 'en' | 'ar')}
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            >
              <option value="all">All Languages (EN + AR)</option>
              <option value="en">English Only</option>
              <option value="ar">Arabic Only</option>
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Min Total Spent (USD)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={minSpentUsd}
              onChange={(e) => setMinSpentUsd(e.target.value)}
              placeholder="e.g. 50"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)] font-mono-tabular"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Min Order Count</span>
            <input
              type="number"
              min="0"
              step="1"
              value={minOrders}
              onChange={(e) => setMinOrders(e.target.value)}
              placeholder="e.g. 1"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)] font-mono-tabular"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Max Order Count</span>
            <input
              type="number"
              min="0"
              step="1"
              value={maxOrders}
              onChange={(e) => setMaxOrders(e.target.value)}
              placeholder="Optional"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)] font-mono-tabular"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Days Since Last Order (&ge;)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={daysSinceLastOrder}
              onChange={(e) => setDaysSinceLastOrder(e.target.value)}
              placeholder="e.g. 30 for inactive"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)] font-mono-tabular"
            />
          </label>
        </div>

        {/* Live Audience Preview */}
        {previewResult && (
          <div className="border border-[var(--cyan)] bg-[var(--ink)] p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono-tabular">
              <span className="text-[var(--cyan)] font-bold uppercase">
                Live Segment Match: {previewResult.count} contact{previewResult.count === 1 ? '' : 's'}
              </span>
              <span className="text-[var(--muted)]">Showing up to 50 contacts (unsubscribed contacts excluded)</span>
            </div>
            {previewResult.contacts.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No contacts match these criteria right now.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[var(--muted)] font-mono-tabular uppercase">
                      <th className="py-1.5 pr-3">Name</th>
                      <th className="py-1.5 pr-3">Email</th>
                      <th className="py-1.5 pr-3">Source</th>
                      <th className="py-1.5 pr-3">Locale</th>
                      <th className="py-1.5 pr-3">Gov</th>
                      <th className="py-1.5 pr-3">Orders</th>
                      <th className="py-1.5">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.contacts.map((c) => (
                      <tr key={c.email} className="border-b border-[var(--line)]/50">
                        <td className="py-1.5 pr-3 text-[var(--bone)]">{c.name}</td>
                        <td className="py-1.5 pr-3 font-mono-tabular text-[var(--bone)]">{c.email}</td>
                        <td className="py-1.5 pr-3 uppercase font-mono-tabular text-[var(--muted)]">{c.source}</td>
                        <td className="py-1.5 pr-3 uppercase font-mono-tabular">{c.locale}</td>
                        <td className="py-1.5 pr-3 font-mono-tabular">{c.governorate || '—'}</td>
                        <td className="py-1.5 pr-3 font-mono-tabular">{c.orderCount}</td>
                        <td className="py-1.5 font-mono-tabular text-[var(--cedar)]">
                          ${(c.totalSpentUsdCents / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Saved Segments */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--ember)]" />
          <h3 className="font-display text-lg font-bold text-[var(--bone)]">Saved Segments ({segments.length})</h3>
        </div>
        {segments.length === 0 ? (
          <EmptyState
            title="No customer segments yet"
            description="Create a dynamic segment above to target specific Lebanese governorates, VIP spenders, or newsletter subscribers."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {segments.map((seg) => (
              <div key={seg.id} className="border border-[var(--line)] bg-[var(--ink)] p-4 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-display font-bold text-[var(--bone)]">
                      {seg.name.en} <span className="text-[var(--muted)] font-normal">/ {seg.name.ar}</span>
                    </div>
                    <span className="border border-[var(--cedar)] px-2 py-0.5 text-[11px] font-mono-tabular text-[var(--cedar)]">
                      {seg.cachedMemberCount} members
                    </span>
                  </div>
                  {seg.description && <p className="text-xs text-[var(--muted)]">{seg.description}</p>}
                  <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] font-mono-tabular text-[var(--muted)]">
                    <span className="border border-[var(--line)] px-2 py-0.5">{seg.rules.audienceScope}</span>
                    {seg.rules.governorate && (
                      <span className="border border-[var(--line)] px-2 py-0.5">gov:{seg.rules.governorate}</span>
                    )}
                    {seg.rules.locale && seg.rules.locale !== 'all' && (
                      <span className="border border-[var(--line)] px-2 py-0.5">lang:{seg.rules.locale}</span>
                    )}
                    {seg.rules.minOrderCount !== undefined && (
                      <span className="border border-[var(--line)] px-2 py-0.5">orders&ge;{seg.rules.minOrderCount}</span>
                    )}
                    {seg.rules.maxOrderCount !== undefined && (
                      <span className="border border-[var(--line)] px-2 py-0.5">orders&le;{seg.rules.maxOrderCount}</span>
                    )}
                    {seg.rules.minTotalSpentUsdCents !== undefined && (
                      <span className="border border-[var(--line)] px-2 py-0.5">
                        spent&ge;${(seg.rules.minTotalSpentUsdCents / 100).toFixed(0)}
                      </span>
                    )}
                    {seg.rules.daysSinceLastOrder !== undefined && (
                      <span className="border border-[var(--line)] px-2 py-0.5">
                        inactive&ge;{seg.rules.daysSinceLastOrder}d
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] pt-2">
                  {confirmDeleteId === seg.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(seg.id)}
                        className="border border-[var(--crimson)] bg-[var(--crimson)] text-white px-2.5 py-1 text-xs font-bold cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(seg.id)}
                      className="inline-flex items-center gap-1 border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--crimson)] hover:border-[var(--crimson)] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Newsletter Subscribers Roster */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[var(--cyan)]" />
            <h3 className="font-display text-lg font-bold text-[var(--bone)]">
              Newsletter Subscribers ({subscribers.length})
            </h3>
          </div>
          <div className="flex gap-2 text-xs font-mono-tabular">
            <span className="border border-[var(--cedar)] px-2.5 py-1 text-[var(--cedar)]">
              Subscribed: {subscribedCount}
            </span>
            <span className="border border-[var(--crimson)] px-2.5 py-1 text-[var(--crimson)]">
              Unsubscribed: {unsubscribedCount}
            </span>
          </div>
        </div>
        {subscribers.length === 0 ? (
          <EmptyState
            title="No newsletter subscribers yet"
            description="Signups from the homepage footer or newsletter modal will appear here with consent and opt-out tracking."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--muted)] font-mono-tabular uppercase">
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Locale</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Consented At</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.slice(0, 100).map((s) => (
                  <tr key={s.id} className="border-b border-[var(--line)]/50">
                    <td className="py-2 pr-3 font-mono-tabular text-[var(--bone)]">{s.email}</td>
                    <td className="py-2 pr-3 uppercase font-mono-tabular">{s.locale}</td>
                    <td className="py-2 pr-3 text-[var(--muted)]">{s.source}</td>
                    <td className="py-2 pr-3 font-mono-tabular uppercase">
                      <span
                        className={`border px-2 py-0.5 text-[10px] ${
                          s.status === 'subscribed'
                            ? 'border-[var(--cedar)] text-[var(--cedar)]'
                            : 'border-[var(--crimson)] text-[var(--crimson)]'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-2 font-mono-tabular text-[var(--muted)]">{s.consentedAt}</td>
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
