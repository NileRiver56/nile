import React, { useState } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';

export function Footer() {
  const { t, locale, navigate, showToast } = useMarketplace();
  const [email, setEmail] = useState('');

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      showToast(locale === 'ar' ? 'أدخل بريداً إلكترونياً صحيحاً' : 'Enter a valid email address', 'error');
      return;
    }
    setEmail('');
    showToast(locale === 'ar' ? 'تم الاشتراك في النشرة الأسبوعية' : 'Subscribed to weekly dispatches', 'success');
  };

  return (
    <footer className="border-t border-[var(--line)] bg-[var(--ink)] pb-16 md:pb-0">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-12">
        <div className="hairline-grid grid-cols-1 md:grid-cols-12">
          <div className="hairline-cell p-6 md:col-span-5">
            <span className="font-display text-2xl font-bold text-[var(--bone)]">{t.brand}</span>
            <span className="heading-dash" aria-hidden="true" />
            <p className="mt-4 text-sm text-[var(--muted)] max-w-sm">
              {locale === 'ar'
                ? 'سوق لبناني متعدد البائعين يربط المتاجر الموثقة بالمشترين عبر المحافظات الثماني.'
                : 'Lebanese multi-vendor marketplace connecting verified independent storefronts with nationwide delivery.'}
            </p>
          </div>

          <div className="hairline-cell p-6 md:col-span-3 space-y-2.5 text-sm">
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--muted)]">
              {locale === 'ar' ? 'روابط سريعة' : 'Directory'}
            </p>
            <div className="flex flex-col items-start gap-2">
              <button type="button" onClick={() => navigate('/catalog')} className="editorial-link text-[var(--bone)] cursor-pointer">
                {t.navCatalog}
              </button>
              <button type="button" onClick={() => navigate('/styleguide')} className="editorial-link text-[var(--bone)] cursor-pointer">
                {t.navStyleguide}
              </button>
              <button type="button" onClick={() => navigate('/seller')} className="editorial-link text-[var(--bone)] cursor-pointer">
                {t.sellerDashboard}
              </button>
              <button type="button" onClick={() => navigate('/admin')} className="editorial-link text-[var(--bone)] cursor-pointer">
                {t.adminPanel}
              </button>
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
                className="px-4 py-2 text-xs font-semibold bg-[var(--ember)] text-[var(--ember-fg)] whitespace-nowrap cursor-pointer"
              >
                {t.subscribe}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--muted)]">
          <span>{t.footerCopy}</span>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => navigate('/legal?tab=terms')} className="editorial-link cursor-pointer">
              {t.legalTerms}
            </button>
            <button type="button" onClick={() => navigate('/legal?tab=privacy')} className="editorial-link cursor-pointer">
              {t.legalPrivacy}
            </button>
            <button type="button" onClick={() => navigate('/legal?tab=returns')} className="editorial-link cursor-pointer">
              {t.legalReturns}
            </button>
            <button type="button" onClick={() => navigate('/legal?tab=seller')} className="editorial-link cursor-pointer">
              {t.legalSellerAgreement}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
