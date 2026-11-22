import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  GripVertical,
  History,
  Layout,
  Maximize2,
  Minimize2,
  Monitor,
  Moon,
  Plus,
  Redo2,
  Rocket,
  Save,
  Smartphone,
  Sun,
  Tablet,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type {
  HomeMigrationReport,
  HomePageSnapshot,
  HomeSection,
  HomeSectionTemplate,
  HomeSectionType,
  HomeSectionVersion,
  Locale,
  LocalizedText,
  MediaAsset,
  SiteChromeSettings,
  ThemeMode,
} from '../shared/types.ts';
import {
  DEFAULT_SITE_CHROME,
  getPresetForSectionType,
  normalizeTargeting,
} from '../shared/homeSections.ts';
import { parseUtcTimestampMs } from '../shared/offers.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { Header } from './Header.tsx';
import { Footer } from './Footer.tsx';
import { HomeSectionRenderer } from './HomeSectionRenderer.tsx';
import { EmptyState } from './HairlineUI.tsx';
import { BlockFormInspector } from './homeBuilder/BlockFormInspector.tsx';
import { BlockLibraryModal } from './homeBuilder/BlockLibraryModal.tsx';
import { MediaLibraryModal } from './homeBuilder/MediaLibraryModal.tsx';
import { ChromeAndSeoModal } from './homeBuilder/ChromeAndSeoModal.tsx';
import { PageHistoryModal } from './homeBuilder/PageHistoryModal.tsx';

interface HomeBuilderStatePayload {
  sections: HomeSection[];
  versionsBySectionId: Record<string, HomeSectionVersion[]>;
  chromeDraft: SiteChromeSettings;
  chromePublished: SiteChromeSettings;
  templates: HomeSectionTemplate[];
  pageSnapshots: HomePageSnapshot[];
  mediaLibrary: MediaAsset[];
  migrationReport: HomeMigrationReport;
}

type SimDevice = 'desktop' | 'tablet' | 'mobile';
type SimAudience = 'all' | 'guest' | 'logged_in' | 'new_visitor';

function cloneSections(list: HomeSection[]): HomeSection[] {
  return JSON.parse(JSON.stringify(list)) as HomeSection[];
}

