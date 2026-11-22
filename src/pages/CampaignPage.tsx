import React, { useEffect, useState } from 'react';
import { Clock, Copy, Check, Flame, Sparkles, Tag, Zap } from 'lucide-react';
import type { Campaign, FlashSale, Offer } from '../shared/types.ts';
import { offerMatchesTarget } from '../shared/offers.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, PriceDisplay, ProductCard, ResilientImage, SectionHeading } from '../components/HairlineUI.tsx';

function useCountdown(targetIso?: string | null) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!targetIso) {
      setRemainingMs(null);
      return;
    }
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(targetIso.trim())
      ? targetIso.trim().replace(' ', 'T') + 'Z'
      : targetIso;
    const endMs = Date.parse(normalized);
    if (Number.isNaN(endMs)) {
      setRemainingMs(null);
      return;
    }
    const update = () => setRemainingMs(Math.max(0, endMs - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso]);

  if (remainingMs === null) return null;
  const totalSec = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return { days, hours, mins, secs, expired: remainingMs <= 0 };
}

export function CampaignPage({ slug }: { slug: string }) {
  const { locale, products, sellers, addToCart, navigate, showToast, t } = useMarketplace();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [linkedOffers, setLinkedOffers] = useState<Offer[]>([]);
  const [flashSale, setFlashSale] = useState<FlashSale | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/campaigns/${encodeURIComponent(slug)}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Campaign not found');
        return (await r.json()) as { campaign: Campaign; offers: Offer[]; flashSale: FlashSale | null };
      })
      .then((data) => {
        if (!active) return;
        setCampaign(data.campaign);
        setLinkedOffers(data.offers || []);
        setFlashSale(data.flashSale || null);
      })
      .catch(() => {
        if (active) setCampaign(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const countdown = useCountdown(flashSale?.endsAt || campaign?.endsAt);

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-12">
        <div className="h-64 border border-[var(--line)] bg-[var(--graphite)] animate-pulse" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-12">
        <EmptyState
          title={locale === 'ar' ? 'الحملة غير متوفرة' : 'Campaign Not Found'}
          description={
            locale === 'ar'
              ? 'قد تكون هذه الحملة الترويجية قد انتهت أو تم إيقافها.'
              : 'This promotional campaign may have ended or is no longer active.'
          }
          actionLabel={t.navCatalog}
          onAction={() => navigate('/catalog')}
        />
      </div>
    );
  }

  const tokenBg: Record<string, string> = {
    ember: 'border-[var(--ember)] bg-[var(--graphite)]',
    cedar: 'border-[var(--cedar)] bg-[var(--graphite)]',
    gold: 'border-[var(--gold)] bg-[var(--graphite)]',
    cyan: 'border-[var(--cyan)] bg-[var(--graphite)]',
    sand: 'border-[var(--sand)] bg-[var(--graphite)]',
    graphite: 'border-[var(--line)] bg-[var(--graphite)]',
  };

  const matchingProducts = products.filter((prod) => {
    if (linkedOffers.length === 0) return false;
    return linkedOffers.some((off) => offerMatchesTarget(off.targetType, off.targetId, prod));
  });

  const handleCopyCoupon = (code: string) => {
    void navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    showToast(locale === 'ar' ? `تم نسخ الكود ${code}` : `Copied coupon ${code}`, 'success');
    window.setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-10">
      {/* Campaign Hero */}
      <section className={`border ${tokenBg[campaign.bgToken] || 'border-[var(--line)] bg-[var(--graphite)]'} grid grid-cols-1 lg:grid-cols-12`}>
        <div className="p-6 md:p-10 lg:col-span-7 flex flex-col justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-mono-tabular uppercase tracking-wider text-[var(--ember)]">
              <Sparkles className="w-4 h-4" />
              <span>{locale === 'ar' ? 'حملة ترويجية رسمية' : 'Official Marketplace Campaign'}</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-[var(--bone)]">
              {campaign.title[locale]}
            </h1>
            {campaign.subtitle[locale] && (
              <p className="text-lg text-[var(--sand)] font-medium">{campaign.subtitle[locale]}</p>
            )}
            {campaign.description[locale] && (
              <p className="text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
                {campaign.description[locale]}
              </p>
            )}
          </div>

          {countdown && !countdown.expired && (
            <div className="inline-flex flex-wrap items-center gap-3 border border-[var(--line)] bg-[var(--ink)] px-4 py-3 w-fit">
              <Clock className="w-4 h-4 text-[var(--ember)]" />
              <span className="text-xs font-mono-tabular uppercase text-[var(--muted)]">
                {locale === 'ar' ? 'ينتهي خلال' : 'Ends in'}
              </span>
              <span className="font-mono-tabular text-base font-bold text-[var(--bone)]">
                {countdown.days > 0 ? `${countdown.days}d ` : ''}
                {String(countdown.hours).padStart(2, '0')}:{String(countdown.mins).padStart(2, '0')}:
                {String(countdown.secs).padStart(2, '0')}
              </span>
            </div>
          )}
        </div>

        {campaign.heroImageUrl && (
          <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-s border-[var(--line)]">
            <ResilientImage src={campaign.heroImageUrl} alt={campaign.title[locale]} aspectClass="aspect-[16/10] lg:h-full" />
          </div>
        )}
      </section>

      {/* Campaign Coupon Codes */}
      {campaign.featuredCouponCodes.length > 0 && (
        <section className="space-y-4">
          <SectionHeading
            title={locale === 'ar' ? 'أكواد الخصم الحصرية' : 'Exclusive Campaign Coupons'}
            subtitle={locale === 'ar' ? 'انسخ الكود وطبّقه عند الدفع' : 'Copy a code and apply it during checkout'}
          />
          <div className="hairline-grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {campaign.featuredCouponCodes.map((code) => (
              <div key={code} className="hairline-cell p-5 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-mono-tabular uppercase text-[var(--muted)]">
                    {locale === 'ar' ? 'رمز الخصم' : 'Promo Code'}
                  </span>
                  <p className="font-mono-tabular text-xl font-bold text-[var(--gold)] tracking-wider">{code}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCoupon(code)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[var(--line)] text-xs font-semibold text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                >
                  {copiedCode === code ? <Check className="w-3.5 h-3.5 text-[var(--cedar)]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode === code ? (locale === 'ar' ? 'تم النسخ' : 'Copied') : locale === 'ar' ? 'نسخ' : 'Copy'}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Linked Flash Sale */}
      {flashSale && flashSale.items.length > 0 && (
        <section className="space-y-4">
          <SectionHeading
            title={flashSale.title[locale]}
            subtitle={locale === 'ar' ? 'عروض محدودة الكمية حتى نفاد المخزون المخصص' : 'Stock-capped flash deals while allocated inventory lasts'}
          />
          <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {flashSale.items.map((item) => {
              const prod = products.find((p) => p.id === item.productId);
              if (!prod) return null;
              const variant = prod.variants.find((v) => v.stock > 0) || prod.variants[0];
              const remaining = item.stockCap > 0 ? Math.max(0, item.stockCap - item.claimedCount) : null;
              const soldOut = remaining !== null && remaining <= 0;
              return (
                <div key={item.id} className="hairline-cell p-4 flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/product/${prod.slug}`)}
                      className="block w-full text-start cursor-pointer"
                    >
                      <ResilientImage src={prod.images[0]} alt={prod.title[locale]} />
                    </button>
                    <div className="flex items-center justify-between text-xs font-mono-tabular">
                      <span className="text-[var(--ember)] font-bold inline-flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" /> -{item.discountPercent}%
                      </span>
                      {remaining !== null && (
                        <span className={soldOut ? 'text-[var(--muted)]' : 'text-[var(--gold)]'}>
                          {soldOut
                            ? locale === 'ar'
                              ? 'نفدت الكمية'
                              : 'Cap Reached'
                            : locale === 'ar'
                              ? `متبقي ${remaining}`
                              : `${remaining} left`}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--bone)] line-clamp-2">{prod.title[locale]}</h3>
                  </div>

                  <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between gap-2">
                    <PriceDisplay
                      usdCents={item.salePriceUsdCents}
                      compareAtUsdCents={prod.basePriceUsdCents}
                      size="sm"
                    />
                    <button
                      type="button"
                      disabled={soldOut || !variant}
                      onClick={() => variant && addToCart(prod.id, variant.id, 1)}
                      className="px-3 py-1.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase disabled:opacity-40 cursor-pointer"
                    >
                      {t.addToCart}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Linked Offers Summary */}
      {linkedOffers.length > 0 && (
        <section className="space-y-4">
          <SectionHeading title={locale === 'ar' ? 'العروض المشمولة' : 'Active Campaign Promotions'} />
          <div className="hairline-grid grid-cols-1 md:grid-cols-3">
            {linkedOffers.map((off) => (
              <div key={off.id} className="hairline-cell p-5 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono-tabular">
                  <span className="inline-flex items-center gap-1.5 text-[var(--ember)] uppercase font-bold">
                    <Flame className="w-3.5 h-3.5" />
                    {off.offerType.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[var(--muted)]">
                    <Tag className="w-3 h-3 inline me-1" />
                    {off.targetType}
                  </span>
                </div>
                <p className="font-display text-lg font-bold text-[var(--bone)]">{off.title[locale]}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Qualifying Products */}
      <section className="space-y-4">
        <SectionHeading
          title={locale === 'ar' ? 'المنتجات المشاركة' : 'Participating Products'}
          action={
            <button
              type="button"
              onClick={() => navigate('/catalog?deals=true')}
              className="px-4 py-2 border border-[var(--line)] text-xs font-semibold text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
            >
              {locale === 'ar' ? 'تصفح كل العروض' : 'Browse All Deals'}
            </button>
          }
        />
        {matchingProducts.length === 0 ? (
          <EmptyState
            title={locale === 'ar' ? 'استكشف الكتالوج' : 'Explore Full Catalog'}
            description={
              locale === 'ar'
                ? 'تسوق المنتجات المشمولة في عروضنا عبر الكتالوج الكامل.'
                : 'Browse the full catalog to claim campaign coupons and cart promotions at checkout.'
            }
            actionLabel={t.navCatalog}
            onAction={() => navigate('/catalog')}
          />
        ) : (
          <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {matchingProducts.map((prod) => (
              <ProductCard
                key={prod.id}
                product={prod}
                seller={sellers.find((s) => s.id === prod.sellerId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
