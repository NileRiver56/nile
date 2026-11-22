import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  Crosshair,
  Eye,
  EyeOff,
  History,
  ImagePlus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  HomeSection,
  HomeSectionAudience,
  HomeSectionStatus,
  HomeSectionStyle,
  HomeSectionTargeting,
  HomeSectionVersion,
  Locale,
  LocalizedText,
} from '../../shared/types.ts';
import { getPresetForSectionType, normalizeTargeting } from '../../shared/homeSections.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';

function toDatetimeLocalValue(raw?: string | null): string {
  if (!raw) return '';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function asLoc(val: unknown): LocalizedText {
  if (typeof val === 'string') return { en: val, ar: val };
  if (val && typeof val === 'object') {
    const o = val as Partial<LocalizedText>;
    return { en: String(o.en ?? ''), ar: String(o.ar ?? '') };
  }
  return { en: '', ar: '' };
}

function countMissingTranslations(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  if (Array.isArray(node)) {
    return node.reduce((sum, item) => sum + countMissingTranslations(item), 0);
  }
  const obj = node as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.includes('en') && keys.includes('ar') && keys.length <= 2) {
    const en = String(obj.en || '').trim();
    const ar = String(obj.ar || '').trim();
    if ((en && !ar) || (ar && !en)) return 1;
    return 0;
  }
  return Object.values(obj).reduce<number>((sum, val) => sum + countMissingTranslations(val), 0);
}

const PRESET_URLS = [
  { label: 'Catalog (All Products)', value: '/catalog' },
  { label: 'Fashion Department', value: '/catalog?department=fashion' },
  { label: 'Electronics & Mobiles', value: '/catalog?department=electronics' },
  { label: 'Home Gadgets', value: '/catalog?department=home-gadgets' },
  { label: 'Active Deals & Offers', value: '/catalog?deals=true' },
  { label: 'Seller Hub / Apply', value: '/seller' },
  { label: 'Track Orders', value: '/orders' },
  { label: 'Design Styleguide', value: '/styleguide' },
];

