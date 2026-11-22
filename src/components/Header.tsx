import React, { useState } from 'react';
import { Globe, LogOut, Moon, ShoppingBag, Sun, X } from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';

export function Header() {
  const {
    theme,
    toggleTheme,
    locale,
    toggleLocale,
    currency,
    toggleCurrency,
    t,
    route,
    navigate,
    settings,
    cart,
    setIsCartOpen,
    authUser,
    logout,
  } = useMarketplace();

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const bagCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const announcementText = settings.announcement?.[locale]?.trim() || '';

  const navItems = [
    { path: '/catalog', label: t.navCatalog },
    { path: '/orders', label: t.myOrders },
    { path: '/styleguide', label: t.navStyleguide },
    { path: '/seller', label: t.navSell },
    { path: '/admin', label: t.navAdmin },
  ];

  const isActive = (path: string) => route.startsWith(path);

  return (
    <div className="sticky top-0 z-40 bg-[var(--ink)] border-b border-[var(--line)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-[var(--ember)] focus:text-[var(--ember-fg)] focus:text-xs focus:font-semibold"
      >
        {locale === 'ar' ? 'تخطي إلى المحتوى الرئيسي' : 'Skip to content'}
      </a>

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
            {authUser && (
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
              onClick={toggleLocale}
              className="inline-flex items-center gap-1 text-[var(--bone)] hover:text-[var(--ember)] whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Toggle language"
            >
              <Globe className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{locale === 'en' ? 'العربية' : 'EN'}</span>
            </button>

            <span className="text-[var(--line)]" aria-hidden="true">|</span>

            <button
              type="button"
              onClick={toggleCurrency}
              className="text-[var(--bone)] hover:text-[var(--ember)] whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Toggle currency"
            >
              {currency === 'USD' ? 'USD $' : 'LBP ل.ل'}
            </button>

            <span className="text-[var(--line)]" aria-hidden="true">|</span>

            <button
              type="button"
              onClick={toggleTheme}
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
      <header className="max-w-[1440px] mx-auto px-4 md:px-8 h-14 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="font-display text-2xl font-bold text-[var(--bone)] hover:text-[var(--ember)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {t.brand}
        </button>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--muted)]">
          {navItems.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`editorial-link py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isActive(item.path) ? 'text-[var(--bone)] font-semibold' : 'hover:text-[var(--bone)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[var(--ember)] text-[var(--ember-fg)] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            <span>{t.bag}</span>
            <span className="font-mono-tabular">({bagCount})</span>
          </button>
        </div>
      </header>
    </div>
  );
}
