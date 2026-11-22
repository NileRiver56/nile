import React, { useState } from 'react';
import type { Locale, SiteChromeSettings } from '../shared/types.ts';
import { getCopy } from '../shared/i18n.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';

export function Footer({
  previewLocale,
  previewChrome,
  previewMode = false,
}: {
  previewLocale?: Locale;
  previewChrome?: SiteChromeSettings;
  previewMode?: boolean;
} = {}) {
  const ctx = useMarketplace();
  const locale = previewLocale ?? ctx.locale;
  const chrome = previewChrome ?? ctx.siteChrome;
  const t = previewLocale ? getCopy(previewLocale) : ctx.t;
  const { navigate, showToast, apiFetch } = ctx;
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const safeNavigate = (to: string) => {
    if (!previewMode) navigate(to);
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (previewMode) return;
    if (!email.trim() || !email.includes('@')) {
      showToast(locale === 'ar' ? 'أدخل بريداً إلكترونياً صحيحاً' : 'Enter a valid email address', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), locale, source: 'footer' }),
      });
      setEmail('');
      showToast(locale === 'ar' ? 'تم الاشتراك في النشرة الأسبوعية' : 'Subscribed to weekly dispatches', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = chrome.footerColumns || [];

  return (
    <footer className="border-t border-[var(--line)] bg-[var(--ink)] pb-16 md:pb-0">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-12">
        <div className="hairline-grid grid-cols-1 md:grid-cols-12">
          <div className="hairline-cell p-6 md:col-span-4">
            <span className="font-display text-2xl font-bold text-[var(--bone)]">{t.brand}</span>
            <span className="heading-dash" aria-hidden="true" />
            <p className="mt-4 text-sm text-[var(--muted)] max-w-sm">
              {chrome.footerNote?.[locale] || chrome.footerNote?.en}
            </p>
            {chrome.paymentBadges && chrome.paymentBadges.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {chrome.paymentBadges.map((badge, i) => (
                  <span
                    key={i}
                    className="border border-[var(--line)] px-2 py-0.5 text-[11px] font-mono-tabular uppercase text-[var(--muted)]"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="hairline-cell p-6 md:col-span-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {columns.map((col) => (
                <div key={col.id} className="space-y-2.5 text-sm">
                  <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--muted)]">
                    {col.title[locale] || col.title.en}
                  </p>
                  <div className="flex flex-col items-start gap-2">
                    {col.links.map((lnk, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => safeNavigate(lnk.url)}
                        className="editorial-link text-[var(--bone)] cursor-pointer text-start"
                      >
                        {lnk.label[locale] || lnk.label.en}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hairline-cell p-6 md:col-span-4">
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--muted)]">
              {t.newsletterTitle}
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">{t.newsletterDesc}</p>
            <form onSubmit={handleSubscribe} className="mt-4 flex">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beirut.lb"
                aria-label="Newsletter email"
                className="flex-1 min-w-0 bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)] placeholder:text-[var(--muted)]"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-[var(--ember)] text-[var(--ember-fg)] whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {submitting ? '...' : t.subscribe}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--muted)]">
          <span>{t.footerCopy}</span>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => safeNavigate('/legal?tab=terms')} className="editorial-link cursor-pointer">
              {t.legalTerms}
            </button>
            <button type="button" onClick={() => safeNavigate('/legal?tab=privacy')} className="editorial-link cursor-pointer">
              {t.legalPrivacy}
            </button>
            <button type="button" onClick={() => safeNavigate('/legal?tab=returns')} className="editorial-link cursor-pointer">
              {t.legalReturns}
            </button>
            <button type="button" onClick={() => safeNavigate('/legal?tab=seller')} className="editorial-link cursor-pointer">
              {t.legalSellerAgreement}
            </button>
            <button type="button" onClick={() => safeNavigate('/support')} className="editorial-link cursor-pointer">
              {t.navSupport}
            </button>
            <button type="button" onClick={() => safeNavigate('/account')} className="editorial-link cursor-pointer">
              {t.navAccount}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

