import React, { useState } from 'react';
import { Edit3, ShieldAlert, Trash2, Upload } from 'lucide-react';
import type {
  BannerBgToken,
  BannerPageScope,
  BannerPlacementType,
  DeviceTargetType,
  MarketingAudienceType,
  OfferBanner,
} from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState } from '../HairlineUI.tsx';

const BANNER_PAGES: BannerPageScope[] = ['home', 'catalog', 'checkout', 'store'];
const BANNER_TOKENS: BannerBgToken[] = ['graphite', 'ember', 'cedar', 'gold', 'cyan', 'sand'];
const BANNER_PLACEMENTS: Array<{ id: BannerPlacementType; label: string }> = [
  { id: 'top_bar', label: 'Header Top Bar (Global)' },
  { id: 'page_strip', label: 'Page Top Strip' },
  { id: 'category_header', label: 'Category Header Banner' },
  { id: 'inline_card', label: 'Inline Content Card' },
  { id: 'floating_strip', label: 'Bottom Floating Notice' },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function toDatetimeLocalValue(raw?: string | null): string {
  if (!raw) return '';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BannersManagerPanel({
  banners,
  onReload,
}: {
  banners: OfferBanner[];
  onReload: () => Promise<void>;
}) {
  const { apiFetch, showToast, refreshBootstrap } = useMarketplace();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [ctaEn, setCtaEn] = useState('Shop Now');
  const [ctaAr, setCtaAr] = useState('تسوق الآن');
  const [targetUrl, setTargetUrl] = useState('/catalog?deals=true');
  const [placement, setPlacement] = useState<BannerPlacementType>('page_strip');
  const [pages, setPages] = useState<BannerPageScope[]>(['home', 'catalog']);
  const [bgToken, setBgToken] = useState<BannerBgToken>('ember');
  const [audience, setAudience] = useState<MarketingAudienceType>('all');
  const [deviceTarget, setDeviceTarget] = useState<DeviceTargetType>('all');
  const [categorySlug, setCategorySlug] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [dismissible, setDismissible] = useState(true);
  const [priority, setPriority] = useState('10');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [uploading, setUploading] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setTitleEn('');
    setTitleAr('');
    setCtaEn('Shop Now');
    setCtaAr('تسوق الآن');
    setTargetUrl('/catalog?deals=true');
    setPlacement('page_strip');
    setPages(['home', 'catalog']);
    setBgToken('ember');
    setAudience('all');
    setDeviceTarget('all');
    setCategorySlug('');
    setImageUrl('');
    setDismissible(true);
    setPriority('10');
    setStartsAt('');
    setEndsAt('');
  };

  const startEdit = (b: OfferBanner) => {
    setEditingId(b.id);
    setTitleEn(b.title.en);
    setTitleAr(b.title.ar);
    setCtaEn(b.ctaLabel?.en || '');
    setCtaAr(b.ctaLabel?.ar || '');
    setTargetUrl(b.targetUrl);
    setPlacement(b.placement || 'page_strip');
    setPages(b.pages);
    setBgToken(b.bgToken);
    setAudience(b.audience || 'all');
    setDeviceTarget(b.deviceTarget || 'all');
    setCategorySlug(b.categorySlug || '');
    setImageUrl(b.imageUrl || '');
    setDismissible(b.dismissible !== false);
    setPriority(String(b.priority));
    setStartsAt(toDatetimeLocalValue(b.startsAt));
    setEndsAt(toDatetimeLocalValue(b.endsAt));
  };

  const handleUploadImage = async (file: File) => {
    setUploading(true);
    try {
      const base64Data = await readFileAsDataUrl(file);
      const res = await apiFetch<{ media: { publicUrl: string } }>('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({
          base64Data,
          mimeType: file.type,
          entityType: 'marketing_banner',
          folder: 'banners',
        }),
      });
      setImageUrl(res.media.publicUrl);
      showToast('Banner thumbnail uploaded', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pages.length === 0) {
      showToast('Select at least one target page.', 'error');
      return;
    }

    const payload = {
      title: { en: titleEn.trim(), ar: (titleAr || titleEn).trim() },
      ctaLabel: ctaEn.trim() || ctaAr.trim() ? { en: ctaEn.trim(), ar: (ctaAr || ctaEn).trim() } : undefined,
      bgToken,
      targetUrl: targetUrl.trim() || '/catalog',
      pages,
      placement,
      imageUrl: imageUrl.trim() || null,
      dismissible,
      audience,
      deviceTarget,
      categorySlug: placement === 'category_header' ? categorySlug.trim() || null : null,
      priority: Number(priority || 10),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      active: true,
    };

    try {
      if (editingId) {
        await apiFetch(`/api/admin/banners/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Banner updated', 'success');
      } else {
        await apiFetch('/api/admin/banners', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Multi-placement banner published', 'success');
      }
      resetForm();
      await onReload();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
      <form onSubmit={handleSubmit} className="hairline-cell lg:col-span-5 p-6 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xl font-bold text-[var(--bone)]">
            {editingId ? 'Edit Banner Placement' : 'Create Multi-Placement Banner'}
          </h3>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-2 py-1 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
            >
              Cancel Edit
            </button>
          )}
        </div>
        <p className="text-[var(--muted)]">
          Publish banners to Top Bar, Page Strip, Category Header, Inline Card, or Floating Notice with bot-filtered &amp; deduplicated tracking.
        </p>

        <input
          required
          value={titleEn}
          onChange={(e) => setTitleEn(e.target.value)}
          placeholder="Banner copy (EN)"
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
        />
        <input
          required
          dir="rtl"
          value={titleAr}
          onChange={(e) => setTitleAr(e.target.value)}
          placeholder="نص الإعلان الترويجي (AR)"
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            value={ctaEn}
            onChange={(e) => setCtaEn(e.target.value)}
            placeholder="CTA Label (EN)"
            className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
          />
          <input
            dir="rtl"
            value={ctaAr}
            onChange={(e) => setCtaAr(e.target.value)}
            placeholder="نص الزر (AR)"
            className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Placement Slot</span>
            <select
              value={placement}
              onChange={(e) => setPlacement(e.target.value as BannerPlacementType)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              {BANNER_PLACEMENTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Accent Token</span>
            <select
              value={bgToken}
              onChange={(e) => setBgToken(e.target.value as BannerBgToken)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              {BANNER_TOKENS.map((tok) => (
                <option key={tok} value={tok}>
                  {tok}
                </option>
              ))}
            </select>
          </label>
        </div>

        {placement === 'category_header' && (
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Department / Category Filter</span>
            <select
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              <option value="">All Categories</option>
              <option value="fashion">fashion</option>
              <option value="electronics">electronics</option>
              <option value="home-gadgets">home-gadgets</option>
            </select>
          </label>
        )}

        <div className="grid grid-cols-3 gap-2">
          <input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="/catalog"
            className="col-span-2 bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
          />
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            placeholder="Priority"
            aria-label="Banner priority"
            className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Audience</span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as MarketingAudienceType)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              <option value="all">All Visitors</option>
              <option value="guest">Guests Only</option>
              <option value="logged_in">Logged-In Customers</option>
              <option value="arabic">Arabic (RTL)</option>
              <option value="english">English (LTR)</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Device</span>
            <select
              value={deviceTarget}
              onChange={(e) => setDeviceTarget(e.target.value as DeviceTargetType)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              <option value="all">All Devices</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>
        </div>

        <div className="space-y-1">
          <span className="font-mono-tabular text-[var(--muted)] block">Target Pages</span>
          <div className="flex flex-wrap gap-1.5">
            {BANNER_PAGES.map((pg) => {
              const active = pages.includes(pg);
              return (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setPages((prev) => (active ? prev.filter((p) => p !== pg) : [...prev, pg]))}
                  className={`px-2.5 py-1 border font-mono-tabular cursor-pointer ${
                    active ? 'border-[var(--ember)] text-[var(--ember)]' : 'border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  {pg}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <span className="font-mono-tabular text-[var(--muted)] block">Optional Thumbnail Image</span>
          <div className="flex items-center gap-2">
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="/uploads/... or leave blank"
              className="flex-1 bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
            />
            <label className="inline-flex items-center gap-1 px-2.5 py-2 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer shrink-0">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? '...' : 'Upload'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadImage(f);
                }}
              />
            </label>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--bone)]">
          <input
            type="checkbox"
            checked={dismissible}
            onChange={(e) => setDismissible(e.target.checked)}
            className="accent-[var(--ember)]"
          />
          <span>Allow visitor to dismiss banner</span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            aria-label="Banner start time"
            className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
          />
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            aria-label="Banner end time"
            className="bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
        >
          {editingId ? 'Save Banner Changes' : 'Publish Multi-Placement Banner'}
        </button>
      </form>

      <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl font-bold text-[var(--bone)]">
            Active &amp; Scheduled Banners ({banners.length})
          </h3>
          <span className="inline-flex items-center gap-1 text-[11px] font-mono-tabular text-[var(--cedar)]">
            <ShieldAlert className="w-3.5 h-3.5" /> Bot &amp; Duplicate Filtering Active
          </span>
        </div>

        {banners.length === 0 ? (
          <EmptyState
            title="No banners configured yet"
            description="Create a banner on the left to target top bar, page strips, category headers, inline cards, or floating strips."
          />
        ) : (
          <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
            {banners.map((b) => {
              const ctr = b.impressions > 0 ? ((b.clicks / b.impressions) * 100).toFixed(1) : '0.0';
              return (
                <div key={b.id} className="p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--ink)] text-xs">
                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
                      <span className="px-1.5 py-0.5 border border-[var(--line)] text-[var(--cyan)] uppercase text-[10px]">
                        {b.placement || 'page_strip'}
                      </span>
                      <span className="text-[var(--bone)] font-semibold">[{b.bgToken}]</span>
                      <span className="text-[var(--muted)]">
                        {b.pages.join(', ')} · {b.audience}/{b.deviceTarget}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-[var(--bone)] truncate">
                      {b.title.en} <span className="text-[var(--muted)] text-xs">({b.targetUrl})</span>
                    </p>
                    <p className="font-mono-tabular text-[11px] text-[var(--cedar)]">
                      {b.impressions} imp · {b.clicks} clk · {ctr}% CTR
                      {(b.botFilteredCount ?? 0) > 0 && (
                        <span className="ms-2 text-[var(--gold)]">· {b.botFilteredCount} bot-filtered</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(b)}
                      aria-label="Edit banner"
                      className="p-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
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
  );
}
