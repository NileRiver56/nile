import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Layers,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Campaign,
  Category,
  Offer,
  OfferConflict,
  OfferFundingSource,
  OfferQuantityTier,
  OfferRulesConfig,
  OfferStackingRule,
  OfferTargetType,
  OfferType,
  Seller,
} from '../../shared/types.ts';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { EmptyState, StatusLabel } from '../HairlineUI.tsx';

const OFFER_TYPE_CARDS: Array<{
  id: OfferType;
  label: string;
  desc: string;
}> = [
  { id: 'percent', label: 'Percentage Off (%)', desc: 'Classic percentage reduction on matching SKUs' },
  { id: 'flash_percent', label: 'Flash Deal (%)', desc: 'High-urgency timed % discount with stock cap' },
  { id: 'fixed_usd_cents', label: 'Fixed USD Off ($)', desc: 'Flat dollar deduction per unit in integer cents' },
  { id: 'bogo', label: 'Buy 1 Get 1 (BOGO)', desc: 'Second matching unit free or discounted %' },
  { id: 'buy_x_get_y', label: 'Buy X Get Y', desc: 'Custom multi-unit cycle (e.g., Buy 2 Get 1 50%)' },
  { id: 'tiered_qty', label: 'Tiered Volume Discount', desc: 'Higher % off when buying larger quantities' },
  { id: 'cart_threshold', label: 'Cart Threshold Deal', desc: 'Unlock discount once cart exceeds $ minimum' },
  { id: 'bundle_deal', label: 'Product Bundle Deal', desc: 'Discount when specific products are bought together' },
  { id: 'free_shipping', label: 'Free Delivery Waiver', desc: 'Waives shipping fee for qualifying orders' },
  { id: 'first_order', label: 'First Order Welcome', desc: 'Exclusive reward for first-time buyers' },
  { id: 'vip_exclusive', label: 'Logged-In Member VIP', desc: 'Exclusive discount unlocked after sign-in' },
];

