import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  ChevronDown,
  Clock,
  Play,
  Search,
  ShieldCheck,
  Star,
  Truck,
  Wallet,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { HomeSection, Locale, LocalizedText } from '../shared/types.ts';
import { getCopy } from '../shared/i18n.ts';
import { parseUtcTimestampMs, resolveUnitOfferPrice } from '../shared/offers.ts';
import { formatMoney } from '../shared/money.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import {
  EmptyState,
  PriceDisplay,
  ProductCard,
  ResilientImage,
  SectionHeading,
  StampBadge,
} from './HairlineUI.tsx';

function getLocalized(val: unknown, locale: Locale, fallback = ''): string {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const obj = val as Partial<LocalizedText>;
    return obj[locale] || obj.en || obj.ar || fallback;
  }
  return fallback;
}

function formatCountdown(msRemaining: number): string {
  const totalSec = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return days > 0 ? `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

function getSafeVideoEmbed(url: string): { kind: 'iframe' | 'video' | 'none'; src: string } {
  const clean = (url || '').trim();
  if (!clean) return { kind: 'none', src: '' };
  try {
    const u = new URL(clean, window.location.origin);
    if (u.hostname.includes('youtube.com')) {
      const vid = u.searchParams.get('v');
      if (vid && /^[a-zA-Z0-9_-]{6,20}$/.test(vid)) {
        return { kind: 'iframe', src: `https://www.youtube.com/embed/${vid}` };
      }
    }
    if (u.hostname === 'youtu.be') {
      const vid = u.pathname.replace('/', '');
      if (vid && /^[a-zA-Z0-9_-]{6,20}$/.test(vid)) {
        return { kind: 'iframe', src: `https://www.youtube.com/embed/${vid}` };
      }
    }
    if (u.hostname.includes('vimeo.com')) {
      const vid = u.pathname.split('/').filter(Boolean).pop();
      if (vid && /^\d+$/.test(vid)) {
        return { kind: 'iframe', src: `https://player.vimeo.com/video/${vid}` };
      }
    }
    if (/\.(mp4|webm)(\?.*)?$/i.test(u.pathname) && (u.protocol === 'https:' || u.protocol === 'http:' || clean.startsWith('/'))) {
      return { kind: 'video', src: clean };
    }
  } catch {
    return { kind: 'none', src: '' };
  }
  return { kind: 'none', src: '' };
}

