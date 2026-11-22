import React, { useEffect, useState } from 'react';
import { Globe, ImagePlus, Layout, Plus, Trash2, X } from 'lucide-react';
import type { SiteChromeSettings } from '../../shared/types.ts';

export function ChromeAndSeoModal({
  open,
  onClose,
  initialChrome,
  onSave,
  onPickImage,
}: {
  open: boolean;
  onClose: () => void;
  initialChrome: SiteChromeSettings;
  onSave: (nextChrome: SiteChromeSettings, publishNow: boolean) => Promise<void>;
  onPickImage: (cb: (picked: { url: string }) => void) => void;
}) {
  const [draft, setDraft] = useState<SiteChromeSettings>(initialChrome);
  const [tab, setTab] = useState<'header' | 'footer' | 'seo'>('header');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(JSON.parse(JSON.stringify(initialChrome)) as SiteChromeSettings);
  }, [open, initialChrome]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col border border-[var(--line)] bg-[var(--ink)]">
        <div className="px-5 py-3.5 border-b border-[var(--line)] bg-[var(--graphite)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Layout className="w-4 h-4 text-[var(--ember)]" />
            <h2 className="font-display text-lg font-bold text-[var(--bone)]">
              Header, Mega-Menu, Footer & Home SEO
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Chrome and SEO Editor"
            className="p-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[var(--line)] flex gap-2 text-xs">
          {[
            { id: 'header' as const, label: 'Header Nav & Mega-Menu' },
            { id: 'footer' as const, label: 'Footer Columns & Badges' },
            { id: 'seo' as const, label: 'Home Page SEO & Share Card' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 border font-medium cursor-pointer ${
                tab === item.id
                  ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                  : 'border-[var(--line)] text-[var(--bone)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
          {tab === 'header' && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-[var(--bone)]">Top Header Navigation Links</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        headerLinks: [
                          ...d.headerLinks,
                          {
                            id: `nav-${Date.now()}`,
                            label: { en: 'New Link', ar: 'رابط جديد' },
                            url: '/catalog',
                            visible: true,
                          },
                        ],
                      }))
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--ember)] text-[var(--ember)] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Link
                  </button>
                </div>

                <div className="space-y-2">
                  {draft.headerLinks.map((lnk, idx) => (
                    <div
                      key={lnk.id}
                      className="grid grid-cols-1 md:grid-cols-12 gap-2 border border-[var(--line)] bg-[var(--graphite)] p-3 items-center"
                    >
                      <input
                        value={lnk.label.en}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            headerLinks: d.headerLinks.map((x, i) =>
                              i === idx ? { ...x, label: { ...x.label, en: e.target.value } } : x
                            ),
                          }))
                        }
                        placeholder="Label (EN)"
                        className="md:col-span-3 bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
                      />
                      <input
                        dir="rtl"
                        value={lnk.label.ar}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            headerLinks: d.headerLinks.map((x, i) =>
                              i === idx ? { ...x, label: { ...x.label, ar: e.target.value } } : x
                            ),
                          }))
                        }
                        placeholder="Label (AR)"
                        className="md:col-span-3 bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
                      />
                      <input
                        value={lnk.url}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            headerLinks: d.headerLinks.map((x, i) => (i === idx ? { ...x, url: e.target.value } : x)),
                          }))
                        }
                        placeholder="/catalog"
                        className="md:col-span-4 bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
                      />
                      <div className="md:col-span-2 flex items-center justify-end gap-2">
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={lnk.visible}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                headerLinks: d.headerLinks.map((x, i) =>
                                  i === idx ? { ...x, visible: e.target.checked } : x
                                ),
                              }))
                            }
                          />
                          <span>Show</span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              headerLinks: d.headerLinks.filter((_, i) => i !== idx),
                            }))
                          }
                          className="p-1 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                          aria-label="Remove header link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--line)] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 font-semibold text-[var(--bone)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.showMegaMenu}
                      onChange={(e) => setDraft((d) => ({ ...d, showMegaMenu: e.target.checked }))}
                    />
                    <span>Enable Departments Mega-Menu in Header</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        megaMenuDepartments: [
                          ...d.megaMenuDepartments,
                          {
                            slug: `dept-${d.megaMenuDepartments.length + 1}`,
                            title: { en: 'New Department', ar: 'قسم جديد' },
                            tagline: { en: 'Curated selection', ar: 'تشكيلة مختارة' },
                            links: [{ label: { en: 'Browse All', ar: 'عرض الكل' }, url: '/catalog' }],
                          },
                        ],
                      }))
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Department
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {draft.megaMenuDepartments.map((dept, dIdx) => (
                    <div key={dIdx} className="border border-[var(--line)] bg-[var(--graphite)] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-tabular text-[var(--cyan)]">{dept.slug}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              megaMenuDepartments: d.megaMenuDepartments.filter((_, i) => i !== dIdx),
                            }))
                          }
                          className="text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        value={dept.title.en}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            megaMenuDepartments: d.megaMenuDepartments.map((x, i) =>
                              i === dIdx ? { ...x, title: { ...x.title, en: e.target.value } } : x
                            ),
                          }))
                        }
                        placeholder="Title (EN)"
                        className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                      />
                      <input
                        dir="rtl"
                        value={dept.title.ar}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            megaMenuDepartments: d.megaMenuDepartments.map((x, i) =>
                              i === dIdx ? { ...x, title: { ...x.title, ar: e.target.value } } : x
                            ),
                          }))
                        }
                        placeholder="Title (AR)"
                        className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                      />
                      <input
                        value={dept.tagline.en}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            megaMenuDepartments: d.megaMenuDepartments.map((x, i) =>
                              i === dIdx ? { ...x, tagline: { ...x.tagline, en: e.target.value } } : x
                            ),
                          }))
                        }
                        placeholder="Tagline (EN)"
                        className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--muted)]"
                      />
                      <input
                        dir="rtl"
                        value={dept.tagline.ar}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            megaMenuDepartments: d.megaMenuDepartments.map((x, i) =>
                              i === dIdx ? { ...x, tagline: { ...x.tagline, ar: e.target.value } } : x
                            ),
                          }))
                        }
                        placeholder="Tagline (AR)"
                        className="w-full bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--muted)]"
                      />
                      <div className="pt-2 border-t border-[var(--line)] space-y-1.5">
                        {dept.links.map((l, lIdx) => (
                          <div key={lIdx} className="grid grid-cols-2 gap-1">
                            <input
                              value={l.label.en}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  megaMenuDepartments: d.megaMenuDepartments.map((x, i) =>
                                    i === dIdx
                                      ? {
                                          ...x,
                                          links: x.links.map((k, ki) =>
                                            ki === lIdx ? { ...k, label: { ...k.label, en: e.target.value } } : k
                                          ),
                                        }
                                      : x
                                  ),
                                }))
                              }
                              placeholder="Link EN"
                              className="bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                            />
                            <input
                              value={l.url}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  megaMenuDepartments: d.megaMenuDepartments.map((x, i) =>
                                    i === dIdx
                                      ? {
                                          ...x,
                                          links: x.links.map((k, ki) =>
                                            ki === lIdx ? { ...k, url: e.target.value } : k
                                          ),
                                        }
                                      : x
                                  ),
                                }))
                              }
                              placeholder="/catalog?..."
                              className="bg-[var(--ink)] border border-[var(--line)] px-2 py-1 font-mono-tabular text-[var(--bone)]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'footer' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[var(--muted)]">Footer Brand Statement (EN)</span>
                  <textarea
                    rows={3}
                    value={draft.footerNote.en}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, footerNote: { ...d.footerNote, en: e.target.value } }))
                    }
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] p-2.5 text-[var(--bone)]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[var(--muted)]">Footer Brand Statement (AR)</span>
                  <textarea
                    rows={3}
                    dir="rtl"
                    value={draft.footerNote.ar}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, footerNote: { ...d.footerNote, ar: e.target.value } }))
                    }
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] p-2.5 text-[var(--bone)]"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[var(--muted)]">
                    Payment & Delivery Badges (comma-separated labels)
                  </span>
                  <input
                    value={(draft.paymentBadges || []).join(', ')}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        paymentBadges: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }))
                    }
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 text-[var(--bone)] font-mono-tabular"
                  />
                </label>
              </div>

              <div className="space-y-3 pt-2 border-t border-[var(--line)]">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-[var(--bone)]">Footer Link Columns</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        footerColumns: [
                          ...d.footerColumns,
                          {
                            id: `col-${Date.now()}`,
                            title: { en: 'Support', ar: 'الدعم' },
                            links: [{ label: { en: 'Track Order', ar: 'تتبع الطلب' }, url: '/orders' }],
                          },
                        ],
                      }))
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--ember)] text-[var(--ember)] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Column
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {draft.footerColumns.map((col, cIdx) => (
                    <div key={col.id} className="border border-[var(--line)] bg-[var(--graphite)] p-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={col.title.en}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              footerColumns: d.footerColumns.map((c, i) =>
                                i === cIdx ? { ...c, title: { ...c.title, en: e.target.value } } : c
                              ),
                            }))
                          }
                          placeholder="Column Title (EN)"
                          className="flex-1 bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                        />
                        <input
                          dir="rtl"
                          value={col.title.ar}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              footerColumns: d.footerColumns.map((c, i) =>
                                i === cIdx ? { ...c, title: { ...c.title, ar: e.target.value } } : c
                              ),
                            }))
                          }
                          placeholder="العنوان (AR)"
                          className="flex-1 bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              footerColumns: d.footerColumns.filter((_, i) => i !== cIdx),
                            }))
                          }
                          className="p-1 text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {col.links.map((l, lIdx) => (
                        <div key={lIdx} className="grid grid-cols-12 gap-1.5 items-center">
                          <input
                            value={l.label.en}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                footerColumns: d.footerColumns.map((c, i) =>
                                  i === cIdx
                                    ? {
                                        ...c,
                                        links: c.links.map((x, xi) =>
                                          xi === lIdx ? { ...x, label: { ...x.label, en: e.target.value } } : x
                                        ),
                                      }
                                    : c
                                ),
                              }))
                            }
                            placeholder="EN"
                            className="col-span-4 bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                          />
                          <input
                            dir="rtl"
                            value={l.label.ar}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                footerColumns: d.footerColumns.map((c, i) =>
                                  i === cIdx
                                    ? {
                                        ...c,
                                        links: c.links.map((x, xi) =>
                                          xi === lIdx ? { ...x, label: { ...x.label, ar: e.target.value } } : x
                                        ),
                                      }
                                    : c
                                ),
                              }))
                            }
                            placeholder="AR"
                            className="col-span-3 bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                          />
                          <input
                            value={l.url}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                footerColumns: d.footerColumns.map((c, i) =>
                                  i === cIdx
                                    ? {
                                        ...c,
                                        links: c.links.map((x, xi) => (xi === lIdx ? { ...x, url: e.target.value } : x)),
                                      }
                                    : c
                                ),
                              }))
                            }
                            placeholder="/url"
                            className="col-span-4 bg-[var(--ink)] border border-[var(--line)] px-2 py-1 font-mono-tabular text-[var(--bone)]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                footerColumns: d.footerColumns.map((c, i) =>
                                  i === cIdx ? { ...c, links: c.links.filter((_, xi) => xi !== lIdx) } : c
                                ),
                              }))
                            }
                            className="col-span-1 text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            footerColumns: d.footerColumns.map((c, i) =>
                              i === cIdx
                                ? { ...c, links: [...c.links, { label: { en: 'Link', ar: 'رابط' }, url: '/catalog' }] }
                                : c
                            ),
                          }))
                        }
                        className="text-[11px] font-mono-tabular text-[var(--ember)] cursor-pointer"
                      >
                        + Add Link
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'seo' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[var(--cyan)] font-mono-tabular uppercase">
                <Globe className="w-4 h-4" />
                <span>Home Page Search & Social Share Metadata</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[var(--muted)]">Browser & SEO Title (EN)</span>
                  <input
                    value={draft.homeSeo.title.en}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        homeSeo: { ...d.homeSeo, title: { ...d.homeSeo.title, en: e.target.value } },
                      }))
                    }
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[var(--muted)]">Browser & SEO Title (AR)</span>
                  <input
                    dir="rtl"
                    value={draft.homeSeo.title.ar}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        homeSeo: { ...d.homeSeo, title: { ...d.homeSeo.title, ar: e.target.value } },
                      }))
                    }
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[var(--muted)]">Meta Description (EN)</span>
                  <textarea
                    rows={3}
                    value={draft.homeSeo.description.en}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        homeSeo: { ...d.homeSeo, description: { ...d.homeSeo.description, en: e.target.value } },
                      }))
                    }
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] p-3 text-[var(--bone)]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[var(--muted)]">Meta Description (AR)</span>
                  <textarea
                    rows={3}
                    dir="rtl"
                    value={draft.homeSeo.description.ar}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        homeSeo: { ...d.homeSeo, description: { ...d.homeSeo.description, ar: e.target.value } },
                      }))
                    }
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] p-3 text-[var(--bone)]"
                  />
                </label>
              </div>

              <div className="border border-[var(--line)] bg-[var(--graphite)] p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {draft.homeSeo.ogImageUrl && (
                    <img
                      src={draft.homeSeo.ogImageUrl}
                      alt="OG share preview"
                      className="w-24 h-16 object-cover border border-[var(--line)]"
                    />
                  )}
                  <div>
                    <p className="font-semibold text-[var(--bone)]">OpenGraph / WhatsApp Share Image</p>
                    <p className="font-mono-tabular text-[11px] text-[var(--muted)] break-all">
                      {draft.homeSeo.ogImageUrl || 'Not set'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onPickImage((picked) =>
                      setDraft((d) => ({ ...d, homeSeo: { ...d.homeSeo, ogImageUrl: picked.url } }))
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-[var(--ember)] text-[var(--ember)] font-bold uppercase cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5" /> Choose Image
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--line)] bg-[var(--graphite)] flex flex-wrap items-center justify-end gap-3 text-xs">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft, false);
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className="px-4 py-2 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] font-semibold cursor-pointer"
          >
            Save Draft Only
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft, true);
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className="px-5 py-2 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save & Publish Chrome Live'}
          </button>
        </div>
      </div>
    </div>
  );
}
