import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Mail,
  Plus,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  Coupon,
  CustomerSegment,
  EmailBlock,
  EmailBlockType,
  EmailCampaign,
} from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState } from '../HairlineUI.tsx';

const BLOCK_CATALOG: Array<{ type: EmailBlockType; label: string }> = [
  { type: 'header', label: 'Brand Header' },
  { type: 'hero_text', label: 'Hero Image & Copy' },
  { type: 'product_spotlight', label: 'Product Spotlight' },
  { type: 'coupon_box', label: 'Promo Coupon Box' },
  { type: 'cta_button', label: 'CTA Button' },
  { type: 'divider_footer', label: 'Footer Note' },
];

function createDefaultBlock(type: EmailBlockType): EmailBlock {
  const id = `blk-${Math.random().toString(36).slice(2, 9)}`;
  switch (type) {
    case 'header':
      return { id, type, titleEn: 'Seasonal Drops on NileLink', titleAr: 'عروض الموسم على نيل لينك' };
    case 'hero_text':
      return {
        id,
        type,
        titleEn: 'Curated Lebanese Craft & Tech',
        titleAr: 'منتجات مختارة من لبنان',
        bodyEn: 'Explore verified independent sellers with USD & LBP pricing across all governorates.',
        bodyAr: 'تصفح متاجر لبنانية موثوقة مع التسعير بالدولار والليرة اللبنانية.',
        imageUrl: '',
      };
    case 'product_spotlight':
      return { id, type, titleEn: 'Featured Picks', titleAr: 'اختيارات مميزة', productIds: [] };
    case 'coupon_box':
      return {
        id,
        type,
        titleEn: 'Use this code at checkout',
        titleAr: 'استخدم هذا الرمز عند الدفع',
        couponCode: '',
        bodyEn: 'Limited-time marketplace offer.',
        bodyAr: 'عرض لفترة محدودة.',
      };
    case 'cta_button':
      return {
        id,
        type,
        buttonLabelEn: 'Shop Marketplace',
        buttonLabelAr: 'تسوق الآن',
        buttonUrl: '/catalog',
      };
    case 'divider_footer':
      return {
        id,
        type,
        bodyEn: 'NileLink — Lebanese Multi-Vendor Marketplace',
        bodyAr: 'نيل لينك — سوق لبنان متعدد البائعين',
      };
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function EmailBuilderPanel({
  emailCampaigns,
  segments,
  coupons,
  emailLog,
  onReload,
}: {
  emailCampaigns: EmailCampaign[];
  segments: CustomerSegment[];
  coupons: Coupon[];
  emailLog: Array<{ id: string; recipient_email: string; template_key: string; status: string; error_message: string | null }>;
  onReload: () => Promise<void>;
}) {
  const { apiFetch, showToast, products } = useMarketplace();

  const [name, setName] = useState('');
  const [subjectEn, setSubjectEn] = useState('');
  const [subjectAr, setSubjectAr] = useState('');
  const [previewTextEn, setPreviewTextEn] = useState('');
  const [previewTextAr, setPreviewTextAr] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [blocks, setBlocks] = useState<EmailBlock[]>([
    createDefaultBlock('header'),
    createDefaultBlock('hero_text'),
    createDefaultBlock('cta_button'),
  ]);

  const [previewLocale, setPreviewLocale] = useState<'en' | 'ar'>('en');
  const [previewMode, setPreviewMode] = useState<'html' | 'text'>('html');
  const [previewData, setPreviewData] = useState<{ html: string; text: string }>({ html: '', text: '' });
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);

  const refreshPreview = async () => {
    setLoadingPreview(true);
    try {
      const subject =
        previewLocale === 'ar' ? subjectAr || subjectEn || 'معاينة النشرة' : subjectEn || subjectAr || 'Campaign Preview';
      const previewText = previewLocale === 'ar' ? previewTextAr || previewTextEn : previewTextEn || previewTextAr;
      const res = await apiFetch<{ html: string; text: string }>('/api/admin/email-campaigns/preview', {
        method: 'POST',
        body: JSON.stringify({
          locale: previewLocale,
          subject,
          previewText,
          blocks,
        }),
      });
      setPreviewData(res);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshPreview();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewLocale, subjectEn, subjectAr, previewTextEn, previewTextAr, blocks]);

  const addBlock = (type: EmailBlockType) => {
    setBlocks((prev) => [...prev, createDefaultBlock(type)]);
  };

  const updateBlock = (id: string, patch: Partial<EmailBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const moveBlock = (index: number, delta: -1 | 1) => {
    setBlocks((prev) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const toggleSpotlightProduct = (blockId: string, productId: string) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const curr = new Set(b.productIds || []);
        if (curr.has(productId)) curr.delete(productId);
        else if (curr.size < 12) curr.add(productId);
        return { ...b, productIds: Array.from(curr) };
      })
    );
  };

  const handleUploadBlockImage = async (blockId: string, file: File) => {
    setUploadingBlockId(blockId);
    try {
      const base64Data = await readFileAsDataUrl(file);
      const res = await apiFetch<{ media: { publicUrl: string } }>('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({
          base64Data,
          mimeType: file.type,
          entityType: 'email_campaign',
          folder: 'emails',
        }),
      });
      updateBlock(blockId, { imageUrl: res.media.publicUrl });
      showToast('Image uploaded to media library.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploadingBlockId(null);
    }
  };

  const handleCreateCampaign = async (sendImmediately: boolean) => {
    if (!name.trim() || !subjectEn.trim() || !subjectAr.trim()) {
      showToast('Campaign name and both EN/AR subject lines are required.', 'error');
      return;
    }
    if (blocks.length === 0) {
      showToast('Add at least one email block.', 'error');
      return;
    }
    setSaving(true);
    try {
      const created = await apiFetch<{ emailCampaign: EmailCampaign }>('/api/admin/email-campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          subject: { en: subjectEn.trim(), ar: subjectAr.trim() },
          previewText: { en: previewTextEn.trim(), ar: previewTextAr.trim() },
          segmentId: segmentId || null,
          blocks,
          scheduledAt: !sendImmediately && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      if (sendImmediately) {
        const res = await apiFetch<{ queuedCount: number }>(
          `/api/admin/email-campaigns/${created.emailCampaign.id}/send`,
          {
            method: 'POST',
            body: JSON.stringify({ sendNow: true }),
          }
        );
        showToast(`Email broadcast queued & processed for ${res.queuedCount} contact(s).`, 'success');
      } else {
        showToast(scheduledAt ? 'Email campaign scheduled.' : 'Email campaign saved as draft.', 'success');
      }
      setName('');
      setSubjectEn('');
      setSubjectAr('');
      setPreviewTextEn('');
      setPreviewTextAr('');
      setScheduledAt('');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendSavedCampaign = async (id: string) => {
    setSendingId(id);
    try {
      const res = await apiFetch<{ queuedCount: number }>(`/api/admin/email-campaigns/${id}/send`, {
        method: 'POST',
        body: JSON.stringify({ sendNow: true }),
      });
      showToast(`Dispatched campaign to ${res.queuedCount} contact(s).`, 'success');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSendingId(null);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    try {
      await apiFetch(`/api/admin/email-campaigns/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      showToast('Email campaign deleted.', 'info');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Visual Block Composer + Live Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-bold text-[var(--bone)]">
                Visual Email &amp; Newsletter Composer
              </h3>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Build bilingual EN/AR broadcasts with visual blocks, product spotlights, coupon boxes, and automatic unsubscribe compliance.
              </p>
            </div>
          </div>

          {/* Campaign Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1 block">
              <span className="text-[var(--muted)] uppercase font-mono-tabular">Campaign Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ramadan Weekend Flash Newsletter"
                className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[var(--muted)] uppercase font-mono-tabular">Target Segment</span>
              <select
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
              >
                <option value="">All Contacts (Customers + Subscribers)</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.en} ({s.cachedMemberCount} members)
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-[var(--muted)] uppercase font-mono-tabular">Subject (EN)</span>
              <input
                value={subjectEn}
                onChange={(e) => setSubjectEn(e.target.value)}
                placeholder="48-Hour Beirut Craft Deals Inside"
                className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[var(--muted)] uppercase font-mono-tabular">Subject (AR)</span>
              <input
                dir="rtl"
                value={subjectAr}
                onChange={(e) => setSubjectAr(e.target.value)}
                placeholder="عروض الحرف اللبنانية لمدة 48 ساعة"
                className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[var(--muted)] uppercase font-mono-tabular">Preview Preheader (EN)</span>
              <input
                value={previewTextEn}
                onChange={(e) => setPreviewTextEn(e.target.value)}
                placeholder="Save up to 25% across verified shops..."
                className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[var(--muted)] uppercase font-mono-tabular">Preview Preheader (AR)</span>
              <input
                dir="rtl"
                value={previewTextAr}
                onChange={(e) => setPreviewTextAr(e.target.value)}
                placeholder="وفر حتى 25% لدى المتاجر الموثوقة..."
                className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
              />
            </label>
          </div>

          {/* Add Block Toolbar */}
          <div className="border-t border-[var(--line)] pt-3 space-y-2">
            <div className="text-[11px] font-mono-tabular uppercase text-[var(--muted)]">Add Email Block</div>
            <div className="flex flex-wrap gap-2">
              {BLOCK_CATALOG.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => addBlock(item.type)}
                  className="inline-flex items-center gap-1.5 border border-[var(--line)] bg-[var(--ink)] px-3 py-1.5 text-xs text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-[var(--ember)]" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Block Stack */}
          <div className="space-y-3">
            {blocks.map((block, idx) => (
              <div key={block.id} className="border border-[var(--line)] bg-[var(--ink)] p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
                  <span className="text-xs font-mono-tabular uppercase text-[var(--ember)] font-bold">
                    #{idx + 1} {block.type.replace('_', ' ')}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveBlock(idx, -1)}
                      className="border border-[var(--line)] p-1 text-[var(--muted)] hover:text-[var(--bone)] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === blocks.length - 1}
                      onClick={() => moveBlock(idx, 1)}
                      className="border border-[var(--line)] p-1 text-[var(--muted)] hover:text-[var(--bone)] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      className="border border-[var(--line)] p-1 text-[var(--crimson)] hover:border-[var(--crimson)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {(block.type === 'header' ||
                  block.type === 'hero_text' ||
                  block.type === 'product_spotlight' ||
                  block.type === 'coupon_box') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <input
                      value={block.titleEn || ''}
                      onChange={(e) => updateBlock(block.id, { titleEn: e.target.value })}
                      placeholder="Heading (EN)"
                      className="border border-[var(--line)] bg-[var(--graphite)] px-2.5 py-1.5 text-[var(--bone)]"
                    />
                    <input
                      dir="rtl"
                      value={block.titleAr || ''}
                      onChange={(e) => updateBlock(block.id, { titleAr: e.target.value })}
                      placeholder="العنوان (AR)"
                      className="border border-[var(--line)] bg-[var(--graphite)] px-2.5 py-1.5 text-[var(--bone)]"
                    />
                  </div>
                )}

                {(block.type === 'hero_text' || block.type === 'coupon_box' || block.type === 'divider_footer') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <textarea
                      rows={2}
                      value={block.bodyEn || ''}
                      onChange={(e) => updateBlock(block.id, { bodyEn: e.target.value })}
                      placeholder="Body text (EN)"
                      className="border border-[var(--line)] bg-[var(--graphite)] px-2.5 py-1.5 text-[var(--bone)]"
                    />
                    <textarea
                      dir="rtl"
                      rows={2}
                      value={block.bodyAr || ''}
                      onChange={(e) => updateBlock(block.id, { bodyAr: e.target.value })}
                      placeholder="النص (AR)"
                      className="border border-[var(--line)] bg-[var(--graphite)] px-2.5 py-1.5 text-[var(--bone)]"
                    />
                  </div>
                )}

                {block.type === 'hero_text' && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <input
                      value={block.imageUrl || ''}
                      onChange={(e) => updateBlock(block.id, { imageUrl: e.target.value })}
                      placeholder="Optional Hero Image URL (/uploads/... or https://...)"
                      className="flex-1 min-w-[200px] border border-[var(--line)] bg-[var(--graphite)] px-2.5 py-1.5 text-[var(--bone)]"
                    />
                    <label className="inline-flex items-center gap-1.5 border border-[var(--line)] bg-[var(--graphite)] px-3 py-1.5 text-xs text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingBlockId === block.id ? 'Uploading...' : 'Upload Image'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleUploadBlockImage(block.id, file);
                        }}
                      />
                    </label>
                  </div>
                )}

                {block.type === 'coupon_box' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <select
                      value={block.couponCode || ''}
                      onChange={(e) => updateBlock(block.id, { couponCode: e.target.value })}
                      className="border border-[var(--line)] bg-[var(--graphite)] px-2.5 py-1.5 text-[var(--bone)]"
                    >
                      <option value="">Select active coupon...</option>
                      {coupons.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code} (
                          {c.discountType === 'percent'
                            ? `${c.discountValue}%`
                            : c.discountType === 'free_shipping'
                            ? 'Free Shipping'
                            : `$${(c.discountValue / 100).toFixed(2)}`}
                          )
                        </option>
                      ))}
                    </select>
                    <input
                      value={block.couponCode || ''}
                      onChange={(e) => updateBlock(block.id, { couponCode: e.target.value.toUpperCase() })}
                      placeholder="Or type coupon code"
                      className="border border-[var(--line)] bg-[var(--graphite)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
                    />
                  </div>
                )}

                {block.type === 'cta_button' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <input
                      value={block.buttonLabelEn || ''}
                      onChange={(e) => updateBlock(block.id, { buttonLabelEn: e.target.value })}
                      placeholder="Button Label (EN)"
                      className="border border-[var(--line)] bg-[var(--graphite)] px-2.5 py-1.5 text-[var(--bone)]"
                    />
                    <input
                      dir="rtl"
                      value={block.buttonLabelAr || ''}
                      onChange={(e) => updateBlock(block.id, { buttonLabelAr: e.target.value })}
                      placeholder="نص الزر (AR)"
                      className="border border-[var(--line)] bg-[var(--graphite)] px-2.5 py-1.5 text-[var(--bone)]"
                    />
                    <input
                      value={block.buttonUrl || ''}
                      onChange={(e) => updateBlock(block.id, { buttonUrl: e.target.value })}
                      placeholder="/catalog?deals=true"
                      className="border border-[var(--line)] bg-[var(--graphite)] px-2.5 py-1.5 text-[var(--bone)]"
                    />
                  </div>
                )}

                {block.type === 'product_spotlight' && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-mono-tabular text-[var(--muted)]">
                      Select Products ({(block.productIds || []).length}/12 selected)
                    </div>
                    {products.length === 0 ? (
                      <p className="text-xs text-[var(--muted)]">No published products in catalog yet.</p>
                    ) : (
                      <div className="max-h-36 overflow-y-auto border border-[var(--line)] bg-[var(--graphite)] p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                        {products.slice(0, 40).map((p) => {
                          const checked = (block.productIds || []).includes(p.id);
                          return (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSpotlightProduct(block.id, p.id)}
                              />
                              <span className="truncate text-[var(--bone)]">{p.title.en}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Schedule & Dispatch Controls */}
          <div className="border-t border-[var(--line)] pt-4 flex flex-wrap items-end justify-between gap-3">
            <label className="space-y-1 block text-xs">
              <span className="text-[var(--muted)] uppercase font-mono-tabular">Schedule Send (Optional)</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleCreateCampaign(false)}
                className="border border-[var(--line)] bg-[var(--ink)] px-4 py-2 text-xs font-bold uppercase text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
              >
                {scheduledAt ? 'Save & Schedule' : 'Save as Draft'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleCreateCampaign(true)}
                className="inline-flex items-center gap-2 bg-[var(--ember)] text-[var(--ember-fg)] px-4 py-2 text-xs font-bold uppercase cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{saving ? 'Queueing...' : 'Queue & Send Now'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Email Preview */}
        <div className="xl:col-span-5 border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[var(--cyan)]" />
              <h3 className="font-display text-lg font-bold text-[var(--bone)]">Live Email Preview</h3>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setPreviewLocale('en')}
                className={`border px-2.5 py-1 font-mono-tabular cursor-pointer ${
                  previewLocale === 'en'
                    ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                    : 'border-[var(--line)] bg-[var(--ink)] text-[var(--bone)]'
                }`}
              >
                EN (LTR)
              </button>
              <button
                type="button"
                onClick={() => setPreviewLocale('ar')}
                className={`border px-2.5 py-1 font-mono-tabular cursor-pointer ${
                  previewLocale === 'ar'
                    ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                    : 'border-[var(--line)] bg-[var(--ink)] text-[var(--bone)]'
                }`}
              >
                AR (RTL)
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode(previewMode === 'html' ? 'text' : 'html')}
                className="border border-[var(--line)] bg-[var(--ink)] px-2.5 py-1 font-mono-tabular text-[var(--cyan)] cursor-pointer"
              >
                {previewMode === 'html' ? 'Plain Text' : 'HTML View'}
              </button>
            </div>
          </div>

          <div className="text-xs font-mono-tabular text-[var(--muted)] border border-[var(--line)] bg-[var(--ink)] px-3 py-2">
            Subject: <span className="text-[var(--bone)]">{previewLocale === 'ar' ? subjectAr || subjectEn || '—' : subjectEn || subjectAr || '—'}</span>
            {loadingPreview && <span className="ml-2 text-[var(--cyan)]">(Rendering...)</span>}
          </div>

          {previewMode === 'html' ? (
            <iframe
              title="NileLink Email Campaign Preview"
              sandbox=""
              srcDoc={previewData.html}
              className="w-full h-[540px] border border-[var(--line)] bg-[#111215]"
            />
          ) : (
            <pre
              dir={previewLocale === 'ar' ? 'rtl' : 'ltr'}
              className="w-full h-[540px] overflow-auto border border-[var(--line)] bg-[var(--ink)] p-4 text-xs font-mono-tabular text-[var(--bone)] whitespace-pre-wrap"
            >
              {previewData.text}
            </pre>
          )}
        </div>
      </div>

      {/* Saved Email Broadcasts */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-[var(--ember)]" />
          <h3 className="font-display text-lg font-bold text-[var(--bone)]">
            Email Campaigns ({emailCampaigns.length})
          </h3>
        </div>
        {emailCampaigns.length === 0 ? (
          <EmptyState
            title="No email campaigns yet"
            description="Compose your first bilingual broadcast above and send it to a dynamic segment or all contacts."
          />
        ) : (
          <div className="space-y-3">
            {emailCampaigns.map((cmp) => {
              const seg = segments.find((s) => s.id === cmp.segmentId);
              return (
                <div
                  key={cmp.id}
                  className="border border-[var(--line)] bg-[var(--ink)] p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold text-[var(--bone)]">{cmp.name}</span>
                      <span className="border border-[var(--line)] px-2 py-0.5 text-[11px] font-mono-tabular uppercase text-[var(--cyan)]">
                        {cmp.status}
                      </span>
                      <span className="border border-[var(--line)] px-2 py-0.5 text-[11px] font-mono-tabular text-[var(--muted)]">
                        {seg ? seg.name.en : 'All Contacts'}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      EN: {cmp.subject.en} · AR: {cmp.subject.ar}
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] font-mono-tabular">
                      <span className="text-[var(--cedar)]">Sent: {cmp.sentCount}</span>
                      <span className="text-[var(--crimson)]">Failed/Unconfigured: {cmp.failedCount}</span>
                      <span className="text-[var(--gold)]">Skipped Opt-Out: {cmp.unsubscribedCount}</span>
                      {cmp.scheduledAt && <span className="text-[var(--muted)]">Scheduled: {cmp.scheduledAt}</span>}
                      {cmp.sentAt && <span className="text-[var(--muted)]">Last Dispatched: {cmp.sentAt}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={sendingId === cmp.id}
                      onClick={() => void handleSendSavedCampaign(cmp.id)}
                      className="inline-flex items-center gap-1.5 border border-[var(--ember)] px-3 py-1.5 text-xs font-bold uppercase text-[var(--ember)] hover:bg-[var(--ember)] hover:text-[var(--ember-fg)] cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      <span>{sendingId === cmp.id ? 'Sending...' : 'Send Now'}</span>
                    </button>
                    {confirmDeleteId === cmp.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCampaign(cmp.id)}
                          className="border border-[var(--crimson)] bg-[var(--crimson)] text-white px-2.5 py-1.5 text-xs font-bold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(cmp.id)}
                        className="border border-[var(--line)] p-1.5 text-[var(--crimson)] hover:border-[var(--crimson)] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Email Delivery Log */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-3">
        <h3 className="font-display text-base font-bold text-[var(--bone)]">
          Recent Email Delivery Log ({emailLog.length})
        </h3>
        {emailLog.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No email delivery logs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--muted)] font-mono-tabular uppercase">
                  <th className="py-2 pr-3">Recipient</th>
                  <th className="py-2 pr-3">Campaign / Flow</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {emailLog.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--line)]/50">
                    <td className="py-1.5 pr-3 font-mono-tabular text-[var(--bone)]">{e.recipient_email}</td>
                    <td className="py-1.5 pr-3 font-mono-tabular text-[var(--muted)]">{e.template_key}</td>
                    <td className="py-1.5 pr-3 font-mono-tabular uppercase">
                      <span
                        className={`border px-2 py-0.5 text-[10px] ${
                          e.status === 'sent'
                            ? 'border-[var(--cedar)] text-[var(--cedar)]'
                            : 'border-[var(--gold)] text-[var(--gold)]'
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-[var(--muted)]">{e.error_message || '—'}</td>
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