export function HomeSectionRenderer({
  section,
  isPreview = false,
  selected = false,
  onSelect,
  previewOverride,
}: {
  section: HomeSection;
  isPreview?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  previewOverride?: {
    locale?: Locale;
    asOfMs?: number;
    isMobilePreview?: boolean;
  };
}) {
  const ctx = useMarketplace();
  const locale = previewOverride?.locale ?? ctx.locale;
  const t = previewOverride?.locale ? getCopy(previewOverride.locale) : ctx.t;
  const {
    navigate,
    products,
    sellers,
    offers,
    subscriptionPlans,
    deliveryZones,
    currency,
    settings,
    showToast,
    apiFetch,
  } = ctx;

  const [searchQuery, setSearchQuery] = useState('');
  const [dispatchEmail, setDispatchEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [slideIdx, setSlideIdx] = useState(0);
  const [nowMs, setNowMs] = useState(() => previewOverride?.asOfMs ?? Date.now());
  const carouselRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (previewOverride?.asOfMs) {
      setNowMs(previewOverride.asOfMs);
      return;
    }
    if (section.sectionType !== 'flash_sale_block' && section.sectionType !== 'announcement_bar') return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [section.sectionType, previewOverride?.asOfMs]);

  const c = section.content || {};
  const titleText = section.title[locale] || section.title.en || section.title.ar;
  const safeNav = (url: string) => {
    if (onSelect) return;
    navigate(url || '/catalog');
  };

  const padStyle = section.style?.padding || 'standard';
  const paddingClass =
    padStyle === 'compact' ? 'py-2' : padStyle === 'spacious' ? 'py-5' : '';
  const surfaceClass =
    section.style?.surface === 'ink' ? 'bg-[var(--ink)]' : '';

  const wrapPreviewHeader = (node: React.ReactNode) => (
    <motion.section
      initial={onSelect ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      aria-label={titleText}
      onClick={
        onSelect
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
      className={`${paddingClass} ${surfaceClass} ${
        onSelect
          ? `relative cursor-pointer transition-colors p-2 ${
              selected
                ? 'outline outline-2 outline-[var(--ember)] bg-[var(--graphite)]/40'
                : 'hover:outline hover:outline-1 hover:outline-[var(--muted)]'
            }`
          : isPreview && section.status !== 'published'
            ? 'relative border border-dashed border-[var(--gold)] p-3'
            : ''
      }`}
    >
      {(onSelect || (isPreview && section.status !== 'published')) && (
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-mono-tabular uppercase">
          <span className={selected ? 'text-[var(--ember)] font-semibold' : 'text-[var(--gold)]'}>
            {selected ? 'SELECTED · ' : isPreview ? 'PREVIEW · ' : ''}
            {section.sectionType} · {section.status}
            {!section.visible ? ' · HIDDEN' : ''} · v{section.version}
          </span>
        </div>
      )}
      {node}
    </motion.section>
  );

  // Helper to resolve product selection
  const selectProductsList = (
    sourceMode: string,
    department: string,
    manualIds: unknown,
    limit: number
  ) => {
    const idList = Array.isArray(manualIds) ? manualIds.map(String) : [];
    if (sourceMode === 'manual' && idList.length > 0) {
      const picked = idList
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is (typeof products)[number] => Boolean(p));
      return picked.slice(0, limit);
    }
    let list = [...products];
    if (department) list = list.filter((p) => p.department === department);
    if (sourceMode === 'featured') list = list.filter((p) => p.isFeatured);
    if (sourceMode === 'deals') {
      list = list.filter((p) => p.isDeal || resolveUnitOfferPrice(p.basePriceUsdCents, p, offers, nowMs).appliedOffer !== null);
    }
    if (sourceMode === 'top_rated') {
      list = [...list].sort((a, b) => b.rating - a.rating);
    }
    if (sourceMode === 'newest') {
      list = [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    return list.slice(0, limit);
  };

  // 1. hero
  if (section.sectionType === 'hero') {
    const mode = String(c.mode || 'split');
    const slides = Array.isArray(c.slides) ? (c.slides as Array<Record<string, unknown>>) : [];
    const activeSlide = mode === 'slider' && slides.length > 0 ? slides[slideIdx % slides.length] : null;

    const slideTitle = activeSlide ? getLocalized(activeSlide.title, locale, titleText) : titleText;
    const kicker = getLocalized(activeSlide?.kicker ?? c.kicker, locale, t.heroKicker);
    const subline = getLocalized(activeSlide?.subline ?? c.subline, locale, t.heroSubline);
    const primaryCtaLabel = getLocalized(activeSlide?.ctaLabel ?? c.primaryCtaLabel, locale, t.heroPrimaryCta);
    const primaryCtaUrl =
      typeof (activeSlide?.ctaUrl ?? c.primaryCtaUrl) === 'string' && (activeSlide?.ctaUrl ?? c.primaryCtaUrl)
        ? String(activeSlide?.ctaUrl ?? c.primaryCtaUrl)
        : '/catalog';
    const secondaryCtaLabel = getLocalized(c.secondaryCtaLabel, locale, t.heroSecondaryCta);
    const secondaryCtaUrl = typeof c.secondaryCtaUrl === 'string' && c.secondaryCtaUrl ? c.secondaryCtaUrl : '/seller';
    const showSearch = c.showSearch !== false;
    const imageUrl =
      typeof (activeSlide?.imageUrl ?? c.imageUrl) === 'string' && (activeSlide?.imageUrl ?? c.imageUrl)
        ? String(activeSlide?.imageUrl ?? c.imageUrl)
        : '/src/assets/images/hero_beirut_editorial_1795297173320.jpg';
    const focalX = Number(activeSlide?.focalX ?? c.focalX ?? 50);
    const focalY = Number(activeSlide?.focalY ?? c.focalY ?? 50);
    const badgeLabel = getLocalized(c.badgeLabel, locale, locale === 'ar' ? 'بائع موثق' : 'Verified');

    return wrapPreviewHeader(
      <div className="hairline-grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="hairline-cell lg:col-span-7 p-6 md:p-10 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-mono-tabular text-[var(--muted)] tracking-wider uppercase">{kicker}</p>
              {mode === 'slider' && slides.length > 1 && (
                <div className="flex items-center gap-1.5 font-mono-tabular text-xs">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSlideIdx((i) => (i - 1 + slides.length) % slides.length);
                    }}
                    aria-label="Previous slide"
                    className="w-7 h-7 border border-[var(--line)] flex items-center justify-center text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                  </button>
                  <span className="px-2 text-[var(--muted)]">
                    {(slideIdx % slides.length) + 1}/{slides.length}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSlideIdx((i) => (i + 1) % slides.length);
                    }}
                    aria-label="Next slide"
                    className="w-7 h-7 border border-[var(--line)] flex items-center justify-center text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                  </button>
                </div>
              )}
            </div>
            <h1
              className="mt-3 font-display font-bold text-[var(--bone)] leading-[1.02]"
              style={{ fontSize: 'clamp(2.25rem, 4.4vw, 3.75rem)' }}
            >
              {slideTitle}
            </h1>
            <span className="heading-dash hairline-draw-x" aria-hidden="true" />
            <p className="mt-4 text-base text-[var(--muted)] max-w-xl leading-relaxed">{subline}</p>
          </div>

          <div className="space-y-4">
            {showSearch && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const encoded = encodeURIComponent(searchQuery.trim());
                  safeNav(encoded ? `/catalog?q=${encoded}` : '/catalog');
                }}
                className="flex border border-[var(--line)] bg-[var(--ink)]"
              >
                <div className="flex items-center ps-3.5 text-[var(--muted)]">
                  <Search className="w-4 h-4" aria-hidden="true" />
                </div>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  aria-label="Search marketplace products"
                  className="flex-1 min-w-0 bg-transparent px-3 py-3 text-sm text-[var(--bone)] placeholder:text-[var(--muted)] focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-5 py-3 text-xs font-semibold bg-[var(--graphite)] border-s border-[var(--line)] text-[var(--bone)] hover:bg-[var(--ember)] hover:text-[var(--ember-fg)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {t.searchBtn}
                </button>
              </form>
            )}

            <div className="flex flex-wrap items-center gap-6 pt-1">
              <button
                type="button"
                onClick={() => safeNav(primaryCtaUrl)}
                className="px-6 py-3 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity inline-flex items-center gap-2 cursor-pointer"
              >
                <span>{primaryCtaLabel}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
              </button>
              {secondaryCtaLabel && (
                <button
                  type="button"
                  onClick={() => safeNav(secondaryCtaUrl)}
                  className="editorial-link text-sm font-medium text-[var(--bone)] cursor-pointer"
                >
                  {secondaryCtaLabel}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="hairline-cell lg:col-span-5 relative overflow-hidden group">
          <img
            src={imageUrl}
            alt={slideTitle}
            referrerPolicy="no-referrer"
            style={{ objectPosition: `${focalX}% ${focalY}%` }}
            className="w-full h-64 lg:h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
          <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-mono-tabular uppercase tracking-wider text-white/80">
                {locale === 'ar' ? 'لبنان' : 'Lebanon Marketplace'}
              </p>
              <p className="text-sm font-semibold text-white">
                {locale === 'ar' ? 'متاجر لبنانية موثقة ودفع مرن' : 'Verified Lebanese Merchants · USD & LBP'}
              </p>
            </div>
            <StampBadge label={badgeLabel} tone="cedar" />
          </div>
        </div>
      </div>
    );
  }

  // 2. announcement_bar
  if (section.sectionType === 'announcement_bar') {
    const kicker = getLocalized(c.kicker, locale, locale === 'ar' ? 'تنبيه' : 'Notice');
    const ctaLabel = getLocalized(c.ctaLabel, locale);
    const ctaUrl = typeof c.ctaUrl === 'string' && c.ctaUrl ? c.ctaUrl : '/catalog';
    const accent = String(c.accentToken || 'ember');
    const countdownMs = typeof c.countdownEndsAt === 'string' ? parseUtcTimestampMs(c.countdownEndsAt) : null;
    const borderVar =
      accent === 'cedar'
        ? 'border-[var(--cedar)]'
        : accent === 'gold'
          ? 'border-[var(--gold)]'
          : accent === 'cyan'
            ? 'border-[var(--cyan)]'
            : accent === 'graphite'
              ? 'border-[var(--line)]'
              : 'border-[var(--ember)]';
    const textVar =
      accent === 'cedar'
        ? 'text-[var(--cedar)]'
        : accent === 'gold'
          ? 'text-[var(--gold)]'
          : accent === 'cyan'
            ? 'text-[var(--cyan)]'
            : accent === 'graphite'
              ? 'text-[var(--bone)]'
              : 'text-[var(--ember)]';

    return wrapPreviewHeader(
      <div className={`border ${borderVar} bg-[var(--graphite)] px-5 py-3.5 flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          {kicker && <span className={`text-xs font-mono-tabular uppercase tracking-wider font-bold ${textVar}`}>{kicker}</span>}
          <span className="text-[var(--line)]" aria-hidden="true">|</span>
          <p className="text-sm font-medium text-[var(--bone)]">{titleText}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {countdownMs && countdownMs > nowMs && (
            <span className="inline-flex items-center gap-1.5 font-mono-tabular text-xs text-[var(--gold)]">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              {formatCountdown(countdownMs - nowMs)}
            </span>
          )}
          {ctaLabel && (
            <button
              type="button"
              onClick={() => safeNav(ctaUrl)}
              className={`editorial-link text-xs font-bold uppercase tracking-wider cursor-pointer ${textVar}`}
            >
              {ctaLabel} →
            </button>
          )}
        </div>
      </div>
    );
  }

  // 3. promo_strip
  if (section.sectionType === 'promo_strip') {
    const kicker = getLocalized(c.kicker, locale);
    const body = getLocalized(c.body, locale);
    const statLabel = getLocalized(c.statLabel, locale);
    const statValue = typeof c.statValue === 'string' || typeof c.statValue === 'number' ? String(c.statValue) : '';
    const ctaLabel = getLocalized(c.ctaLabel, locale, locale === 'ar' ? 'استكشف' : 'Explore');
    const ctaUrl = typeof c.ctaUrl === 'string' && c.ctaUrl ? c.ctaUrl : '/catalog';

    return wrapPreviewHeader(
      <div className="hairline-grid grid-cols-1 md:grid-cols-12 items-stretch">
        <div className="hairline-cell md:col-span-8 p-6 md:p-8 space-y-3">
          {kicker && <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--ember)]">{kicker}</p>}
          <h2 className="font-display text-3xl font-bold text-[var(--bone)]">{titleText}</h2>
          <span className="heading-dash" aria-hidden="true" />
          {body && <p className="text-sm text-[var(--muted)] max-w-2xl leading-relaxed">{body}</p>}
        </div>
        <div className="hairline-cell md:col-span-4 p-6 md:p-8 flex flex-col justify-between gap-5 bg-[var(--ink)]">
          {statValue ? (
            <div>
              {statLabel && (
                <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--muted)]">{statLabel}</p>
              )}
              <p className="mt-1 font-display text-4xl font-bold font-mono-tabular text-[var(--cedar)]">{statValue}</p>
            </div>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={() => safeNav(ctaUrl)}
            className="self-start px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    );
  }

  // 4. bento_grid
  if (section.sectionType === 'bento_grid') {
    const tiles = Array.isArray(c.tiles) ? (c.tiles as Array<Record<string, unknown>>) : [];
    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading title={titleText} />
        <div className="hairline-grid grid-cols-1 md:grid-cols-4">
          {tiles.map((tile, idx) => {
            const isWide = tile.span === 'wide';
            const tint = tile.tint === 'cyan' ? 'var(--cyan)' : tile.tint === 'sage' ? 'var(--sage)' : tile.tint === 'ember' ? 'var(--ember)' : 'var(--sand)';
            const img = String(tile.imageUrl || '/src/assets/images/cat_fashion_linen_1795297173988.jpg');
            const fx = Number(tile.focalX ?? 50);
            const fy = Number(tile.focalY ?? 50);
            return (
              <button
                key={String(tile.id || idx)}
                type="button"
                onClick={() => safeNav(String(tile.url || '/catalog'))}
                className={`hairline-cell group text-start p-5 flex flex-col justify-between gap-4 hover:bg-[var(--ink)] cursor-pointer ${
                  isWide ? 'md:col-span-2' : 'md:col-span-1'
                }`}
              >
                <div className="space-y-3">
                  <div className={`${isWide ? 'aspect-[16/9]' : 'aspect-[4/3]'} w-full overflow-hidden bg-[var(--ink)]`}>
                    <img
                      src={img}
                      alt={getLocalized(tile.title, locale)}
                      style={{ objectPosition: `${fx}% ${fy}%` }}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <p className="text-[11px] font-mono-tabular uppercase tracking-wider" style={{ color: tint }}>
                    {getLocalized(tile.tag, locale)}
                  </p>
                  <h3 className="font-display text-2xl font-bold text-[var(--bone)]">{getLocalized(tile.title, locale)}</h3>
                  <p className="text-sm text-[var(--muted)]">{getLocalized(tile.subtitle, locale)}</p>
                </div>
                <span className="editorial-link text-xs font-semibold text-[var(--bone)]">
                  {locale === 'ar' ? 'استكشاف' : 'Explore'}
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // 5. product_grid
  if (section.sectionType === 'product_grid') {
    const sourceMode = String(c.sourceMode || c.filterMode || 'all');
    const deptFilter = String(c.department || '');
    const limit = Math.max(1, Math.min(12, Number(c.limit || 6)));
    const columns = Number(c.columns || 3);
    const colClass = columns === 4 ? 'lg:grid-cols-4 md:grid-cols-2' : columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3';
    const subtitle = getLocalized(c.subtitle, locale);
    const ctaLabel = getLocalized(c.ctaLabel, locale, locale === 'ar' ? 'تصفح الكتالوج' : 'Browse Catalog');
    const ctaUrl = typeof c.ctaUrl === 'string' && c.ctaUrl ? c.ctaUrl : '/catalog';
    const visible = selectProductsList(sourceMode, deptFilter, c.productIds, limit);

    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading
          title={titleText}
          subtitle={subtitle || undefined}
          action={
            <button
              type="button"
              onClick={() => safeNav(ctaUrl)}
              className="editorial-link text-xs font-semibold text-[var(--bone)] cursor-pointer"
            >
              {ctaLabel}
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
            </button>
          }
        />
        {visible.length === 0 ? (
          <EmptyState
            title={locale === 'ar' ? 'لا توجد منتجات منشورة بعد' : 'No products published yet'}
            description={
              locale === 'ar'
                ? 'يمكن للبائعين اللبنانيين التقديم وإضافة أول منتج فور الموافقة على المتجر.'
                : 'Lebanese merchants can apply in Seller Hub and publish the first SKU once approved.'
            }
            actionLabel={t.heroSecondaryCta}
            onAction={() => safeNav('/seller')}
          />
        ) : (
          <div className={`hairline-grid grid-cols-1 ${colClass}`}>
            {visible.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                seller={sellers.find((s) => s.id === product.sellerId)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 6. product_carousel
  if (section.sectionType === 'product_carousel') {
    const sourceMode = String(c.sourceMode || 'featured');
    const deptFilter = String(c.department || '');
    const limit = Math.max(2, Math.min(16, Number(c.limit || 8)));
    const subtitle = getLocalized(c.subtitle, locale);
    const ctaLabel = getLocalized(c.ctaLabel, locale, locale === 'ar' ? 'عرض الكل' : 'View All');
    const ctaUrl = typeof c.ctaUrl === 'string' && c.ctaUrl ? c.ctaUrl : '/catalog';
    const visible = selectProductsList(sourceMode, deptFilter, c.productIds, limit);

    const stepRail = (dir: -1 | 1) => {
      if (!carouselRef.current) return;
      const offset = dir * 340 * (locale === 'ar' ? -1 : 1);
      carouselRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    };

    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading
          title={titleText}
          subtitle={subtitle || undefined}
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  stepRail(-1);
                }}
                aria-label="Previous products"
                className="w-8 h-8 border border-[var(--line)] flex items-center justify-center text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  stepRail(1);
                }}
                aria-label="Next products"
                className="w-8 h-8 border border-[var(--line)] flex items-center justify-center text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
              >
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => safeNav(ctaUrl)}
                className="ms-2 editorial-link text-xs font-semibold text-[var(--bone)] cursor-pointer"
              >
                {ctaLabel}
              </button>
            </div>
          }
        />
        {visible.length === 0 ? (
          <EmptyState
            title={locale === 'ar' ? 'لا توجد منتجات للعرض' : 'No products in carousel yet'}
            description={
              locale === 'ar'
                ? 'أضف منتجات من المتاجر المعتمدة أو اختر يدوياً من لوحة الإعدادات.'
                : 'Published merchant products matching this filter will scroll here automatically.'
            }
          />
        ) : (
          <div
            ref={carouselRef}
            className="flex gap-px bg-[var(--line)] border border-[var(--line)] overflow-x-auto snap-x snap-mandatory"
          >
            {visible.map((product) => (
              <div key={product.id} className="min-w-[270px] sm:min-w-[300px] snap-start bg-[var(--graphite)]">
                <ProductCard product={product} seller={sellers.find((s) => s.id === product.sellerId)} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 7. category_tiles
  if (section.sectionType === 'category_tiles') {
    const columns = Number(c.columns || 3);
    const colClass = columns === 4 ? 'lg:grid-cols-4 md:grid-cols-2' : columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3';
    const rawItems = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];

    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading title={titleText} />
        <div className={`hairline-grid grid-cols-1 ${colClass}`}>
          {rawItems.map((it, idx) => {
            const tint = String(it.tint || 'var(--sand)');
            const img = String(it.image || '/src/assets/images/cat_fashion_linen_1795297173988.jpg');
            const fx = Number(it.focalX ?? 50);
            const fy = Number(it.focalY ?? 50);
            const url = String(it.url || `/catalog?department=${String(it.slug || 'fashion')}`);
            const itemTitle = getLocalized(it.title, locale);

            return (
              <button
                key={String(it.slug || idx)}
                type="button"
                onClick={() => safeNav(url)}
                className="hairline-cell group text-start p-5 flex flex-col justify-between gap-4 hover:bg-[var(--ink)] cursor-pointer"
              >
                <div>
                  <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--ink)]">
                    <img
                      src={img}
                      alt={itemTitle}
                      style={{ objectPosition: `${fx}% ${fy}%` }}
                      className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  </div>
                  <p className="mt-4 text-[11px] font-mono-tabular uppercase tracking-wider" style={{ color: tint }}>
                    {getLocalized(it.tag, locale)}
                  </p>
                  <h3 className="mt-1 font-display text-2xl font-bold text-[var(--bone)]">{itemTitle}</h3>
                  <p className="mt-1.5 text-sm text-[var(--muted)]">{getLocalized(it.desc, locale)}</p>
                </div>
                <span className="editorial-link text-xs font-semibold text-[var(--bone)]">
                  {locale === 'ar' ? 'تصفح القسم' : 'Browse Department'}
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // 8. department_spotlight
  if (section.sectionType === 'department_spotlight') {
    const department = String(c.department || 'electronics');
    const description = getLocalized(c.description, locale);
    const ctaLabel = getLocalized(c.ctaLabel, locale, locale === 'ar' ? 'عرض القسم' : 'View Department');
    const limit = Math.max(1, Math.min(6, Number(c.limit || 3)));
    const deptProducts = products.filter((p) => p.department === department).slice(0, limit);

    return wrapPreviewHeader(
      <div className="hairline-grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="hairline-cell lg:col-span-4 p-6 md:p-8 flex flex-col justify-between gap-6">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--cyan)]">
              {department.replace('-', ' ')}
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-[var(--bone)]">{titleText}</h2>
            <span className="heading-dash" aria-hidden="true" />
            {description && <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">{description}</p>}
          </div>
          <button
            type="button"
            onClick={() => safeNav(`/catalog?department=${encodeURIComponent(department)}`)}
            className="self-start px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        </div>

        <div className="hairline-cell lg:col-span-8 p-4 md:p-6">
          {deptProducts.length === 0 ? (
            <EmptyState
              title={locale === 'ar' ? 'لا توجد منتجات في هذا القسم بعد' : 'No products in this department yet'}
              description={
                locale === 'ar'
                  ? 'سيتم عرض المنتجات المعتمدة لهذا القسم فور نشرها.'
                  : 'Approved merchant products for this department will appear here automatically.'
              }
            />
          ) : (
            <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {deptProducts.map((p) => (
                <ProductCard key={p.id} product={p} seller={sellers.find((s) => s.id === p.sellerId)} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 9. flash_sale_block
  if (section.sectionType === 'flash_sale_block') {
    const subtitle = getLocalized(c.subtitle, locale);
    const limit = Math.max(1, Math.min(9, Number(c.limit || 3)));
    const showCountdown = c.showCountdown !== false;
    const manualIds = Array.isArray(c.productIds) ? c.productIds.map(String) : [];

    const scheduledEnds = offers
      .map((o) => parseUtcTimestampMs(o.endsAt))
      .filter((ms): ms is number => ms !== null && ms > nowMs)
      .sort((a, b) => a - b);
    const nearestEndMs = scheduledEnds[0] ?? null;

    const discountedProducts =
      manualIds.length > 0
        ? manualIds
            .map((id) => products.find((p) => p.id === id))
            .filter((p): p is (typeof products)[number] => Boolean(p))
            .slice(0, limit)
        : products
            .filter((p) => resolveUnitOfferPrice(p.basePriceUsdCents, p, offers, nowMs).appliedOffer !== null)
            .slice(0, limit);

    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading
          title={titleText}
          subtitle={subtitle || undefined}
          action={
            showCountdown && nearestEndMs ? (
              <div className="inline-flex items-center gap-2 border border-[var(--ember)] bg-[var(--graphite)] px-3.5 py-2 text-xs font-mono-tabular text-[var(--ember)]">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{formatCountdown(nearestEndMs - nowMs)}</span>
              </div>
            ) : undefined
          }
        />

        {discountedProducts.length === 0 ? (
          <EmptyState
            title={locale === 'ar' ? 'لا توجد عروض مجدولة نشطة حالياً' : 'No active scheduled offers right now'}
            description={
              locale === 'ar'
                ? 'يمكن للإدارة أو التجار المعتمدين جدولة عروض مؤقتة من لوحة التحكم.'
                : 'Approved platform or seller-submitted offers appear here automatically when active.'
            }
          />
        ) : (
          <div className="hairline-grid grid-cols-1 md:grid-cols-3">
            {discountedProducts.map((p) => (
              <ProductCard key={p.id} product={p} seller={sellers.find((s) => s.id === p.sellerId)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 10. featured_stores
  if (section.sectionType === 'featured_stores') {
    const limit = Math.max(1, Math.min(12, Number(c.limit || 6)));
    const subtitle = getLocalized(c.subtitle, locale);
    const manualIds = Array.isArray(c.sellerIds) ? c.sellerIds.map(String) : [];
    const visibleSellers =
      manualIds.length > 0
        ? manualIds
            .map((id) => sellers.find((s) => s.id === id))
            .filter((s): s is (typeof sellers)[number] => Boolean(s))
            .slice(0, limit)
        : sellers.slice(0, limit);

    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading title={titleText} subtitle={subtitle || undefined} />
        {visibleSellers.length === 0 ? (
          <EmptyState
            title={locale === 'ar' ? 'لا توجد متاجر مفعّلة بعد' : 'No live storefronts yet'}
            description={
              locale === 'ar'
                ? 'سجّل متجرك الآن ليظهر في واجهة المتاجر الموثقة بعد المراجعة.'
                : 'Apply as a Lebanese merchant to launch the first verified storefront on NileLink.'
            }
            actionLabel={t.heroSecondaryCta}
            onAction={() => safeNav('/seller')}
          />
        ) : (
          <div className="hairline-grid grid-cols-1 md:grid-cols-3">
            {visibleSellers.map((seller) => (
              <div key={seller.id} className="hairline-cell p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono-tabular text-[var(--muted)] uppercase">
                      {seller.governorate} · {seller.district}
                    </span>
                    {seller.verified && <StampBadge label={t.verifiedSeller} tone="cedar" />}
                  </div>
                  <h3 className="mt-3 font-display text-2xl font-bold text-[var(--bone)]">{seller.name[locale]}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{seller.tagline[locale]}</p>
                </div>

                <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs">
                  <span className="font-mono-tabular text-[var(--bone)]">
                    ★ {seller.rating.toFixed(1)} · {seller.reviewCount}{' '}
                    {locale === 'ar' ? 'تقييم' : 'reviews'}
                  </span>
                  <button
                    type="button"
                    onClick={() => safeNav(`/store/${seller.slug}`)}
                    className="editorial-link font-semibold text-[var(--ember)] cursor-pointer"
                  >
                    {t.viewStore}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 11. brand_bar
  if (section.sectionType === 'brand_bar') {
    const items = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];
    return wrapPreviewHeader(
      <div className="space-y-4">
        <SectionHeading title={titleText} />
        <div className="hairline-grid grid-cols-2 md:grid-cols-4">
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => safeNav(String(item.url || '/catalog'))}
              className="hairline-cell p-5 text-start hover:bg-[var(--ink)] flex items-center justify-between gap-3 cursor-pointer"
            >
              <div>
                <p className="font-display text-xl font-bold text-[var(--bone)]">{String(item.name || '')}</p>
                <p className="text-[11px] font-mono-tabular uppercase text-[var(--muted)] mt-0.5">
                  {getLocalized(item.note, locale)}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--ember)] rtl:rotate-180 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 12. trust_cells
  if (section.sectionType === 'trust_cells') {
    const mode = String(c.mode || 'guarantees');
    if (mode === 'governorates') {
      const subtitle = getLocalized(c.subtitle, locale);
      return wrapPreviewHeader(
        <div className="space-y-5">
          <SectionHeading title={titleText} subtitle={subtitle || undefined} />
          <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {deliveryZones.map((zone) => (
              <div key={zone.governorateCode} className="hairline-cell p-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--bone)]">{zone.name[locale]}</p>
                  <p className="mt-1 text-xs font-mono-tabular text-[var(--muted)]">{zone.etaDays}</p>
                </div>
                <div className="text-end font-mono-tabular text-xs font-semibold text-[var(--cedar)]">
                  {formatMoney(zone.platformFeeUsdCents, currency, settings.exchangeRateLbpPerUsd, locale)}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const showSpotlight = c.showSpotlightProduct !== false;
    const heroFeatured = showSpotlight ? products.find((p) => p.isFeatured) || products[0] || null : null;
    const rawCells = Array.isArray(c.cells) ? (c.cells as Array<Record<string, unknown>>) : [];
    const fallbackCells = [
      { icon: 'wallet', title: { en: t.currencyTitle, ar: t.currencyTitle }, desc: { en: t.currencyDesc, ar: t.currencyDesc } },
      { icon: 'shield', title: { en: t.trustTitle, ar: t.trustTitle }, desc: { en: t.trustDesc, ar: t.trustDesc } },
      { icon: 'truck', title: { en: t.deliveryTitle, ar: t.deliveryTitle }, desc: { en: t.deliveryDesc, ar: t.deliveryDesc } },
    ];
    const cells = rawCells.length >= 3 ? rawCells : fallbackCells;

    const renderIcon = (icon: unknown) => {
      if (icon === 'shield') return <ShieldCheck className="w-5 h-5 text-[var(--cedar)] shrink-0 mt-0.5" aria-hidden="true" />;
      if (icon === 'truck') return <Truck className="w-5 h-5 text-[var(--cyan)] shrink-0 mt-0.5" aria-hidden="true" />;
      return <Wallet className="w-5 h-5 text-[var(--gold)] shrink-0 mt-0.5" aria-hidden="true" />;
    };

    const firstCell = cells[0];
    const remainingCells = cells.slice(1, 3);

    return wrapPreviewHeader(
      <div className="hairline-grid grid-cols-1 md:grid-cols-3">
        {heroFeatured ? (
          <button
            type="button"
            onClick={() => safeNav(`/product/${heroFeatured.slug}`)}
            className="hairline-cell p-5 text-start flex items-center justify-between gap-4 hover:bg-[var(--ink)] cursor-pointer group"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-mono-tabular uppercase tracking-wider text-[var(--gold)]">
                {locale === 'ar' ? 'المنتج المميز' : 'Spotlight'}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--bone)] truncate group-hover:text-[var(--ember)]">
                {heroFeatured.title[locale]}
              </p>
              <div className="mt-1.5">
                <PriceDisplay
                  usdCents={resolveUnitOfferPrice(heroFeatured.basePriceUsdCents, heroFeatured, offers, nowMs).effectiveUsdCents}
                  size="sm"
                />
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[var(--muted)] shrink-0 rtl:rotate-180" aria-hidden="true" />
          </button>
        ) : (
          <div className="hairline-cell p-5 flex items-start gap-3.5">
            {renderIcon(firstCell.icon)}
            <div>
              <h2 className="text-sm font-semibold text-[var(--bone)]">{getLocalized(firstCell.title, locale)}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">{getLocalized(firstCell.desc, locale)}</p>
            </div>
          </div>
        )}

        {remainingCells.map((cell, i) => (
          <div key={i} className="hairline-cell p-5 flex items-start gap-3.5">
            {renderIcon(cell.icon)}
            <div>
              <h2 className="text-sm font-semibold text-[var(--bone)]">{getLocalized(cell.title, locale)}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">{getLocalized(cell.desc, locale)}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 13. social_proof
  if (section.sectionType === 'social_proof') {
    const subtitle = getLocalized(c.subtitle, locale);
    const items = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];
    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading title={titleText} subtitle={subtitle || undefined} />
        <div className="hairline-grid grid-cols-1 md:grid-cols-3">
          {items.map((item, idx) => {
            const stars = Math.max(1, Math.min(5, Number(item.rating ?? 5)));
            return (
              <div key={idx} className="hairline-cell p-6 flex flex-col justify-between gap-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-1 text-[var(--gold)]">
                    {Array.from({ length: stars }).map((_, sIdx) => (
                      <Star key={sIdx} className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                    ))}
                  </div>
                  <p className="text-sm text-[var(--bone)] leading-relaxed">
                    “{getLocalized(item.quote, locale)}”
                  </p>
                </div>
                <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs font-mono-tabular">
                  <span className="text-[var(--bone)] font-semibold">{String(item.author || 'Buyer')}</span>
                  <span className="text-[var(--muted)]">{getLocalized(item.city, locale)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 14. how_it_works
  if (section.sectionType === 'how_it_works') {
    const eyebrow = getLocalized(c.eyebrow, locale);
    const body = getLocalized(c.body, locale);
    const ctaLabel = getLocalized(c.ctaLabel, locale, t.heroSecondaryCta);
    const ctaUrl = typeof c.ctaUrl === 'string' && c.ctaUrl ? c.ctaUrl : '/seller';
    const showPlans = c.showPlans !== false;
    const steps = Array.isArray(c.steps) ? (c.steps as Array<Record<string, unknown>>) : [];

    return wrapPreviewHeader(
      <div className="space-y-6">
        <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
          <div className="hairline-cell lg:col-span-5 p-6 md:p-8 flex flex-col justify-between gap-6">
            <div>
              {eyebrow && (
                <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--cedar)]">{eyebrow}</p>
              )}
              <h2 className="mt-2 font-display text-3xl font-bold text-[var(--bone)]">{titleText}</h2>
              <span className="heading-dash" aria-hidden="true" />
              {body && <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">{body}</p>}
            </div>
            <button
              type="button"
              onClick={() => safeNav(ctaUrl)}
              className="self-start px-6 py-3 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
            >
              <span>{ctaLabel}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="hairline-cell lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--line)]">
            {showPlans && subscriptionPlans.length > 0
              ? subscriptionPlans.map((plan) => (
                  <div key={plan.tier} className="p-6 flex flex-col justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">{plan.tier}</p>
                      <h3 className="mt-1 font-display text-2xl font-bold text-[var(--bone)]">{plan.name[locale]}</h3>
                      <p className="mt-2 font-mono-tabular text-lg font-bold text-[var(--ember)]">
                        {plan.monthlyFeeUsdCents === 0
                          ? locale === 'ar'
                            ? 'مجاني'
                            : 'Free'
                          : formatMoney(plan.monthlyFeeUsdCents, currency, settings.exchangeRateLbpPerUsd, locale) +
                            (locale === 'ar' ? ' / شهر' : '/mo')}
                      </p>
                      <ul className="mt-3 space-y-1.5 text-xs text-[var(--muted)]">
                        {plan.features.slice(0, 3).map((f, idx) => (
                          <li key={idx}>· {f[locale]}</li>
                        ))}
                      </ul>
                    </div>
                    <span className="text-[11px] font-mono-tabular text-[var(--cedar)]">
                      {plan.productLimit
                        ? `${plan.productLimit} SKUs max`
                        : locale === 'ar'
                          ? 'منتجات غير محدودة'
                          : 'Unlimited SKUs'}
                    </span>
                  </div>
                ))
              : steps.map((st, idx) => (
                  <div key={idx} className="p-6 space-y-2">
                    <span className="font-mono-tabular text-sm font-bold text-[var(--ember)]">
                      {String(st.num || `0${idx + 1}`)}
                    </span>
                    <h3 className="font-display text-xl font-bold text-[var(--bone)]">
                      {getLocalized(st.title, locale)}
                    </h3>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">{getLocalized(st.desc, locale)}</p>
                  </div>
                ))}
          </div>
        </div>
      </div>
    );
  }

  // 15. newsletter_box
  if (section.sectionType === 'newsletter_box') {
    const desc = getLocalized(c.desc, locale);
    const ctaLabel = getLocalized(c.ctaLabel, locale, locale === 'ar' ? 'اشتراك' : 'Subscribe');
    const placeholder = getLocalized(c.placeholder, locale, locale === 'ar' ? 'بريدك الإلكتروني' : 'you@example.com');

    return wrapPreviewHeader(
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="max-w-xl">
          <h2 className="font-display text-2xl font-bold text-[var(--bone)]">{titleText}</h2>
          <span className="heading-dash" aria-hidden="true" />
          {desc && <p className="mt-2 text-sm text-[var(--muted)]">{desc}</p>}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (onSelect || !dispatchEmail.trim()) return;
            setSubscribing(true);
            try {
              await apiFetch('/api/newsletter/subscribe', {
                method: 'POST',
                body: JSON.stringify({ email: dispatchEmail.trim(), locale, source: `home:${section.id}` }),
              });
              setDispatchEmail('');
              showToast(
                locale === 'ar'
                  ? 'تم تسجيل بريدك في النشرة بنجاح.'
                  : 'Subscribed to NileLink launch & offer dispatches.',
                'success'
              );
            } catch (err) {
              showToast((err as Error).message, 'error');
            } finally {
              setSubscribing(false);
            }
          }}
          className="flex w-full lg:w-auto lg:min-w-[380px] border border-[var(--line)] bg-[var(--ink)]"
        >
          <input
            type="email"
            required
            value={dispatchEmail}
            onChange={(e) => setDispatchEmail(e.target.value)}
            placeholder={placeholder}
            aria-label="Dispatch email"
            className="flex-1 min-w-0 bg-transparent px-3.5 py-2.5 text-sm text-[var(--bone)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={subscribing}
            className="px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider cursor-pointer shrink-0 disabled:opacity-50"
          >
            {subscribing ? '...' : ctaLabel}
          </button>
        </form>
      </div>
    );
  }

  // 16. faq_accordion
  if (section.sectionType === 'faq_accordion') {
    const items = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];

    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading title={titleText} />
        <div className="border border-[var(--line)] bg-[var(--graphite)] divide-y divide-[var(--line)]">
          {items.map((item, idx) => {
            const isOpen = openFaqIdx === idx;
            return (
              <div key={idx}>
                <button
                  type="button"
                  onClick={(e) => {
                    if (onSelect) return;
                    e.stopPropagation();
                    setOpenFaqIdx(isOpen ? null : idx);
                  }}
                  aria-expanded={isOpen}
                  className="w-full p-5 flex items-center justify-between gap-4 text-start hover:bg-[var(--ink)] cursor-pointer"
                >
                  <span className="text-sm font-semibold text-[var(--bone)]">{getLocalized(item.q, locale)}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-[var(--muted)] shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[var(--ember)]' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className="px-5 pb-5 text-sm text-[var(--muted)] leading-relaxed"
                    >
                      {getLocalized(item.a, locale)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 18. video_3d_embed
  if (section.sectionType === 'video_3d_embed') {
    const eyebrow = getLocalized(c.eyebrow, locale);
    const body = getLocalized(c.body, locale);
    const mediaMode = String(c.mediaMode || 'video');
    const videoEmbed = getSafeVideoEmbed(String(c.videoUrl || ''));
    const posterImage =
      typeof c.posterImageUrl === 'string' && c.posterImageUrl
        ? c.posterImageUrl
        : '/src/assets/images/hero_beirut_editorial_1795297173320.jpg';
    const fx = Number(c.focalX ?? 50);
    const fy = Number(c.focalY ?? 50);
    const ctaLabel = getLocalized(c.ctaLabel, locale, locale === 'ar' ? 'استكشف الكتالوج' : 'Inspect Catalog');
    const ctaUrl = typeof c.ctaUrl === 'string' && c.ctaUrl ? c.ctaUrl : '/catalog';

    return wrapPreviewHeader(
      <div className="hairline-grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="hairline-cell lg:col-span-5 p-6 md:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-3">
            {eyebrow && (
              <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--cyan)]">{eyebrow}</p>
            )}
            <h2 className="font-display text-3xl font-bold text-[var(--bone)]">{titleText}</h2>
            <span className="heading-dash" aria-hidden="true" />
            {body && <p className="text-sm text-[var(--muted)] leading-relaxed">{body}</p>}
          </div>
          {ctaLabel && (
            <button
              type="button"
              onClick={() => safeNav(ctaUrl)}
              className="self-start px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
            >
              <span>{ctaLabel}</span>
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          )}
        </div>

        <div className="hairline-cell lg:col-span-7 relative bg-[var(--ink)] min-h-[260px] flex items-center justify-center overflow-hidden">
          {mediaMode === 'video' && videoEmbed.kind === 'iframe' ? (
            <iframe
              src={videoEmbed.src}
              title={titleText}
              className="w-full aspect-video border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : mediaMode === 'video' && videoEmbed.kind === 'video' ? (
            <video src={videoEmbed.src} poster={posterImage} controls className="w-full h-full max-h-[380px] object-cover" />
          ) : (
            <div className="relative w-full h-full min-h-[260px]">
              <img
                src={posterImage}
                alt={titleText}
                style={{ objectPosition: `${fx}% ${fy}%` }}
                className="w-full h-full max-h-[380px] object-cover"
              />
              <div className="absolute inset-0 bg-black/35 flex flex-col items-center justify-center gap-2 text-white">
                {mediaMode === '3d' ? <Box className="w-8 h-8 text-[var(--cyan)]" /> : <Play className="w-8 h-8 text-[var(--ember)]" />}
                <span className="text-xs font-mono-tabular uppercase tracking-wider bg-black/75 px-3 py-1 border border-white/20">
                  {mediaMode === '3d'
                    ? locale === 'ar'
                      ? 'معاينة ثلاثية الأبعاد'
                      : 'Interactive 3D View Ready'
                    : locale === 'ar'
                      ? 'أضف رابط فيديو YouTube / MP4'
                      : 'Video Showcase · Poster Preview'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 17. rich_block (editorial / manifesto / comparison)
  const variant = String(c.variant || 'editorial');
  if (variant === 'manifesto') {
    const eyebrow = getLocalized(c.eyebrow, locale);
    const statement = getLocalized(c.statement ?? c.body, locale);
    const ctaLabel = getLocalized(c.ctaLabel, locale);
    const ctaUrl = typeof c.ctaUrl === 'string' && c.ctaUrl ? c.ctaUrl : '/styleguide';

    return wrapPreviewHeader(
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-8 md:p-12 space-y-4">
        {eyebrow && <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--gold)]">{eyebrow}</p>}
        <h2 className="font-display text-3xl md:text-5xl font-bold text-[var(--bone)] max-w-4xl leading-tight">
          {titleText}
        </h2>
        <span className="heading-dash" aria-hidden="true" />
        {statement && <p className="text-base md:text-lg text-[var(--muted)] max-w-3xl leading-relaxed">{statement}</p>}
        {ctaLabel && (
          <button
            type="button"
            onClick={() => safeNav(ctaUrl)}
            className="editorial-link text-xs font-semibold uppercase tracking-wider text-[var(--ember)] pt-2 cursor-pointer"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        )}
      </div>
    );
  }

  if (variant === 'comparison') {
    const colAHeader = getLocalized(c.colAHeader, locale, 'Option A');
    const colBHeader = getLocalized(c.colBHeader, locale, 'Option B');
    const rows = Array.isArray(c.rows) ? (c.rows as Array<Record<string, unknown>>) : [];

    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading title={titleText} />
        <div className="border border-[var(--line)] bg-[var(--graphite)] overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="border-b border-[var(--line)] bg-[var(--ink)] text-xs font-mono-tabular uppercase text-[var(--muted)]">
              <tr>
                <th className="p-4 text-start">{locale === 'ar' ? 'المعيار' : 'Specification'}</th>
                <th className="p-4 text-start text-[var(--bone)]">{colAHeader}</th>
                <th className="p-4 text-start text-[var(--bone)]">{colBHeader}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {rows.map((r, i) => (
                <tr key={i}>
                  <th className="p-4 text-start font-medium text-[var(--muted)]">{getLocalized(r.label, locale)}</th>
                  <td className="p-4 text-start text-[var(--bone)]">{getLocalized(r.colA, locale)}</td>
                  <td className="p-4 text-start text-[var(--bone)]">{getLocalized(r.colB, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Default rich_block editorial
  const eyebrow = getLocalized(c.eyebrow, locale);
  const body = getLocalized(c.body, locale);
  const imageUrl = typeof c.imageUrl === 'string' ? c.imageUrl : '';
  const fx = Number(c.focalX ?? 50);
  const fy = Number(c.focalY ?? 50);
  const ctaLabel = getLocalized(c.ctaLabel, locale);
  const ctaUrl = typeof c.ctaUrl === 'string' && c.ctaUrl ? c.ctaUrl : '/catalog';

  return wrapPreviewHeader(
    <div className={`hairline-grid grid-cols-1 ${imageUrl ? 'lg:grid-cols-12' : ''} items-stretch`}>
      <div className={`hairline-cell ${imageUrl ? 'lg:col-span-7' : ''} p-6 md:p-10 space-y-4`}>
        {eyebrow && <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--ember)]">{eyebrow}</p>}
        <h2 className="font-display text-3xl font-bold text-[var(--bone)]">{titleText}</h2>
        <span className="heading-dash" aria-hidden="true" />
        {body && <p className="text-sm text-[var(--muted)] leading-relaxed whitespace-pre-line">{body}</p>}
        {ctaLabel && (
          <button
            type="button"
            onClick={() => safeNav(ctaUrl)}
            className="px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        )}
      </div>
      {imageUrl && (
        <div className="hairline-cell lg:col-span-5 overflow-hidden">
          <div className="aspect-[4/3] lg:h-full w-full overflow-hidden bg-[var(--ink)]">
            <img
              src={imageUrl}
              alt={titleText}
              style={{ objectPosition: `${fx}% ${fy}%` }}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
}