export function OffersWizardPanel({
  offers,
  categories,
  sellers,
  campaigns = [],
  onReload,
}: {
  offers: Offer[];
  categories: Category[];
  sellers: Seller[];
  campaigns?: Campaign[];
  onReload: () => Promise<void>;
}) {
  const { products, apiFetch, showToast, refreshBootstrap } = useMarketplace();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // Step 1
  const [offerType, setOfferType] = useState<OfferType>('percent');
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');

  // Step 2: Rules & Value
  const [discountInput, setDiscountInput] = useState('15');
  const [buyQty, setBuyQty] = useState('2');
  const [getQty, setGetQty] = useState('1');
  const [getDiscountPct, setGetDiscountPct] = useState('100');
  const [tiers, setTiers] = useState<OfferQuantityTier[]>([
    { minQty: 2, discountPercent: 10 },
    { minQty: 5, discountPercent: 20 },
  ]);
  const [minCartUsd, setMinCartUsd] = useState('50');
  const [maxDiscUsd, setMaxDiscUsd] = useState('');
  const [bundleIds, setBundleIds] = useState<string[]>([]);
  const [bundlePct, setBundlePct] = useState('15');
  const [flashStockCap, setFlashStockCap] = useState('');

  // Step 3: Target Scope
  const [targetType, setTargetType] = useState<OfferTargetType>('all');
  const [targetId, setTargetId] = useState('');
  const [campaignId, setCampaignId] = useState('');

  // Step 4: Schedule & Audience
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // Step 5: Stacking & Funding
  const [stackingRule, setStackingRule] = useState<OfferStackingRule>('best_only');
  const [priority, setPriority] = useState('10');
  const [fundingSource, setFundingSource] = useState<OfferFundingSource>('platform');
  const [fundingPlatformPct, setFundingPlatformPct] = useState('50');

  // Step 6: Conflict check
  const [conflicts, setConflicts] = useState<OfferConflict[] | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const buildPayload = () => {
    const numDisc = Number(discountInput || 0);
    let discountValue = Math.round(numDisc);
    if (offerType === 'fixed_usd_cents') discountValue = Math.round(numDisc * 100);
    else if (offerType === 'bogo') discountValue = Math.round(Number(getDiscountPct || 100));
    else if (offerType === 'buy_x_get_y') discountValue = Math.round(Number(getDiscountPct || 50));
    else if (offerType === 'tiered_qty') discountValue = tiers[0]?.discountPercent ?? 10;
    else if (offerType === 'bundle_deal') discountValue = Math.round(Number(bundlePct || 15));
    else if (offerType === 'free_shipping') discountValue = 0;

    const rules: OfferRulesConfig = {};
    if (offerType === 'bogo') {
      rules.buyQty = 1;
      rules.getQty = 1;
      rules.getDiscountPct = Math.min(100, Math.max(1, Math.round(Number(getDiscountPct || 100))));
    } else if (offerType === 'buy_x_get_y') {
      rules.buyQty = Math.max(1, Math.round(Number(buyQty || 2)));
      rules.getQty = Math.max(1, Math.round(Number(getQty || 1)));
      rules.getDiscountPct = Math.min(100, Math.max(1, Math.round(Number(getDiscountPct || 50))));
    } else if (offerType === 'tiered_qty') {
      rules.tiers = tiers.filter((t) => t.minQty >= 1 && t.discountPercent >= 1);
    } else if (offerType === 'cart_threshold' || offerType === 'free_shipping') {
      rules.minCartUsdCents = Math.max(0, Math.round(Number(minCartUsd || 0) * 100));
    } else if (offerType === 'bundle_deal') {
      rules.bundleProductIds = bundleIds;
      rules.bundleDiscountPct = Math.min(90, Math.max(1, Math.round(Number(bundlePct || 15))));
    } else if (offerType === 'flash_percent' && flashStockCap) {
      rules.flashStockCap = Math.max(1, Math.round(Number(flashStockCap)));
    }
    if (maxDiscUsd && Number(maxDiscUsd) > 0) {
      rules.maxDiscountUsdCents = Math.round(Number(maxDiscUsd) * 100);
    }

    const fundingPlatformBps =
      fundingSource === 'platform'
        ? 10000
        : fundingSource === 'seller'
          ? 0
          : Math.min(10000, Math.max(0, Math.round(Number(fundingPlatformPct || 50) * 100)));

    return {
      title: { en: titleEn.trim() || `${offerType.replace(/_/g, ' ')} Promo`, ar: (titleAr || titleEn || 'عرض ترويجي').trim() },
      offerType,
      discountValue,
      targetType,
      targetId: targetType === 'all' ? null : targetId || null,
      stackingRule,
      fundingSource,
      fundingPlatformBps,
      campaignId: campaignId || null,
      priority: Math.round(Number(priority || 10)),
      rules,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      active: true,
    };
  };

  const runConflictCheck = async () => {
    setCheckingConflicts(true);
    try {
      const payload = buildPayload();
      const res = await apiFetch<{ conflicts: OfferConflict[] }>('/api/admin/offers/check-conflicts', {
        method: 'POST',
        body: JSON.stringify({
          offerType: payload.offerType,
          targetType: payload.targetType,
          targetId: payload.targetId,
          stackingRule: payload.stackingRule,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
        }),
      });
      setConflicts(res.conflicts || []);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setCheckingConflicts(false);
    }
  };

  const handlePublish = async () => {
    if (!titleEn.trim()) {
      showToast('Enter an offer title in English.', 'error');
      return;
    }
    if (offerType === 'bundle_deal' && bundleIds.length < 2) {
      showToast('Select at least 2 products for a bundle deal.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/admin/offers', {
        method: 'POST',
        body: JSON.stringify(buildPayload()),
      });
      showToast('Offer published and active across storefront', 'success');
      setTitleEn('');
      setTitleAr('');
      setConflicts(null);
      setStep(1);
      await onReload();
      await refreshBootstrap();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const wizardSteps = [
    { n: 1 as const, label: '1. Type' },
    { n: 2 as const, label: '2. Rules' },
    { n: 3 as const, label: '3. Scope' },
    { n: 4 as const, label: '4. Schedule' },
    { n: 5 as const, label: '5. Stacking & Split' },
    { n: 6 as const, label: '6. Conflict Check' },
  ];

  return (
    <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
      {/* Left: 6-Step Visual Offers Wizard */}
      <div className="hairline-cell lg:col-span-6 p-6 space-y-5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-xl font-bold text-[var(--bone)]">6-Step Offers Wizard</h3>
            <p className="text-[var(--muted)]">
              Configure all 11 promotion mechanics with integer-cent accuracy &amp; conflict detection.
            </p>
          </div>
          <span className="font-mono-tabular text-[11px] uppercase px-2 py-1 border border-[var(--line)] text-[var(--ember)]">
            Step {step} / 6
          </span>
        </div>

        {/* Stepper Bar */}
        <div className="grid grid-cols-3 sm:grid-cols-6 border border-[var(--line)] divide-x divide-y sm:divide-y-0 divide-[var(--line)]">
          {wizardSteps.map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => {
                setStep(s.n);
                if (s.n === 6) void runConflictCheck();
              }}
              className={`px-2 py-2 text-[11px] font-mono-tabular text-start cursor-pointer ${
                step === s.n
                  ? 'bg-[var(--ember)] text-[var(--ember-fg)] font-bold'
                  : step > s.n
                    ? 'bg-[var(--ink)] text-[var(--cedar)]'
                    : 'bg-[var(--ink)] text-[var(--muted)]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Step 1: Offer Type */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {OFFER_TYPE_CARDS.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setOfferType(card.id)}
                  className={`p-3 border text-start cursor-pointer transition-colors ${
                    offerType === card.id
                      ? 'border-[var(--ember)] bg-[var(--ink)]'
                      : 'border-[var(--line)] bg-[var(--graphite)] hover:border-[var(--muted)]'
                  }`}
                >
                  <p className="font-semibold text-[var(--bone)]">{card.label}</p>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">{card.desc}</p>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Offer Title (EN) *</span>
                <input
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  placeholder="e.g. Weekend Cedar Drops"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
                />
              </label>
              <label className="space-y-1">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Offer Title (AR) *</span>
                <input
                  dir="rtl"
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  placeholder="مثال: عروض نهاية الأسبوع"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
                />
              </label>
            </div>
          </div>
        )}

        {/* Step 2: Value & Mechanics */}
        {step === 2 && (
          <div className="space-y-4">
            {['percent', 'flash_percent', 'first_order', 'vip_exclusive'].includes(offerType) && (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">Discount Percent (1–90%)</span>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                  />
                </label>
                {offerType === 'flash_percent' && (
                  <label className="space-y-1">
                    <span className="font-mono-tabular uppercase text-[var(--muted)]">Stock Cap (optional)</span>
                    <input
                      type="number"
                      min="1"
                      value={flashStockCap}
                      onChange={(e) => setFlashStockCap(e.target.value)}
                      placeholder="Unlimited"
                      className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                    />
                  </label>
                )}
              </div>
            )}

            {offerType === 'fixed_usd_cents' && (
              <label className="block space-y-1">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Fixed USD Off Per Unit ($)</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                />
              </label>
            )}

            {offerType === 'bogo' && (
              <label className="block space-y-1">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">2nd Item Discount % (100 = Free)</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={getDiscountPct}
                  onChange={(e) => setGetDiscountPct(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                />
              </label>
            )}

            {offerType === 'buy_x_get_y' && (
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">Buy Qty (X)</span>
                  <input
                    type="number"
                    min="1"
                    value={buyQty}
                    onChange={(e) => setBuyQty(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">Get Qty (Y)</span>
                  <input
                    type="number"
                    min="1"
                    value={getQty}
                    onChange={(e) => setGetQty(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">Y Discount %</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={getDiscountPct}
                    onChange={(e) => setGetDiscountPct(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                  />
                </label>
              </div>
            )}

            {offerType === 'tiered_qty' && (
              <div className="space-y-2 border border-[var(--line)] bg-[var(--ink)] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">Quantity Tiers</span>
                  <button
                    type="button"
                    onClick={() => setTiers((prev) => [...prev, { minQty: 10, discountPercent: 25 }])}
                    className="inline-flex items-center gap-1 text-[var(--cedar)] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Tier
                  </button>
                </div>
                {tiers.map((tier, idx) => (
                  <div key={idx} className="grid grid-cols-5 gap-2 items-center">
                    <input
                      type="number"
                      min="1"
                      value={tier.minQty}
                      onChange={(e) =>
                        setTiers((p) => p.map((x, i) => (i === idx ? { ...x, minQty: Number(e.target.value) } : x)))
                      }
                      aria-label="Min Qty"
                      className="col-span-2 bg-[var(--graphite)] border border-[var(--line)] px-2 py-1.5 font-mono-tabular text-[var(--bone)]"
                    />
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={tier.discountPercent}
                      onChange={(e) =>
                        setTiers((p) =>
                          p.map((x, i) => (i === idx ? { ...x, discountPercent: Number(e.target.value) } : x))
                        )
                      }
                      aria-label="Tier Discount %"
                      className="col-span-2 bg-[var(--graphite)] border border-[var(--line)] px-2 py-1.5 font-mono-tabular text-[var(--bone)]"
                    />
                    <button
                      type="button"
                      onClick={() => setTiers((p) => p.filter((_, i) => i !== idx))}
                      className="p-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {(offerType === 'cart_threshold' || offerType === 'free_shipping') && (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">Minimum Cart Subtotal ($)</span>
                  <input
                    type="number"
                    min="0"
                    value={minCartUsd}
                    onChange={(e) => setMinCartUsd(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                  />
                </label>
                {offerType === 'cart_threshold' && (
                  <label className="space-y-1">
                    <span className="font-mono-tabular uppercase text-[var(--muted)]">Cart Discount (%)</span>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                    />
                  </label>
                )}
              </div>
            )}

            {offerType === 'bundle_deal' && (
              <div className="space-y-3 border border-[var(--line)] bg-[var(--ink)] p-3">
                <label className="block space-y-1">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">Bundle Discount %</span>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={bundlePct}
                    onChange={(e) => setBundlePct(e.target.value)}
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] px-3 py-1.5 font-mono-tabular text-[var(--bone)]"
                  />
                </label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">
                    Select Bundle Products ({bundleIds.length} selected)
                  </span>
                  {products.map((prod) => {
                    const checked = bundleIds.includes(prod.id);
                    return (
                      <label key={prod.id} className="flex items-center gap-2 py-1 text-[var(--bone)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setBundleIds((prev) =>
                              e.target.checked ? [...prev, prod.id] : prev.filter((id) => id !== prod.id)
                            )
                          }
                        />
                        <span className="truncate">{prod.title.en}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="block space-y-1">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Max Discount Cap USD (optional)</span>
              <input
                type="number"
                min="1"
                value={maxDiscUsd}
                onChange={(e) => setMaxDiscUsd(e.target.value)}
                placeholder="No cap"
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
              />
            </label>
          </div>
        )}

        {/* Step 3: Target Scope & Linked Campaign */}
        {step === 3 && (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Target Scope</span>
              <select
                value={targetType}
                onChange={(e) => {
                  const next = e.target.value as OfferTargetType;
                  setTargetType(next);
                  if (next === 'department') setTargetId('fashion');
                  else if (next === 'category') setTargetId(categories[0]?.id || '');
                  else if (next === 'seller') setTargetId(sellers[0]?.id || '');
                  else if (next === 'product') setTargetId(products[0]?.id || '');
                  else setTargetId('');
                }}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              >
                <option value="all">All Marketplace</option>
                <option value="department">Department</option>
                <option value="category">Category</option>
                <option value="seller">Specific Seller Store</option>
                <option value="product">Specific Product</option>
              </select>
            </label>

            {targetType === 'department' && (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              >
                <option value="fashion">fashion</option>
                <option value="electronics">electronics</option>
                <option value="home-gadgets">home-gadgets</option>
              </select>
            )}
            {targetType === 'category' && (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name.en}
                  </option>
                ))}
              </select>
            )}
            {targetType === 'seller' && (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              >
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.en}
                  </option>
                ))}
              </select>
            )}
            {targetType === 'product' && (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title.en}
                  </option>
                ))}
              </select>
            )}

            <label className="block space-y-1">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Link to Campaign (optional)</span>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
              >
                <option value="">None (Standalone Offer)</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title.en} (/{c.slug})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Step 4: Schedule */}
        {step === 4 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Starts At (optional)</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Ends At (optional)</span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
              />
            </label>
          </div>
        )}

        {/* Step 5: Stacking & Funding */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Stacking Rule</span>
                <select
                  value={stackingRule}
                  onChange={(e) => setStackingRule(e.target.value as OfferStackingRule)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
                >
                  <option value="best_only">Best Price Only (Default)</option>
                  <option value="stackable">Stackable With Other Offers</option>
                  <option value="exclusive">Exclusive (Blocks Stacking)</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Priority (Higher Wins)</span>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Funding Attribution</span>
                <select
                  value={fundingSource}
                  onChange={(e) => setFundingSource(e.target.value as OfferFundingSource)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-[var(--bone)]"
                >
                  <option value="platform">100% Platform Funded</option>
                  <option value="seller">100% Seller Funded</option>
                  <option value="shared">Shared Cost Split</option>
                </select>
              </label>
              {fundingSource === 'shared' && (
                <label className="space-y-1">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">Platform Share %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={fundingPlatformPct}
                    onChange={(e) => setFundingPlatformPct(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Step 6: Conflict Check & Publish */}
        {step === 6 && (
          <div className="space-y-4">
            <div className="border border-[var(--line)] bg-[var(--ink)] p-4 space-y-2">
              <p className="font-mono-tabular uppercase text-[var(--muted)]">Promotion Summary</p>
              <p className="text-sm font-bold text-[var(--bone)]">
                {titleEn || 'Untitled Offer'} · <span className="text-[var(--ember)]">{offerType}</span>
              </p>
              <p className="text-[var(--muted)]">
                Scope: {targetType} {targetId ? `(${targetId})` : ''} · Stacking: {stackingRule} · Funding:{' '}
                {fundingSource}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Overlap &amp; Exclusivity Check</span>
              <button
                type="button"
                onClick={() => void runConflictCheck()}
                className="px-3 py-1 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
              >
                {checkingConflicts ? 'Checking...' : 'Re-Check Conflicts'}
              </button>
            </div>

            {conflicts !== null && (
              <div
                className={`border p-3 space-y-1.5 ${
                  conflicts.length === 0 ? 'border-[var(--cedar)] bg-[var(--ink)]' : 'border-[var(--gold)] bg-[var(--ink)]'
                }`}
              >
                {conflicts.length === 0 ? (
                  <p className="flex items-center gap-2 text-[var(--cedar)]">
                    <CheckCircle2 className="w-4 h-4" /> No conflicting offers detected on this scope.
                  </p>
                ) : (
                  conflicts.map((c) => (
                    <div key={c.conflictingOfferId} className="flex items-start gap-2 text-[var(--gold)]">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">{c.conflictingTitle}</p>
                        <p className="text-[11px] text-[var(--muted)]">{c.reason}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Wizard Navigation Footer */}
        <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4 | 5 | 6)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[var(--line)] text-[var(--bone)] disabled:opacity-40 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>

          {step < 6 ? (
            <button
              type="button"
              onClick={() => {
                const next = (step + 1) as 1 | 2 | 3 | 4 | 5 | 6;
                setStep(next);
                if (next === 6) void runConflictCheck();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
            >
              Next <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handlePublish()}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[var(--cedar)] text-[#17181B] font-bold uppercase cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {submitting ? 'Publishing...' : 'Publish Offer'}
            </button>
          )}
        </div>
      </div>

      {/* Right: Offers & Seller Moderation Queue */}
      <div className="hairline-cell lg:col-span-6 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-[var(--bone)]">
            Active Offers &amp; Seller Queue ({offers.length})
          </h3>
          <span className="text-[11px] font-mono-tabular text-[var(--muted)]">
            <Layers className="w-3.5 h-3.5 inline me-1" /> Sorted by priority
          </span>
        </div>

        {offers.length === 0 ? (
          <EmptyState
            title="No offers created yet"
            description="Create a marketplace offer with the 6-step wizard or review seller-submitted promotions here."
          />
        ) : (
          <div className="divide-y divide-[var(--line)] border border-[var(--line)] max-h-[680px] overflow-y-auto">
            {offers.map((off) => (
              <div key={off.id} className="p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--ink)] text-xs">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
                    <StatusLabel
                      status={off.approvalStatus}
                      tone={
                        off.approvalStatus === 'approved'
                          ? 'cedar'
                          : off.approvalStatus === 'pending'
                            ? 'gold'
                            : 'ember'
                      }
                    />
                    <span className="text-[var(--ember)] font-bold uppercase">{off.offerType.replace(/_/g, ' ')}</span>
                    <span className="text-[var(--bone)]">
                      {off.offerType === 'fixed_usd_cents'
                        ? `-$${(off.discountValue / 100).toFixed(2)}`
                        : off.offerType === 'free_shipping'
                          ? 'FREE SHIP'
                          : `-${off.discountValue}%`}
                    </span>
                    <span className="text-[var(--muted)]">
                      {off.stackingRule} · P{off.priority} · {off.fundingSource}
                    </span>
                    {off.sellerName && <span className="text-[var(--cyan)]">by {off.sellerName.en}</span>}
                  </div>
                  <p className="text-sm font-medium text-[var(--bone)]">{off.title.en}</p>
                  <p className="text-[11px] font-mono-tabular text-[var(--muted)]">
                    Scope: {off.targetType}
                    {off.targetId ? `(${off.targetId.slice(0, 12)})` : ''} ·{' '}
                    {off.startsAt || 'Now'} → {off.endsAt || 'Indefinite'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {off.approvalStatus !== 'approved' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/offers/${off.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ approvalStatus: 'approved', active: true }),
                        });
                        showToast('Offer approved', 'success');
                        await onReload();
                        await refreshBootstrap();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--cedar)] text-[var(--cedar)] cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Approve</span>
                    </button>
                  )}
                  {off.approvalStatus !== 'rejected' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/offers/${off.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ approvalStatus: 'rejected', active: false }),
                        });
                        showToast('Offer rejected', 'info');
                        await onReload();
                        await refreshBootstrap();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      <span>Reject</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/offers/${off.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ active: !off.active }),
                      });
                      await onReload();
                      await refreshBootstrap();
                    }}
                    className={`px-2.5 py-1 border cursor-pointer ${
                      off.active ? 'border-[var(--cedar)] text-[var(--cedar)]' : 'border-[var(--line)] text-[var(--muted)]'
                    }`}
                  >
                    {off.active ? 'Active' : 'Paused'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/offers/${off.id}`, { method: 'DELETE' });
                      showToast('Offer deleted', 'info');
                      await onReload();
                      await refreshBootstrap();
                    }}
                    aria-label="Delete offer"
                    className="p-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
