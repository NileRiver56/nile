import React, { useMemo, useRef, useState } from 'react';
import { Check, Crosshair, ImagePlus, Trash2, Upload, X } from 'lucide-react';
import type { LocalizedText, MediaAsset } from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';

const BUILTIN_GALLERY = [
  {
    id: 'builtin-hero',
    label: 'Beirut Editorial Hero',
    url: '/src/assets/images/hero_beirut_editorial_1795297173320.jpg',
    folder: 'editorial_image',
  },
  {
    id: 'builtin-fashion',
    label: 'Fashion Linen Lookbook',
    url: '/src/assets/images/cat_fashion_linen_1795297173988.jpg',
    folder: 'editorial_image',
  },
  {
    id: 'builtin-electronics',
    label: 'Electronics Studio Audio',
    url: '/src/assets/images/cat_electronics_audio_1795297173898.jpg',
    folder: 'editorial_image',
  },
  {
    id: 'builtin-home',
    label: 'Home Gadgets & Ceramics',
    url: '/src/assets/images/cat_home_gadgets_1795297173679.jpg',
    folder: 'editorial_image',
  },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function MediaLibraryModal({
  open,
  onClose,
  mediaLibrary,
  onRefreshMedia,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  mediaLibrary: MediaAsset[];
  onRefreshMedia: () => Promise<void>;
  onSelect?: (picked: { url: string; focalX: number; focalY: number; alt?: LocalizedText }) => void;
}) {
  const { apiFetch, showToast } = useMarketplace();
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [uploadFolder, setUploadFolder] = useState<string>('editorial_image');
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editAltEn, setEditAltEn] = useState('');
  const [editAltAr, setEditAltAr] = useState('');
  const [editFolder, setEditFolder] = useState('editorial_image');
  const [editFocalX, setEditFocalX] = useState(50);
  const [editFocalY, setEditFocalY] = useState(50);
  const [savingMeta, setSavingMeta] = useState(false);
  const focalImgRef = useRef<HTMLDivElement | null>(null);

  const folders = useMemo(() => {
    const set = new Set<string>(['editorial_image', 'product_image', 'store_banner', 'store_logo', 'general']);
    for (const m of mediaLibrary) if (m.folder) set.add(m.folder);
    return ['all', ...Array.from(set)];
  }, [mediaLibrary]);

  const filtered = useMemo(() => {
    if (folderFilter === 'all') return mediaLibrary;
    return mediaLibrary.filter((m) => m.folder === folderFilter);
  }, [mediaLibrary, folderFilter]);

  const selectedAsset = mediaLibrary.find((m) => m.id === selectedId) || null;

  const chooseAsset = (asset: MediaAsset) => {
    setSelectedId(asset.id);
    setEditAltEn(asset.alt?.en || '');
    setEditAltAr(asset.alt?.ar || '');
    setEditFolder(asset.folder || 'general');
    setEditFocalX(asset.focalX ?? 50);
    setEditFocalY(asset.focalY ?? 50);
  };

  if (!open) return null;

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const base64Data = await readFileAsDataUrl(file);
      const res = await apiFetch<{ media: { mediaId: string; publicUrl: string } }>('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({
          base64Data,
          mimeType: file.type,
          entityType: 'editorial_image',
          folder: uploadFolder,
          alt: { en: file.name.replace(/\.[^.]+$/, ''), ar: file.name.replace(/\.[^.]+$/, '') },
          focalX: 50,
          focalY: 50,
        }),
      });
      await onRefreshMedia();
      setSelectedId(res.media.mediaId);
      setEditFocalX(50);
      setEditFocalY(50);
      showToast(`Uploaded ${res.media.publicUrl}`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveMeta = async () => {
    if (!selectedAsset) return;
    setSavingMeta(true);
    try {
      await apiFetch(`/api/admin/media/${selectedAsset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          folder: editFolder,
          alt: { en: editAltEn, ar: editAltAr },
          focalX: editFocalX,
          focalY: editFocalY,
        }),
      });
      await onRefreshMedia();
      showToast('Media metadata & focal point saved', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAsset) return;
    try {
      await apiFetch(`/api/admin/media/${selectedAsset.id}`, { method: 'DELETE' });
      setSelectedId(null);
      await onRefreshMedia();
      showToast('Media deleted', 'info');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleFocalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!focalImgRef.current) return;
    const rect = focalImgRef.current.getBoundingClientRect();
    const fx = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const fy = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
    setEditFocalX(fx);
    setEditFocalY(fy);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[90vh] flex flex-col border border-[var(--line)] bg-[var(--ink)]">
        <div className="px-5 py-3.5 border-b border-[var(--line)] bg-[var(--graphite)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ImagePlus className="w-4 h-4 text-[var(--ember)]" />
            <h2 className="font-display text-lg font-bold text-[var(--bone)]">Media Library & Focal Point</h2>
            <span className="text-xs font-mono-tabular text-[var(--muted)]">({mediaLibrary.length} uploaded)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Media Library"
            className="p-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {folders.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFolderFilter(f)}
                className={`px-2.5 py-1 border font-mono-tabular cursor-pointer ${
                  folderFilter === f
                    ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)] font-semibold'
                    : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={uploadFolder}
              onChange={(e) => setUploadFolder(e.target.value)}
              aria-label="Upload destination folder"
              className="bg-[var(--graphite)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)] font-mono-tabular"
            >
              <option value="editorial_image">editorial_image</option>
              <option value="general">general</option>
              <option value="store_banner">store_banner</option>
              <option value="product_image">product_image</option>
            </select>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? 'Optimizing WebP...' : 'Upload Image'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                }}
              />
            </label>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Grid */}
          <div className="lg:col-span-8 p-5 overflow-y-auto space-y-6">
            <div>
              <p className="text-[11px] font-mono-tabular uppercase text-[var(--muted)] mb-2">
                Curated Built-In Editorial Photography
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {BUILTIN_GALLERY.map((item) => (
                  <div key={item.id} className="border border-[var(--line)] bg-[var(--graphite)] p-2 space-y-2">
                    <img src={item.url} alt={item.label} className="w-full h-24 object-cover" />
                    <p className="text-[11px] text-[var(--bone)] truncate">{item.label}</p>
                    {onSelect && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelect({ url: item.url, focalX: 50, focalY: 50, alt: { en: item.label, ar: item.label } });
                          onClose();
                        }}
                        className="w-full py-1 border border-[var(--ember)] text-[11px] font-semibold text-[var(--ember)] hover:bg-[var(--ember)] hover:text-[var(--ember-fg)] cursor-pointer"
                      >
                        Use Image
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-mono-tabular uppercase text-[var(--muted)] mb-2">
                Uploaded Media Assets ({filtered.length})
              </p>
              {filtered.length === 0 ? (
                <div className="border border-[var(--line)] bg-[var(--graphite)] p-8 text-center text-xs text-[var(--muted)]">
                  No uploaded files in this folder yet. Use &ldquo;Upload Image&rdquo; above to convert and store WebP assets.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {filtered.map((asset) => {
                    const isSel = asset.id === selectedId;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => chooseAsset(asset)}
                        className={`text-start border p-2 space-y-1.5 cursor-pointer bg-[var(--graphite)] ${
                          isSel ? 'border-[var(--ember)]' : 'border-[var(--line)] hover:border-[var(--muted)]'
                        }`}
                      >
                        <div className="relative aspect-[4/3] w-full bg-[var(--ink)] overflow-hidden">
                          <img
                            src={asset.publicUrl}
                            alt={asset.alt?.en || asset.id}
                            style={{ objectPosition: `${asset.focalX}% ${asset.focalY}%` }}
                            className="w-full h-full object-cover"
                          />
                          {asset.usedIn.length > 0 && (
                            <span className="absolute bottom-1 start-1 bg-black/80 px-1.5 py-0.5 text-[10px] font-mono-tabular text-[var(--cedar)]">
                              {asset.usedIn.length} ref
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--bone)] truncate">{asset.alt?.en || asset.folder}</p>
                        <p className="text-[10px] font-mono-tabular text-[var(--muted)]">
                          {asset.width || '?'}×{asset.height || '?'} · {Math.round(asset.sizeBytes / 1024)}KB
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Inspector */}
          <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-s border-[var(--line)] bg-[var(--graphite)] p-5 overflow-y-auto space-y-4 text-xs">
            {!selectedAsset ? (
              <div className="text-[var(--muted)] py-10 text-center space-y-2">
                <Crosshair className="w-6 h-6 mx-auto opacity-60" />
                <p>Select any uploaded image to edit bilingual Alt text, focal point, or inspect where it is used.</p>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tabular uppercase text-[var(--muted)]">
                      Click Image to Set Focal Point ({editFocalX}%, {editFocalY}%)
                    </span>
                  </div>
                  <div
                    ref={focalImgRef}
                    onClick={handleFocalClick}
                    className="relative aspect-[4/3] w-full border border-[var(--line)] bg-[var(--ink)] overflow-hidden cursor-crosshair"
                  >
                    <img
                      src={selectedAsset.publicUrl}
                      alt={editAltEn || 'Preview'}
                      style={{ objectPosition: `${editFocalX}% ${editFocalY}%` }}
                      className="w-full h-full object-cover"
                    />
                    <div
                      style={{ left: `${editFocalX}%`, top: `${editFocalY}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 border-2 border-[var(--ember)] bg-black/50 pointer-events-none"
                    />
                  </div>
                </div>

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[var(--muted)]">Folder</span>
                  <input
                    value={editFolder}
                    onChange={(e) => setEditFolder(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 font-mono-tabular text-[var(--bone)]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[var(--muted)]">Alt Text (EN)</span>
                  <input
                    value={editAltEn}
                    onChange={(e) => setEditAltEn(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[var(--muted)]">Alt Text (AR)</span>
                  <input
                    dir="rtl"
                    value={editAltAr}
                    onChange={(e) => setEditAltAr(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-1.5 text-[var(--bone)]"
                  />
                </label>

                <div className="space-y-1 pt-2 border-t border-[var(--line)]">
                  <p className="font-mono-tabular uppercase text-[var(--muted)]">Where Used</p>
                  {selectedAsset.usedIn.length === 0 ? (
                    <p className="text-[11px] text-[var(--muted)]">Not referenced by any block, store, or product.</p>
                  ) : (
                    <ul className="space-y-1 text-[11px] font-mono-tabular text-[var(--cedar)]">
                      {selectedAsset.usedIn.map((u, i) => (
                        <li key={i}>
                          · {u.kind}: {u.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  {onSelect && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelect({
                          url: selectedAsset.publicUrl,
                          focalX: editFocalX,
                          focalY: editFocalY,
                          alt: { en: editAltEn, ar: editAltAr },
                        });
                        onClose();
                      }}
                      className="w-full py-2 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Use This Image</span>
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={savingMeta}
                      onClick={() => void handleSaveMeta()}
                      className="flex-1 py-2 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                    >
                      {savingMeta ? 'Saving...' : 'Save Metadata'}
                    </button>
                    <button
                      type="button"
                      disabled={selectedAsset.usedIn.length > 0}
                      onClick={() => void handleDelete()}
                      title={selectedAsset.usedIn.length > 0 ? 'Cannot delete while referenced' : 'Delete file'}
                      className="px-3 py-2 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
