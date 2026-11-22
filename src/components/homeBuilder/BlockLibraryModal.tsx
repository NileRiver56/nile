import React, { useState } from 'react';
import { Bookmark, Layers, Plus, Trash2, X } from 'lucide-react';
import type { HomeSectionTemplate, HomeSectionType, LocalizedText } from '../../shared/types.ts';
import { HOME_SECTION_PRESETS, type HomeSectionPresetCategory } from '../../shared/homeSections.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';

const CATEGORY_TABS: Array<{ id: 'all' | HomeSectionPresetCategory | 'templates'; label: LocalizedText }> = [
  { id: 'all', label: { en: 'All Blocks (18)', ar: 'كل الكتل (18)' } },
  { id: 'hero_promo', label: { en: 'Hero & Promo', ar: 'الواجهة والإعلانات' } },
  { id: 'merchandising', label: { en: 'Merchandising', ar: 'عرض المنتجات' } },
  { id: 'discovery_trust', label: { en: 'Discovery & Trust', ar: 'المتاجر والثقة' } },
  { id: 'editorial_media', label: { en: 'Editorial & Media', ar: 'التحرير والوسائط' } },
  { id: 'templates', label: { en: 'Saved Templates', ar: 'القوالب المحفوظة' } },
];

export function BlockLibraryModal({
  open,
  onClose,
  templates,
  onAddBlock,
  onDeleteTemplate,
}: {
  open: boolean;
  onClose: () => void;
  templates: HomeSectionTemplate[];
  onAddBlock: (payload: {
    sectionType: HomeSectionType;
    title: LocalizedText;
    content: Record<string, unknown>;
  }) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
}) {
  const { locale } = useMarketplace();
  const [tab, setTab] = useState<'all' | HomeSectionPresetCategory | 'templates'>('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (!open) return null;

  const filteredPresets =
    tab === 'all' ? HOME_SECTION_PRESETS : HOME_SECTION_PRESETS.filter((p) => p.category === tab);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[88vh] flex flex-col border border-[var(--line)] bg-[var(--ink)]">
        <div className="px-5 py-3.5 border-b border-[var(--line)] bg-[var(--graphite)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-[var(--ember)]" />
            <h2 className="font-display text-lg font-bold text-[var(--bone)]">
              Add Home Block or Reusable Template
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close block library"
            className="p-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[var(--line)] flex flex-wrap gap-2 text-xs">
          {CATEGORY_TABS.map((tItem) => (
            <button
              key={tItem.id}
              type="button"
              onClick={() => setTab(tItem.id)}
              className={`px-3 py-1.5 border font-medium cursor-pointer ${
                tab === tItem.id
                  ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)] font-semibold'
                  : 'border-[var(--line)] text-[var(--bone)] hover:border-[var(--muted)]'
              }`}
            >
              {tItem.label[locale]}
              {tItem.id === 'templates' ? ` (${templates.length})` : ''}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'templates' ? (
            <div className="hairline-grid grid-cols-1 md:grid-cols-2">
              {templates.map((tmpl) => (
                <div key={tmpl.id} className="hairline-cell p-5 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular uppercase">
                      <span className="text-[var(--cyan)] inline-flex items-center gap-1">
                        <Bookmark className="w-3 h-3" /> {tmpl.sectionType}
                      </span>
                      <span className="text-[var(--muted)]">{tmpl.isSystem ? 'System Starter' : 'Saved Template'}</span>
                    </div>
                    <h3 className="mt-2 font-display text-xl font-bold text-[var(--bone)]">{tmpl.name[locale]}</h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">{tmpl.description[locale]}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--line)]">
                    <button
                      type="button"
                      disabled={busyKey === tmpl.id}
                      onClick={async () => {
                        setBusyKey(tmpl.id);
                        try {
                          await onAddBlock({
                            sectionType: tmpl.sectionType,
                            title: tmpl.name,
                            content: tmpl.content,
                          });
                          onClose();
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                      className="px-4 py-2 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{busyKey === tmpl.id ? 'Adding...' : 'Insert Template'}</span>
                    </button>
                    {!tmpl.isSystem && (
                      <button
                        type="button"
                        onClick={() => void onDeleteTemplate(tmpl.id)}
                        className="p-2 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                        aria-label="Delete custom template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="hairline-grid grid-cols-1 md:grid-cols-3">
              {filteredPresets.map((preset) => (
                <div key={preset.type} className="hairline-cell p-5 flex flex-col justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-mono-tabular uppercase text-[var(--cyan)]">{preset.type}</p>
                    <h3 className="mt-1.5 font-display text-lg font-bold text-[var(--bone)]">
                      {preset.label[locale]}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">{preset.description[locale]}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busyKey === preset.type}
                    onClick={async () => {
                      setBusyKey(preset.type);
                      try {
                        await onAddBlock({
                          sectionType: preset.type,
                          title: preset.defaultTitle,
                          content: preset.defaultContent,
                        });
                        onClose();
                      } finally {
                        setBusyKey(null);
                      }
                    }}
                    className="w-full py-2 border border-[var(--line)] bg-[var(--ink)] text-[var(--bone)] hover:border-[var(--ember)] hover:bg-[var(--ember)] hover:text-[var(--ember-fg)] text-xs font-bold uppercase inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{busyKey === preset.type ? 'Adding...' : 'Add Block'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
