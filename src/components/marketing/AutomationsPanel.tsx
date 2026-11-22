import React, { useState } from 'react';
import { Play, Plus, Power, Trash2, Zap } from 'lucide-react';
import type {
  AutomationFlow,
  AutomationTriggerType,
  Coupon,
  EmailBlock,
} from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState } from '../HairlineUI.tsx';

const TRIGGER_OPTIONS: Array<{ id: AutomationTriggerType; label: string; hint: string }> = [
  {
    id: 'welcome_subscriber',
    label: 'Welcome Subscriber',
    hint: 'Fires immediately when a visitor subscribes to the newsletter.',
  },
  {
    id: 'abandoned_cart',
    label: 'Abandoned Cart Reminder',
    hint: 'Fires for logged-in shoppers with cart items and no order after delay hours.',
  },
  {
    id: 'post_purchase',
    label: 'Post-Purchase Follow-up',
    hint: 'Fires after order placement to ask for reviews or offer a repeat code.',
  },
  {
    id: 'winback_30d',
    label: 'Winback Lapsed Buyer (30d+)',
    hint: 'Fires for past buyers who have not placed a new order within the configured window.',
  },
];

export function AutomationsPanel({
  automationFlows,
  coupons,
  onReload,
}: {
  automationFlows: AutomationFlow[];
  coupons: Coupon[];
  onReload: () => Promise<void>;
}) {
  const { apiFetch, showToast } = useMarketplace();

  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('welcome_subscriber');
  const [delayHours, setDelayHours] = useState('0');
  const [attachCouponCode, setAttachCouponCode] = useState('');
  const [subjectEn, setSubjectEn] = useState('');
  const [subjectAr, setSubjectAr] = useState('');
  const [headlineEn, setHeadlineEn] = useState('');
  const [headlineAr, setHeadlineAr] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [ctaLabelEn, setCtaLabelEn] = useState('Shop Now');
  const [ctaLabelAr, setCtaLabelAr] = useState('تسوق الآن');
  const [ctaUrl, setCtaUrl] = useState('/catalog');
  const [activeOnCreate, setActiveOnCreate] = useState(true);

  const [saving, setSaving] = useState(false);
  const [runningWorker, setRunningWorker] = useState(false);
  const [lastRunSummary, setLastRunSummary] = useState<Record<string, number> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!nameEn.trim() || !nameAr.trim() || !subjectEn.trim() || !subjectAr.trim()) {
      showToast('Enter EN & AR names and email subjects for the flow.', 'error');
      return;
    }
    const blocks: EmailBlock[] = [
      {
        id: 'auto-hdr',
        type: 'header',
        titleEn: headlineEn.trim() || nameEn.trim(),
        titleAr: headlineAr.trim() || nameAr.trim(),
      },
      {
        id: 'auto-body',
        type: 'hero_text',
        titleEn: headlineEn.trim() || subjectEn.trim(),
        titleAr: headlineAr.trim() || subjectAr.trim(),
        bodyEn: bodyEn.trim() || 'Thank you for shopping with independent Lebanese sellers on NileLink.',
        bodyAr: bodyAr.trim() || 'شكراً لتسوقك من المتاجر اللبنانية المستقلة على نيل لينك.',
      },
      ...(attachCouponCode
        ? [
            {
              id: 'auto-cpn',
              type: 'coupon_box' as const,
              titleEn: 'Your Exclusive Promo Code',
              titleAr: 'رمز الخصم الخاص بك',
              couponCode: attachCouponCode,
            },
          ]
        : []),
      {
        id: 'auto-cta',
        type: 'cta_button',
        buttonLabelEn: ctaLabelEn.trim() || 'Shop Now',
        buttonLabelAr: ctaLabelAr.trim() || 'تسوق الآن',
        buttonUrl: ctaUrl.trim() || '/catalog',
      },
    ];

    setSaving(true);
    try {
      await apiFetch('/api/admin/automations', {
        method: 'POST',
        body: JSON.stringify({
          name: { en: nameEn.trim(), ar: nameAr.trim() },
          triggerType,
          delayHours: Math.max(0, Math.trunc(Number(delayHours) || 0)),
          subject: { en: subjectEn.trim(), ar: subjectAr.trim() },
          blocks,
          attachCouponCode: attachCouponCode || null,
          active: activeOnCreate,
        }),
      });
      showToast('Automation flow saved.', 'success');
      setNameEn('');
      setNameAr('');
      setSubjectEn('');
      setSubjectAr('');
      setHeadlineEn('');
      setHeadlineAr('');
      setBodyEn('');
      setBodyAr('');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (flow: AutomationFlow) => {
    try {
      await apiFetch(`/api/admin/automations/${flow.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !flow.active }),
      });
      showToast(flow.active ? 'Automation paused.' : 'Automation activated.', 'info');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/admin/automations/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      showToast('Automation flow deleted.', 'info');
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleRunWorkerNow = async () => {
    setRunningWorker(true);
    try {
      const res = await apiFetch<{ ok: boolean; summary: Record<string, number> }>('/api/admin/automations/run-now', {
        method: 'POST',
      });
      setLastRunSummary(res.summary);
      showToast(
        `Worker ran: ${res.summary.automationJobsQueued || 0} automation(s) queued, ${res.summary.processed || 0} job(s) processed.`,
        'success'
      );
      await onReload();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setRunningWorker(false);
    }
  };

  const selectedTriggerMeta = TRIGGER_OPTIONS.find((t) => t.id === triggerType);

  return (
    <div className="space-y-6">
      {/* Worker Execution Strip */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono-tabular uppercase text-[var(--cyan)]">
            <Zap className="w-3.5 h-3.5" />
            <span>Queue-Backed Automation Engine</span>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Welcome emails enqueue immediately on signup; Abandoned Cart, Post-Purchase, and Winback flows evaluate via the cron job worker with strict deduplication.
          </p>
        </div>
        <button
          type="button"
          disabled={runningWorker}
          onClick={() => void handleRunWorkerNow()}
          className="inline-flex items-center gap-2 border border-[var(--cedar)] bg-[var(--ink)] px-4 py-2 text-xs font-bold uppercase text-[var(--cedar)] hover:bg-[var(--cedar)] hover:text-[#17181B] cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{runningWorker ? 'Running Worker...' : 'Run Automation & Job Worker Now'}</span>
        </button>
      </div>

      {lastRunSummary && (
        <div className="border border-[var(--cedar)] bg-[var(--ink)] p-3 flex flex-wrap gap-4 text-xs font-mono-tabular">
          <span className="text-[var(--cedar)] font-bold">Last Run Telemetry:</span>
          <span>Processed: {lastRunSummary.processed ?? 0}</span>
          <span>Failed: {lastRunSummary.failed ?? 0}</span>
          <span>Campaigns Dispatched: {lastRunSummary.campaignsDispatched ?? 0}</span>
          <span>Automation Jobs Queued: {lastRunSummary.automationJobsQueued ?? 0}</span>
          <span>Flash Sales Reverted: {lastRunSummary.flashSalesEnded ?? 0}</span>
        </div>
      )}

      {/* Create Automation Flow */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-[var(--bone)]">Create Automated Flow</h3>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleCreate()}
            className="inline-flex items-center gap-2 bg-[var(--ember)] text-[var(--ember-fg)] px-4 py-2 text-xs font-bold uppercase cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Automation Flow'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Flow Name (EN)</span>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="Abandoned Cart 2h Recovery"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Flow Name (AR)</span>
            <input
              dir="rtl"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="استعادة السلة المتروكة"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Trigger Type</span>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)}
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            >
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            {selectedTriggerMeta && <p className="text-[11px] text-[var(--muted)]">{selectedTriggerMeta.hint}</p>}
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Delay (Hours)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={delayHours}
              onChange={(e) => setDelayHours(e.target.value)}
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)] font-mono-tabular"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Attach Coupon (Optional)</span>
            <select
              value={attachCouponCode}
              onChange={(e) => setAttachCouponCode(e.target.value)}
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            >
              <option value="">No coupon attached</option>
              {coupons.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 pt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={activeOnCreate}
              onChange={(e) => setActiveOnCreate(e.target.checked)}
            />
            <span className="text-[var(--bone)]">Activate flow immediately</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2 border-t border-[var(--line)]">
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Email Subject (EN)</span>
            <input
              value={subjectEn}
              onChange={(e) => setSubjectEn(e.target.value)}
              placeholder="You left items in your NileLink cart"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Email Subject (AR)</span>
            <input
              dir="rtl"
              value={subjectAr}
              onChange={(e) => setSubjectAr(e.target.value)}
              placeholder="لديك منتجات بانتظارك في السلة"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Headline (EN)</span>
            <input
              value={headlineEn}
              onChange={(e) => setHeadlineEn(e.target.value)}
              placeholder="Complete your order before stock runs out"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Headline (AR)</span>
            <input
              dir="rtl"
              value={headlineAr}
              onChange={(e) => setHeadlineAr(e.target.value)}
              placeholder="أكمل طلبك قبل نفاد الكمية"
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Message Body (EN)</span>
            <textarea
              rows={2}
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              placeholder="Your curated Lebanese items are reserved for checkout."
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[var(--muted)] uppercase font-mono-tabular">Message Body (AR)</span>
            <textarea
              dir="rtl"
              rows={2}
              value={bodyAr}
              onChange={(e) => setBodyAr(e.target.value)}
              placeholder="منتجاتك المختارة جاهزة لإتمام الطلب."
              className="w-full border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </label>
          <div className="grid grid-cols-3 gap-2 md:col-span-2">
            <input
              value={ctaLabelEn}
              onChange={(e) => setCtaLabelEn(e.target.value)}
              placeholder="Button (EN)"
              className="border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
            <input
              dir="rtl"
              value={ctaLabelAr}
              onChange={(e) => setCtaLabelAr(e.target.value)}
              placeholder="الزر (AR)"
              className="border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
            <input
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="/checkout"
              className="border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-[var(--bone)]"
            />
          </div>
        </div>
      </div>

      {/* Saved Flows */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
        <h3 className="font-display text-lg font-bold text-[var(--bone)]">
          Configured Automation Flows ({automationFlows.length})
        </h3>
        {automationFlows.length === 0 ? (
          <EmptyState
            title="No automated flows configured"
            description="Set up a Welcome Subscriber, Abandoned Cart, Post-Purchase, or Winback flow above."
          />
        ) : (
          <div className="space-y-3">
            {automationFlows.map((flow) => (
              <div
                key={flow.id}
                className="border border-[var(--line)] bg-[var(--ink)] p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold text-[var(--bone)]">
                      {flow.name.en} <span className="text-[var(--muted)] font-normal">/ {flow.name.ar}</span>
                    </span>
                    <span className="border border-[var(--cyan)] px-2 py-0.5 text-[11px] font-mono-tabular text-[var(--cyan)] uppercase">
                      {flow.triggerType}
                    </span>
                    <span
                      className={`border px-2 py-0.5 text-[11px] font-mono-tabular uppercase ${
                        flow.active
                          ? 'border-[var(--cedar)] text-[var(--cedar)]'
                          : 'border-[var(--muted)] text-[var(--muted)]'
                      }`}
                    >
                      {flow.active ? 'Active' : 'Paused'}
                    </span>
                    {flow.attachCouponCode && (
                      <span className="border border-[var(--gold)] px-2 py-0.5 text-[11px] font-mono-tabular text-[var(--gold)]">
                        {flow.attachCouponCode}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    Subject EN: {flow.subject.en} · Delay: {flow.delayHours}h
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] font-mono-tabular text-[var(--muted)]">
                    <span>Triggered: {flow.totalTriggered}</span>
                    <span className="text-[var(--cedar)]">Sent: {flow.totalSent}</span>
                    {flow.lastRunAt && <span>Last Run: {flow.lastRunAt}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(flow)}
                    className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-bold uppercase cursor-pointer ${
                      flow.active
                        ? 'border-[var(--gold)] text-[var(--gold)]'
                        : 'border-[var(--cedar)] text-[var(--cedar)]'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    <span>{flow.active ? 'Pause' : 'Activate'}</span>
                  </button>
                  {confirmDeleteId === flow.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleDelete(flow.id)}
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
                      onClick={() => setConfirmDeleteId(flow.id)}
                      className="border border-[var(--line)] p-1.5 text-[var(--crimson)] hover:border-[var(--crimson)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
