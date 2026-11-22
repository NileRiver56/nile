import React from 'react';
import { BarChart3, Mail, MousePointerClick, RefreshCw, Tag, Zap } from 'lucide-react';
import type { MarketingAnalyticsSummary } from '../../shared/types.ts';
import { formatBpsAsPercent } from '../../shared/money.ts';
import { EmptyState, PriceDisplay } from '../HairlineUI.tsx';

export function MarketingAnalyticsPanel({
  analytics,
  onReload,
}: {
  analytics?: MarketingAnalyticsSummary;
  onReload: () => Promise<void>;
}) {
  if (!analytics) {
    return (
      <EmptyState
        title="Marketing analytics loading"
        description="No analytics snapshot loaded yet."
        actionLabel="Refresh Analytics"
        onAction={() => void onReload()}
      />
    );
  }

  const { kpis } = analytics;
  const promoSharePct =
    kpis.totalOrderGmvUsdCents > 0
      ? ((kpis.promoAttributedGmvUsdCents * 100) / kpis.totalOrderGmvUsdCents).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono-tabular uppercase text-[var(--cyan)]">
              <BarChart3 className="w-4 h-4" />
              <span>Real-Time Revenue Attribution &amp; Channel Telemetry</span>
            </div>
            <h3 className="font-display text-lg font-bold text-[var(--bone)] mt-1">
              Marketing Performance Overview
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void onReload()}
            className="inline-flex items-center gap-2 border border-[var(--line)] bg-[var(--ink)] px-3.5 py-2 text-xs font-semibold text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Attribution</span>
          </button>
        </div>

        <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className="hairline-cell p-4 space-y-1">
            <div className="text-[11px] font-mono-tabular uppercase text-[var(--muted)]">Total Marketplace GMV</div>
            <PriceDisplay usdCents={kpis.totalOrderGmvUsdCents} size="lg" />
            <div className="text-[11px] font-mono-tabular text-[var(--muted)]">
              {kpis.couponOrdersCount} coupon-backed order(s)
            </div>
          </div>

          <div className="hairline-cell p-4 space-y-1">
            <div className="text-[11px] font-mono-tabular uppercase text-[var(--muted)]">Promo-Attributed GMV</div>
            <PriceDisplay usdCents={kpis.promoAttributedGmvUsdCents} size="lg" />
            <div className="text-[11px] font-mono-tabular text-[var(--cedar)]">
              {promoSharePct}% of total GMV
            </div>
          </div>

          <div className="hairline-cell p-4 space-y-1">
            <div className="text-[11px] font-mono-tabular uppercase text-[var(--muted)]">Total Discounts Granted</div>
            <PriceDisplay usdCents={kpis.totalDiscountsGrantedUsdCents} size="lg" />
            <div className="text-[11px] font-mono-tabular text-[var(--gold)]">
              Server-enforced integer minor units
            </div>
          </div>

          <div className="hairline-cell p-4 space-y-1">
            <div className="text-[11px] font-mono-tabular uppercase text-[var(--muted)]">Banners &amp; Popups CTR</div>
            <div className="font-mono-tabular text-2xl font-bold text-[var(--bone)]">
              {formatBpsAsPercent(kpis.bannerCtrBps)}
            </div>
            <div className="text-[11px] font-mono-tabular text-[var(--muted)]">
              {kpis.bannerClicks}/{kpis.bannerImpressions} banner clicks · {kpis.bannerBotFiltered} bot events filtered
            </div>
          </div>
        </div>
      </div>

      {/* Coupon & Campaign Attribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[var(--gold)]" />
            <h4 className="font-display text-base font-bold text-[var(--bone)]">
              Coupon Revenue Attribution ({analytics.couponAttribution.length})
            </h4>
          </div>
          {analytics.couponAttribution.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No coupons created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[var(--muted)] font-mono-tabular uppercase">
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Orders</th>
                    <th className="py-2 pr-3">Redemptions</th>
                    <th className="py-2 pr-3">Attributed GMV</th>
                    <th className="py-2">Discounts</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.couponAttribution.map((c) => (
                    <tr key={c.code} className="border-b border-[var(--line)]/50 font-mono-tabular">
                      <td className="py-2 pr-3 font-bold text-[var(--bone)]">{c.code}</td>
                      <td className="py-2 pr-3">{c.ordersCount}</td>
                      <td className="py-2 pr-3">
                        {c.usedCount}
                        {c.maxUses ? `/${c.maxUses}` : ''}
                      </td>
                      <td className="py-2 pr-3 text-[var(--cedar)]">${(c.revenueUsdCents / 100).toFixed(2)}</td>
                      <td className="py-2 text-[var(--gold)]">${(c.discountUsdCents / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--ember)]" />
            <h4 className="font-display text-base font-bold text-[var(--bone)]">
              Campaign &amp; Flash Sale Attribution
            </h4>
          </div>
          {analytics.campaignAttribution.length === 0 && analytics.flashSalePerformance.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No campaigns or flash sales created yet.</p>
          ) : (
            <div className="space-y-4">
              {analytics.campaignAttribution.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-[var(--muted)] font-mono-tabular uppercase">
                        <th className="py-1.5 pr-3">Campaign</th>
                        <th className="py-1.5 pr-3">Status</th>
                        <th className="py-1.5 pr-3">Orders</th>
                        <th className="py-1.5">Attributed GMV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.campaignAttribution.map((cmp) => (
                        <tr key={cmp.id} className="border-b border-[var(--line)]/50">
                          <td className="py-1.5 pr-3 text-[var(--bone)]">{cmp.title.en}</td>
                          <td className="py-1.5 pr-3 font-mono-tabular uppercase text-[var(--cyan)]">{cmp.status}</td>
                          <td className="py-1.5 pr-3 font-mono-tabular">{cmp.ordersCount}</td>
                          <td className="py-1.5 font-mono-tabular text-[var(--cedar)]">
                            ${(cmp.revenueUsdCents / 100).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {analytics.flashSalePerformance.length > 0 && (
                <div className="overflow-x-auto pt-2 border-t border-[var(--line)]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-[var(--muted)] font-mono-tabular uppercase">
                        <th className="py-1.5 pr-3">Flash Sale</th>
                        <th className="py-1.5 pr-3">Status</th>
                        <th className="py-1.5 pr-3">Sold / Cap</th>
                        <th className="py-1.5">Est. Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.flashSalePerformance.map((fs) => (
                        <tr key={fs.id} className="border-b border-[var(--line)]/50">
                          <td className="py-1.5 pr-3 text-[var(--bone)]">{fs.title.en}</td>
                          <td className="py-1.5 pr-3 font-mono-tabular uppercase text-[var(--ember)]">{fs.status}</td>
                          <td className="py-1.5 pr-3 font-mono-tabular">
                            {fs.soldCount} / {fs.stockCapTotal}
                          </td>
                          <td className="py-1.5 font-mono-tabular text-[var(--cedar)]">
                            ${(fs.estimatedRevenueUsdCents / 100).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Placements & Email Channel Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <MousePointerClick className="w-4 h-4 text-[var(--cyan)]" />
            <h4 className="font-display text-base font-bold text-[var(--bone)]">
              Banners, Popups &amp; Featured Slots Telemetry
            </h4>
          </div>
          <div className="text-xs font-mono-tabular text-[var(--muted)] flex flex-wrap gap-4 border-b border-[var(--line)] pb-2">
            <span>Popup Impr: {kpis.popupImpressions}</span>
            <span className="text-[var(--cedar)]">Conversions: {kpis.popupConversions} ({formatBpsAsPercent(kpis.popupConversionBps)})</span>
            <span>Dismissals: {kpis.popupDismissals}</span>
          </div>
          {analytics.placementsTelemetry.banners.length === 0 &&
          analytics.placementsTelemetry.popups.length === 0 &&
          analytics.placementsTelemetry.featuredSlots.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No placement impressions recorded yet.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {analytics.placementsTelemetry.banners.slice(0, 6).map((b) => (
                <div key={b.id} className="border border-[var(--line)] bg-[var(--ink)] p-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-[var(--bone)] font-semibold">{b.title.en}</div>
                    <div className="text-[11px] font-mono-tabular text-[var(--muted)]">Banner · {b.placement}</div>
                  </div>
                  <div className="font-mono-tabular text-right">
                    <div className="text-[var(--cedar)]">
                      {b.clicks}/{b.impressions} ({formatBpsAsPercent(b.ctrBps)})
                    </div>
                    <div className="text-[10px] text-[var(--muted)]">Bot filtered: {b.botFilteredCount}</div>
                  </div>
                </div>
              ))}
              {analytics.placementsTelemetry.featuredSlots.slice(0, 4).map((f) => (
                <div key={f.id} className="border border-[var(--line)] bg-[var(--ink)] p-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-[var(--bone)] font-semibold">{f.slotKey}</div>
                    <div className="text-[11px] font-mono-tabular text-[var(--muted)]">Featured · {f.targetType}</div>
                  </div>
                  <div className="font-mono-tabular text-[var(--cyan)]">
                    {f.clicks}/{f.impressions} ({formatBpsAsPercent(f.ctrBps)})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[var(--ember)]" />
            <h4 className="font-display text-base font-bold text-[var(--bone)]">
              Email Broadcasts &amp; Automation Delivery
            </h4>
          </div>
          <div className="text-xs font-mono-tabular text-[var(--muted)] flex flex-wrap gap-4 border-b border-[var(--line)] pb-2">
            <span className="text-[var(--cedar)]">Delivered: {kpis.emailDeliveredCount}</span>
            <span className="text-[var(--crimson)]">Failed/Unconfigured: {kpis.emailFailedCount}</span>
            <span className="text-[var(--gold)]">Opt-Outs Skipped: {kpis.emailUnsubscribedSkipped}</span>
          </div>
          {analytics.emailPerformance.campaigns.length === 0 && analytics.emailPerformance.automations.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No email campaigns or automated flows recorded yet.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {analytics.emailPerformance.campaigns.map((c) => (
                <div key={c.id} className="border border-[var(--line)] bg-[var(--ink)] p-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-[var(--bone)] font-semibold">{c.name}</div>
                    <div className="text-[11px] font-mono-tabular uppercase text-[var(--cyan)]">{c.status}</div>
                  </div>
                  <div className="font-mono-tabular text-right">
                    <span className="text-[var(--cedar)]">Sent {c.sentCount}</span> ·{' '}
                    <span className="text-[var(--crimson)]">Fail {c.failedCount}</span> ·{' '}
                    <span className="text-[var(--gold)]">Skip {c.unsubscribedCount}</span>
                  </div>
                </div>
              ))}
              {analytics.emailPerformance.automations.map((f) => (
                <div key={f.id} className="border border-[var(--line)] bg-[var(--ink)] p-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-[var(--bone)] font-semibold">{f.name.en}</div>
                    <div className="text-[11px] font-mono-tabular text-[var(--muted)]">{f.triggerType}</div>
                  </div>
                  <div className="font-mono-tabular">
                    Triggered {f.totalTriggered} · <span className="text-[var(--cedar)]">Sent {f.totalSent}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
