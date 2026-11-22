import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { BannerBgToken, BannerPageScope, MarketingPopup, PopupFrequency } from '../shared/types.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { matchesMarketingTargeting, useIsMobileViewport } from './OfferBannerStrip.tsx';

function getPageScopeFromRoute(route: string): BannerPageScope | null {
  const path = route.split('?')[0] || '/';
  if (path === '/' || path === '') return 'home';
  if (path === '/catalog') return 'catalog';
  if (path === '/checkout') return 'checkout';
  if (path.startsWith('/store/')) return 'store';
  return null;
}

function isPopupBlockedByFrequencyCap(popupId: string, cap: PopupFrequency): boolean {
  try {
    if (cap === 'once_per_session') {
      return sessionStorage.getItem(`nl_pop_sess_${popupId}`) === '1';
    }
    const raw = localStorage.getItem(`nl_pop_seen_${popupId}`);
    if (!raw) return false;
    if (cap === 'once_ever') return true;
    const seenAt = Number(raw);
    if (!Number.isFinite(seenAt)) return false;
    const elapsed = Date.now() - seenAt;
    if (cap === 'once_per_day') return elapsed < 86_400_000;
    if (cap === 'once_per_week') return elapsed < 7 * 86_400_000;
  } catch {
    return false;
  }
  return false;
}

function markPopupSeen(popupId: string, cap: PopupFrequency) {
  try {
    if (cap === 'once_per_session') {
      sessionStorage.setItem(`nl_pop_sess_${popupId}`, '1');
    }
    localStorage.setItem(`nl_pop_seen_${popupId}`, String(Date.now()));
  } catch {
    // ignore storage errors
  }
}

const POPUP_ACCENT: Record<BannerBgToken, string> = {
  graphite: 'border-[var(--line)]',
  ember: 'border-[var(--ember)]',
  cedar: 'border-[var(--cedar)]',
  gold: 'border-[var(--gold)]',
  cyan: 'border-[var(--cyan)]',
  sand: 'border-[var(--sand)]',
};

