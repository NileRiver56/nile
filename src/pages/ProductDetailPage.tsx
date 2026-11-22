import React, { useEffect, useState } from 'react';
import { Heart, MessageCircle, ShieldCheck, ZoomIn } from 'lucide-react';
import type { Product, Review, Seller } from '../shared/types.ts';
import { resolveUnitOfferPrice } from '../shared/offers.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import {
  EmptyState,
  PriceDisplay,
  QuantityStepper,
  RatingInline,
  ResilientImage,
  SectionHeading,
  StampBadge,
  getDepartmentAccent,
} from '../components/HairlineUI.tsx';

export function ProductDetailPage({ slug }: { slug: string }) {
  const { locale, t, addToCart, wishlist, toggleWishlist, navigate, apiFetch, authUser, showToast, offers } =
    useMarketplace();

  const [product, setProduct] = useState<Product | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeImage, setActiveImage] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(slug)}`, { credentials: 'include' });
        if (!res.ok) {
          if (active) setProduct(null);
          return;
        }
        const data = await res.json();
        if (active) {
          setProduct(data.product);
          setSeller(data.seller);
          setReviews(data.reviews || []);
          const firstAvail =
            data.product.variants.find((v: { stock: number }) => v.stock > 0) || data.product.variants[0];
          setSelectedVariantId(firstAvail?.id || '');
          setActiveImage(0);
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
        <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
          <div className="hairline-cell lg:col-span-7 h-96 animate-pulse" />
          <div className="hairline-cell lg:col-span-5 h-96 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-12">
        <EmptyState
          title={locale === 'ar' ? 'المنتج غير موجود' : 'Product not found'}
          description={locale === 'ar' ? 'قد يكون هذا المنتج غير منشور حالياً.' : 'This item may have been unpublished or moved.'}
          actionLabel={t.navCatalog}
          onAction={() => navigate('/catalog')}
        />
      </div>
    );
  }

  const activeVariant = product.variants.find((v) => v.id === selectedVariantId) || product.variants[0];
  const baseUnitUsdCents = product.basePriceUsdCents + (activeVariant?.priceDeltaUsdCents || 0);
  const resolvedOffer = resolveUnitOfferPrice(baseUnitUsdCents, product, offers);
  const unitPriceUsdCents = resolvedOffer.effectiveUsdCents;
  const inStock = (activeVariant?.stock || 0) > 0;
  const isWished = wishlist.includes(product.id);
  const deptAccent = getDepartmentAccent(product.department);
  const gallery =
    product.images.length > 0 ? product.images : ['/src/assets/images/hero_beirut_editorial_1795297173320.jpg'];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title[locale],
    description: product.description[locale],
    sku: activeVariant?.sku,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: (unitPriceUsdCents / 100).toFixed(2),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
    ...(product.reviewCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
  };

  const handlePublishReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) {
      showToast(locale === 'ar' ? 'سجّل الدخول لنشر تقييم موثق' : 'Sign in to publish a verified review', 'error');
      return;
    }
    if (!reviewComment.trim()) return;
    setSubmittingReview(true);
    try {
      const res = await apiFetch<{ review: Review }>('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          rating: reviewRating,
          comment: reviewComment,
        }),
      });
      setReviews((prev) => [res.review, ...prev]);
      setReviewComment('');
      showToast(locale === 'ar' ? 'تم نشر تقييمك' : 'Verified review published', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const whatsappUrl = seller
    ? `https://wa.me/${seller.whatsappPhone}?text=${encodeURIComponent(
        `Hello ${seller.name.en}, I have a question about ${product.title.en} (${activeVariant?.sku}) on NileLink.`
      )}`
    : '#';

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 md:py-8 space-y-10 pb-24 md:pb-12">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <button type="button" onClick={() => navigate('/')} className="hover:text-[var(--bone)] cursor-pointer">
          {t.brand}
        </button>
        <span aria-hidden="true">/</span>
        <button
          type="button"
          onClick={() => navigate(`/catalog?department=${product.department}`)}
          className="hover:text-[var(--bone)] uppercase cursor-pointer"
          style={{ color: deptAccent }}
        >
          {product.department}
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-[var(--bone)]">{product.title[locale]}</span>
      </nav>

      <div className="hairline-grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="hairline-cell lg:col-span-7 p-4 md:p-6 space-y-4">
          <div className="relative border border-[var(--line)] bg-[var(--ink)] overflow-hidden">
            <div onClick={() => setZoomed((z) => !z)} className="cursor-zoom-in relative">
              <img
                src={gallery[activeImage] || gallery[0]}
                alt={product.title[locale]}
                referrerPolicy="no-referrer"
                className={`w-full aspect-[4/3] object-cover transition-transform duration-300 ${
                  zoomed ? 'scale-125' : 'scale-100'
                }`}
              />
              <span className="absolute bottom-3 end-3 px-2.5 py-1 bg-[var(--ink)]/85 border border-[var(--line)] text-[11px] font-mono-tabular text-[var(--bone)] inline-flex items-center gap-1.5">
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{zoomed ? '1.25×' : 'Zoom'}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {gallery.map((img, i) => (
              <button
                key={img + i}
                type="button"
                onClick={() => setActiveImage(i)}
                className={`w-16 h-12 border overflow-hidden cursor-pointer ${
                  activeImage === i ? 'border-[var(--ember)]' : 'border-[var(--line)]'
                }`}
              >
                <ResilientImage src={img} alt={`${product.title[locale]} view ${i + 1}`} aspectClass="aspect-[4/3]" />
              </button>
            ))}
          </div>
        </div>

        <div className="hairline-cell lg:col-span-5 p-6 md:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono-tabular uppercase tracking-wider" style={{ color: deptAccent }}>
                {product.department} · SKU {activeVariant?.sku}
              </span>
              <RatingInline rating={product.rating} count={product.reviewCount} />
            </div>

            <h1 className="font-display text-3xl md:text-4xl font-bold text-[var(--bone)]">
              {product.title[locale]}
            </h1>
            <p className="text-sm text-[var(--muted)]">{product.description[locale]}</p>

            <div className="pt-2 border-t border-[var(--line)] space-y-1.5">
              {resolvedOffer.appliedOffer && (
                <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--ember)]">
                  {resolvedOffer.appliedOffer.title[locale]} ·{' '}
                  {resolvedOffer.appliedOffer.offerType === 'fixed_usd_cents'
                    ? `-$${(resolvedOffer.appliedOffer.discountValue / 100).toFixed(2)}`
                    : `-${resolvedOffer.appliedOffer.discountValue}%`}
                </p>
              )}
              <PriceDisplay
                usdCents={unitPriceUsdCents}
                compareAtUsdCents={resolvedOffer.compareAtUsdCents}
                size="lg"
              />
            </div>

            <div className="space-y-2.5 pt-2">
              <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--muted)]">
                {locale === 'ar' ? 'الخيار المتاح' : 'Select Variant'}
              </p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => {
                  const selected = v.id === activeVariant?.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`px-3.5 py-2 text-xs font-medium border flex items-center gap-2 cursor-pointer transition-colors ${
                        selected
                          ? 'border-[var(--ember)] bg-[var(--ink)] text-[var(--bone)]'
                          : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)]'
                      }`}
                    >
                      <span
                        className="w-3 h-3 border border-white/30 shrink-0"
                        style={{ backgroundColor: v.colorHex }}
                        aria-hidden="true"
                      />
                      <span>
                        {v.size ? `${v.size} · ` : ''}
                        {v.color}
                      </span>
                      <span className="font-mono-tabular text-[11px] opacity-75">({v.stock})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <QuantityStepper
                value={quantity}
                max={Math.max(1, activeVariant?.stock || 1)}
                onChange={setQuantity}
              />
              <span className={`text-xs font-mono-tabular ${inStock ? 'text-[var(--cedar)]' : 'text-[var(--ember)]'}`}>
                {inStock
                  ? `${t.inStock} · ${activeVariant?.stock} ${locale === 'ar' ? 'قطعة' : 'units'}`
                  : t.outOfStock}
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={!inStock}
                onClick={() => activeVariant && addToCart(product.id, activeVariant.id, quantity)}
                className="flex-1 py-3.5 px-5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                {t.addToCart}
              </button>
              <button
                type="button"
                onClick={() => toggleWishlist(product.id)}
                aria-label="Wishlist toggle"
                className="w-12 flex items-center justify-center border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
              >
                <Heart className={`w-4 h-4 ${isWished ? 'fill-[var(--ember)] text-[var(--ember)]' : ''}`} />
              </button>
            </div>
          </div>

          {seller && (
            <div className="border border-[var(--line)] bg-[var(--ink)] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-mono-tabular uppercase text-[var(--muted)]">
                    {locale === 'ar' ? 'يباع ويُشحن بواسطة' : 'Sold & fulfilled by'}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(`/store/${seller.slug}`)}
                    className="editorial-link text-base font-semibold text-[var(--bone)] cursor-pointer"
                  >
                    {seller.name[locale]}
                  </button>
                </div>
                {seller.verified && <StampBadge label={t.verifiedSeller} tone="cedar" />}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
                <span>
                  {seller.deliveryMode === 'self'
                    ? locale === 'ar'
                      ? 'توصيل خاص بالمتجر'
                      : 'Seller Direct Fleet'
                    : locale === 'ar'
                      ? 'توصيل نايل لينك المركزي'
                      : 'NileLink Platform Courier'}
                </span>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[var(--cedar)] hover:underline"
                >
                  <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.contactWhatsapp}</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
        <section className="hairline-cell lg:col-span-5 p-6 space-y-4">
          <SectionHeading title={t.specsHeading} />
          {product.specs.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              {locale === 'ar' ? 'لا توجد مواصفات إضافية مسجلة.' : 'No additional specification rows provided.'}
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <tbody className="divide-y divide-[var(--line)]">
                {product.specs.map((spec, i) => (
                  <tr key={i}>
                    <th className="py-3 text-start font-medium text-[var(--muted)] w-2/5">{spec.key[locale]}</th>
                    <td className="py-3 text-end font-mono-tabular text-[var(--bone)]">{spec.value[locale]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="hairline-cell lg:col-span-7 p-6 space-y-5">
          <SectionHeading title={t.reviewsHeading} />

          <form onSubmit={handlePublishReview} className="border border-[var(--line)] bg-[var(--ink)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--bone)]">{t.writeReview}</span>
              {authUser ? (
                <span className="text-xs font-mono-tabular text-[var(--cedar)] inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {authUser.name}
                </span>
              ) : (
                <span className="text-xs text-[var(--muted)]">
                  {locale === 'ar' ? 'يتطلب حساب مشتري موثق' : 'Requires verified buyer purchase & sign-in'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                value={reviewRating}
                onChange={(e) => setReviewRating(Number(e.target.value))}
                aria-label="Rating"
                className="bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 text-xs text-[var(--bone)]"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={
                  locale === 'ar' ? 'اكتب تجربتك بعد استلام الطلب...' : 'Verified buyers can share product feedback...'
                }
                className="flex-1 min-w-0 bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
              />
              <button
                type="submit"
                disabled={submittingReview || !authUser}
                className="px-4 py-2 text-xs font-semibold bg-[var(--ember)] text-[var(--ember-fg)] disabled:opacity-40 cursor-pointer"
              >
                {t.submitReview}
              </button>
            </div>
          </form>

          {reviews.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              {locale === 'ar' ? 'لا توجد تقييمات لهذا المنتج بعد.' : 'No verified reviews yet for this product.'}
            </p>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {reviews.map((rev) => (
                <div key={rev.id} className="py-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--bone)]">{rev.authorName}</span>
                      {rev.verifiedBuyer && (
                        <span className="text-[var(--cedar)] font-mono-tabular">· {t.verifiedBuyer}</span>
                      )}
                    </div>
                    <span className="font-mono-tabular text-[var(--gold)]">{'★'.repeat(rev.rating)}</span>
                  </div>
                  <p className="text-sm text-[var(--bone)]">{rev.comment}</p>
                  {rev.sellerReply && (
                    <p className="text-xs text-[var(--muted)] ps-3 border-s border-[var(--line)]">
                      <strong className="text-[var(--bone)]">{seller?.name[locale]}:</strong> {rev.sellerReply}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="md:hidden fixed bottom-14 inset-x-0 z-30 bg-[var(--graphite)] border-t border-[var(--line)] px-4 py-2.5 flex items-center justify-between gap-3">
        <PriceDisplay usdCents={unitPriceUsdCents} size="sm" />
        <button
          type="button"
          disabled={!inStock}
          onClick={() => activeVariant && addToCart(product.id, activeVariant.id, quantity)}
          className="px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
        >
          {t.addToCart}
        </button>
      </div>
    </div>
  );
}
