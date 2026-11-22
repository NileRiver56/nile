import React, { useEffect, useState } from 'react';
import { MapPin, MessageCircle, Truck } from 'lucide-react';
import type { Product, Review, Seller } from '../shared/types.ts';
import { APPROVED_STOREFRONT_THEMES } from '../shared/themes.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, ProductCard, SectionHeading, StampBadge } from '../components/HairlineUI.tsx';
import { OfferBannerStrip } from '../components/OfferBannerStrip.tsx';

export function StorefrontPage({ slug }: { slug: string }) {
  const { locale, t, navigate, theme } = useMarketplace();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          if (active) setSeller(null);
          return;
        }
        const data = await res.json();
        if (active) {
          setSeller(data.seller);
          setProducts(data.products || []);
          setReviews(data.reviews || []);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-12">
        <div className="hairline-cell h-64 animate-pulse" />
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-12">
        <EmptyState
          title="Storefront unavailable"
          description="This merchant storefront does not exist or is awaiting verification."
          actionLabel={t.navCatalog}
          onAction={() => navigate('/catalog')}
        />
      </div>
    );
  }

  const themeSpec = APPROVED_STOREFRONT_THEMES[seller.storefrontTheme] || APPROVED_STOREFRONT_THEMES['obsidian-ember'];
  const accentHex = theme === 'dark' ? themeSpec.accentHexDark : themeSpec.accentHexLight;
  const whatsappUrl = `https://wa.me/${seller.whatsappPhone}?text=${encodeURIComponent(
    `Hello ${seller.name.en}, I am browsing your storefront on NileLink.`
  )}`;

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 md:py-8 space-y-8">
      <OfferBannerStrip page="store" />
      {seller.announcement?.[locale] && (
        <div
          className="border border-[var(--line)] px-4 py-2.5 text-xs font-mono-tabular flex items-center justify-between"
          style={{ backgroundColor: themeSpec.surfaceTint, borderColor: accentHex }}
        >
          <span className="text-[var(--bone)]">{seller.announcement[locale]}</span>
          <span style={{ color: accentHex }} className="uppercase">
            {themeSpec.name[locale]}
          </span>
        </div>
      )}

      {/* Branded Storefront Hero Bento */}
      <div className="hairline-grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="hairline-cell lg:col-span-7 p-6 md:p-10 flex flex-col justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              {seller.verified && <StampBadge label={t.verifiedSeller} tone="cedar" />}
              <span className="text-xs font-mono-tabular text-[var(--muted)] uppercase">
                ★ {seller.rating.toFixed(1)} · {seller.reviewCount}{' '}
                {locale === 'ar' ? 'تقييم' : 'reviews'}
              </span>
            </div>

            <h1 className="mt-4 font-display text-4xl md:text-5xl font-bold text-[var(--bone)]">
              {seller.name[locale]}
            </h1>
            <span className="block w-6 h-0.5 mt-2" style={{ backgroundColor: accentHex }} aria-hidden="true" />
            <p className="mt-3 text-base text-[var(--bone)]">{seller.tagline[locale]}</p>
            <p className="mt-2 text-sm text-[var(--muted)] max-w-xl">{seller.about[locale]}</p>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-[var(--line)] text-xs text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" style={{ color: accentHex }} />
              {seller.governorate} · {seller.district}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" style={{ color: accentHex }} />
              {seller.deliveryMode === 'self'
                ? locale === 'ar'
                  ? 'توصيل خاص بالمتجر'
                  : 'Seller Direct Delivery'
                : locale === 'ar'
                  ? 'توصيل نايل لينك'
                  : 'Platform Courier'}
            </span>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="editorial-link font-semibold text-[var(--cedar)]"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{t.contactWhatsapp}</span>
            </a>
          </div>
        </div>

        <div className="hairline-cell lg:col-span-5 overflow-hidden">
          <img
            src={seller.bannerImage}
            alt={seller.name[locale]}
            referrerPolicy="no-referrer"
            className="w-full h-64 lg:h-full object-cover"
          />
        </div>
      </div>

      {/* Storefront Catalog */}
      <section className="space-y-4">
        <SectionHeading title={locale === 'ar' ? 'منتجات المتجر' : 'Storefront Catalog'} />
        {products.length === 0 ? (
          <EmptyState
            title="No published products yet"
            description="This merchant has not published any SKUs yet."
          />
        ) : (
          <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} seller={seller} />
            ))}
          </div>
        )}
      </section>

      {/* Store Reviews */}
      {reviews.length > 0 && (
        <section className="space-y-4">
          <SectionHeading title={t.reviewsHeading} />
          <div className="hairline-grid grid-cols-1 md:grid-cols-2">
            {reviews.map((rev) => (
              <div key={rev.id} className="hairline-cell p-5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--bone)]">{rev.authorName}</span>
                  <span className="font-mono-tabular text-[var(--gold)]">{'★'.repeat(rev.rating)}</span>
                </div>
                <p className="text-sm text-[var(--muted)]">{rev.comment}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