export function BlockFormInspector({
  section,
  versions,
  onChange,
  onSaveTemplate,
  onRollbackVersion,
  onPickImage,
}: {
  section: HomeSection | null;
  versions: HomeSectionVersion[];
  onChange: (next: HomeSection) => void;
  onSaveTemplate: (sec: HomeSection) => Promise<void>;
  onRollbackVersion: (sectionId: string, versionId: string) => Promise<void>;
  onPickImage: (cb: (picked: { url: string; focalX: number; focalY: number }) => void) => void;
}) {
  const { products, sellers, deliveryZones } = useMarketplace();
  const [editLang, setEditLang] = useState<Locale>('en');
  const [showVersionDrawer, setShowVersionDrawer] = useState(false);
  const [productQuery, setProductQuery] = useState('');

  const missingCount = useMemo(() => {
    if (!section) return 0;
    return countMissingTranslations({ title: section.title, content: section.content });
  }, [section]);

  if (!section) {
    return (
      <div className="p-6 text-center text-xs text-[var(--muted)] space-y-2">
        <p className="font-display text-base font-bold text-[var(--bone)]">No Block Selected</p>
        <p>Click any block in the left stack or directly in the center preview to configure it.</p>
      </div>
    );
  }

  const preset = getPresetForSectionType(section.sectionType);
  const c = (section.content || {}) as Record<string, unknown>;
  const targeting: HomeSectionTargeting = normalizeTargeting(section.targeting, section.audience);
  const style: HomeSectionStyle = section.style || { surface: 'graphite', padding: 'standard' };

  const patchContent = (patch: Record<string, unknown>) => {
    onChange({ ...section, content: { ...c, ...patch } });
  };

  const setLocContent = (key: string, nextVal: string) => {
    const curr = asLoc(c[key]);
    patchContent({ [key]: { ...curr, [editLang]: nextVal } });
  };

  const LocField = ({
    label,
    fieldKey,
    multiline = false,
  }: {
    label: string;
    fieldKey: string;
    multiline?: boolean;
  }) => {
    const loc = asLoc(c[fieldKey]);
    const otherLang = editLang === 'en' ? 'ar' : 'en';
    const otherEmpty = !loc[otherLang]?.trim() && Boolean(loc[editLang]?.trim());
    return (
      <label className="block space-y-1">
        <span className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--muted)]">
          <span>
            {label} ({editLang.toUpperCase()})
          </span>
          {otherEmpty && (
            <span className="text-[var(--gold)]">{otherLang.toUpperCase()} empty</span>
          )}
        </span>
        {multiline ? (
          <textarea
            rows={3}
            dir={editLang === 'ar' ? 'rtl' : 'ltr'}
            value={loc[editLang]}
            onChange={(e) => setLocContent(fieldKey, e.target.value)}
            className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--bone)]"
          />
        ) : (
          <input
            dir={editLang === 'ar' ? 'rtl' : 'ltr'}
            value={loc[editLang]}
            onChange={(e) => setLocContent(fieldKey, e.target.value)}
            className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--bone)]"
          />
        )}
      </label>
    );
  };

  const UrlPicker = ({
    label,
    value,
    onUrlChange,
  }: {
    label: string;
    value: string;
    onUrlChange: (url: string) => void;
  }) => (
    <div className="space-y-1">
      <span className="text-[11px] font-mono-tabular text-[var(--muted)]">{label}</span>
      <div className="grid grid-cols-1 gap-1.5">
        <select
          value={PRESET_URLS.some((p) => p.value === value) ? value : '__custom__'}
          onChange={(e) => {
            if (e.target.value !== '__custom__') onUrlChange(e.target.value);
          }}
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1.5 text-xs text-[var(--bone)]"
        >
          {PRESET_URLS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="__custom__">Custom Path / URL...</option>
        </select>
        <input
          value={value}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="/catalog or /store/..."
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-xs text-[var(--bone)]"
        />
      </div>
    </div>
  );

  const ImageField = ({
    label,
    urlKey = 'imageUrl',
    fxKey = 'focalX',
    fyKey = 'focalY',
  }: {
    label: string;
    urlKey?: string;
    fxKey?: string;
    fyKey?: string;
  }) => {
    const imgUrl = typeof c[urlKey] === 'string' ? String(c[urlKey]) : '';
    const fx = Number(c[fxKey] ?? 50);
    const fy = Number(c[fyKey] ?? 50);
    return (
      <div className="border border-[var(--line)] bg-[var(--ink)] p-2.5 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--muted)]">
          <span>{label}</span>
          <span className="inline-flex items-center gap-1">
            <Crosshair className="w-3 h-3" /> {fx}%, {fy}%
          </span>
        </div>
        {imgUrl && (
          <div className="aspect-[16/9] w-full overflow-hidden border border-[var(--line)] bg-[var(--graphite)]">
            <img
              src={imgUrl}
              alt="Selected"
              style={{ objectPosition: `${fx}% ${fy}%` }}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() =>
              onPickImage((picked) =>
                patchContent({ [urlKey]: picked.url, [fxKey]: picked.focalX, [fyKey]: picked.focalY })
              )
            }
            className="flex-1 py-1.5 border border-[var(--ember)] text-[var(--ember)] text-[11px] font-bold uppercase inline-flex items-center justify-center gap-1.5 hover:bg-[var(--ember)] hover:text-[var(--ember-fg)] cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span>Choose / Upload</span>
          </button>
          {imgUrl && (
            <button
              type="button"
              onClick={() => patchContent({ [urlKey]: '' })}
              className="px-2.5 py-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
              aria-label="Clear image"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const ProductMultiPicker = () => {
    const picked = Array.isArray(c.productIds) ? c.productIds.map(String) : [];
    const filtered = products
      .filter((p) => !productQuery || p.title.en.toLowerCase().includes(productQuery.toLowerCase()) || p.title.ar.includes(productQuery))
      .slice(0, 30);

    return (
      <div className="border border-[var(--line)] bg-[var(--ink)] p-2.5 space-y-2">
        <p className="text-[11px] font-mono-tabular uppercase text-[var(--muted)]">
          Selected Products ({picked.length})
        </p>
        <input
          value={productQuery}
          onChange={(e) => setProductQuery(e.target.value)}
          placeholder="Filter products..."
          className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-xs text-[var(--bone)]"
        />
        {products.length === 0 ? (
          <p className="text-[11px] text-[var(--muted)]">No live products published yet.</p>
        ) : (
          <div className="max-h-36 overflow-y-auto space-y-1">
            {filtered.map((p) => {
              const checked = picked.includes(p.id);
              return (
                <label key={p.id} className="flex items-center gap-2 text-xs text-[var(--bone)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked ? [...picked, p.id] : picked.filter((id) => id !== p.id);
                      patchContent({ productIds: next });
                    }}
                  />
                  <span className="truncate">{p.title.en}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const SellerMultiPicker = () => {
    const picked = Array.isArray(c.sellerIds) ? c.sellerIds.map(String) : [];
    return (
      <div className="border border-[var(--line)] bg-[var(--ink)] p-2.5 space-y-2">
        <p className="text-[11px] font-mono-tabular uppercase text-[var(--muted)]">
          Handpicked Stores ({picked.length || 'Auto'})
        </p>
        {sellers.length === 0 ? (
          <p className="text-[11px] text-[var(--muted)]">No approved stores yet.</p>
        ) : (
          <div className="max-h-36 overflow-y-auto space-y-1">
            {sellers.map((s) => {
              const checked = picked.includes(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 text-xs text-[var(--bone)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked ? [...picked, s.id] : picked.filter((id) => id !== s.id);
                      patchContent({ sellerIds: next });
                    }}
                  />
                  <span className="truncate">{s.name.en}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const stType = section.sectionType;

  return (
    <div className="p-4 space-y-4 text-xs">
      {/* Header Meta */}
      <div className="border-b border-[var(--line)] pb-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono-tabular text-[11px] uppercase text-[var(--cyan)]">
            {stType} · v{section.version}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void onSaveTemplate(section)}
              title="Save this block as a reusable template"
              className="px-2 py-1 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] inline-flex items-center gap-1 cursor-pointer"
            >
              <BookmarkPlus className="w-3 h-3" />
              <span>Template</span>
            </button>
            <button
              type="button"
              onClick={() => setShowVersionDrawer((v) => !v)}
              className="px-2 py-1 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)] inline-flex items-center gap-1 cursor-pointer"
            >
              <History className="w-3 h-3" />
              <span>{versions.length}</span>
            </button>
          </div>
        </div>

        <p className="text-[11px] text-[var(--muted)]">{preset.description[editLang]}</p>

        {/* Language Toggle & Translation Check */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="inline-flex border border-[var(--line)]">
            {(['en', 'ar'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setEditLang(lang)}
                className={`px-3 py-1 font-mono-tabular uppercase cursor-pointer ${
                  editLang === lang
                    ? 'bg-[var(--ember)] text-[var(--ember-fg)] font-bold'
                    : 'bg-[var(--ink)] text-[var(--bone)]'
                }`}
              >
                {lang === 'en' ? 'English (LTR)' : 'العربية (RTL)'}
              </button>
            ))}
          </div>
          {missingCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono-tabular text-[var(--gold)]">
              <AlertTriangle className="w-3 h-3" />
              {missingCount} untranslated
            </span>
          )}
        </div>
      </div>

      {/* Block Version Rollback Drawer */}
      {showVersionDrawer && (
        <div className="border border-[var(--line)] bg-[var(--ink)] p-3 space-y-2">
          <p className="font-mono-tabular uppercase text-[11px] text-[var(--muted)]">
            Block Version History ({versions.length})
          </p>
          <div className="max-h-40 overflow-y-auto divide-y divide-[var(--line)]">
            {versions.map((ver) => (
              <div key={ver.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono-tabular text-[var(--bone)] truncate">
                    v{ver.version} · {ver.changeNote || ver.snapshot.status}
                  </p>
                  <p className="text-[10px] font-mono-tabular text-[var(--muted)]">{ver.createdAt}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void onRollbackVersion(section.id, ver.id)}
                  className="px-2 py-1 border border-[var(--cedar)] text-[var(--cedar)] text-[10px] inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Common Block Title */}
      <label className="block space-y-1">
        <span className="text-[11px] font-mono-tabular text-[var(--muted)]">
          Block Heading ({editLang.toUpperCase()})
        </span>
        <input
          dir={editLang === 'ar' ? 'rtl' : 'ltr'}
          value={section.title[editLang]}
          onChange={(e) =>
            onChange({
              ...section,
              title: { ...section.title, [editLang]: e.target.value },
            })
          }
          className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-xs font-semibold text-[var(--bone)]"
        />
      </label>

      {/* Block-Specific No-Code Forms */}
      <div className="space-y-3 border-t border-[var(--line)] pt-3">
        {stType === 'hero' && (
          <>
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Layout Mode</span>
              <select
                value={String(c.mode || 'split')}
                onChange={(e) => patchContent({ mode: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
              >
                <option value="split">Single Split Hero</option>
                <option value="slider">Multi-Slide Carousel Hero</option>
              </select>
            </label>
            <LocField label="Eyebrow / Kicker" fieldKey="kicker" />
            <LocField label="Subheadline" fieldKey="subline" multiline />
            <label className="inline-flex items-center gap-2 text-[var(--bone)] cursor-pointer">
              <input
                type="checkbox"
                checked={c.showSearch !== false}
                onChange={(e) => patchContent({ showSearch: e.target.checked })}
              />
              <span>Show Search Input Bar</span>
            </label>
            <LocField label="Primary Button Label" fieldKey="primaryCtaLabel" />
            <UrlPicker
              label="Primary Button Link"
              value={String(c.primaryCtaUrl || '/catalog')}
              onUrlChange={(url) => patchContent({ primaryCtaUrl: url })}
            />
            <LocField label="Secondary Link Label" fieldKey="secondaryCtaLabel" />
            <UrlPicker
              label="Secondary Link Target"
              value={String(c.secondaryCtaUrl || '/seller')}
              onUrlChange={(url) => patchContent({ secondaryCtaUrl: url })}
            />
            <LocField label="Image Badge Label" fieldKey="badgeLabel" />
            <ImageField label="Hero Visual" />

            {String(c.mode || 'split') === 'slider' && (
              <div className="border border-[var(--line)] bg-[var(--ink)] p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">
                    Carousel Slides ({Array.isArray(c.slides) ? c.slides.length : 0})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const prev = Array.isArray(c.slides) ? (c.slides as Array<Record<string, unknown>>) : [];
                      patchContent({
                        slides: [
                          ...prev,
                          {
                            title: { en: section.title.en, ar: section.title.ar },
                            kicker: asLoc(c.kicker),
                            subline: asLoc(c.subline),
                            ctaLabel: asLoc(c.primaryCtaLabel),
                            ctaUrl: String(c.primaryCtaUrl || '/catalog'),
                            imageUrl: String(c.imageUrl || '/src/assets/images/hero_beirut_editorial_1795297173320.jpg'),
                            focalX: Number(c.focalX ?? 50),
                            focalY: Number(c.focalY ?? 50),
                          },
                        ],
                      });
                    }}
                    className="inline-flex items-center gap-1 text-[var(--ember)] font-semibold cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Slide
                  </button>
                </div>
                {(Array.isArray(c.slides) ? (c.slides as Array<Record<string, unknown>>) : []).map((sl, idx) => (
                  <div key={idx} className="border border-[var(--line)] bg-[var(--graphite)] p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-tabular text-[var(--cyan)]">Slide #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const prev = (c.slides as Array<Record<string, unknown>>) || [];
                          patchContent({ slides: prev.filter((_, i) => i !== idx) });
                        }}
                        className="text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <input
                      dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                      value={asLoc(sl.title)[editLang]}
                      onChange={(e) => {
                        const prev = [...((c.slides as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...sl, title: { ...asLoc(sl.title), [editLang]: e.target.value } };
                        patchContent({ slides: prev });
                      }}
                      placeholder={`Slide Title (${editLang.toUpperCase()})`}
                      className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                    />
                    <input
                      dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                      value={asLoc(sl.subline)[editLang]}
                      onChange={(e) => {
                        const prev = [...((c.slides as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...sl, subline: { ...asLoc(sl.subline), [editLang]: e.target.value } };
                        patchContent({ slides: prev });
                      }}
                      placeholder={`Slide Subtitle (${editLang.toUpperCase()})`}
                      className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                    />
                    <div className="flex gap-1.5">
                      <input
                        value={String(sl.ctaUrl || '/catalog')}
                        onChange={(e) => {
                          const prev = [...((c.slides as Array<Record<string, unknown>>) || [])];
                          prev[idx] = { ...sl, ctaUrl: e.target.value };
                          patchContent({ slides: prev });
                        }}
                        placeholder="/catalog"
                        className="flex-1 bg-[var(--ink)] border border-[var(--line)] px-2 py-1 font-mono-tabular text-[var(--bone)]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onPickImage((picked) => {
                            const prev = [...((c.slides as Array<Record<string, unknown>>) || [])];
                            prev[idx] = { ...sl, imageUrl: picked.url, focalX: picked.focalX, focalY: picked.focalY };
                            patchContent({ slides: prev });
                          })
                        }
                        className="px-2 py-1 border border-[var(--ember)] text-[var(--ember)] cursor-pointer"
                      >
                        Image
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {stType === 'announcement_bar' && (
          <>
            <LocField label="Badge / Kicker" fieldKey="kicker" />
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Accent Border Color</span>
              <select
                value={String(c.accentToken || 'ember')}
                onChange={(e) => patchContent({ accentToken: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
              >
                <option value="ember">Ember (Warm Terracotta)</option>
                <option value="cedar">Cedar (Verified Green)</option>
                <option value="gold">Gold (Alert)</option>
                <option value="cyan">Cyan (Tech)</option>
                <option value="graphite">Neutral Hairline</option>
              </select>
            </label>
            <LocField label="Action Link Text" fieldKey="ctaLabel" />
            <UrlPicker
              label="Action Link Target"
              value={String(c.ctaUrl || '/catalog')}
              onUrlChange={(url) => patchContent({ ctaUrl: url })}
            />
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Optional Countdown End</span>
              <input
                type="datetime-local"
                value={toDatetimeLocalValue(typeof c.countdownEndsAt === 'string' ? c.countdownEndsAt : '')}
                onChange={(e) =>
                  patchContent({ countdownEndsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })
                }
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
              />
            </label>
          </>
        )}

        {stType === 'promo_strip' && (
          <>
            <LocField label="Eyebrow" fieldKey="kicker" />
            <LocField label="Description" fieldKey="body" multiline />
            <LocField label="Stat Label" fieldKey="statLabel" />
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Stat Figure (e.g. 8 / 8 or 24H)</span>
              <input
                value={String(c.statValue || '')}
                onChange={(e) => patchContent({ statValue: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
              />
            </label>
            <LocField label="Button Label" fieldKey="ctaLabel" />
            <UrlPicker
              label="Button Target URL"
              value={String(c.ctaUrl || '/catalog')}
              onUrlChange={(url) => patchContent({ ctaUrl: url })}
            />
          </>
        )}

        {stType === 'bento_grid' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Bento Cards</span>
              <button
                type="button"
                onClick={() => {
                  const prev = Array.isArray(c.tiles) ? (c.tiles as Array<Record<string, unknown>>) : [];
                  patchContent({
                    tiles: [
                      ...prev,
                      {
                        id: `tile-${Date.now()}`,
                        span: 'normal',
                        tint: 'sand',
                        tag: { en: 'Collection', ar: 'تشكيلة' },
                        title: { en: 'New Feature', ar: 'قسم جديد' },
                        subtitle: { en: 'Shop verified SKUs.', ar: 'تسوق منتجات موثقة.' },
                        url: '/catalog',
                        imageUrl: '/src/assets/images/cat_fashion_linen_1795297173988.jpg',
                        focalX: 50,
                        focalY: 50,
                      },
                    ],
                  });
                }}
                className="inline-flex items-center gap-1 text-[var(--ember)] font-semibold cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Tile
              </button>
            </div>
            {(Array.isArray(c.tiles) ? (c.tiles as Array<Record<string, unknown>>) : []).map((tile, idx) => (
              <div key={String(tile.id || idx)} className="border border-[var(--line)] bg-[var(--ink)] p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono-tabular text-[var(--cyan)]">Tile #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const prev = (c.tiles as Array<Record<string, unknown>>) || [];
                      patchContent({ tiles: prev.filter((_, i) => i !== idx) });
                    }}
                    className="text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={String(tile.span || 'normal')}
                    onChange={(e) => {
                      const prev = [...((c.tiles as Array<Record<string, unknown>>) || [])];
                      prev[idx] = { ...tile, span: e.target.value };
                      patchContent({ tiles: prev });
                    }}
                    className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                  >
                    <option value="normal">Standard Width</option>
                    <option value="wide">Wide (2 Cols)</option>
                  </select>
                  <select
                    value={String(tile.tint || 'sand')}
                    onChange={(e) => {
                      const prev = [...((c.tiles as Array<Record<string, unknown>>) || [])];
                      prev[idx] = { ...tile, tint: e.target.value };
                      patchContent({ tiles: prev });
                    }}
                    className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                  >
                    <option value="sand">Sand Tint</option>
                    <option value="cyan">Cyan Tint</option>
                    <option value="sage">Sage Tint</option>
                    <option value="ember">Ember Tint</option>
                  </select>
                </div>
                <input
                  dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                  value={asLoc(tile.tag)[editLang]}
                  onChange={(e) => {
                    const prev = [...((c.tiles as Array<Record<string, unknown>>) || [])];
                    prev[idx] = { ...tile, tag: { ...asLoc(tile.tag), [editLang]: e.target.value } };
                    patchContent({ tiles: prev });
                  }}
                  placeholder={`Tag (${editLang.toUpperCase()})`}
                  className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                />
                <input
                  dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                  value={asLoc(tile.title)[editLang]}
                  onChange={(e) => {
                    const prev = [...((c.tiles as Array<Record<string, unknown>>) || [])];
                    prev[idx] = { ...tile, title: { ...asLoc(tile.title), [editLang]: e.target.value } };
                    patchContent({ tiles: prev });
                  }}
                  placeholder={`Tile Title (${editLang.toUpperCase()})`}
                  className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                />
                <input
                  dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                  value={asLoc(tile.subtitle)[editLang]}
                  onChange={(e) => {
                    const prev = [...((c.tiles as Array<Record<string, unknown>>) || [])];
                    prev[idx] = { ...tile, subtitle: { ...asLoc(tile.subtitle), [editLang]: e.target.value } };
                    patchContent({ tiles: prev });
                  }}
                  placeholder={`Subtitle (${editLang.toUpperCase()})`}
                  className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                />
                <div className="flex gap-1.5">
                  <input
                    value={String(tile.url || '/catalog')}
                    onChange={(e) => {
                      const prev = [...((c.tiles as Array<Record<string, unknown>>) || [])];
                      prev[idx] = { ...tile, url: e.target.value };
                      patchContent({ tiles: prev });
                    }}
                    placeholder="/catalog"
                    className="flex-1 bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 font-mono-tabular text-[var(--bone)]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onPickImage((picked) => {
                        const prev = [...((c.tiles as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...tile, imageUrl: picked.url, focalX: picked.focalX, focalY: picked.focalY };
                        patchContent({ tiles: prev });
                      })
                    }
                    className="px-2 py-1 border border-[var(--ember)] text-[var(--ember)] cursor-pointer"
                  >
                    Image
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {(stType === 'product_grid' || stType === 'product_carousel') && (
          <>
            <LocField label="Subtitle" fieldKey="subtitle" />
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Product Selection Mode</span>
              <select
                value={String(c.sourceMode || 'all')}
                onChange={(e) => patchContent({ sourceMode: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
              >
                <option value="all">All Published Products</option>
                <option value="featured">Featured Products Only</option>
                <option value="deals">Active Deals & Offers</option>
                <option value="newest">Newest Arrivals</option>
                <option value="top_rated">Highest Rated</option>
                <option value="manual">Handpick Specific Products</option>
              </select>
            </label>
            {String(c.sourceMode || 'all') === 'manual' ? (
              <ProductMultiPicker />
            ) : (
              <label className="block space-y-1">
                <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Department Filter</span>
                <select
                  value={String(c.department || '')}
                  onChange={(e) => patchContent({ department: e.target.value })}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
                >
                  <option value="">All Departments</option>
                  <option value="fashion">Fashion</option>
                  <option value="electronics">Electronics & Mobiles</option>
                  <option value="home-gadgets">Home Gadgets</option>
                </select>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              {stType === 'product_grid' && (
                <label className="block space-y-1">
                  <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Columns</span>
                  <select
                    value={String(c.columns || 3)}
                    onChange={(e) => patchContent({ columns: Number(e.target.value) })}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1.5 text-[var(--bone)]"
                  >
                    <option value="2">2 Columns</option>
                    <option value="3">3 Columns</option>
                    <option value="4">4 Columns</option>
                  </select>
                </label>
              )}
              <label className="block space-y-1">
                <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Max Items</span>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={Number(c.limit || 6)}
                  onChange={(e) => patchContent({ limit: Number(e.target.value) })}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
                />
              </label>
            </div>
            <LocField label="Action Link Text" fieldKey="ctaLabel" />
            <UrlPicker
              label="Action Link Target"
              value={String(c.ctaUrl || '/catalog')}
              onUrlChange={(url) => patchContent({ ctaUrl: url })}
            />
          </>
        )}

        {stType === 'category_tiles' && (
          <>
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Grid Columns</span>
              <select
                value={String(c.columns || 3)}
                onChange={(e) => patchContent({ columns: Number(e.target.value) })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
              >
                <option value="2">2 Columns</option>
                <option value="3">3 Columns</option>
                <option value="4">4 Columns</option>
              </select>
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Department / Category Cards</span>
                <button
                  type="button"
                  onClick={() => {
                    const prev = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];
                    patchContent({
                      items: [
                        ...prev,
                        {
                          slug: `cat-${prev.length + 1}`,
                          tint: 'var(--sand)',
                          tag: { en: 'Department', ar: 'قسم' },
                          title: { en: 'New Category', ar: 'فئة جديدة' },
                          desc: { en: 'Explore curated SKUs.', ar: 'تصفح المنتجات المختارة.' },
                          image: '/src/assets/images/cat_fashion_linen_1795297173988.jpg',
                          focalX: 50,
                          focalY: 50,
                          url: '/catalog',
                        },
                      ],
                    });
                  }}
                  className="inline-flex items-center gap-1 text-[var(--ember)] cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add Card
                </button>
              </div>
              {(Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : []).map((it, idx) => (
                <div key={idx} className="border border-[var(--line)] bg-[var(--ink)] p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tabular text-[var(--cyan)]">Card #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const prev = (c.items as Array<Record<string, unknown>>) || [];
                        patchContent({ items: prev.filter((_, i) => i !== idx) });
                      }}
                      className="text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <input
                    dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                    value={asLoc(it.title)[editLang]}
                    onChange={(e) => {
                      const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                      prev[idx] = { ...it, title: { ...asLoc(it.title), [editLang]: e.target.value } };
                      patchContent({ items: prev });
                    }}
                    placeholder={`Title (${editLang.toUpperCase()})`}
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                  />
                  <input
                    dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                    value={asLoc(it.tag)[editLang]}
                    onChange={(e) => {
                      const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                      prev[idx] = { ...it, tag: { ...asLoc(it.tag), [editLang]: e.target.value } };
                      patchContent({ items: prev });
                    }}
                    placeholder={`Tag (${editLang.toUpperCase()})`}
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                  />
                  <input
                    dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                    value={asLoc(it.desc)[editLang]}
                    onChange={(e) => {
                      const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                      prev[idx] = { ...it, desc: { ...asLoc(it.desc), [editLang]: e.target.value } };
                      patchContent({ items: prev });
                    }}
                    placeholder={`Description (${editLang.toUpperCase()})`}
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                  />
                  <div className="flex gap-1.5">
                    <input
                      value={String(it.url || `/catalog?department=${String(it.slug || '')}`)}
                      onChange={(e) => {
                        const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...it, url: e.target.value };
                        patchContent({ items: prev });
                      }}
                      placeholder="/catalog?department=..."
                      className="flex-1 bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 font-mono-tabular text-[var(--bone)]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onPickImage((picked) => {
                          const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                          prev[idx] = { ...it, image: picked.url, focalX: picked.focalX, focalY: picked.focalY };
                          patchContent({ items: prev });
                        })
                      }
                      className="px-2 py-1 border border-[var(--ember)] text-[var(--ember)] cursor-pointer"
                    >
                      Image
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {stType === 'department_spotlight' && (
          <>
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Target Department</span>
              <select
                value={String(c.department || 'electronics')}
                onChange={(e) => patchContent({ department: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
              >
                <option value="fashion">Fashion</option>
                <option value="electronics">Electronics & Mobiles</option>
                <option value="home-gadgets">Home Gadgets</option>
              </select>
            </label>
            <LocField label="Department Description" fieldKey="description" multiline />
            <LocField label="Button Label" fieldKey="ctaLabel" />
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Product Count (1–6)</span>
              <input
                type="number"
                min={1}
                max={6}
                value={Number(c.limit || 3)}
                onChange={(e) => patchContent({ limit: Number(e.target.value) })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
              />
            </label>
          </>
        )}

        {stType === 'flash_sale_block' && (
          <>
            <LocField label="Subtitle" fieldKey="subtitle" />
            <label className="inline-flex items-center gap-2 text-[var(--bone)] cursor-pointer">
              <input
                type="checkbox"
                checked={c.showCountdown !== false}
                onChange={(e) => patchContent({ showCountdown: e.target.checked })}
              />
              <span>Show Live Countdown Clock</span>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Max Deal Cards (1–9)</span>
              <input
                type="number"
                min={1}
                max={9}
                value={Number(c.limit || 3)}
                onChange={(e) => patchContent({ limit: Number(e.target.value) })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
              />
            </label>
            <ProductMultiPicker />
          </>
        )}

        {stType === 'featured_stores' && (
          <>
            <LocField label="Subtitle" fieldKey="subtitle" />
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Max Stores (1–12)</span>
              <input
                type="number"
                min={1}
                max={12}
                value={Number(c.limit || 6)}
                onChange={(e) => patchContent({ limit: Number(e.target.value) })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
              />
            </label>
            <SellerMultiPicker />
          </>
        )}

        {stType === 'brand_bar' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Brands / Houses</span>
              <button
                type="button"
                onClick={() => {
                  const prev = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];
                  patchContent({
                    items: [...prev, { name: 'New Atelier', note: { en: 'Beirut', ar: 'بيروت' }, url: '/catalog' }],
                  });
                }}
                className="inline-flex items-center gap-1 text-[var(--ember)] cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Brand
              </button>
            </div>
            {(Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : []).map((it, idx) => (
              <div key={idx} className="border border-[var(--line)] bg-[var(--ink)] p-2 space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    value={String(it.name || '')}
                    onChange={(e) => {
                      const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                      prev[idx] = { ...it, name: e.target.value };
                      patchContent({ items: prev });
                    }}
                    placeholder="Brand Name"
                    className="flex-1 bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const prev = (c.items as Array<Record<string, unknown>>) || [];
                      patchContent({ items: prev.filter((_, i) => i !== idx) });
                    }}
                    className="text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                    value={asLoc(it.note)[editLang]}
                    onChange={(e) => {
                      const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                      prev[idx] = { ...it, note: { ...asLoc(it.note), [editLang]: e.target.value } };
                      patchContent({ items: prev });
                    }}
                    placeholder={`City / Tag (${editLang.toUpperCase()})`}
                    className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                  />
                  <input
                    value={String(it.url || '/catalog')}
                    onChange={(e) => {
                      const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                      prev[idx] = { ...it, url: e.target.value };
                      patchContent({ items: prev });
                    }}
                    placeholder="/catalog"
                    className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 font-mono-tabular text-[var(--bone)]"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {stType === 'trust_cells' && (
          <>
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Display Mode</span>
              <select
                value={String(c.mode || 'guarantees')}
                onChange={(e) => patchContent({ mode: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
              >
                <option value="guarantees">3-Cell Trust & Spotlight Strip</option>
                <option value="governorates">Live 8 Governorates Delivery Tariff Matrix</option>
              </select>
            </label>
            {String(c.mode || 'guarantees') === 'governorates' ? (
              <LocField label="Matrix Subtitle" fieldKey="subtitle" />
            ) : (
              <>
                <label className="inline-flex items-center gap-2 text-[var(--bone)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={c.showSpotlightProduct !== false}
                    onChange={(e) => patchContent({ showSpotlightProduct: e.target.checked })}
                  />
                  <span>Replace Cell #1 with Live Featured Product</span>
                </label>
                {(Array.isArray(c.cells) ? (c.cells as Array<Record<string, unknown>>) : []).map((cell, idx) => (
                  <div key={idx} className="border border-[var(--line)] bg-[var(--ink)] p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-tabular text-[var(--cyan)]">Cell #{idx + 1}</span>
                      <select
                        value={String(cell.icon || 'wallet')}
                        onChange={(e) => {
                          const prev = [...((c.cells as Array<Record<string, unknown>>) || [])];
                          prev[idx] = { ...cell, icon: e.target.value };
                          patchContent({ cells: prev });
                        }}
                        className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--bone)]"
                      >
                        <option value="wallet">Wallet Icon</option>
                        <option value="shield">Shield Icon</option>
                        <option value="truck">Truck Icon</option>
                      </select>
                    </div>
                    <input
                      dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                      value={asLoc(cell.title)[editLang]}
                      onChange={(e) => {
                        const prev = [...((c.cells as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...cell, title: { ...asLoc(cell.title), [editLang]: e.target.value } };
                        patchContent({ cells: prev });
                      }}
                      placeholder={`Cell Title (${editLang.toUpperCase()})`}
                      className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                    />
                    <input
                      dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                      value={asLoc(cell.desc)[editLang]}
                      onChange={(e) => {
                        const prev = [...((c.cells as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...cell, desc: { ...asLoc(cell.desc), [editLang]: e.target.value } };
                        patchContent({ cells: prev });
                      }}
                      placeholder={`Cell Description (${editLang.toUpperCase()})`}
                      className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                    />
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {stType === 'social_proof' && (
          <>
            <LocField label="Subtitle" fieldKey="subtitle" />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Customer Quotes</span>
                <button
                  type="button"
                  onClick={() => {
                    const prev = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];
                    patchContent({
                      items: [
                        ...prev,
                        {
                          author: 'Buyer Name',
                          city: { en: 'Beirut', ar: 'بيروت' },
                          rating: 5,
                          quote: { en: 'Fast delivery and clean pricing.', ar: 'توصيل سريع وتسعير واضح.' },
                        },
                      ],
                    });
                  }}
                  className="inline-flex items-center gap-1 text-[var(--ember)] cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add Quote
                </button>
              </div>
              {(Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : []).map((it, idx) => (
                <div key={idx} className="border border-[var(--line)] bg-[var(--ink)] p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tabular text-[var(--cyan)]">Quote #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const prev = (c.items as Array<Record<string, unknown>>) || [];
                        patchContent({ items: prev.filter((_, i) => i !== idx) });
                      }}
                      className="text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      value={String(it.author || '')}
                      onChange={(e) => {
                        const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...it, author: e.target.value };
                        patchContent({ items: prev });
                      }}
                      placeholder="Author"
                      className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                    />
                    <input
                      dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                      value={asLoc(it.city)[editLang]}
                      onChange={(e) => {
                        const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...it, city: { ...asLoc(it.city), [editLang]: e.target.value } };
                        patchContent({ items: prev });
                      }}
                      placeholder="City"
                      className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                    />
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={Number(it.rating ?? 5)}
                      onChange={(e) => {
                        const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...it, rating: Number(e.target.value) };
                        patchContent({ items: prev });
                      }}
                      className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 font-mono-tabular text-[var(--bone)]"
                    />
                  </div>
                  <textarea
                    rows={2}
                    dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                    value={asLoc(it.quote)[editLang]}
                    onChange={(e) => {
                      const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                      prev[idx] = { ...it, quote: { ...asLoc(it.quote), [editLang]: e.target.value } };
                      patchContent({ items: prev });
                    }}
                    placeholder={`Quote (${editLang.toUpperCase()})`}
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] p-2 text-[var(--bone)]"
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {stType === 'how_it_works' && (
          <>
            <LocField label="Eyebrow" fieldKey="eyebrow" />
            <LocField label="Body Text" fieldKey="body" multiline />
            <LocField label="Button Label" fieldKey="ctaLabel" />
            <UrlPicker
              label="Button Target URL"
              value={String(c.ctaUrl || '/seller')}
              onUrlChange={(url) => patchContent({ ctaUrl: url })}
            />
            <label className="inline-flex items-center gap-2 text-[var(--bone)] cursor-pointer">
              <input
                type="checkbox"
                checked={c.showPlans !== false}
                onChange={(e) => patchContent({ showPlans: e.target.checked })}
              />
              <span>Display Live Subscription Plans (from DB) instead of Custom Steps</span>
            </label>
            {c.showPlans === false && (
              <div className="space-y-2">
                {(Array.isArray(c.steps) ? (c.steps as Array<Record<string, unknown>>) : []).map((st, idx) => (
                  <div key={idx} className="border border-[var(--line)] bg-[var(--ink)] p-2 space-y-1">
                    <input
                      dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                      value={asLoc(st.title)[editLang]}
                      onChange={(e) => {
                        const prev = [...((c.steps as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...st, title: { ...asLoc(st.title), [editLang]: e.target.value } };
                        patchContent({ steps: prev });
                      }}
                      placeholder={`Step #${idx + 1} Title`}
                      className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                    />
                    <input
                      dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                      value={asLoc(st.desc)[editLang]}
                      onChange={(e) => {
                        const prev = [...((c.steps as Array<Record<string, unknown>>) || [])];
                        prev[idx] = { ...st, desc: { ...asLoc(st.desc), [editLang]: e.target.value } };
                        patchContent({ steps: prev });
                      }}
                      placeholder={`Step #${idx + 1} Description`}
                      className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {stType === 'newsletter_box' && (
          <>
            <LocField label="Description" fieldKey="desc" multiline />
            <LocField label="Email Placeholder" fieldKey="placeholder" />
            <LocField label="Submit Button Label" fieldKey="ctaLabel" />
          </>
        )}

        {stType === 'faq_accordion' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Q&A Items</span>
              <button
                type="button"
                onClick={() => {
                  const prev = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];
                  patchContent({
                    items: [...prev, { q: { en: 'New Question?', ar: 'سؤال جديد؟' }, a: { en: 'Answer...', ar: 'الإجابة...' } }],
                  });
                }}
                className="inline-flex items-center gap-1 text-[var(--ember)] cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Q&A
              </button>
            </div>
            {(Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : []).map((it, idx) => (
              <div key={idx} className="border border-[var(--line)] bg-[var(--ink)] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono-tabular text-[var(--cyan)]">Q#{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const prev = (c.items as Array<Record<string, unknown>>) || [];
                      patchContent({ items: prev.filter((_, i) => i !== idx) });
                    }}
                    className="text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <input
                  dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                  value={asLoc(it.q)[editLang]}
                  onChange={(e) => {
                    const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                    prev[idx] = { ...it, q: { ...asLoc(it.q), [editLang]: e.target.value } };
                    patchContent({ items: prev });
                  }}
                  placeholder={`Question (${editLang.toUpperCase()})`}
                  className="w-full bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                />
                <textarea
                  rows={2}
                  dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                  value={asLoc(it.a)[editLang]}
                  onChange={(e) => {
                    const prev = [...((c.items as Array<Record<string, unknown>>) || [])];
                    prev[idx] = { ...it, a: { ...asLoc(it.a), [editLang]: e.target.value } };
                    patchContent({ items: prev });
                  }}
                  placeholder={`Answer (${editLang.toUpperCase()})`}
                  className="w-full bg-[var(--graphite)] border border-[var(--line)] p-2 text-[var(--bone)]"
                />
              </div>
            ))}
          </div>
        )}

        {stType === 'rich_block' && (
          <>
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Block Variant</span>
              <select
                value={String(c.variant || 'editorial')}
                onChange={(e) => patchContent({ variant: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
              >
                <option value="editorial">Editorial Copy + Optional Image</option>
                <option value="manifesto">Full-Width Manifesto Statement</option>
                <option value="comparison">2-Column Comparison Table</option>
              </select>
            </label>
            {String(c.variant || 'editorial') === 'comparison' ? (
              <>
                <LocField label="Column A Header" fieldKey="colAHeader" />
                <LocField label="Column B Header" fieldKey="colBHeader" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tabular uppercase text-[var(--muted)]">Comparison Rows</span>
                    <button
                      type="button"
                      onClick={() => {
                        const prev = Array.isArray(c.rows) ? (c.rows as Array<Record<string, unknown>>) : [];
                        patchContent({
                          rows: [
                            ...prev,
                            { label: { en: 'Criteria', ar: 'المعيار' }, colA: { en: 'Yes', ar: 'نعم' }, colB: { en: 'Standard', ar: 'قياسي' } },
                          ],
                        });
                      }}
                      className="inline-flex items-center gap-1 text-[var(--ember)] cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add Row
                    </button>
                  </div>
                  {(Array.isArray(c.rows) ? (c.rows as Array<Record<string, unknown>>) : []).map((row, idx) => (
                    <div key={idx} className="border border-[var(--line)] bg-[var(--ink)] p-2 space-y-1">
                      <div className="flex gap-1.5">
                        <input
                          dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                          value={asLoc(row.label)[editLang]}
                          onChange={(e) => {
                            const prev = [...((c.rows as Array<Record<string, unknown>>) || [])];
                            prev[idx] = { ...row, label: { ...asLoc(row.label), [editLang]: e.target.value } };
                            patchContent({ rows: prev });
                          }}
                          placeholder="Row Label"
                          className="flex-1 bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const prev = (c.rows as Array<Record<string, unknown>>) || [];
                            patchContent({ rows: prev.filter((_, i) => i !== idx) });
                          }}
                          className="text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                          value={asLoc(row.colA)[editLang]}
                          onChange={(e) => {
                            const prev = [...((c.rows as Array<Record<string, unknown>>) || [])];
                            prev[idx] = { ...row, colA: { ...asLoc(row.colA), [editLang]: e.target.value } };
                            patchContent({ rows: prev });
                          }}
                          placeholder="Col A"
                          className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                        />
                        <input
                          dir={editLang === 'ar' ? 'rtl' : 'ltr'}
                          value={asLoc(row.colB)[editLang]}
                          onChange={(e) => {
                            const prev = [...((c.rows as Array<Record<string, unknown>>) || [])];
                            prev[idx] = { ...row, colB: { ...asLoc(row.colB), [editLang]: e.target.value } };
                            patchContent({ rows: prev });
                          }}
                          placeholder="Col B"
                          className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <LocField label="Eyebrow" fieldKey="eyebrow" />
                <LocField label="Body / Statement" fieldKey="body" multiline />
                <LocField label="Button Label" fieldKey="ctaLabel" />
                <UrlPicker
                  label="Button Target URL"
                  value={String(c.ctaUrl || '/catalog')}
                  onUrlChange={(url) => patchContent({ ctaUrl: url })}
                />
                {String(c.variant || 'editorial') === 'editorial' && <ImageField label="Editorial Image (Optional)" />}
              </>
            )}
          </>
        )}

        {stType === 'video_3d_embed' && (
          <>
            <LocField label="Eyebrow" fieldKey="eyebrow" />
            <LocField label="Description" fieldKey="body" multiline />
            <label className="block space-y-1">
              <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Media Mode</span>
              <select
                value={String(c.mediaMode || 'video')}
                onChange={(e) => patchContent({ mediaMode: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
              >
                <option value="video">Video Showcase (YouTube / Vimeo / MP4)</option>
                <option value="3d">3D Product Showcase Panel</option>
              </select>
            </label>
            {String(c.mediaMode || 'video') === 'video' && (
              <label className="block space-y-1">
                <span className="text-[11px] font-mono-tabular text-[var(--muted)]">Video URL (https://...)</span>
                <input
                  value={String(c.videoUrl || '')}
                  onChange={(e) => patchContent({ videoUrl: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
                />
              </label>
            )}
            <ImageField label="Poster / Fallback Visual" urlKey="posterImageUrl" />
            <LocField label="Button Label" fieldKey="ctaLabel" />
            <UrlPicker
              label="Button Target URL"
              value={String(c.ctaUrl || '/catalog')}
              onUrlChange={(url) => patchContent({ ctaUrl: url })}
            />
          </>
        )}
      </div>

      {/* Appearance & Style Controls */}
      <div className="border-t border-[var(--line)] pt-3 space-y-2.5">
        <p className="font-mono-tabular uppercase text-[11px] text-[var(--muted)]">Appearance & Spacing</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Surface</span>
            <select
              value={style.surface || 'graphite'}
              onChange={(e) =>
                onChange({ ...section, style: { ...style, surface: e.target.value as 'ink' | 'graphite' } })
              }
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1.5 text-[var(--bone)]"
            >
              <option value="graphite">Default Surface</option>
              <option value="ink">Recessed Ink</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Vertical Padding</span>
            <select
              value={style.padding || 'standard'}
              onChange={(e) =>
                onChange({
                  ...section,
                  style: { ...style, padding: e.target.value as 'compact' | 'standard' | 'spacious' },
                })
              }
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1.5 text-[var(--bone)]"
            >
              <option value="compact">Compact</option>
              <option value="standard">Standard</option>
              <option value="spacious">Spacious</option>
            </select>
          </label>
        </div>
      </div>

      {/* Visibility, Targeting & Scheduling */}
      <div className="border-t border-[var(--line)] pt-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="font-mono-tabular uppercase text-[11px] text-[var(--muted)]">Visibility & Targeting</p>
          <button
            type="button"
            onClick={() => onChange({ ...section, visible: !section.visible })}
            className={`inline-flex items-center gap-1 px-2 py-1 border text-[11px] cursor-pointer ${
              section.visible
                ? 'border-[var(--cedar)] text-[var(--cedar)]'
                : 'border-[var(--line)] text-[var(--muted)]'
            }`}
          >
            {section.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>{section.visible ? 'Visible' : 'Hidden'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Status</span>
            <select
              value={section.status}
              onChange={(e) => onChange({ ...section, status: e.target.value as HomeSectionStatus })}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1.5 text-[var(--bone)]"
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Visitor Segment</span>
            <select
              value={targeting.visitor || 'all'}
              onChange={(e) => {
                const v = e.target.value as HomeSectionTargeting['visitor'];
                onChange({
                  ...section,
                  audience: (v || 'all') as HomeSectionAudience,
                  targeting: { ...targeting, visitor: v },
                });
              }}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1.5 text-[var(--bone)]"
            >
              <option value="all">All Visitors</option>
              <option value="guest">Guests Only</option>
              <option value="logged_in">Signed-In Users</option>
              <option value="new_visitor">New Visitors</option>
              <option value="returning">Returning Customers</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Device</span>
            <select
              value={targeting.device || 'all'}
              onChange={(e) =>
                onChange({
                  ...section,
                  targeting: { ...targeting, device: e.target.value as 'all' | 'desktop' | 'mobile' },
                })
              }
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1.5 text-[var(--bone)]"
            >
              <option value="all">Desktop & Mobile</option>
              <option value="desktop">Desktop Only</option>
              <option value="mobile">Mobile Only</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Language</span>
            <select
              value={targeting.locale || 'all'}
              onChange={(e) =>
                onChange({
                  ...section,
                  targeting: { ...targeting, locale: e.target.value as 'all' | 'en' | 'ar' },
                })
              }
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1.5 text-[var(--bone)]"
            >
              <option value="all">English & Arabic</option>
              <option value="en">English Only</option>
              <option value="ar">Arabic (RTL) Only</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] text-[var(--muted)]">Governorate Focus (Optional)</span>
          <select
            value={targeting.governorate || ''}
            onChange={(e) =>
              onChange({
                ...section,
                targeting: { ...targeting, governorate: e.target.value || undefined },
              })
            }
            className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1.5 text-[var(--bone)]"
          >
            <option value="">All 8 Governorates</option>
            {deliveryZones.map((z) => (
              <option key={z.governorateCode} value={z.governorateCode}>
                {z.name.en}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Schedule Start</span>
            <input
              type="datetime-local"
              value={toDatetimeLocalValue(section.startsAt)}
              onChange={(e) =>
                onChange({
                  ...section,
                  startsAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1 font-mono-tabular text-[11px] text-[var(--bone)]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Schedule End</span>
            <input
              type="datetime-local"
              value={toDatetimeLocalValue(section.endsAt)}
              onChange={(e) =>
                onChange({
                  ...section,
                  endsAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1 font-mono-tabular text-[11px] text-[var(--bone)]"
            />
          </label>
        </div>
      </div>

      {/* Collapsed-by-default Developer Raw View */}
      <details className="border-t border-[var(--line)] pt-3">
        <summary className="cursor-pointer font-mono-tabular text-[11px] text-[var(--muted)] hover:text-[var(--bone)]">
          Developer · Raw Block Data (Hidden by default)
        </summary>
        <pre className="mt-2 p-2.5 bg-[var(--ink)] border border-[var(--line)] font-mono-tabular text-[10px] text-[var(--muted)] overflow-x-auto max-h-48">
          {JSON.stringify({ id: section.id, sectionType: section.sectionType, content: section.content }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
