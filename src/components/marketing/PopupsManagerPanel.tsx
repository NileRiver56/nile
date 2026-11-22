import React, { useState } from 'react';
import { Edit3, Sparkles, Trash2, Upload } from 'lucide-react';
import type {
  BannerBgToken,
  BannerPageScope,
  DeviceTargetType,
  MarketingAudienceType,
  MarketingPopup,
  PopupFrequency,
  PopupTrigger,
  PopupType,
} from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState } from '../HairlineUI.tsx';

const POPUP_PAGES: BannerPageScope[] = ['home', 'catalog', 'checkout', 'store'];
const POPUP_TYPES: PopupType[] = ['promo', 'newsletter', 'announcement', 'exit_intent', 'cart_reminder'];
const POPUP_TRIGGERS: Array<{ id: PopupTrigger; label: string }> = [
  { id: 'delay_seconds', label: 'Time Delay (seconds)' },
  { id: 'scroll_percent', label: 'Scroll Depth (%)' },
  { id: 'exit_intent', label: 'Exit Intent (Desktop Cursor)' },
  { id: 'cart_abandon', label: 'Cart Non-Empty Reminder' },
  { id: 'immediate', label: 'Immediate on Load' },
];
const POPUP_FREQ: Array<{ id: PopupFrequency; label: string }> = [
  { id: 'once_per_session', label: 'Once per Browser Session' },
  { id: 'once_per_day', label: 'Once per 24 Hours' },
  { id: 'once_per_week', label: 'Once per 7 Days' },
  { id: 'once_ever', label: 'Once Ever per Device' },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function PopupsManagerPanel({
  popups,
  onReload,
}: {
  popups: MarketingPopup[];
  onReload: () => Promise<void>;
}) {
  const { apiFetch, showToast, refreshBootstrap } = useMarketplace();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [ctaEn, setCtaEn] = useState('Claim Offer');
  const [ctaAr, setCtaAr] = useState('احصل على العرض');
  const [targetUrl, setTargetUrl] = useState('/catalog?deals=true');
  const [imageUrl, setImageUrl] = useState('');
  const [bgToken, setBgToken] = useState<BannerBgToken>('ember');
  const [popupType, setPopupType] = useState<PopupType>('promo');
  const [triggerType, setTriggerType] = useState<PopupTrigger>('delay_seconds');
  const [triggerValue, setTriggerValue] = useState('5');
  const [frequencyCap, setFrequencyCap] = useState<PopupFrequency>('once_per_day');
  const [pages, setPages] = useState<BannerPageScope[]>(['home', 'catalog']);
  const [audience, setAudience] = useState<MarketingAudienceType>('all');
  const [deviceTarget, setDeviceTarget] = useState<DeviceTargetType>('all');
  const [showNewsletterForm, setShowNewsletterForm] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [uploading, setUploading] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setTitleEn('');
    setTitleAr('');
    setBodyEn('');
    setBodyAr('');
    setCtaEn('Claim Offer');
    setCtaAr('احصل على العرض');
    setTargetUrl('/catalog?deals=true');
    setImageUrl('');
    setBgToken('ember');
    setPopupType('promo');
    setTriggerType('delay_seconds');
    setTriggerValue('5');
    setFrequencyCap('once_per_day');
    setPages(['home', 'catalog']);
    setAudience('all');
    setDeviceTarget('all');
    setShowNewsletterForm(false);
    setCouponCode('');
    setStartsAt('');
    setEndsAt('');
  };

  const startEdit = (p: MarketingPopup) => {
    setEditingId(p.id);
    setTitleEn(p.title.en);
    setTitleAr(p.title.ar);
    setBodyEn(p.body.en);
    setBodyAr(p.body.ar);
    setCtaEn(p.ctaLabel.en);
    setCtaAr(p.ctaLabel.ar);
    setTargetUrl(p.targetUrl);
    setImageUrl(p.imageUrl || '');
    setBgToken(p.bgToken);
    setPopupType(p.popupType);
    setTriggerType(p.triggerType);
    setTriggerValue(String(p.triggerValue));
    setFrequencyCap(p.frequencyCap);
    setPages(p.pages);
    setAudience(p.audience);
    setDeviceTarget(p.deviceTarget);
    setShowNewsletterForm(p.showNewsletterForm);
    setCouponCode(p.couponCode || '');
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
          entityType: 'marketing_popup',
          folder: 'popups',
        }),
      });
      setImageUrl(res.media.publicUrl);
      showToast('Popup visual uploaded', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pages.length === 0) {
      showToast('Select at least one page for this popup.', 'error');
      return;
    }

    const payload = {
      title: { en: titleEn.trim(), ar: (titleAr || titleEn).trim() },
      body: { en: bodyEn.trim(), ar: (bodyAr || bodyEn).trim() },
      ctaLabel: { en: ctaEn.trim() || 'Shop Now', ar: (ctaAr || ctaEn).trim() || 'تسوق الآن' },
      targetUrl: targetUrl.trim() || '/catalog',
      imageUrl: imageUrl.trim() || null,
      bgToken,
      popupType,
      triggerType,
      triggerValue: Math.max(0, Number(triggerValue || 5)),
      frequencyCap,
      pages,
      audience,
      deviceTarget,
      showNewsletterForm,
      couponCode: couponCode.trim() ? couponCode.trim().toUpperCase() : null,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      active: true,
    };

    try {
      if (editingId) {
        await apiFetch(`/api/admin/popups/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Popup updated', 'success');
      } else {
        await apiFetch('/api/admin/popups', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Popup rule published', 'success');
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
            {editingId ? 'Edit Marketing Popup' : 'Create Triggered Popup'}
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
          Control triggers (delay, scroll %, exit intent, cart reminder) and persistent frequency caps per visitor.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Popup Type</span>
            <select
              value={popupType}
              onChange={(e) => setPopupType(e.target.value as PopupType)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              {POPUP_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {pt}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Frequency Cap</span>
            <select
              value={frequencyCap}
              onChange={(e) => setFrequencyCap(e.target.value as PopupFrequency)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              {POPUP_FREQ.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">Trigger Rule</span>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as PopupTrigger)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
            >
              {POPUP_TRIGGERS.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-mono-tabular text-[var(--muted)]">
              {triggerType === 'scroll_percent' ? 'Scroll %' : 'Seconds'}
            </span>
            <input
              type="number"
              min="0"
              max="300"
              value={triggerValue}
              onChange={(e) => setTriggerValue(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
            />
          </label>
        </div>

        <input
          required
          value={titleEn}
          onChange={(e) => setTitleEn(e.target.value)}
          placeholder="Headline (EN)"
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
        />
        <input
          required
          dir="rtl"
          value={titleAr}
          onChange={(e) => setTitleAr(e.target.value)}
          placeholder="العنوان الرئيسي (AR)"
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
        />

        <textarea
          required
          rows={2}
          value={bodyEn}
          onChange={(e) => setBodyEn(e.target.value)}
          placeholder="Message Body (EN)"
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
        />
        <textarea
          required
          rows={2}
          dir="rtl"
          value={bodyAr}
          onChange={(e) => setBodyAr(e.target.value)}
          placeholder="نص الرسالة (AR)"
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            required
            value={ctaEn}
            onChange={(e) => setCtaEn(e.target.value)}
            placeholder="CTA Button (EN)"
            className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
          />
          <input
            required
            dir="rtl"
            value={ctaAr}
            onChange={(e) => setCtaAr(e.target.value)}
            placeholder="زر الإجراء (AR)"
            className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="/catalog"
            className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
          />
          <input
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            placeholder="Optional Coupon Code"
            className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Optional Image URL"
            className="flex-1 bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
          />
          <label className="inline-flex items-center gap-1 px-2.5 py-2 border border-[var(--line)] text-[var(--bone)] cursor-pointer">
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

        <div className="grid grid-cols-3 gap-2">
          <select
            value={bgToken}
            onChange={(e) => setBgToken(e.target.value as BannerBgToken)}
            className="bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[var(--bone)]"
          >
            <option value="ember">ember</option>
            <option value="gold">gold</option>
            <option value="cedar">cedar</option>
            <option value="cyan">cyan</option>
            <option value="graphite">graphite</option>
          </select>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as MarketingAudienceType)}
            className="bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[var(--bone)]"
          >
            <option value="all">All Visitors</option>
            <option value="guest">Guests</option>
            <option value="logged_in">Logged In</option>
            <option value="arabic">Arabic</option>
            <option value="english">English</option>
          </select>
          <select
            value={deviceTarget}
            onChange={(e) => setDeviceTarget(e.target.value as DeviceTargetType)}
            className="bg-[var(--ink)] border border-[var(--line)] px-2 py-2 text-[var(--bone)]"
          >
            <option value="all">All Devices</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {POPUP_PAGES.map((pg) => {
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

        <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--bone)]">
          <input
            type="checkbox"
            checked={showNewsletterForm}
            onChange={(e) => setShowNewsletterForm(e.target.checked)}
            className="accent-[var(--ember)]"
          />
          <span>Embed live newsletter signup form inside popup</span>
        </label>

        <button
          type="submit"
          className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
        >
          {editingId ? 'Save Popup Rule' : 'Publish Popup Rule'}
        </button>
      </form>

      <div className="hairline-cell lg:col-span-7 p-6 space-y-5">
        {/* Live Preview Card */}
        <div className="border border-[var(--line)] bg-[var(--ink)] p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between text-[10px] font-mono-tabular uppercase text-[var(--muted)]">
            <span className="inline-flex items-center gap-1 text-[var(--ember)]">
              <Sparkles className="w-3 h-3" /> Live Popup Preview
            </span>
            <span>
              {triggerType} ({triggerValue}) · {frequencyCap}
            </span>
          </div>
          <p className="font-display text-lg font-bold text-[var(--bone)]">
            {titleEn || 'Your Popup Headline Here'}
          </p>
          <p className="text-[var(--muted)]">{bodyEn || 'Concise promotional copy or newsletter offer...'}</p>
          {couponCode && (
            <span className="inline-block px-2 py-1 border border-[var(--gold)] text-[var(--gold)] font-mono-tabular">
              CODE: {couponCode}
            </span>
          )}
          <div className="pt-1">
            <span className="inline-block px-3 py-1.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase">
              {ctaEn || 'Claim Offer'}
            </span>
          </div>
        </div>

        <h3 className="font-display text-xl font-bold text-[var(--bone)]">
          Configured Popups ({popups.length})
        </h3>
        {popups.length === 0 ? (
          <EmptyState
            title="No popups configured"
            description="Create a frequency-capped popup rule on the left for welcome offers, exit intent, or cart recovery."
          />
        ) : (
          <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
            {popups.map((p) => {
              const convRate = p.impressions > 0 ? ((p.conversions / p.impressions) * 100).toFixed(1) : '0.0';
              return (
                <div key={p.id} className="p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--ink)] text-xs">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
                      <span className="px-1.5 py-0.5 border border-[var(--line)] text-[var(--ember)] uppercase text-[10px]">
                        {p.popupType}
                      </span>
                      <span className="text-[var(--cyan)]">
                        {p.triggerType}({p.triggerValue})
                      </span>
                      <span className="text-[var(--muted)]">{p.frequencyCap}</span>
                    </div>
                    <p className="text-sm font-medium text-[var(--bone)] truncate">{p.title.en}</p>
                    <p className="font-mono-tabular text-[11px] text-[var(--cedar)]">
                      {p.impressions} imp · {p.conversions} conv ({convRate}%) · {p.dismissals} dismissed
                      {(p.botFilteredCount ?? 0) > 0 && (
                        <span className="ms-2 text-[var(--gold)]">· {p.botFilteredCount} bot-filtered</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      aria-label="Edit popup"
                      className="p-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/popups/${p.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ active: !p.active }),
                        });
                        await onReload();
                        await refreshBootstrap();
                      }}
                      className={`px-3 py-1 border cursor-pointer ${
                        p.active ? 'border-[var(--cedar)] text-[var(--cedar)]' : 'border-[var(--line)] text-[var(--muted)]'
                      }`}
                    >
                      {p.active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/popups/${p.id}`, { method: 'DELETE' });
                        showToast('Popup deleted', 'info');
                        await onReload();
                        await refreshBootstrap();
                      }}
                      aria-label="Delete popup"
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
