import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, History, RotateCcw, Trash2, Upload } from 'lucide-react';
import type {
  HomeSection,
  HomeSectionAudience,
  HomeSectionStatus,
  HomeSectionType,
  HomeSectionVersion,
} from '../shared/types.ts';
import { HOME_SECTION_PRESETS, getPresetForSectionType } from '../shared/homeSections.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, StatusLabel } from './HairlineUI.tsx';

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

export function AdminHomeBuilderTab({
  sections,
  versionsBySectionId,
  onReload,
}: {
  sections: HomeSection[];
  versionsBySectionId: Record<string, HomeSectionVersion[]>;
  onReload: () => Promise<void>;
}) {
  const { apiFetch, showToast, refreshBootstrap, setPreviewDrafts, navigate } = useMarketplace();

  const initialPreset = HOME_SECTION_PRESETS[0];
  const [newType, setNewType] = useState<HomeSectionType>(initialPreset.type);
  const [newTitleEn, setNewTitleEn] = useState(initialPreset.defaultTitle.en);
  const [newTitleAr, setNewTitleAr] = useState(initialPreset.defaultTitle.ar);
  const [newStatus, setNewStatus] = useState<HomeSectionStatus>('draft');
  const [newAudience, setNewAudience] = useState<HomeSectionAudience>('all');
  const [newStartsAt, setNewStartsAt] = useState('');
  const [newEndsAt, setNewEndsAt] = useState('');
  const [newContentJson, setNewContentJson] = useState(() => JSON.stringify(initialPreset.defaultContent, null, 2));
  const [uploadingEditorial, setUploadingEditorial] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitleEn, setEditTitleEn] = useState('');
  const [editTitleAr, setEditTitleAr] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editContentJson, setEditContentJson] = useState('');
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);

  const handleSelectType = (nextType: HomeSectionType) => {
    setNewType(nextType);
    const preset = getPresetForSectionType(nextType);
    setNewTitleEn(preset.defaultTitle.en);
    setNewTitleAr(preset.defaultTitle.ar);
    setNewContentJson(JSON.stringify(preset.defaultContent, null, 2));
  };

  const handleUploadEditorial = async (file: File, target: 'new' | 'edit') => {
    setUploadingEditorial(true);
    try {
      const base64Data = await readFileAsDataUrl(file);
      const res = await apiFetch<{ media: { publicUrl: string } }>('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({
          base64Data,
          mimeType: file.type,
          entityType: 'editorial_image',
        }),
      });
      const setter = target === 'new' ? setNewContentJson : setEditContentJson;
      const current = target === 'new' ? newContentJson : editContentJson;
      try {
        const parsed = JSON.parse(current) as Record<string, unknown>;
        parsed.imageUrl = res.media.publicUrl;
        setter(JSON.stringify(parsed, null, 2));
      } catch {
        // leave JSON intact if invalid
      }
      showToast(`Uploaded ${res.media.publicUrl} and set imageUrl`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploadingEditorial(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsedContent: Record<string, unknown> = {};
    try {
      parsedContent = JSON.parse(newContentJson || '{}');
    } catch {
      showToast('Content JSON is invalid syntax.', 'error');
      return;
    }

    try {
      await apiFetch('/api/admin/home-sections', {
        method: 'POST',
        body: JSON.stringify({
          sectionType: newType,
          title: { en: newTitleEn.trim(), ar: newTitleAr.trim() || newTitleEn.trim() },
          content: parsedContent,
          status: newStatus,
          audience: newAudience,
          startsAt: newStartsAt ? new Date(newStartsAt).toISOString() : null,
          endsAt: newEndsAt ? new Date(newEndsAt).toISOString() : null,
        }),
      });
      showToast('Home section created (v1 snapshot saved)', 'success');
      await onReload();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const ids = sections.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    try {
      await apiFetch('/api/admin/home-sections/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds: ids }),
      });
      showToast('Home section order updated', 'success');
      await onReload();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const startEdit = (sec: HomeSection) => {
    setEditingId(sec.id);
    setEditTitleEn(sec.title.en);
    setEditTitleAr(sec.title.ar);
    setEditStartsAt(toDatetimeLocalValue(sec.startsAt));
    setEditEndsAt(toDatetimeLocalValue(sec.endsAt));
    setEditContentJson(JSON.stringify(sec.content || {}, null, 2));
  };

  const handleSaveEdit = async (sectionId: string) => {
    let parsedContent: Record<string, unknown> = {};
    try {
      parsedContent = JSON.parse(editContentJson || '{}');
    } catch {
      showToast('Edited Content JSON is invalid syntax.', 'error');
      return;
    }

    try {
      await apiFetch(`/api/admin/home-sections/${sectionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: { en: editTitleEn.trim(), ar: editTitleAr.trim() || editTitleEn.trim() },
          content: parsedContent,
          startsAt: editStartsAt ? new Date(editStartsAt).toISOString() : null,
          endsAt: editEndsAt ? new Date(editEndsAt).toISOString() : null,
        }),
      });
      setEditingId(null);
      showToast('Section updated & new version snapshot stored', 'success');
      await onReload();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-[var(--bone)]">
            DB-Driven Home Page Builder (15 Section Types)
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Every section on the home page loads dynamically from MySQL with scheduling, audience targeting, version snapshots, and 1-click rollback.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPreviewDrafts(true);
            navigate('/?previewDrafts=1');
          }}
          className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--gold)] text-xs font-mono-tabular uppercase text-[var(--gold)] hover:bg-[var(--ink)] cursor-pointer"
        >
          <Eye className="w-4 h-4" />
          <span>Preview Drafts on Home</span>
        </button>
      </div>

      <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
        <form onSubmit={handleCreate} className="hairline-cell lg:col-span-5 p-6 space-y-3 text-xs">
          <h3 className="font-display text-lg font-bold text-[var(--bone)]">Add Home Section</h3>

          <label className="block space-y-1">
            <span className="font-mono-tabular uppercase text-[var(--muted)]">Section Type</span>
            <select
              value={newType}
              onChange={(e) => handleSelectType(e.target.value as HomeSectionType)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
            >
              {HOME_SECTION_PRESETS.map((p) => (
                <option key={p.type} value={p.type}>
                  {p.label.en}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[var(--muted)]">{getPresetForSectionType(newType).description.en}</p>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              required
              value={newTitleEn}
              onChange={(e) => setNewTitleEn(e.target.value)}
              placeholder="Title (EN)"
              className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
            />
            <input
              required
              dir="rtl"
              value={newTitleAr}
              onChange={(e) => setNewTitleAr(e.target.value)}
              placeholder="العنوان (AR)"
              className="bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="font-mono-tabular text-[var(--muted)]">Status</span>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as HomeSectionStatus)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="font-mono-tabular text-[var(--muted)]">Audience</span>
              <select
                value={newAudience}
                onChange={(e) => setNewAudience(e.target.value as HomeSectionAudience)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-[var(--bone)]"
              >
                <option value="all">all</option>
                <option value="guest">guest</option>
                <option value="logged_in">logged_in</option>
                <option value="arabic">arabic (RTL)</option>
                <option value="english">english (LTR)</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="font-mono-tabular text-[var(--muted)]">Starts At (Optional)</span>
              <input
                type="datetime-local"
                value={newStartsAt}
                onChange={(e) => setNewStartsAt(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-mono-tabular text-[var(--muted)]">Ends At (Optional)</span>
              <input
                type="datetime-local"
                value={newEndsAt}
                onChange={(e) => setNewEndsAt(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 font-mono-tabular text-[var(--bone)]"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Content JSON</span>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-[var(--line)] text-[11px] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>{uploadingEditorial ? 'Uploading...' : 'Upload Image -> imageUrl'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadEditorial(f, 'new');
                  }}
                />
              </label>
            </div>
            <textarea
              rows={8}
              value={newContentJson}
              onChange={(e) => setNewContentJson(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--line)] p-3 font-mono-tabular text-[11px] text-[var(--bone)]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase tracking-wider cursor-pointer"
          >
            Create Section
          </button>
        </form>

        <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
          <h3 className="font-display text-lg font-bold text-[var(--bone)]">
            Active & Draft Home Stack ({sections.length})
          </h3>

          {sections.length === 0 ? (
            <EmptyState
              title="No home sections defined"
              description="Add a section from the 15 types on the left to build your home page."
            />
          ) : (
            <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
              {sections.map((sec, idx) => {
                const versions = versionsBySectionId[sec.id] || [];
                const isEditing = editingId === sec.id;
                const isHistoryOpen = historyOpenId === sec.id;

                return (
                  <div key={sec.id} className="p-4 space-y-3 bg-[var(--ink)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono-tabular text-[var(--muted)]">#{idx + 1}</span>
                          <span className="font-mono-tabular text-[var(--cyan)]">{sec.sectionType}</span>
                          <StatusLabel
                            status={sec.status}
                            tone={sec.status === 'published' ? 'cedar' : sec.status === 'draft' ? 'gold' : 'muted'}
                          />
                          <span className="font-mono-tabular text-[var(--muted)]">v{sec.version}</span>
                        </div>
                        <p className="mt-1 font-semibold text-sm text-[var(--bone)]">
                          {sec.title.en} · <span className="text-[var(--muted)]">{sec.title.ar}</span>
                        </p>
                        {(sec.startsAt || sec.endsAt) && (
                          <p className="mt-0.5 text-[11px] font-mono-tabular text-[var(--muted)]">
                            Schedule: {sec.startsAt || 'Now'} → {sec.endsAt || 'Indefinite'}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => void handleMove(idx, -1)}
                          aria-label="Move section up"
                          className="p-1.5 border border-[var(--line)] text-[var(--bone)] disabled:opacity-30 hover:border-[var(--ember)] cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === sections.length - 1}
                          onClick={() => void handleMove(idx, 1)}
                          aria-label="Move section down"
                          className="p-1.5 border border-[var(--line)] text-[var(--bone)] disabled:opacity-30 hover:border-[var(--ember)] cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <select
                          value={sec.status}
                          onChange={async (e) => {
                            await apiFetch(`/api/admin/home-sections/${sec.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: e.target.value }),
                            });
                            showToast(`Status set to ${e.target.value}`, 'success');
                            await onReload();
                            await refreshBootstrap();
                          }}
                          aria-label="Section status"
                          className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                        >
                          <option value="draft">draft</option>
                          <option value="published">published</option>
                          <option value="archived">archived</option>
                        </select>

                        <select
                          value={sec.audience}
                          onChange={async (e) => {
                            await apiFetch(`/api/admin/home-sections/${sec.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ audience: e.target.value }),
                            });
                            showToast(`Audience set to ${e.target.value}`, 'success');
                            await onReload();
                            await refreshBootstrap();
                          }}
                          aria-label="Section audience"
                          className="bg-[var(--graphite)] border border-[var(--line)] px-2 py-1 text-[var(--bone)]"
                        >
                          <option value="all">all</option>
                          <option value="guest">guest</option>
                          <option value="logged_in">logged_in</option>
                          <option value="arabic">arabic</option>
                          <option value="english">english</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => (isEditing ? setEditingId(null) : startEdit(sec))}
                          className="px-2.5 py-1 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                        >
                          {isEditing ? 'Close' : 'Edit'}
                        </button>

                        <button
                          type="button"
                          onClick={() => setHistoryOpenId(isHistoryOpen ? null : sec.id)}
                          className="px-2.5 py-1 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <History className="w-3 h-3" />
                          <span>{versions.length}</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/home-sections/${sec.id}`, { method: 'DELETE' });
                            showToast('Section deleted', 'info');
                            await onReload();
                            await refreshBootstrap();
                          }}
                          aria-label="Delete section"
                          className="p-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="pt-3 border-t border-[var(--line)] space-y-2.5 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            value={editTitleEn}
                            onChange={(e) => setEditTitleEn(e.target.value)}
                            placeholder="Title (EN)"
                            className="bg-[var(--graphite)] border border-[var(--line)] px-3 py-1.5 text-[var(--bone)]"
                          />
                          <input
                            dir="rtl"
                            value={editTitleAr}
                            onChange={(e) => setEditTitleAr(e.target.value)}
                            placeholder="Title (AR)"
                            className="bg-[var(--graphite)] border border-[var(--line)] px-3 py-1.5 text-[var(--bone)]"
                          />
                          <input
                            type="datetime-local"
                            value={editStartsAt}
                            onChange={(e) => setEditStartsAt(e.target.value)}
                            className="bg-[var(--graphite)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
                          />
                          <input
                            type="datetime-local"
                            value={editEndsAt}
                            onChange={(e) => setEditEndsAt(e.target.value)}
                            className="bg-[var(--graphite)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
                          />
                        </div>
                        <div className="flex justify-end">
                          <label className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-[var(--line)] text-[11px] text-[var(--bone)] cursor-pointer">
                            <Upload className="w-3 h-3" />
                            <span>{uploadingEditorial ? 'Uploading...' : 'Upload Image -> imageUrl'}</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handleUploadEditorial(f, 'edit');
                              }}
                            />
                          </label>
                        </div>
                        <textarea
                          rows={7}
                          value={editContentJson}
                          onChange={(e) => setEditContentJson(e.target.value)}
                          className="w-full bg-[var(--graphite)] border border-[var(--line)] p-3 font-mono-tabular text-[11px] text-[var(--bone)]"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(sec.id)}
                          className="px-4 py-2 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
                        >
                          Save Changes (Create v{sec.version + 1})
                        </button>
                      </div>
                    )}

                    {isHistoryOpen && (
                      <div className="pt-3 border-t border-[var(--line)] space-y-2 text-xs font-mono-tabular">
                        <p className="text-[var(--muted)] uppercase">Version History & 1-Click Rollback</p>
                        {versions.length === 0 ? (
                          <p className="text-[var(--muted)]">No snapshots recorded yet.</p>
                        ) : (
                          <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
                            {versions.map((ver) => (
                              <div key={ver.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <span className="text-[var(--bone)] font-semibold">v{ver.version}</span>
                                  <span className="ms-2 text-[var(--muted)]">
                                    {ver.snapshot.title.en} · {ver.snapshot.status} · {ver.createdAt}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiFetch(`/api/admin/home-sections/${sec.id}/rollback`, {
                                      method: 'POST',
                                      body: JSON.stringify({ versionId: ver.id }),
                                    });
                                    showToast(`Rolled back to v${ver.version}`, 'success');
                                    await onReload();
                                    await refreshBootstrap();
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--cedar)] text-[var(--cedar)] hover:bg-[var(--graphite)] cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Rollback</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