export function AdminHomeBuilderTab({
  sections: _initialSections,
  versionsBySectionId: _initialVersions,
  onReload,
}: {
  sections?: HomeSection[];
  versionsBySectionId?: Record<string, HomeSectionVersion[]>;
  onReload?: () => Promise<void>;
}) {
  const { apiFetch, showToast, refreshBootstrap, setPreviewDrafts, navigate } = useMarketplace();

  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<HomeSection[]>(_initialSections || []);
  const [versionsBySectionId, setVersionsBySectionId] = useState<Record<string, HomeSectionVersion[]>>(
    _initialVersions || {}
  );
  const [chromeDraft, setChromeDraft] = useState<SiteChromeSettings>(DEFAULT_SITE_CHROME);
  const [templates, setTemplates] = useState<HomeSectionTemplate[]>([]);
  const [pageSnapshots, setPageSnapshots] = useState<HomePageSnapshot[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<MediaAsset[]>([]);
  const [migrationReport, setMigrationReport] = useState<HomeMigrationReport | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Simulation controls
  const [simDevice, setSimDevice] = useState<SimDevice>('desktop');
  const [simLang, setSimLang] = useState<Locale>('en');
  const [simTheme, setSimTheme] = useState<ThemeMode>('dark');
  const [simAudience, setSimAudience] = useState<SimAudience>('all');
  const [simAsOf, setSimAsOf] = useState<string>('');
  const [showAllInPreview, setShowAllInPreview] = useState(true);

  // Undo / Redo & Autosave
  const [historyPast, setHistoryPast] = useState<HomeSection[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<HomeSection[][]>([]);
  const [dirtyIds, setDirtyIds] = useState<Record<string, boolean>>({});
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autosaveTimerRef = useRef<number | null>(null);
  const lastHistoryPushRef = useRef<number>(0);
  const sectionsRef = useRef<HomeSection[]>(sections);
  sectionsRef.current = sections;

  // Drag-and-drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modals & Popovers
  const [blockLibraryOpen, setBlockLibraryOpen] = useState(false);
  const [chromeModalOpen, setChromeModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [mediaPickerCallback, setMediaPickerCallback] = useState<
    ((picked: { url: string; focalX: number; focalY: number }) => void) | null
  >(null);

  // Schedule / Publish popover
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [publishNote, setPublishNote] = useState('');
  const [schedulePublishAt, setSchedulePublishAt] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Save as template dialog
  const [templateSourceSection, setTemplateSourceSection] = useState<HomeSection | null>(null);
  const [templateNameEn, setTemplateNameEn] = useState('');
  const [templateNameAr, setTemplateNameAr] = useState('');
  const [templateDescEn, setTemplateDescEn] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const loadBuilderState = useCallback(
    async (preserveSelection = true) => {
      try {
        const data = await apiFetch<HomeBuilderStatePayload>('/api/admin/home-builder/state');
        setSections(data.sections);
        setVersionsBySectionId(data.versionsBySectionId || {});
        setChromeDraft(data.chromeDraft || DEFAULT_SITE_CHROME);
        setTemplates(data.templates || []);
        setPageSnapshots(data.pageSnapshots || []);
        setMediaLibrary(data.mediaLibrary || []);
        setMigrationReport(data.migrationReport || null);
        setDirtyIds({});
        if (!preserveSelection || !selectedId || !data.sections.some((s) => s.id === selectedId)) {
          setSelectedId(data.sections[0]?.id || null);
        }
      } catch (err) {
        showToast((err as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, showToast, selectedId]
  );

  useEffect(() => {
    void loadBuilderState(false);
  }, []); // initial mount load

  const refreshMedia = useCallback(async () => {
    try {
      const res = await apiFetch<{ media: MediaAsset[] }>('/api/admin/media');
      setMediaLibrary(res.media || []);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [apiFetch, showToast]);

  const persistSectionDraft = useCallback(
    async (sec: HomeSection, changeNote?: string) => {
      setSavingStatus('saving');
      try {
        const res = await apiFetch<{ section: HomeSection }>(`/api/admin/home-sections/${sec.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            sectionType: sec.sectionType,
            title: sec.title,
            content: sec.content,
            status: sec.status,
            visible: sec.visible,
            audience: sec.audience,
            targeting: sec.targeting,
            style: sec.style,
            schedulePriority: sec.schedulePriority ?? 0,
            startsAt: sec.startsAt || null,
            endsAt: sec.endsAt || null,
            changeNote,
          }),
        });
        setSections((prev) => prev.map((item) => (item.id === sec.id ? res.section : item)));
        setDirtyIds((prev) => {
          const next = { ...prev };
          delete next[sec.id];
          return next;
        });
        setSavingStatus('saved');
      } catch (err) {
        setSavingStatus('error');
        showToast((err as Error).message, 'error');
      }
    },
    [apiFetch, showToast]
  );

  const flushDirtySections = useCallback(async () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const dirtyEntries = Object.keys(dirtyIds).filter((id) => dirtyIds[id]);
    if (dirtyEntries.length === 0) return;
    for (const id of dirtyEntries) {
      const target = sectionsRef.current.find((s) => s.id === id);
      if (target) {
        await persistSectionDraft(target);
      }
    }
    if (onReload) await onReload();
  }, [dirtyIds, persistSectionDraft, onReload]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  const handleLocalSectionChange = (updated: HomeSection) => {
    const now = Date.now();
    if (now - lastHistoryPushRef.current > 800) {
      setHistoryPast((prev) => [...prev.slice(-24), cloneSections(sectionsRef.current)]);
      setHistoryFuture([]);
      lastHistoryPushRef.current = now;
    }

    setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setDirtyIds((prev) => ({ ...prev, [updated.id]: true }));
    setSavingStatus('idle');

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      const latest = sectionsRef.current.find((s) => s.id === updated.id);
      if (latest) void persistSectionDraft(latest);
    }, 950);
  };

  const handleUndo = async () => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    const currentSnapshot = cloneSections(sections);
    setHistoryPast((prev) => prev.slice(0, -1));
    setHistoryFuture((prev) => [currentSnapshot, ...prev.slice(0, 24)]);
    setSections(previous);

    const active = previous.find((s) => s.id === selectedId);
    if (active) await persistSectionDraft(active, 'Undo change');
  };

  const handleRedo = async () => {
    if (historyFuture.length === 0) return;
    const nextState = historyFuture[0];
    const currentSnapshot = cloneSections(sections);
    setHistoryFuture((prev) => prev.slice(1));
    setHistoryPast((prev) => [...prev.slice(-24), currentSnapshot]);
    setSections(nextState);

    const active = nextState.find((s) => s.id === selectedId);
    if (active) await persistSectionDraft(active, 'Redo change');
  };

  const handleReorderIds = async (orderedIds: string[]) => {
    setHistoryPast((prev) => [...prev.slice(-24), cloneSections(sections)]);
    setHistoryFuture([]);

    const byId = new Map(sections.map((s) => [s.id, s]));
    const reordered = orderedIds
      .map((id, idx) => {
        const sec = byId.get(id);
        return sec ? { ...sec, sortOrder: idx + 1 } : null;
      })
      .filter((item): item is HomeSection => Boolean(item));
    setSections(reordered);

    try {
      const res = await apiFetch<{ sections: HomeSection[] }>('/api/admin/home-sections/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds }),
      });
      setSections(res.sections);
      showToast('Section order saved', 'success');
      if (onReload) await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
      await loadBuilderState(true);
    }
  };

  const handleMoveByOffset = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    const ids = sections.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIdx, 0, moved);
    await handleReorderIds(ids);
  };

  const handleDropOnCard = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const ids = sections.map((s) => s.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    setDraggedId(null);
    setDragOverId(null);
    await handleReorderIds(ids);
  };

  const handleToggleVisible = async (sec: HomeSection) => {
    const nextSec = { ...sec, visible: !sec.visible };
    setHistoryPast((prev) => [...prev.slice(-24), cloneSections(sections)]);
    setSections((prev) => prev.map((s) => (s.id === sec.id ? nextSec : s)));
    await persistSectionDraft(nextSec, nextSec.visible ? 'Shown on home page' : 'Hidden from home page');
  };

  const handleDuplicateSection = async (sec: HomeSection) => {
    try {
      const res = await apiFetch<{ section: HomeSection }>(`/api/admin/home-sections/${sec.id}/duplicate`, {
        method: 'POST',
      });
      showToast('Block duplicated as draft', 'success');
      await loadBuilderState(false);
      setSelectedId(res.section.id);
      if (onReload) await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDeleteSection = async (id: string) => {
    try {
      await apiFetch(`/api/admin/home-sections/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      showToast('Block deleted', 'info');
      await loadBuilderState(true);
      await refreshBootstrap();
      if (onReload) await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleAddBlock = async (payload: {
    sectionType: HomeSectionType;
    title: LocalizedText;
    content: Record<string, unknown>;
  }) => {
    try {
      const selectedIdx = selectedId ? sections.findIndex((s) => s.id === selectedId) : -1;
      const insertAtIndex = selectedIdx >= 0 ? selectedIdx + 1 : sections.length;
      const res = await apiFetch<{ section: HomeSection }>('/api/admin/home-sections', {
        method: 'POST',
        body: JSON.stringify({
          sectionType: payload.sectionType,
          title: payload.title,
          content: payload.content,
          status: 'draft',
          visible: true,
          audience: 'all',
          targeting: { visitor: 'all', device: 'all', locale: 'all', governorate: '' },
          style: { surface: 'graphite', padding: 'standard' },
          insertAtIndex,
        }),
      });
      setBlockLibraryOpen(false);
      showToast(`Added "${payload.title.en}" draft block`, 'success');
      await loadBuilderState(false);
      setSelectedId(res.section.id);
      if (onReload) await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handlePublishPage = async (scheduled = false) => {
    setPublishing(true);
    try {
      await flushDirtySections();
      if (scheduled && !schedulePublishAt) {
        showToast('Choose a date and time for scheduled publish.', 'error');
        setPublishing(false);
        return;
      }
      const res = await apiFetch<{ snapshot: HomePageSnapshot }>('/api/admin/home-builder/publish', {
        method: 'POST',
        body: JSON.stringify({
          changeNote: publishNote.trim() || undefined,
          scheduledPublishAt: scheduled && schedulePublishAt ? new Date(schedulePublishAt).toISOString() : null,
        }),
      });
      setPublishMenuOpen(false);
      setPublishNote('');
      setSchedulePublishAt('');
      showToast(
        res.snapshot.status === 'scheduled'
          ? `Scheduled page v${res.snapshot.version} for ${res.snapshot.scheduledPublishAt}`
          : `Published Home Page v${res.snapshot.version} live!`,
        'success'
      );
      await loadBuilderState(true);
      await refreshBootstrap();
      if (onReload) await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleSaveTemplateConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateSourceSection) return;
    setSavingTemplate(true);
    try {
      await apiFetch('/api/admin/home-builder/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: {
            en: templateNameEn.trim() || templateSourceSection.title.en,
            ar: templateNameAr.trim() || templateNameEn.trim() || templateSourceSection.title.ar,
          },
          description: { en: templateDescEn.trim(), ar: templateDescEn.trim() },
          sectionType: templateSourceSection.sectionType,
          content: templateSourceSection.content,
          style: templateSourceSection.style,
        }),
      });
      showToast('Saved reusable block template', 'success');
      setTemplateSourceSection(null);
      setTemplateNameEn('');
      setTemplateNameAr('');
      setTemplateDescEn('');
      await loadBuilderState(true);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleOpenImagePicker = (cb: (picked: { url: string; focalX: number; focalY: number }) => void) => {
    setMediaPickerCallback(() => cb);
    setMediaModalOpen(true);
  };

  const asOfMs = useMemo(() => {
    if (!simAsOf) return Date.now();
    const parsed = new Date(simAsOf).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  }, [simAsOf]);

  const previewSections = useMemo(() => {
    const devNorm: 'desktop' | 'mobile' = simDevice === 'mobile' ? 'mobile' : 'desktop';
    return sections.filter((sec) => {
      if (!showAllInPreview) {
        if (!sec.visible || sec.status !== 'published') return false;
      }
      if (sec.status === 'archived') return false;

      const targeting = normalizeTargeting(sec.targeting, sec.audience);
      if (targeting.locale && targeting.locale !== 'all' && targeting.locale !== simLang) return false;
      if (targeting.device && targeting.device !== 'all' && targeting.device !== devNorm) return false;
      if (simAudience !== 'all' && targeting.visitor && targeting.visitor !== 'all') {
        if (targeting.visitor === 'guest' && simAudience !== 'guest') return false;
        if (targeting.visitor === 'logged_in' && simAudience !== 'logged_in') return false;
        if (targeting.visitor === 'new_visitor' && simAudience !== 'new_visitor') return false;
        if (targeting.visitor === 'returning' && simAudience === 'new_visitor') return false;
      }

      if (!showAllInPreview) {
        const sMs = parseUtcTimestampMs(sec.startsAt);
        const eMs = parseUtcTimestampMs(sec.endsAt);
        if (sMs !== null && asOfMs < sMs) return false;
        if (eMs !== null && asOfMs > eMs) return false;
      }
      return true;
    });
  }, [sections, showAllInPreview, simDevice, simLang, simAudience, asOfMs]);

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedId) || null,
    [sections, selectedId]
  );

  const hasDirty = Object.values(dirtyIds).some(Boolean);
  const draftCount = sections.filter((s) => s.status === 'draft').length;

  const previewThemeClass =
    simTheme === 'dark'
      ? '[--ink:#17181B] [--graphite:#222428] [--line:#3A3D44] [--bone:#F3EFE8] [--muted:#A9ABB2] [--ember:#FF5A44] [--ember-fg:#17181B] [--cedar:#2FBF8F] [--gold:#E8B84A] [--sand:#D9C3A5] [--cyan:#4DD4E6] [--sage:#9BC995] bg-[var(--ink)] text-[var(--bone)]'
      : '[--ink:#F3EFE8] [--graphite:#FFFFFF] [--line:#D9D4CB] [--bone:#17181B] [--muted:#5B5E66] [--ember:#E8452F] [--ember-fg:#17181B] [--cedar:#1E9A72] [--gold:#B8860B] [--sand:#8A6F4B] [--cyan:#0E8FA3] [--sage:#4F7F4A] bg-[var(--ink)] text-[var(--bone)]';

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-40 bg-[var(--ink)] flex flex-col'
          : 'border border-[var(--line)] bg-[var(--ink)] flex flex-col min-h-[760px] h-[calc(100vh-140px)]'
      }
    >
      {/* Top Studio Bar */}
      <div className="px-3 py-2.5 border-b border-[var(--line)] bg-[var(--graphite)] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-display text-base font-bold text-[var(--bone)] me-2">Home Studio</span>

          <button
            type="button"
            disabled={historyPast.length === 0}
            onClick={() => void handleUndo()}
            title="Undo"
            aria-label="Undo"
            className="p-1.5 border border-[var(--line)] text-[var(--bone)] disabled:opacity-30 hover:border-[var(--ember)] cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={historyFuture.length === 0}
            onClick={() => void handleRedo()}
            title="Redo"
            aria-label="Redo"
            className="p-1.5 border border-[var(--line)] text-[var(--bone)] disabled:opacity-30 hover:border-[var(--ember)] cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="h-5 w-px bg-[var(--line)] mx-1" />

          {/* Device */}
          <div className="inline-flex border border-[var(--line)]">
            {[
              { id: 'desktop' as const, icon: Monitor, label: 'Desktop preview' },
              { id: 'tablet' as const, icon: Tablet, label: 'Tablet preview' },
              { id: 'mobile' as const, icon: Smartphone, label: 'Mobile preview' },
            ].map((d) => {
              const Icon = d.icon;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSimDevice(d.id)}
                  title={d.label}
                  aria-label={d.label}
                  className={`p-1.5 cursor-pointer ${
                    simDevice === d.id ? 'bg-[var(--ember)] text-[var(--ember-fg)]' : 'text-[var(--bone)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>

          {/* Language */}
          <div className="inline-flex border border-[var(--line)] font-mono-tabular">
            {(['en', 'ar'] as const).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setSimLang(lng)}
                className={`px-2 py-1 uppercase cursor-pointer ${
                  simLang === lng ? 'bg-[var(--ember)] text-[var(--ember-fg)] font-bold' : 'text-[var(--bone)]'
                }`}
              >
                {lng}
              </button>
            ))}
          </div>

          {/* Theme */}
          <button
            type="button"
            onClick={() => setSimTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            title={`Simulated theme: ${simTheme}`}
            className="inline-flex items-center gap-1 px-2 py-1 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            {simTheme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            <span className="font-mono-tabular uppercase">{simTheme}</span>
          </button>

          {/* Audience */}
          <select
            value={simAudience}
            onChange={(e) => setSimAudience(e.target.value as SimAudience)}
            aria-label="Simulate audience"
            className="bg-[var(--ink)] border border-[var(--line)] px-2 py-1 text-[var(--bone)] font-mono-tabular"
          >
            <option value="all">Visitor: All</option>
            <option value="guest">Visitor: Guest</option>
            <option value="logged_in">Visitor: Logged In</option>
            <option value="new_visitor">Visitor: New</option>
          </select>

          {/* As Of Simulator */}
          <div className="inline-flex items-center border border-[var(--line)] bg-[var(--ink)]">
            <input
              type="datetime-local"
              value={simAsOf}
              onChange={(e) => setSimAsOf(e.target.value)}
              aria-label="Preview As Of Date/Time"
              className="bg-transparent px-2 py-0.5 text-[11px] font-mono-tabular text-[var(--bone)]"
            />
            {simAsOf && (
              <button
                type="button"
                onClick={() => setSimAsOf('')}
                title="Reset As Of to Now"
                className="px-1.5 text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAllInPreview((v) => !v)}
            className={`px-2 py-1 border font-mono-tabular text-[11px] cursor-pointer ${
              showAllInPreview
                ? 'border-[var(--gold)] text-[var(--gold)]'
                : 'border-[var(--cedar)] text-[var(--cedar)]'
            }`}
          >
            {showAllInPreview ? 'Preview: Drafts + Live' : 'Preview: Live Only'}
          </button>
        </div>

        {/* Right Utility & Publish Actions */}
        <div className="flex flex-wrap items-center gap-1.5 relative">
          <button
            type="button"
            onClick={() => setChromeModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <Layout className="w-3.5 h-3.5" />
            <span>Header / Footer / SEO</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMediaPickerCallback(null);
              setMediaModalOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Media ({mediaLibrary.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setHistoryModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>History ({pageSnapshots.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPreviewDrafts(true);
              navigate('/?previewDrafts=1');
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[var(--line)] text-[var(--gold)] hover:border-[var(--gold)] cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Open Storefront</span>
          </button>

          <button
            type="button"
            onClick={() => void flushDirtySections()}
            disabled={!hasDirty && savingStatus !== 'error'}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[var(--line)] text-[var(--bone)] disabled:opacity-50 cursor-pointer"
          >
            {savingStatus === 'saving' ? (
              <span className="font-mono-tabular text-[var(--gold)]">Saving...</span>
            ) : hasDirty ? (
              <>
                <Save className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>Save Draft</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 text-[var(--cedar)]" />
                <span className="text-[var(--muted)]">Saved</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setPublishMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase tracking-wider cursor-pointer"
          >
            <Rocket className="w-3.5 h-3.5" />
            <span>Publish {draftCount > 0 ? `(${draftCount} draft)` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
            aria-label={fullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
            className="p-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {publishMenuOpen && (
            <div className="absolute end-0 top-full mt-2 w-80 z-30 border border-[var(--line)] bg-[var(--graphite)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-bold text-[var(--bone)]">Publish Home Page</p>
                <button
                  type="button"
                  onClick={() => setPublishMenuOpen(false)}
                  className="text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                Publishes all draft home blocks + draft Header/Footer/SEO together and records a full-page rollback snapshot.
              </p>
              <label className="block space-y-1">
                <span className="font-mono-tabular text-[11px] text-[var(--muted)]">Change Note (Optional)</span>
                <input
                  value={publishNote}
                  onChange={(e) => setPublishNote(e.target.value)}
                  placeholder="e.g. Weekend flash launch + Beirut audio drop"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--bone)]"
                />
              </label>
              <button
                type="button"
                disabled={publishing}
                onClick={() => void handlePublishPage(false)}
                className="w-full py-2 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {publishing ? 'Publishing...' : 'Publish Live Now'}
              </button>
              <div className="pt-2 border-t border-[var(--line)] space-y-2">
                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[11px] text-[var(--muted)] inline-flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" /> Or Schedule Publish
                  </span>
                  <input
                    type="datetime-local"
                    value={schedulePublishAt}
                    onChange={(e) => setSchedulePublishAt(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
                  />
                </label>
                <button
                  type="button"
                  disabled={publishing || !schedulePublishAt}
                  onClick={() => void handlePublishPage(true)}
                  className="w-full py-1.5 border border-[var(--gold)] text-[var(--gold)] font-semibold uppercase cursor-pointer disabled:opacity-40"
                >
                  Schedule Snapshot
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3-Pane Studio Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
        {/* LEFT PANE: Drag-and-Drop Section Stack */}
        <aside className="lg:col-span-3 border-b lg:border-b-0 lg:border-e border-[var(--line)] bg-[var(--graphite)] flex flex-col min-h-0">
          <div className="p-3 border-b border-[var(--line)] flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] font-mono-tabular uppercase tracking-wider text-[var(--muted)]">
              Blocks ({sections.length})
            </span>
            <button
              type="button"
              onClick={() => setBlockLibraryOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Block</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--line)]">
            {loading ? (
              <div className="p-4 text-xs text-[var(--muted)] font-mono-tabular">Loading studio state...</div>
            ) : sections.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Empty Home Page"
                  description="Add blocks from the 18-block library to build your storefront."
                />
              </div>
            ) : (
              sections.map((sec, idx) => {
                const preset = getPresetForSectionType(sec.sectionType);
                const isSelected = sec.id === selectedId;
                const isDragOver = dragOverId === sec.id && draggedId !== sec.id;
                const isDirty = Boolean(dirtyIds[sec.id]);

                return (
                  <div
                    key={sec.id}
                    draggable
                    onDragStart={() => setDraggedId(sec.id)}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverId(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverId(sec.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      void handleDropOnCard(sec.id);
                    }}
                    onClick={() => setSelectedId(sec.id)}
                    className={`p-2.5 text-xs cursor-pointer transition-colors ${
                      isSelected ? 'bg-[var(--ink)] border-s-2 border-s-[var(--ember)]' : 'hover:bg-[var(--ink)]/50'
                    } ${isDragOver ? 'border-t-2 border-t-[var(--cyan)]' : ''} ${
                      !sec.visible ? 'opacity-65' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <GripVertical className="w-4 h-4 text-[var(--muted)] shrink-0 mt-0.5 cursor-grab" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono-tabular text-[10px] text-[var(--muted)]">#{idx + 1}</span>
                            <span className="font-mono-tabular text-[10px] text-[var(--cyan)]">
                              {preset.label.en}
                            </span>
                            {sec.status !== 'published' && (
                              <span className="px-1 border border-[var(--gold)] text-[10px] font-mono-tabular uppercase text-[var(--gold)]">
                                {sec.status}
                              </span>
                            )}
                            {isDirty && (
                              <span className="text-[10px] font-mono-tabular text-[var(--ember)]">●</span>
                            )}
                          </div>
                          <p className="mt-0.5 font-semibold text-[var(--bone)] truncate">
                            {sec.title[simLang] || sec.title.en}
                          </p>
                          {(sec.startsAt || sec.endsAt) && (
                            <p className="text-[10px] font-mono-tabular text-[var(--gold)] truncate">
                              Scheduled window active
                            </p>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => void handleMoveByOffset(idx, -1)}
                          aria-label={`Move ${sec.title.en} up`}
                          className="p-1 text-[var(--muted)] hover:text-[var(--bone)] disabled:opacity-25 cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === sections.length - 1}
                          onClick={() => void handleMoveByOffset(idx, 1)}
                          aria-label={`Move ${sec.title.en} down`}
                          className="p-1 text-[var(--muted)] hover:text-[var(--bone)] disabled:opacity-25 cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleVisible(sec)}
                          title={sec.visible ? 'Hide block' : 'Show block'}
                          aria-label={sec.visible ? 'Hide block' : 'Show block'}
                          className="p-1 text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
                        >
                          {sec.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-[var(--ember)]" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDuplicateSection(sec)}
                          title="Duplicate block"
                          aria-label="Duplicate block"
                          className="p-1 text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === sec.id ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteSection(sec.id)}
                            className="px-1.5 py-0.5 bg-[var(--ember)] text-[var(--ember-fg)] text-[10px] font-bold uppercase cursor-pointer"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(sec.id)}
                            title="Delete block"
                            aria-label="Delete block"
                            className="p-1 text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* CENTER PANE: Interactive Live Preview */}
        <main className="lg:col-span-6 bg-[var(--ink)] overflow-y-auto p-4 min-h-0 flex flex-col">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular text-[var(--muted)]">
            <span>
              LIVE PREVIEW · {simDevice.toUpperCase()} · {simLang.toUpperCase()} ({simLang === 'ar' ? 'RTL' : 'LTR'}) ·{' '}
              {simTheme.toUpperCase()} · {simAudience.toUpperCase()}
            </span>
            <span>Click any section in preview to inspect & edit →</span>
          </div>

          <div
            dir={simLang === 'ar' ? 'rtl' : 'ltr'}
            className={`border border-[var(--line)] transition-all mx-auto w-full ${
              simDevice === 'desktop'
                ? 'max-w-full'
                : simDevice === 'tablet'
                ? 'max-w-[768px]'
                : 'max-w-[390px]'
            } ${previewThemeClass}`}
          >
            <Header
              previewLocale={simLang}
              previewTheme={simTheme}
              previewChrome={chromeDraft}
              previewMode
            />

            <div className="space-y-0">
              {previewSections.length === 0 ? (
                <div className="p-10 text-center text-xs text-[var(--muted)]">
                  No sections match the active simulation filters ({simAudience} · {simLang} · {simDevice}).
                </div>
              ) : (
                previewSections.map((sec) => {
                  const isOutOfWindow = (() => {
                    const sMs = parseUtcTimestampMs(sec.startsAt);
                    const eMs = parseUtcTimestampMs(sec.endsAt);
                    return (sMs !== null && asOfMs < sMs) || (eMs !== null && asOfMs > eMs);
                  })();

                  return (
                    <div key={sec.id} className="relative group">
                      {(!sec.visible || sec.status !== 'published' || isOutOfWindow) && (
                        <div className="bg-[var(--graphite)] border-b border-[var(--line)] px-3 py-1 flex items-center justify-between text-[10px] font-mono-tabular text-[var(--gold)]">
                          <span>
                            {!sec.visible ? 'HIDDEN BLOCK' : sec.status.toUpperCase()}
                            {isOutOfWindow ? ' · OUTSIDE SCHEDULE WINDOW' : ''}
                          </span>
                          <span>{getPresetForSectionType(sec.sectionType).label[simLang]}</span>
                        </div>
                      )}
                      <HomeSectionRenderer
                        section={sec}
                        isPreview
                        selected={sec.id === selectedId}
                        onSelect={() => setSelectedId(sec.id)}
                        previewOverride={{
                          locale: simLang,
                          asOfMs,
                          isMobilePreview: simDevice === 'mobile',
                        }}
                      />
                    </div>
                  );
                })
              )}
            </div>

            <Footer previewLocale={simLang} previewChrome={chromeDraft} previewMode />
          </div>
        </main>

        {/* RIGHT PANE: Visual Block Inspector */}
        <aside className="lg:col-span-3 border-t lg:border-t-0 lg:border-s border-[var(--line)] bg-[var(--graphite)] overflow-y-auto min-h-0">
          <BlockFormInspector
            section={selectedSection}
            versions={selectedSection ? versionsBySectionId[selectedSection.id] || [] : []}
            onChange={handleLocalSectionChange}
            onSaveTemplate={async (sec) => {
              setTemplateSourceSection(sec);
              setTemplateNameEn(`${sec.title.en} Template`);
              setTemplateNameAr(`قالب ${sec.title.ar || sec.title.en}`);
              setTemplateDescEn(`Reusable ${getPresetForSectionType(sec.sectionType).label.en} layout`);
            }}
            onRollbackVersion={async (sectionId, versionId) => {
              try {
                const res = await apiFetch<{ section: HomeSection }>(`/api/admin/home-sections/${sectionId}/rollback`, {
                  method: 'POST',
                  body: JSON.stringify({ versionId }),
                });
                showToast(`Rolled back block to v${res.section.version}`, 'success');
                await loadBuilderState(true);
                await refreshBootstrap();
                if (onReload) await onReload();
              } catch (err) {
                showToast((err as Error).message, 'error');
              }
            }}
            onPickImage={handleOpenImagePicker}
          />
        </aside>
      </div>

      {/* Modals */}
      <BlockLibraryModal
        open={blockLibraryOpen}
        onClose={() => setBlockLibraryOpen(false)}
        templates={templates}
        onAddBlock={handleAddBlock}
        onDeleteTemplate={async (templateId) => {
          try {
            await apiFetch(`/api/admin/home-builder/templates/${templateId}`, { method: 'DELETE' });
            showToast('Template deleted', 'info');
            await loadBuilderState(true);
          } catch (err) {
            showToast((err as Error).message, 'error');
          }
        }}
      />

      <ChromeAndSeoModal
        open={chromeModalOpen}
        onClose={() => setChromeModalOpen(false)}
        initialChrome={chromeDraft}
        onSave={async (nextChrome, publishNow) => {
          const res = await apiFetch<{ chrome: SiteChromeSettings }>('/api/admin/home-builder/chrome', {
            method: 'PUT',
            body: JSON.stringify({ chrome: nextChrome, publishNow }),
          });
          setChromeDraft(res.chrome);
          showToast(publishNow ? 'Header, Footer & SEO published live' : 'Chrome & SEO saved to draft', 'success');
          if (publishNow) await refreshBootstrap();
        }}
        onPickImage={(cb) => handleOpenImagePicker((picked) => cb({ url: picked.url }))}
      />

      <PageHistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        snapshots={pageSnapshots}
        migrationReport={migrationReport}
        onRollbackPage={async (snapshotId) => {
          const res = await apiFetch<{ snapshot: HomePageSnapshot }>('/api/admin/home-builder/rollback-page', {
            method: 'POST',
            body: JSON.stringify({ snapshotId }),
          });
          showToast(`Restored full Home Page snapshot (now v${res.snapshot.version})`, 'success');
          await loadBuilderState(true);
          await refreshBootstrap();
          if (onReload) await onReload();
          setHistoryModalOpen(false);
        }}
      />

      <MediaLibraryModal
        open={mediaModalOpen}
        onClose={() => {
          setMediaModalOpen(false);
          setMediaPickerCallback(null);
        }}
        mediaLibrary={mediaLibrary}
        onRefreshMedia={refreshMedia}
        onSelect={
          mediaPickerCallback
            ? (picked) => {
                mediaPickerCallback(picked);
                setMediaModalOpen(false);
                setMediaPickerCallback(null);
              }
            : undefined
        }
      />

      {templateSourceSection && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTemplateConfirm}
            className="w-full max-w-md border border-[var(--line)] bg-[var(--ink)] p-5 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[var(--bone)]">Save as Reusable Template</h3>
              <button
                type="button"
                onClick={() => setTemplateSourceSection(null)}
                className="text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="font-mono-tabular text-[var(--muted)]">Template Name (EN)</span>
              <input
                required
                value={templateNameEn}
                onChange={(e) => setTemplateNameEn(e.target.value)}
                className="w-full bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-mono-tabular text-[var(--muted)]">اسم القالب (AR)</span>
              <input
                required
                dir="rtl"
                value={templateNameAr}
                onChange={(e) => setTemplateNameAr(e.target.value)}
                className="w-full bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-mono-tabular text-[var(--muted)]">Description</span>
              <input
                value={templateDescEn}
                onChange={(e) => setTemplateDescEn(e.target.value)}
                className="w-full bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTemplateSourceSection(null)}
                className="px-3 py-1.5 border border-[var(--line)] text-[var(--bone)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingTemplate}
                className="px-4 py-1.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
              >
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
