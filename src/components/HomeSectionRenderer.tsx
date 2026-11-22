import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, Clock, Search, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { HomeSection, LocalizedText } from '../shared/types.ts';
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

function getLocalized(val: unknown, locale: 'en' | 'ar', fallback = ''): string {
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

export function HomeSectionRenderer({
  section,
  isPreview = false,
}: {
  section: HomeSection;
  isPreview?: boolean;
}) {
  const {
    locale,
    t,
    navigate,
    products,
    sellers,
    offers,
    subscriptionPlans,
    deliveryZones,
    currency,
    settings,
    showToast,
  } = useMarketplace();

  const [searchQuery, setSearchQuery] = useState('');
  const [dispatchEmail, setDispatchEmail] = useState('');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (section.sectionType !== 'flash_deals_countdown') return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [section.sectionType]);

  const c = section.content || {};
  const titleText = section.title[locale] || section.title.en;

  const wrapPreviewHeader = (node: React.ReactNode) => (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      aria-label={titleText}
      className={isPreview && section.status !== 'published' ? 'relative border border-dashed border-[var(--gold)] p-3' : ''}
    >
      {isPreview && section.status !== 'published' && (
        <div className="mb-3 flex items-center justify-between text-[11px] font-mono-tabular uppercase text-[var(--gold)]">
          <span>
            PREVIEW · {section.sectionType} · status={section.status} · audience={section.audience} · v{section.version}
          </span>
        </div>
      )}
      {node}
    </motion.section>
  );

  // 1. hero_split
  if (section.sectionType === 'hero_split') {
    const kicker = getLocalized(c.kicker, locale, t.heroKicker);
    const subline = getLocalized(c.subline, locale, t.heroSubline);
    const primaryCtaLabel = getLocalized(c.primaryCtaLabel, locale, t.heroPrimaryCta);
    const primaryCtaUrl = typeof c.primaryCtaUrl === 'string' && c.primaryCtaUrl ? c.primaryCtaUrl : '/catalog';
    const secondaryCtaLabel = getLocalized(c.secondaryCtaLabel, locale, t.heroSecondaryCta);
    const secondaryCtaUrl = typeof c.secondaryCtaUrl === 'string' && c.secondaryCtaUrl ? c.secondaryCtaUrl : '/seller';
    const showSearch = c.showSearch !== false;
    const imageUrl =
      typeof c.imageUrl === 'string' && c.imageUrl
        ? c.imageUrl
        : '/src/assets/images/hero_beirut_editorial_1795297173320.jpg';
    const badgeLabel = getLocalized(c.badgeLabel, locale, locale === 'ar' ? 'بائع موثق' : 'Verified');

    return wrapPreviewHeader(
      <div className="hairline-grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="hairline-cell lg:col-span-7 p-6 md:p-10 flex flex-col justify-between gap-6">
          <div>
            <p className="text-xs font-mono-tabular text-[var(--muted)] tracking-wider uppercase">{kicker}</p>
            <h1
              className="mt-3 font-display font-bold text-[var(--bone)] leading-[1.02]"
              style={{ fontSize: 'clamp(2.25rem, 4.4vw, 3.75rem)' }}
            >
              {titleText}
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
                  navigate(encoded ? `/catalog?q=${encoded}` : '/catalog');
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
                onClick={() => navigate(primaryCtaUrl)}
                className="px-6 py-3 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity inline-flex items-center gap-2 cursor-pointer"
              >
                <span>{primaryCtaLabel}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => navigate(secondaryCtaUrl)}
                className="editorial-link text-sm font-medium text-[var(--bone)] cursor-pointer"
              >
                {secondaryCtaLabel}
              </button>
            </div>
          </div>
        </div>

        <div className="hairline-cell lg:col-span-5 relative overflow-hidden group">
          <img
            src={imageUrl}
            alt={titleText}
            referrerPolicy="no-referrer"
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

  // 2. trust_strip
  if (section.sectionType === 'trust_strip') {
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
            onClick={() => navigate(`/product/${heroFeatured.slug}`)}
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
                  usdCents={resolveUnitOfferPrice(heroFeatured.basePriceUsdCents, heroFeatured, offers).effectiveUsdCents}
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

  // 3. departments_bento
  if (section.sectionType === 'departments_bento') {
    const rawItems = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];
    const items =
      rawItems.length > 0
        ? rawItems.map((it) => ({
            slug: String(it.slug || 'fashion'),
            tint: String(it.tint || 'var(--sand)'),
            tag: getLocalized(it.tag, locale),
            title: getLocalized(it.title, locale),
            desc: getLocalized(it.desc, locale),
            image: String(it.image || '/src/assets/images/cat_fashion_linen_1795297173988.jpg'),
          }))
        : [
            {
              slug: 'fashion',
              tint: 'var(--sand)',
              tag: locale === 'ar' ? 'أسلوب تحريري · مقاسات دقيقة' : 'Editorial Lookbook · Size Guide',
              title: t.fashionTitle,
              desc: t.fashionDesc,
              image: '/src/assets/images/cat_fashion_linen_1795297173988.jpg',
            },
            {
              slug: 'electronics',
              tint: 'var(--cyan)',
              tag: locale === 'ar' ? 'مواصفات تقنية · ضمانات موثقة' : 'Spec Tables · Verified Warranty',
              title: t.electronicsTitle,
              desc: t.electronicsDesc,
              image: '/src/assets/images/cat_electronics_audio_1795297173898.jpg',
            },
            {
              slug: 'home-gadgets',
              tint: 'var(--sage)',
              tag: locale === 'ar' ? 'أدوات عملية · خزف وقهوة' : 'Home Rituals · Precision Gear',
              title: t.homeTitle,
              desc: t.homeDesc,
              image: '/src/assets/images/cat_home_gadgets_1795297173679.jpg',
            },
          ];

    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading title={titleText} />
        <div className="hairline-grid grid-cols-1 md:grid-cols-3">
          {items.map((dept) => (
            <button
              key={dept.slug}
              type="button"
              onClick={() => navigate(`/catalog?department=${dept.slug}`)}
              className="hairline-cell group text-start p-5 flex flex-col justify-between gap-4 hover:bg-[var(--ink)] cursor-pointer"
            >
              <div>
                <ResilientImage src={dept.image} alt={dept.title} aspectClass="aspect-[4/3]" />
                <p className="mt-4 text-[11px] font-mono-tabular uppercase tracking-wider" style={{ color: dept.tint }}>
                  {dept.tag}
                </p>
                <h3 className="mt-1 font-display text-2xl font-bold text-[var(--bone)]">{dept.title}</h3>
                <p className="mt-1.5 text-sm text-[var(--muted)]">{dept.desc}</p>
              </div>
              <span className="editorial-link text-xs font-semibold text-[var(--bone)]">
                {locale === 'ar' ? 'تصفح القسم' : 'Browse Department'}
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 4. dynamic_products_grid
  if (section.sectionType === 'dynamic_products_grid') {
    const filterMode = String(c.filterMode || 'all');
    const deptFilter = String(c.department || '');
    const limit = Math.max(1, Math.min(12, Number(c.limit || 6)));
    const subtitle = getLocalized(c.subtitle, locale);
    const ctaLabel = getLocalized(c.ctaLabel, locale, locale === 'ar' ? 'تصفح الكتالوج' : 'Browse Catalog');
    const ctaUrl = typeof c.ctaUrl === 'string' && c.ctaUrl ? c.ctaUrl : '/catalog';

    let list = [...products];
    if (deptFilter) list = list.filter((p) => p.department === deptFilter);
    if (filterMode === 'featured') list = list.filter((p) => p.isFeatured);
    if (filterMode === 'deals') {
      list = list.filter(
        (p) => p.isDeal || resolveUnitOfferPrice(p.basePriceUsdCents, p, offers).appliedOffer !== null
      );
    }
    const visible = list.slice(0, limit);

    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading
          title={titleText}
          subtitle={subtitle || undefined}
          action={
            <button
              type="button"
              onClick={() => navigate(ctaUrl)}
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
            onAction={() => navigate('/seller')}
          />
        ) : (
          <div className="hairline-grid grid-cols-1 md:grid-cols-3">
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

  // 5. verified_stores_grid
  if (section.sectionType === 'verified_stores_grid') {
    const limit = Math.max(1, Math.min(12, Number(c.limit || 6)));
    const subtitle = getLocalized(c.subtitle, locale);
    const visibleSellers = sellers.slice(0, limit);

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
            onAction={() => navigate('/seller')}
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
                    onClick={() => navigate(`/store/${seller.slug}`)}
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

  // 6. category_spotlight
  if (section.sectionType === 'category_spotlight') {
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
            onClick={() => navigate(`/catalog?department=${encodeURIComponent(department)}`)}
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

  // 7. flash_deals_countdown
  if (section.sectionType === 'flash_deals_countdown') {
    const subtitle = getLocalized(c.subtitle, locale);
    const limit = Math.max(1, Math.min(9, Number(c.limit || 3)));
    const scheduledEnds = offers
      .map((o) => parseUtcTimestampMs(o.endsAt))
      .filter((ms): ms is number => ms !== null && ms > nowMs)
      .sort((a, b) => a - b);
    const nearestEndMs = scheduledEnds[0] ?? null;

    const discountedProducts = products
      .filter((p) => resolveUnitOfferPrice(p.basePriceUsdCents, p, offers, nowMs).appliedOffer !== null)
      .slice(0, limit);

    return wrapPreviewHeader(
      <div className="space-y-5">
        <SectionHeading
          title={titleText}
          subtitle={subtitle || undefined}
          action={
            nearestEndMs ? (
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

  // 8. promo_announcement_split
  if (section.sectionType === 'promo_announcement_split') {
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
            onClick={() => navigate(ctaUrl)}
            className="self-start px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    );
  }

  // 9. brand_manifesto_band
  if (section.sectionType === 'brand_manifesto_band') {
    const eyebrow = getLocalized(c.eyebrow, locale);
    const statement = getLocalized(c.statement, locale);
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
            onClick={() => navigate(ctaUrl)}
            className="editorial-link text-xs font-semibold uppercase tracking-wider text-[var(--ember)] pt-2 cursor-pointer"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        )}
      </div>
    );
  }

  // 10. seller_recruitment_cta
  if (section.sectionType === 'seller_recruitment_cta') {
    const body = getLocalized(c.body, locale);
    const ctaLabel = getLocalized(c.ctaLabel, locale, t.heroSecondaryCta);
    const ctaUrl = typeof c.ctaUrl === 'string' && c.ctaUrl ? c.ctaUrl : '/seller';

    return wrapPreviewHeader(
      <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
        <div className="hairline-cell lg:col-span-5 p-6 md:p-8 flex flex-col justify-between gap-6">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--cedar)]">
              {locale === 'ar' ? 'بوابة التجار اللبنانيين' : 'Merchant Onboarding'}
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-[var(--bone)]">{titleText}</h2>
            <span className="heading-dash" aria-hidden="true" />
            {body && <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">{body}</p>}
          </div>
          <button
            type="button"
            onClick={() => navigate(ctaUrl)}
            className="self-start px-6 py-3 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </button>
        </div>

        <div className="hairline-cell lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--line)]">
          {subscriptionPlans.map((plan) => (
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
                {plan.productLimit ? `${plan.productLimit} SKUs max` : locale === 'ar' ? 'منتجات غير محدودة' : 'Unlimited SKUs'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 11. governorates_coverage_grid
  if (section.sectionType === 'governorates_coverage_grid') {
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

  // 12. comparison_table
  if (section.sectionType === 'comparison_table') {
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

  // 13. newsletter_dispatch
  if (section.sectionType === 'newsletter_dispatch') {
    const desc = getLocalized(c.desc, locale);
    const ctaLabel = getLocalized(c.ctaLabel, locale, locale === 'ar' ? 'اشتراك' : 'Subscribe');

    return wrapPreviewHeader(
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="max-w-xl">
          <h2 className="font-display text-2xl font-bold text-[var(--bone)]">{titleText}</h2>
          <span className="heading-dash" aria-hidden="true" />
          {desc && <p className="mt-2 text-sm text-[var(--muted)]">{desc}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!dispatchEmail.trim()) return;
            setDispatchEmail('');
            showToast(
              locale === 'ar' ? 'تم تسجيل بريدك لتنبيهات المتاجر والعروض.' : 'Subscribed to NileLink launch & offer dispatches.',
              'success'
            );
          }}
          className="flex w-full lg:w-auto lg:min-w-[380px] border border-[var(--line)] bg-[var(--ink)]"
        >
          <input
            type="email"
            required
            value={dispatchEmail}
            onChange={(e) => setDispatchEmail(e.target.value)}
            placeholder={locale === 'ar' ? 'بريدك الإلكتروني' : 'you@example.com'}
            aria-label="Dispatch email"
            className="flex-1 min-w-0 bg-transparent px-3.5 py-2.5 text-sm text-[var(--bone)] focus:outline-none"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider cursor-pointer shrink-0"
          >
            {ctaLabel}
          </button>
        </form>
      </div>
    );
  }

  // 14. faq_accordion
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
                  onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
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

  // 15. custom_rich_editorial
  const eyebrow = getLocalized(c.eyebrow, locale);
  const body = getLocalized(c.body, locale);
  const imageUrl = typeof c.imageUrl === 'string' ? c.imageUrl : '';
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
            onClick={() => navigate(ctaUrl)}
            className="px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        )}
      </div>
      {imageUrl && (
        <div className="hairline-cell lg:col-span-5 overflow-hidden">
          <ResilientImage src={imageUrl} alt={titleText} aspectClass="aspect-[4/3] lg:h-full" />
        </div>
      )}
    </div>
  );
}
