import React, { useEffect, useState } from 'react';
import { ArrowRight, Tag, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  BannerBgToken,
  BannerPageScope,
  BannerPlacementType,
  OfferBanner,
} from '../shared/types.ts';
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

export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

export function matchesMarketingTargeting(
  item: {
    audience?: string;
    deviceTarget?: string;
  },
  locale: 'en' | 'ar',
  isLoggedIn: boolean,
  isMobileViewport: boolean
): boolean {
  const aud = item.audience || 'all';
  if (aud === 'guest' && isLoggedIn) return false;
  if (aud === 'logged_in' && !isLoggedIn) return false;
  if (aud === 'arabic' && locale !== 'ar') return false;
  if (aud === 'english' && locale !== 'en') return false;

  const dev = item.deviceTarget || 'all';
  if (dev === 'mobile' && !isMobileViewport) return false;
  if (dev === 'desktop' && isMobileViewport) return false;
  return true;
}

export function OfferBannerStrip({
  page,
  placement = 'page_strip',
  categorySlug,
}: {
  page: BannerPageScope;
  placement?: BannerPlacementType;
  categorySlug?: string;
}) {
  const { banners, locale, navigate, authUser } = useMarketplace();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const isMobile = useIsMobileViewport();

  const matching = banners
    .filter((b) => {
      if ((b.placement || 'page_strip') !== placement) return false;
      if (!b.pages.includes(page)) return false;
      if (dismissedIds.includes(b.id)) return false;
      if (placement === 'category_header' && b.categorySlug && categorySlug && b.categorySlug !== categorySlug) {
        return false;
      }
      if (placement === 'category_header' && b.categorySlug && !categorySlug) {
        return false;
      }
      return matchesMarketingTargeting(b, locale, Boolean(authUser), isMobile);
    })
    .sort((a, b) => b.priority - a.priority);

  useEffect(() => {
    for (const banner of matching) {
      const key = `${page}:${placement}:${banner.id}`;
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
  }, [page, placement, matching]);

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
          const isInlineCard = placement === 'inline_card' || placement === 'category_header';

          return (
            <motion.div
              key={banner.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={`border ${styleSpec.border} ${isInlineCard ? 'p-4' : 'px-4 py-2.5'} flex flex-wrap items-center justify-between gap-3 text-xs border-s-[3px]`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {banner.imageUrl ? (
                  <img
                    src={banner.imageUrl}
                    alt={banner.title[locale] || banner.title.en}
                    className="w-10 h-10 object-cover border border-[var(--line)] shrink-0"
                  />
                ) : (
                  <Tag className="w-3.5 h-3.5 shrink-0 text-[var(--ember)]" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  {placement === 'category_header' && (
                    <span className="block text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--muted)]">
                      {locale === 'ar' ? 'عرض القسم المميز' : 'Featured Category Offer'}
                    </span>
                  )}
                  <p className="text-[var(--bone)] font-medium truncate">
                    {banner.title[locale] || banner.title.en}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => handleBannerClick(banner)}
                  className="editorial-link font-mono-tabular font-semibold uppercase tracking-wider text-[var(--ember)] cursor-pointer"
                >
                  <span>{ctaText}</span>
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                </button>
                {banner.dismissible !== false && (
                  <button
                    type="button"
                    onClick={() => setDismissedIds((prev) => [...prev, banner.id])}
                    aria-label={locale === 'ar' ? 'إغلاق الإعلان' : 'Dismiss banner'}
                    className="p-1 text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
