import React, { useState } from 'react';
import { CheckCircle2, History, RotateCcw, X } from 'lucide-react';
import type { HomeMigrationReport, HomePageSnapshot } from '../../shared/types.ts';

export function PageHistoryModal({
  open,
  onClose,
  snapshots,
  migrationReport,
  onRollbackPage,
}: {
  open: boolean;
  onClose: () => void;
  snapshots: HomePageSnapshot[];
  migrationReport: HomeMigrationReport | null;
  onRollbackPage: (snapshotId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'snapshots' | 'migration'>('snapshots');
  const [rollingId, setRollingId] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col border border-[var(--line)] bg-[var(--ink)]">
        <div className="px-5 py-3.5 border-b border-[var(--line)] bg-[var(--graphite)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-[var(--ember)]" />
            <h2 className="font-display text-lg font-bold text-[var(--bone)]">
              Page History, Full Rollback & 15 → 18 Migration Report
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history modal"
            className="p-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[var(--line)] flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTab('snapshots')}
            className={`px-3 py-1.5 border font-medium cursor-pointer ${
              tab === 'snapshots'
                ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                : 'border-[var(--line)] text-[var(--bone)]'
            }`}
          >
            Published Page Snapshots ({snapshots.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('migration')}
            className={`px-3 py-1.5 border font-medium cursor-pointer ${
              tab === 'migration'
                ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                : 'border-[var(--line)] text-[var(--bone)]'
            }`}
          >
            Legacy 15 → 18 Migration Report
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {tab === 'snapshots' ? (
            <div className="border border-[var(--line)] divide-y divide-[var(--line)]">
              {snapshots.length === 0 ? (
                <div className="p-8 text-center text-[var(--muted)]">No full-page snapshots recorded yet.</div>
              ) : (
                snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-4 bg-[var(--graphite)] flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono-tabular">
                        <span className="font-bold text-[var(--bone)]">Page v{snap.version}</span>
                        <span
                          className={
                            snap.status === 'published'
                              ? 'text-[var(--cedar)]'
                              : snap.status === 'scheduled'
                                ? 'text-[var(--gold)]'
                                : 'text-[var(--muted)]'
                          }
                        >
                          · {snap.status.toUpperCase()}
                        </span>
                        <span className="text-[var(--muted)]">· {snap.sectionCount} blocks</span>
                      </div>
                      <p className="text-[var(--bone)]">{snap.changeNote || 'Snapshot'}</p>
                      <p className="font-mono-tabular text-[11px] text-[var(--muted)]">
                        {snap.status === 'scheduled' && snap.scheduledPublishAt
                          ? `Scheduled for: ${snap.scheduledPublishAt}`
                          : `Published: ${snap.publishedAt || snap.createdAt}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={rollingId === snap.id}
                      onClick={async () => {
                        setRollingId(snap.id);
                        try {
                          await onRollbackPage(snap.id);
                          onClose();
                        } finally {
                          setRollingId(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[var(--cedar)] text-[var(--cedar)] hover:bg-[var(--ink)] font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{rollingId === snap.id ? 'Restoring...' : `Restore v${snap.version}`}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : !migrationReport ? (
            <div className="p-6 text-[var(--muted)]">Migration report not available.</div>
          ) : (
            <div className="space-y-4">
              <div className="hairline-grid grid-cols-1 sm:grid-cols-3">
                <div className="hairline-cell p-4">
                  <p className="font-mono-tabular text-[var(--muted)] uppercase">Migrated Sections</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[var(--cedar)]">
                    {migrationReport.migratedSections.length}
                  </p>
                </div>
                <div className="hairline-cell p-4">
                  <p className="font-mono-tabular text-[var(--muted)] uppercase">Version Snapshots Updated</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[var(--bone)]">
                    {migrationReport.migratedVersionsCount}
                  </p>
                </div>
                <div className="hairline-cell p-4">
                  <p className="font-mono-tabular text-[var(--muted)] uppercase">Already V2 Native</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[var(--bone)]">
                    {migrationReport.alreadyUpToDateCount}
                  </p>
                </div>
              </div>

              <div className="border border-[var(--line)] bg-[var(--graphite)] overflow-x-auto">
                <table className="w-full border-collapse text-start">
                  <thead className="border-b border-[var(--line)] bg-[var(--ink)] font-mono-tabular text-[11px] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="p-3 text-start">Section Title</th>
                      <th className="p-3 text-start">Legacy Type</th>
                      <th className="p-3 text-start">Mapped V2 Block</th>
                      <th className="p-3 text-start">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {migrationReport.migratedSections.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-5 text-center text-[var(--cedar)]">
                          <CheckCircle2 className="w-4 h-4 inline me-1.5" />
                          All active sections are already running on the 18 v2 block schema.
                        </td>
                      </tr>
                    ) : (
                      migrationReport.migratedSections.map((m) => (
                        <tr key={m.id}>
                          <td className="p-3 text-[var(--bone)] font-medium">{m.titleEn}</td>
                          <td className="p-3 font-mono-tabular text-[var(--muted)]">{m.fromType}</td>
                          <td className="p-3 font-mono-tabular text-[var(--cedar)]">{m.toType}</td>
                          <td className="p-3 font-mono-tabular text-[var(--bone)]">{m.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="font-mono-tabular text-[11px] text-[var(--muted)]">Last verified: {migrationReport.ranAt}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
