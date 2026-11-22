import React, { useState } from 'react';
import { ChevronDown, Globe, LogOut, Moon, ShoppingBag, Sun, X } from 'lucide-react';
import type { Locale, SiteChromeSettings, ThemeMode } from '../shared/types.ts';
import { getCopy } from '../shared/i18n.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';

export function Header({
  previewLocale,
  previewTheme,
  previewChrome,
  previewMode = false,
}: {
  previewLocale?: Locale;
  previewTheme?: ThemeMode;
  previewChrome?: SiteChromeSettings;
  previewMode?: boolean;
} = {}) {
  const ctx = useMarketplace();
  const locale = previewLocale ?? ctx.locale;
  const theme = previewTheme ?? ctx.theme;
  const chrome = previewChrome ?? ctx.siteChrome;
  const t = previewLocale ? getCopy(previewLocale) : ctx.t;
  const {
    toggleTheme,
    toggleLocale,
    currency,
    toggleCurrency,
    route,
    navigate,
    settings,
    cart,
    setIsCartOpen,
    authUser,
    logout,
  } = ctx;

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [dismissedTopBarIds, setDismissedTopBarIds] = useState<string[]>([]);
  const [megaOpen, setMegaOpen] = useState(false);
  const bagCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const announcementText = settings.announcement?.[locale]?.trim() || '';

  const topBarBanners = previewMode
    ? []
    : (ctx.banners || [])
        .filter((b) => b.placement === 'top_bar' && !dismissedTopBarIds.includes(b.id))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 1);

  const navItems = (chrome.headerLinks || []).filter((link) => link.visible);
  const isActive = (path: string) => !previewMode && route.startsWith(path);
  const safeNavigate = (to: string) => {
    setMegaOpen(false);
    if (!previewMode) navigate(to);
  };

  return (
    <div className={`${previewMode ? 'relative' : 'sticky top-0 z-40'} bg-[var(--ink)] border-b border-[var(--line)]`}>
      {topBarBanners.map((tb) => (
        <div
          key={tb.id}
          className="border-b border-[var(--line)] bg-[var(--ember)] text-[var(--ember-fg)] text-xs px-4 py-1.5 flex items-center justify-center gap-3 font-medium"
        >
          <button
            type="button"
            onClick={() => {
              void fetch(`/api/banners/${encodeURIComponent(tb.id)}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: 'click' }),
                keepalive: true,
              }).catch(() => {});
              safeNavigate(tb.targetUrl || '/catalog');
            }}
            className="underline-offset-2 hover:underline cursor-pointer truncate"
          >
            {tb.title[locale] || tb.title.en}
            {tb.ctaLabel?.[locale] ? ` — ${tb.ctaLabel[locale]}` : ''}
          </button>
          {tb.dismissible !== false && (
            <button
              type="button"
              onClick={() => setDismissedTopBarIds((prev) => [...prev, tb.id])}
              aria-label="Dismiss top bar promo"
              className="p-0.5 opacity-80 hover:opacity-100 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {!previewMode && (
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-[var(--ember)] focus:text-[var(--ember-fg)] focus:text-xs focus:font-semibold"
        >
          {locale === 'ar' ? 'تخطي إلى المحتوى الرئيسي' : 'Skip to content'}
        </a>
      )}

      {/* Slim Utility & Optional Announcement Row (<= 38px) */}
      <div className="border-b border-[var(--line)] bg-[var(--graphite)] text-xs">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 h-9 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            {announcementText && !bannerDismissed ? (
              <>
                <p className="truncate text-[var(--muted)]">{announcementText}</p>
                <button
                  type="button"
                  onClick={() => setBannerDismissed(true)}
                  aria-label="Dismiss announcement"
                  className="text-[var(--muted)] hover:text-[var(--bone)] shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <span className="text-[var(--muted)] font-mono-tabular">
                1 USD = {new Intl.NumberFormat('en-US').format(settings.exchangeRateLbpPerUsd)} LBP
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0 font-mono-tabular">
            {authUser && !previewMode && (
              <>
                <button
                  type="button"
                  onClick={() => void logout()}
                  title={authUser.email}
                  className="inline-flex items-center gap-1 text-[var(--cedar)] hover:text-[var(--ember)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span className="hidden sm:inline">{authUser.name}</span>
                  <LogOut className="w-3 h-3" aria-hidden="true" />
                </button>
                <span className="text-[var(--line)]" aria-hidden="true">|</span>
              </>
            )}

            <button
              type="button"
              onClick={() => !previewMode && toggleLocale()}
              className="inline-flex items-center gap-1 text-[var(--bone)] hover:text-[var(--ember)] whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Toggle language"
            >
              <Globe className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{locale === 'en' ? 'العربية' : 'EN'}</span>
            </button>

            <span className="text-[var(--line)]" aria-hidden="true">|</span>

            <button
              type="button"
              onClick={() => !previewMode && toggleCurrency()}
              className="text-[var(--bone)] hover:text-[var(--ember)] whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Toggle currency"
            >
              {currency === 'USD' ? 'USD $' : 'LBP ل.ل'}
            </button>

            <span className="text-[var(--line)]" aria-hidden="true">|</span>

            <button
              type="button"
              onClick={() => !previewMode && toggleTheme()}
              className="inline-flex items-center gap-1 text-[var(--bone)] hover:text-[var(--ember)] whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Toggle dark or light theme"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main 3-Zone Header Contract */}
      <header className="max-w-[1440px] mx-auto px-4 md:px-8 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => safeNavigate('/')}
            className="font-display text-2xl font-bold text-[var(--bone)] hover:text-[var(--ember)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.brand}
          </button>

          {chrome.showMegaMenu && chrome.megaMenuDepartments.length > 0 && (
            <button
              type="button"
              onClick={() => setMegaOpen((o) => !o)}
              aria-expanded={megaOpen}
              className="hidden sm:inline-flex items-center gap-1.5 border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--bone)] hover:border-[var(--ember)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{locale === 'ar' ? 'الأقسام' : 'Departments'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${megaOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--muted)]">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => safeNavigate(item.url)}
              className={`editorial-link py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isActive(item.url) ? 'text-[var(--bone)] font-semibold' : 'hover:text-[var(--bone)]'
              }`}
            >
              {item.label[locale] || item.label.en}
            </button>
          ))}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => !previewMode && setIsCartOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[var(--ember)] text-[var(--ember-fg)] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            <span>{t.bag}</span>
            <span className="font-mono-tabular">({bagCount})</span>
          </button>
        </div>
      </header>

      {/* Hairline Department Mega-Menu Panel */}
      {megaOpen && chrome.showMegaMenu && chrome.megaMenuDepartments.length > 0 && (
        <div className="border-t border-[var(--line)] bg-[var(--graphite)]">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-5">
            <div className="hairline-grid grid-cols-1 md:grid-cols-3">
              {chrome.megaMenuDepartments.map((dept) => (
                <div key={dept.slug} className="hairline-cell p-4 space-y-2.5">
                  <div>
                    <p className="font-display text-lg font-bold text-[var(--bone)]">
                      {dept.title[locale] || dept.title.en}
                    </p>
                    <p className="text-xs text-[var(--muted)]">{dept.tagline[locale] || dept.tagline.en}</p>
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    {dept.links.map((lnk, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => safeNavigate(lnk.url)}
                        className="editorial-link text-xs font-medium text-[var(--ember)] cursor-pointer"
                      >
                        {lnk.label[locale] || lnk.label.en}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

