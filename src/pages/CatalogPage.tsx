import React, { useEffect, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import type { NaturalSearchParsed, Product } from '../shared/types.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, ProductCard, SectionHeading, SkeletonCell } from '../components/HairlineUI.tsx';
import { OfferBannerStrip } from '../components/OfferBannerStrip.tsx';
import { FeaturedPlacementStrip } from '../components/FeaturedPlacementStrip.tsx';

export function CatalogPage() {
  const { route, locale, t, sellers, navigate } = useMarketplace();
  const params = new URLSearchParams(route.split('?')[1] || '');

  const [query, setQuery] = useState(params.get('q') || '');
  const [department, setDepartment] = useState(params.get('department') || '');
  const [dealsOnly, setDealsOnly] = useState(params.get('deals') === 'true');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState('featured');
  const [items, setItems] = useState<Product[]>([]);
  const [parsed, setParsed] = useState<NaturalSearchParsed | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const p = new URLSearchParams(route.split('?')[1] || '');
    setQuery(p.get('q') || '');
    setDepartment(p.get('department') || '');
    setDealsOnly(p.get('deals') === 'true');
  }, [route]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const qs = new URLSearchParams();
      if (query.trim()) qs.set('q', query.trim());
      if (department) qs.set('department', department);
      if (dealsOnly) qs.set('deals', 'true');
      if (inStockOnly) qs.set('inStock', 'true');
      if (sort) qs.set('sort', sort);

      try {
        const res = await fetch(`/api/products?${qs.toString()}`);
        const data = await res.json();
        if (active) {
          setItems(data.products || []);
          setParsed(data.parsedQuery || null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [query, department, dealsOnly, inStockOnly, sort]);

  const clearFilters = () => {
    setQuery('');
    setDepartment('');
    setDealsOnly(false);
    setInStockOnly(false);
    setSort('featured');
    navigate('/catalog');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-6">
      <OfferBannerStrip page="catalog" placement="page_strip" />
      <OfferBannerStrip page="catalog" placement="category_header" categorySlug={department || undefined} />
      <FeaturedPlacementStrip
        slots={query.trim() ? ['search_promoted', 'catalog_top_sponsored'] : ['catalog_top_sponsored', 'category_top_spotlight']}
        headingEn="Sponsored & Promoted"
        headingAr="منتجات ومتاجر مميزة"
      />
      <OfferBannerStrip page="catalog" placement="inline_card" />
      <SectionHeading
        title={t.allProducts}
        subtitle={
          locale === 'ar'
            ? 'جرّب البحث الطبيعي مثل "black sneakers size 42 under $60" أو استخدم الفلاتر المباشرة.'
            : 'Try natural-language queries like "black sneakers size 42 under $60" or filter directly below.'
        }
      />

      {/* Sticky Dense Filter & Natural Search Bar */}
      <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
        <div className="hairline-cell lg:col-span-5 p-3 flex items-center gap-2">
          <Search className="w-4 h-4 text-[var(--muted)] shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label="Filter catalog by keyword or natural query"
            className="w-full bg-transparent text-sm text-[var(--bone)] placeholder:text-[var(--muted)] focus:outline-none"
          />
        </div>

        <div className="hairline-cell lg:col-span-7 p-3 flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--muted)] me-1" aria-hidden="true" />
          {[
            { id: '', label: locale === 'ar' ? 'الكل' : 'All' },
            { id: 'fashion', label: t.fashionTitle },
            { id: 'electronics', label: t.electronicsTitle },
            { id: 'home-gadgets', label: t.homeTitle },
          ].map((tab) => (
            <button
              key={tab.id || 'all'}
              type="button"
              onClick={() => setDepartment(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                department === tab.id
                  ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)] font-semibold'
                  : 'border-[var(--line)] text-[var(--bone)] hover:border-[var(--bone)]'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setDealsOnly((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer ${
              dealsOnly
                ? 'border-[var(--gold)] text-[var(--gold)]'
                : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)]'
            }`}
          >
            {t.navDeals}
          </button>

          <button
            type="button"
            onClick={() => setInStockOnly((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer ${
              inStockOnly
                ? 'border-[var(--cedar)] text-[var(--cedar)]'
                : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)]'
            }`}
          >
            {t.filterInStock}
          </button>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label={t.sortBy}
            className="ms-auto bg-[var(--ink)] border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--bone)] cursor-pointer"
          >
            <option value="featured">{t.sortFeatured}</option>
            <option value="price_asc">{t.sortPriceAsc}</option>
            <option value="price_desc">{t.sortPriceDesc}</option>
            <option value="rating">{t.sortRating}</option>
          </select>
        </div>
      </div>

      {/* Natural Language Extraction Notice */}
      {parsed && (parsed.maxPriceUsdCents || parsed.size || parsed.color || parsed.department) && (
        <div className="border border-[var(--line)] bg-[var(--graphite)] px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs font-mono-tabular">
          <span className="text-[var(--cedar)] font-semibold">{t.naturalMatch}:</span>
          {parsed.department && <span>dept={parsed.department}</span>}
          {parsed.color && <span>color={parsed.color}</span>}
          {parsed.size && <span>size={parsed.size}</span>}
          {parsed.maxPriceUsdCents && <span>max=${(parsed.maxPriceUsdCents / 100).toFixed(0)}</span>}
        </div>
      )}

      {/* Dense Scannable Product Grid */}
      {loading ? (
        <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCell />
          <SkeletonCell />
          <SkeletonCell />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={locale === 'ar' ? 'لم يتم العثور على منتجات مطابقة' : 'No matching products'}
          description={
            locale === 'ar'
              ? 'حاول توسيع نطاق السعر أو إزالة أحد الفلاتر.'
              : 'Try clearing active filters or adjusting your natural-language query.'
          }
          actionLabel={locale === 'ar' ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}
          onAction={clearFilters}
        />
      ) : (
        <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((product) => (
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
