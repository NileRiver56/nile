import React, { useEffect, useMemo } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { FeaturedSlotKey } from '../shared/types.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { PriceDisplay, ResilientImage } from './HairlineUI.tsx';

const trackedFeatured = new Set<string>();

export function FeaturedPlacementStrip({
  slots,
  headingEn,
  headingAr,
}: {
  slots: FeaturedSlotKey[];
  headingEn?: string;
  headingAr?: string;
}) {
  const { featuredPlacements, products, sellers, locale, navigate } = useMarketplace();

  const matching = useMemo(() => {
    return featuredPlacements
      .filter((fp) => fp.active && slots.includes(fp.slotKey))
      .sort((a, b) => b.priority - a.priority);
  }, [featuredPlacements, slots]);

  useEffect(() => {
    for (const fp of matching) {
      if (!trackedFeatured.has(fp.id)) {
        trackedFeatured.add(fp.id);
        void fetch(`/api/featured-placements/${encodeURIComponent(fp.id)}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'impression' }),
          keepalive: true,
        }).catch(() => {});
      }
    }
  }, [matching]);

  if (matching.length === 0) return null;

  const trackAndNavigate = (placementId: string, to: string) => {
    void fetch(`/api/featured-placements/${encodeURIComponent(placementId)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'click' }),
      keepalive: true,
    }).catch(() => {});
    navigate(to);
  };

  return (
    <section className="space-y-3" aria-label={locale === 'ar' ? 'ترشيحات مميزة' : 'Featured Placements'}>
      <div className="flex items-center justify-between gap-2 text-xs font-mono-tabular uppercase tracking-wider text-[var(--gold)]">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{locale === 'ar' ? headingAr || 'اختيارات مميزة برعاية' : headingEn || 'Featured & Sponsored'}</span>
        </span>
        <span className="text-[var(--muted)]">{matching.length}</span>
      </div>

      <div className="hairline-grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {matching.map((fp) => {
          if (fp.targetType === 'product') {
            const product = products.find((p) => p.id === fp.targetId);
            if (!product) return null;
            const seller = sellers.find((s) => s.id === product.sellerId);
            return (
              <button
                key={fp.id}
                type="button"
                onClick={() => trackAndNavigate(fp.id, `/product/${product.slug}`)}
                className="hairline-cell p-4 text-start flex gap-4 hover:bg-[var(--ink)] transition-colors cursor-pointer"
              >
                <div className="w-20 h-20 border border-[var(--line)] bg-[var(--ink)] shrink-0 overflow-hidden">
                  <ResilientImage
                    src={product.images[0] || ''}
                    alt={product.title[locale] || product.title.en}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <span className="inline-block px-1.5 py-0.5 border border-[var(--gold)] text-[10px] font-mono-tabular uppercase text-[var(--gold)]">
                    {fp.badgeText[locale] || fp.badgeText.en}
                  </span>
                  <p className="text-sm font-semibold text-[var(--bone)] truncate">
                    {product.title[locale] || product.title.en}
                  </p>
                  {seller && (
                    <p className="text-xs text-[var(--muted)] truncate">{seller.name[locale] || seller.name.en}</p>
                  )}
                  <PriceDisplay
                    usdCents={product.basePriceUsdCents}
                    compareAtUsdCents={product.compareAtUsdCents}
                    size="sm"
                  />
                </div>
              </button>
            );
          }

          const seller = sellers.find((s) => s.id === fp.targetId);
          if (!seller) return null;
          return (
            <button
              key={fp.id}
              type="button"
              onClick={() => trackAndNavigate(fp.id, `/store/${seller.slug}`)}
              className="hairline-cell p-4 text-start flex items-center justify-between gap-4 hover:bg-[var(--ink)] transition-colors cursor-pointer"
            >
              <div className="min-w-0 space-y-1.5">
                <span className="inline-block px-1.5 py-0.5 border border-[var(--gold)] text-[10px] font-mono-tabular uppercase text-[var(--gold)]">
                  {fp.badgeText[locale] || fp.badgeText.en}
                </span>
                <p className="font-display text-lg font-bold text-[var(--bone)] truncate">
                  {seller.name[locale] || seller.name.en}
                </p>
                <p className="text-xs text-[var(--muted)] truncate">
                  {seller.tagline[locale] || seller.tagline.en}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--gold)] shrink-0 rtl:rotate-180" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
