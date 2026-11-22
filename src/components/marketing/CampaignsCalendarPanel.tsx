import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ExternalLink, Sparkles, Trash2, Upload } from 'lucide-react';
import type {
  BannerBgToken,
  Campaign,
  CampaignStatus,
  Coupon,
  FlashSale,
  Offer,
  OfferBanner,
} from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState, StatusLabel } from '../HairlineUI.tsx';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function CampaignsCalendarPanel({
  campaigns,
  offers,
  coupons,
  flashSales,
  banners,
  onReload,
}: {
  campaigns: Campaign[];
  offers: Offer[];
  coupons: Coupon[];
  flashSales: FlashSale[];
  banners: OfferBanner[];
  onReload: () => Promise<void>;
}) {
  const { apiFetch, showToast, navigate, refreshBootstrap } = useMarketplace();
  const [viewMode, setViewMode] = useState<'campaigns' | 'calendar'>('campaigns');

  const [slug, setSlug] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [subtitleEn, setSubtitleEn] = useState('');
  const [subtitleAr, setSubtitleAr] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descAr, setDescAr] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [bgToken, setBgToken] = useState<BannerBgToken>('ember');
  const [status, setStatus] = useState<CampaignStatus>('active');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [featuredOfferIds, setFeaturedOfferIds] = useState<string[]>([]);
  const [featuredCouponCodes, setFeaturedCouponCodes] = useState<string[]>([]);
  const [featuredFlashSaleId, setFeaturedFlashSaleId] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleUploadHero = async (file: File) => {
    setUploading(true);
    try {
      const base64Data = await readFileAsDataUrl(file);
      const res = await apiFetch<{ media: { publicUrl: string } }>('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({
          base64Data,
          mimeType: file.type,
          entityType: 'marketing_campaign',
          folder: 'campaigns',
          alt: { en: titleEn || 'Campaign Hero', ar: titleAr || 'صورة الحملة' },
        }),
      });
      setHeroImageUrl(res.media.publicUrl);
      showToast('Campaign hero image uploaded', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanSlug =
        slug.trim() ||
        titleEn
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') ||
        `campaign-${Date.now()}`;

      await apiFetch('/api/admin/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          slug: cleanSlug,
          title: { en: titleEn.trim(), ar: (titleAr || titleEn).trim() },
          subtitle: { en: subtitleEn.trim(), ar: (subtitleAr || subtitleEn).trim() },
          description: { en: descEn.trim(), ar: (descAr || descEn).trim() },
          heroImageUrl: heroImageUrl.trim() || null,
          bgToken,
          status,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          featuredOfferIds,
          featuredCouponCodes,
          featuredFlashSaleId: featuredFlashSaleId || null,
        }),
      });
      setSlug('');
      setTitleEn('');
      setTitleAr('');
      setSubtitleEn('');
      setSubtitleAr('');
      setDescEn('');
      setDescAr('');
      setHeroImageUrl('');
      setFeaturedOfferIds([]);
      setFeaturedCouponCodes([]);
      setFeaturedFlashSaleId('');
      showToast(`Campaign /campaign/${cleanSlug} created`, 'success');
      await onReload();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const calendarDays = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const events = [
      ...campaigns.map((c) => ({
        id: c.id,
        kind: 'Campaign' as const,
        label: c.title.en,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        color: 'var(--ember)',
      })),
      ...flashSales.map((f) => ({
        id: f.id,
        kind: 'Flash Sale' as const,
        label: f.title.en,
        startsAt: f.startsAt,
        endsAt: f.endsAt,
        color: 'var(--gold)',
      })),
      ...offers.map((o) => ({
        id: o.id,
        kind: 'Offer' as const,
        label: o.title.en,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        color: 'var(--cedar)',
      })),
      ...banners.map((b) => ({
        id: b.id,
        kind: 'Banner' as const,
        label: b.title.en,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        color: 'var(--cyan)',
      })),
    ];

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStart = new Date(year, month, d, 0, 0, 0).getTime();
      const dayEnd = new Date(year, month, d, 23, 59, 59).getTime();
      const activeToday = events.filter((ev) => {
        const s = ev.startsAt ? Date.parse(ev.startsAt) : -Infinity;
        const e = ev.endsAt ? Date.parse(ev.endsAt) : Infinity;
        return s <= dayEnd && e >= dayStart;
      });
      days.push({ day: d, activeToday });
    }
    return { monthLabel, days };
  }, [campaigns, flashSales, offers, banners]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] bg-[var(--graphite)] px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('campaigns')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 border font-semibold cursor-pointer ${
              viewMode === 'campaigns'
                ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                : 'border-[var(--line)] text-[var(--bone)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Campaign Landing Pages ({campaigns.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 border font-semibold cursor-pointer ${
              viewMode === 'calendar'
                ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                : 'border-[var(--line)] text-[var(--bone)]'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" /> Unified Marketing Calendar
          </button>
        </div>
        <span className="font-mono-tabular text-[var(--muted)]">
          Public URL: <code className="text-[var(--bone)]">/campaign/&lt;slug&gt;</code>
        </span>
      </div>

      {viewMode === 'calendar' ? (
        <div className="border border-[var(--line)] bg-[var(--graphite)] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-xl font-bold text-[var(--bone)]">
              Marketing Schedule · {calendarDays.monthLabel}
            </h3>
            <div className="flex flex-wrap gap-3 text-[11px] font-mono-tabular">
              <span className="text-[var(--ember)]">■ Campaign</span>
              <span className="text-[var(--gold)]">■ Flash Sale</span>
              <span className="text-[var(--cedar)]">■ Offer</span>
              <span className="text-[var(--cyan)]">■ Banner</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 border-t border-s border-[var(--line)]">
            {calendarDays.days.map((d) => (
              <div key={d.day} className="min-h-[110px] border-e border-b border-[var(--line)] bg-[var(--ink)] p-2 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--muted)]">
                  <span>Day {d.day}</span>
                  {d.activeToday.length > 0 && <span>{d.activeToday.length}</span>}
                </div>
                <div className="space-y-1">
                  {d.activeToday.slice(0, 4).map((ev) => (
                    <div
                      key={`${d.day}-${ev.id}`}
                      className="px-1.5 py-0.5 border border-[var(--line)] bg-[var(--graphite)] text-[10px] truncate"
                      style={{ borderInlineStartWidth: '3px', borderInlineStartColor: ev.color }}
                      title={`${ev.kind}: ${ev.label}`}
                    >
                      {ev.label}
                    </div>
                  ))}
                  {d.activeToday.length > 4 && (
                    <p className="text-[10px] font-mono-tabular text-[var(--muted)]">
                      +{d.activeToday.length - 4} more
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
          <form onSubmit={handleCreateCampaign} className="hairline-cell lg:col-span-5 p-6 space-y-3 text-xs">
            <h3 className="font-display text-xl font-bold text-[var(--bone)]">Create Campaign Landing Page</h3>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="URL Slug (e.g. beirut-summer-edit)"
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="Campaign Title (EN)"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
              <input
                required
                dir="rtl"
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                placeholder="عنوان الحملة (AR)"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={subtitleEn}
                onChange={(e) => setSubtitleEn(e.target.value)}
                placeholder="Subtitle (EN)"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
              <input
                dir="rtl"
                value={subtitleAr}
                onChange={(e) => setSubtitleAr(e.target.value)}
                placeholder="العنوان الفرعي (AR)"
                className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
            </div>
            <textarea
              rows={2}
              value={descEn}
              onChange={(e) => setDescEn(e.target.value)}
              placeholder="Description (EN)"
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
            />
            <textarea
              rows={2}
              dir="rtl"
              value={descAr}
              onChange={(e) => setDescAr(e.target.value)}
              placeholder="وصف الحملة (AR)"
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
            />

            <div className="flex items-center gap-2">
              <input
                value={heroImageUrl}
                onChange={(e) => setHeroImageUrl(e.target.value)}
                placeholder="Hero Image URL (or upload)"
                className="flex-1 bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
              />
              <label className="inline-flex items-center gap-1 px-3 py-2 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? '...' : 'Upload'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadHero(file);
                  }}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={bgToken}
                onChange={(e) => setBgToken(e.target.value as BannerBgToken)}
                className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                <option value="ember">Ember Border</option>
                <option value="gold">Gold Border</option>
                <option value="cedar">Cedar Border</option>
                <option value="cyan">Cyan Border</option>
                <option value="sand">Sand Border</option>
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CampaignStatus)}
                className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                <option value="active">Active</option>
                <option value="scheduled">Scheduled</option>
                <option value="draft">Draft</option>
                <option value="ended">Ended</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                aria-label="Campaign start"
                className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
              />
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                aria-label="Campaign end"
                className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
              />
            </div>

            {flashSales.length > 0 && (
              <select
                value={featuredFlashSaleId}
                onChange={(e) => setFeaturedFlashSaleId(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                <option value="">Attach Flash Sale (optional)</option>
                {flashSales.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title.en}
                  </option>
                ))}
              </select>
            )}

            {coupons.length > 0 && (
              <div className="border border-[var(--line)] bg-[var(--ink)] p-2.5 space-y-1 max-h-28 overflow-y-auto">
                <p className="font-mono-tabular uppercase text-[var(--muted)]">Feature Coupon Codes</p>
                <div className="flex flex-wrap gap-2">
                  {coupons.map((cp) => {
                    const checked = featuredCouponCodes.includes(cp.code);
                    return (
                      <label key={cp.id} className="inline-flex items-center gap-1 text-[var(--bone)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setFeaturedCouponCodes((prev) =>
                              e.target.checked ? [...prev, cp.code] : prev.filter((x) => x !== cp.code)
                            )
                          }
                        />
                        <span className="font-mono-tabular">{cp.code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {offers.length > 0 && (
              <div className="border border-[var(--line)] bg-[var(--ink)] p-2.5 space-y-1 max-h-28 overflow-y-auto">
                <p className="font-mono-tabular uppercase text-[var(--muted)]">Feature Offers</p>
                {offers.map((off) => {
                  const checked = featuredOfferIds.includes(off.id);
                  return (
                    <label key={off.id} className="flex items-center gap-2 text-[var(--bone)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setFeaturedOfferIds((prev) =>
                            e.target.checked ? [...prev, off.id] : prev.filter((x) => x !== off.id)
                          )
                        }
                      />
                      <span className="truncate">{off.title.en}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
            >
              Publish Campaign Page
            </button>
          </form>

          <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
            <h3 className="font-display text-xl font-bold text-[var(--bone)]">Campaigns ({campaigns.length})</h3>
            {campaigns.length === 0 ? (
              <EmptyState
                title="No campaigns created yet"
                description="Build seasonal landing pages (/campaign/:slug) combining offers, flash sales, and copyable coupons."
              />
            ) : (
              <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
                {campaigns.map((cmp) => (
                  <div key={cmp.id} className="p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--ink)] text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono-tabular">
                        <StatusLabel
                          status={cmp.status}
                          tone={cmp.status === 'active' ? 'cedar' : cmp.status === 'scheduled' ? 'gold' : 'muted'}
                        />
                        <span className="text-[var(--cyan)]">/campaign/{cmp.slug}</span>
                      </div>
                      <p className="font-display text-lg font-bold text-[var(--bone)]">{cmp.title.en}</p>
                      <p className="text-[11px] font-mono-tabular text-[var(--muted)]">
                        {cmp.featuredOfferIds.length} offer(s) · {cmp.featuredCouponCodes.length} coupon(s)
                        {cmp.featuredFlashSaleId ? ' · 1 flash sale' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/campaign/${cmp.slug}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/campaigns/${cmp.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: cmp.status === 'active' ? 'ended' : 'active' }),
                          });
                          await onReload();
                          await refreshBootstrap();
                        }}
                        className="px-2.5 py-1.5 border border-[var(--line)] text-[var(--bone)] cursor-pointer"
                      >
                        {cmp.status === 'active' ? 'End' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/campaigns/${cmp.id}`, { method: 'DELETE' });
                          showToast('Campaign deleted', 'info');
                          await onReload();
                          await refreshBootstrap();
                        }}
                        aria-label="Delete campaign"
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
      )}
    </div>
  );
}
