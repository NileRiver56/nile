import React, { useEffect } from 'react';
import { Eye, Settings2 } from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, SkeletonCell } from '../components/HairlineUI.tsx';
import { HomeSectionRenderer } from '../components/HomeSectionRenderer.tsx';
import { OfferBannerStrip } from '../components/OfferBannerStrip.tsx';
import { FeaturedPlacementStrip } from '../components/FeaturedPlacementStrip.tsx';

export function HomePage() {
  const { homeSections, siteChrome, loading, authUser, previewDrafts, setPreviewDrafts, navigate, locale } = useMarketplace();
  const isAdmin = Boolean(authUser && (authUser.roleKey === 'admin_super' || authUser.roleKey === 'admin_staff'));

  useEffect(() => {
    const seoTitle = siteChrome.homeSeo?.title?.[locale] || siteChrome.homeSeo?.title?.en;
    const seoDesc = siteChrome.homeSeo?.description?.[locale] || siteChrome.homeSeo?.description?.en;
    if (seoTitle) document.title = seoTitle;
    if (seoDesc) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', seoDesc);
    }
  }, [siteChrome, locale]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 md:py-8 space-y-10">
      {isAdmin && previewDrafts && (
        <div className="border border-[var(--gold)] bg-[var(--graphite)] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono-tabular">
          <div className="flex items-center gap-2 text-[var(--gold)]">
            <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              {locale === 'ar'
                ? 'وضع معاينة المسودات والعروض المجدولة مفعّل (مرئي للمشرفين فقط)'
                : 'ADMIN DRAFT PREVIEW ACTIVE · Showing draft & scheduled sections (hidden from public)'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setPreviewDrafts(false);
                navigate('/');
              }}
              className="px-3 py-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
            >
              {locale === 'ar' ? 'العودة للوضع الحي' : 'Exit Preview'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="px-3 py-1.5 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{locale === 'ar' ? 'لوحة الإدارة' : 'Admin Builder'}</span>
            </button>
          </div>
        </div>
      )}

      <OfferBannerStrip page="home" placement="page_strip" />
      <FeaturedPlacementStrip
        slots={['home_hero_spotlight', 'home_trending_top']}
        headingEn="Featured Spotlights"
        headingAr="عروض المتاجر والمنتجات المميزة"
      />
      <OfferBannerStrip page="home" placement="inline_card" />

      {loading && homeSections.length === 0 ? (
        <div className="hairline-grid grid-cols-1 md:grid-cols-3">
          <SkeletonCell />
          <SkeletonCell />
          <SkeletonCell />
        </div>
      ) : homeSections.length === 0 ? (
        <EmptyState
          title={locale === 'ar' ? 'لا توجد أقسام منشورة في الصفحة الرئيسية' : 'No published home sections yet'}
          description={
            locale === 'ar'
              ? 'يمكن للإدارة إضافة وترتيب أقسام الصفحة الرئيسية من منشئ الواجهة.'
              : 'Administrators can publish or arrange home page sections inside Admin Console → Home Builder.'
          }
          actionLabel={locale === 'ar' ? 'تصفح الكتالوج' : 'Browse Catalog'}
          onAction={() => navigate('/catalog')}
        />
      ) : (
        homeSections.map((section) => (
          <HomeSectionRenderer key={section.id} section={section} isPreview={isAdmin && previewDrafts} />
        ))
      )}
    </div>
  );
}