export function MarketingOverlayManager() {
  const { popups, banners, route, locale, authUser, cart, navigate, apiFetch, showToast } = useMarketplace();
  const isMobile = useIsMobileViewport();
  const pageScope = getPageScopeFromRoute(route);

  const [activePopup, setActivePopup] = useState<MarketingPopup | null>(null);
  const [dismissedFloatingIds, setDismissedFloatingIds] = useState<string[]>([]);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [submittingNewsletter, setSubmittingNewsletter] = useState(false);
  const [copiedCoupon, setCopiedCoupon] = useState(false);

  // Floating strip banners for current page
  const floatingBanners = useMemo(() => {
    if (!pageScope) return [];
    return banners
      .filter(
        (b) =>
          b.placement === 'floating_strip' &&
          b.pages.includes(pageScope) &&
          !dismissedFloatingIds.includes(b.id) &&
          matchesMarketingTargeting(b, locale, Boolean(authUser), isMobile)
      )
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 1);
  }, [banners, pageScope, dismissedFloatingIds, locale, authUser, isMobile]);

  useEffect(() => {
    for (const b of floatingBanners) {
      void fetch(`/api/banners/${encodeURIComponent(b.id)}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'impression' }),
        keepalive: true,
      }).catch(() => {});
    }
  }, [floatingBanners]);

  // Candidate popups eligible on current route + audience + frequency cap
  const eligiblePopups = useMemo(() => {
    if (!pageScope) return [];
    return popups.filter((p) => {
      if (!p.active) return false;
      if (!p.pages.includes(pageScope)) return false;
      if (!matchesMarketingTargeting(p, locale, Boolean(authUser), isMobile)) return false;
      if (isPopupBlockedByFrequencyCap(p.id, p.frequencyCap)) return false;
      if (p.triggerType === 'cart_abandon' && cart.length === 0) return false;
      return true;
    });
  }, [popups, pageScope, locale, authUser, isMobile, cart.length]);

  useEffect(() => {
    if (activePopup || eligiblePopups.length === 0) return;

    const triggerPopup = (p: MarketingPopup) => {
      if (isPopupBlockedByFrequencyCap(p.id, p.frequencyCap)) return;
      markPopupSeen(p.id, p.frequencyCap);
      setActivePopup(p);
      setCopiedCoupon(false);
      void fetch(`/api/popups/${encodeURIComponent(p.id)}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'impression' }),
        keepalive: true,
      }).catch(() => {});
    };

    const cleanups: Array<() => void> = [];

    for (const p of eligiblePopups) {
      if (p.triggerType === 'immediate') {
        const t = window.setTimeout(() => triggerPopup(p), 250);
        cleanups.push(() => window.clearTimeout(t));
        break;
      }
      if (p.triggerType === 'delay_seconds' || p.triggerType === 'cart_abandon') {
        const ms = Math.max(1, p.triggerValue || 5) * 1000;
        const t = window.setTimeout(() => triggerPopup(p), ms);
        cleanups.push(() => window.clearTimeout(t));
        break;
      }
      if (p.triggerType === 'scroll_percent') {
        const threshold = Math.max(10, Math.min(95, p.triggerValue || 40));
        const onScroll = () => {
          const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
          const pct = (window.scrollY / maxScroll) * 100;
          if (pct >= threshold) triggerPopup(p);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        cleanups.push(() => window.removeEventListener('scroll', onScroll));
      }
      if (p.triggerType === 'exit_intent' && !isMobile) {
        const onMouseLeave = (ev: MouseEvent) => {
          if (ev.clientY <= 12) triggerPopup(p);
        };
        document.documentElement.addEventListener('mouseleave', onMouseLeave);
        cleanups.push(() => document.documentElement.removeEventListener('mouseleave', onMouseLeave));
      }
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [eligiblePopups, activePopup, isMobile]);

  const handleClosePopup = () => {
    if (activePopup) {
      void fetch(`/api/popups/${encodeURIComponent(activePopup.id)}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'dismissal' }),
        keepalive: true,
      }).catch(() => {});
    }
    setActivePopup(null);
  };

  const handlePopupCta = () => {
    if (!activePopup) return;
    void fetch(`/api/popups/${encodeURIComponent(activePopup.id)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'conversion' }),
      keepalive: true,
    }).catch(() => {});
    const target = activePopup.targetUrl || '/catalog';
    setActivePopup(null);
    if (target.startsWith('http://') || target.startsWith('https://')) {
      window.location.assign(target);
    } else {
      navigate(target);
    }
  };

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePopup || !newsletterEmail.trim().includes('@')) return;
    setSubmittingNewsletter(true);
    try {
      await apiFetch('/api/newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          email: newsletterEmail.trim(),
          locale,
          source: `popup:${activePopup.id}`,
        }),
      });
      void fetch(`/api/popups/${encodeURIComponent(activePopup.id)}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'conversion' }),
        keepalive: true,
      }).catch(() => {});
      setNewsletterEmail('');
      showToast(locale === 'ar' ? 'تم الاشتراك بنجاح!' : 'Subscribed successfully!', 'success');
      setActivePopup(null);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmittingNewsletter(false);
    }
  };

  return (
    <>
      {/* Floating Bottom-Edge Strip Banner */}
      <AnimatePresence>
        {floatingBanners.map((banner) => (
          <motion.div
            key={banner.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-16 md:bottom-6 start-4 md:start-8 z-40 max-w-sm border border-[var(--ember)] bg-[var(--graphite)] p-3.5 text-xs space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-[var(--bone)]">
                {banner.title[locale] || banner.title.en}
              </p>
              {banner.dismissible !== false && (
                <button
                  type="button"
                  onClick={() => setDismissedFloatingIds((prev) => [...prev, banner.id])}
                  aria-label="Dismiss floating offer"
                  className="text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                void fetch(`/api/banners/${encodeURIComponent(banner.id)}/track`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ event: 'click' }),
                  keepalive: true,
                }).catch(() => {});
                navigate(banner.targetUrl || '/catalog');
              }}
              className="editorial-link font-mono-tabular font-semibold uppercase text-[var(--ember)] cursor-pointer"
            >
              <span>{banner.ctaLabel?.[locale] || (locale === 'ar' ? 'تسوق الآن' : 'Shop Now')}</span>
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Triggered Marketing Popup with Frequency Cap */}
      <AnimatePresence>
        {activePopup && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={`w-full max-w-md border-2 ${POPUP_ACCENT[activePopup.bgToken] || 'border-[var(--ember)]'} bg-[var(--ink)] overflow-hidden`}
            >
              {activePopup.imageUrl && (
                <div className="aspect-[16/9] border-b border-[var(--line)] bg-[var(--graphite)] overflow-hidden">
                  <img
                    src={activePopup.imageUrl}
                    alt={activePopup.title[locale] || activePopup.title.en}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--ember)]">
                      <Sparkles className="w-3 h-3" />
                      <span>{activePopup.popupType.replace('_', ' ')}</span>
                    </span>
                    <h2 className="font-display text-2xl font-bold text-[var(--bone)]">
                      {activePopup.title[locale] || activePopup.title.en}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleClosePopup}
                    aria-label={locale === 'ar' ? 'إغلاق النافذة' : 'Close popup'}
                    className="p-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  {activePopup.body[locale] || activePopup.body.en}
                </p>

                {activePopup.couponCode && (
                  <div className="border border-[var(--gold)] bg-[var(--graphite)] px-3 py-2.5 flex items-center justify-between gap-2 text-xs font-mono-tabular">
                    <div>
                      <span className="text-[var(--muted)] block text-[10px] uppercase">
                        {locale === 'ar' ? 'رمز الخصم' : 'PROMO CODE'}
                      </span>
                      <span className="text-sm font-bold text-[var(--gold)]">{activePopup.couponCode}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(activePopup.couponCode || '');
                        setCopiedCoupon(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--gold)] cursor-pointer"
                    >
                      {copiedCoupon ? <Check className="w-3 h-3 text-[var(--cedar)]" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCoupon ? (locale === 'ar' ? 'تم النسخ' : 'Copied') : locale === 'ar' ? 'نسخ' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                {activePopup.showNewsletterForm ? (
                  <form onSubmit={handleNewsletterSubmit} className="space-y-2.5">
                    <input
                      type="email"
                      required
                      value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                      placeholder={locale === 'ar' ? 'أدخل بريدك الإلكتروني...' : 'Enter your email address...'}
                      className="w-full bg-[var(--graphite)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                    />
                    <button
                      type="submit"
                      disabled={submittingNewsletter}
                      className="w-full py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                    >
                      {submittingNewsletter
                        ? '...'
                        : activePopup.ctaLabel[locale] || activePopup.ctaLabel.en}
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={handlePopupCta}
                    className="w-full py-3 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{activePopup.ctaLabel[locale] || activePopup.ctaLabel.en}</span>
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
