import React, { useEffect, useState } from 'react';
import { ArrowRight, Tag, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { BannerBgToken, BannerPageScope, OfferBanner } from '../shared/types.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';

const trackedImpressions = new Set<string>();

const TOKEN_STYLES: Record<BannerBgToken, { border: string; accent: string }> = {
  graphite: { border: 'border-[var(--line)] bg-[var(--graphite)]', accent: 'var(--ember)' },
  ember: { border: 'border-[var(--ember)] bg-[var(--ink)]', accent: 'var(--ember)' },
  cedar: { border: 'border-[var(--cedar)] bg-[var(--ink)]', accent: 'var(--cedar)' },
  gold: { border: 'border-[var(--gold)] bg-[var(--ink)]', accent: 'var(--gold)' },
  cyan: { border: 'border-[var(--cyan)] bg-[var(--ink)]', accent: 'var(--cyan)' },
  sand: { border: 'border-[var(--sand)] bg-[var(--ink)]', accent: 'var(--sand)' },
};

export function OfferBannerStrip({ page }: { page: BannerPageScope }) {
  const { banners, locale, navigate } = useMarketplace();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const matching = banners
    .filter((b) => b.pages.includes(page) && !dismissedIds.includes(b.id))
    .sort((a, b) => b.priority - a.priority);

  useEffect(() => {
    for (const banner of matching) {
      const key = `${page}:${banner.id}`;
      if (!trackedImpressions.has(key)) {
        trackedImpressions.add(key);
        void fetch(`/api/banners/${encodeURIComponent(banner.id)}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'impression' }),
          keepalive: true,
        }).catch(() => {});
      }
    }
  }, [page, matching]);

  if (matching.length === 0) return null;

  const handleBannerClick = (banner: OfferBanner) => {
    void fetch(`/api/banners/${encodeURIComponent(banner.id)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'click' }),
      keepalive: true,
    }).catch(() => {});

    const target = banner.targetUrl || '/catalog';
    if (target.startsWith('http://') || target.startsWith('https://')) {
      window.location.assign(target);
    } else {
      navigate(target);
    }
  };

  return (
    <div className="space-y-2" aria-label={locale === 'ar' ? 'العروض النشطة' : 'Active promotional banners'}>
      <AnimatePresence initial={false}>
        {matching.map((banner) => {
          const styleSpec = TOKEN_STYLES[banner.bgToken] || TOKEN_STYLES.graphite;
          const ctaText = banner.ctaLabel?.[locale]?.trim() || (locale === 'ar' ? 'عرض العرض' : 'View Offer');

          return (
            <motion.div
              key={banner.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={`border ${styleSpec.border} px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs`}
              style={{ borderInlineStartWidth: '3px', borderInlineStartColor: styleSpec.accent }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Tag className="w-3.5 h-3.5 shrink-0" style={{ color: styleSpec.accent }} aria-hidden="true" />
                <p className="text-[var(--bone)] font-medium truncate">
                  {banner.title[locale] || banner.title.en}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => handleBannerClick(banner)}
                  className="editorial-link font-mono-tabular font-semibold uppercase tracking-wider cursor-pointer"
                  style={{ color: styleSpec.accent }}
                >
                  <span>{ctaText}</span>
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedIds((prev) => [...prev, banner.id])}
                  aria-label={locale === 'ar' ? 'إغلاق الإعلان' : 'Dismiss banner'}
                  className="p-1 text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
