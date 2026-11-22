import React, { useState } from 'react';
import { Check, Heart, Minus, Package, Plus, ShieldCheck, Star } from 'lucide-react';
import type { DepartmentSlug, Product, Seller } from '../shared/types.ts';
import { formatMoney } from '../shared/money.ts';
import { resolveUnitOfferPrice } from '../shared/offers.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';

export function getDepartmentAccent(dept: DepartmentSlug): string {
  if (dept === 'fashion') return 'var(--sand)';
  if (dept === 'electronics') return 'var(--cyan)';
  return 'var(--sage)';
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl md:text-3xl font-bold text-[var(--bone)]">{title}</h2>
        <span className="heading-dash" aria-hidden="true" />
        {subtitle && <p className="mt-2 text-sm text-[var(--muted)] max-w-xl">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StampBadge({
  label,
  tone = 'cedar',
}: {
  label: string;
  tone?: 'cedar' | 'ember' | 'gold';
}) {
  const colorMap = {
    cedar: 'var(--cedar)',
    ember: 'var(--ember)',
    gold: 'var(--gold)',
  };
  const strokeColor = colorMap[tone];

  return (
    <span
      className="stamp-badge inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-mono-tabular uppercase tracking-wider select-none"
      style={{ borderColor: strokeColor, color: strokeColor, borderRadius: '2px' }}
    >
      <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function ResilientImage({
  src,
  alt,
  className = '',
  aspectClass = 'aspect-[4/3]',
}: {
  src: string;
  alt: string;
  className?: string;
  aspectClass?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`${aspectClass} w-full flex flex-col items-center justify-center bg-[var(--ink)] border border-[var(--line)] text-[var(--muted)] p-4 ${className}`}
      >
        <Package className="w-7 h-7 mb-2 opacity-60" aria-hidden="true" />
        <span className="text-xs text-center line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <div className={`${aspectClass} w-full overflow-hidden bg-[var(--ink)]`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] ${className}`}
      />
    </div>
  );
}

export function PriceDisplay({
  usdCents,
  compareAtUsdCents,
  size = 'md',
}: {
  usdCents: number;
  compareAtUsdCents?: number | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { currency, settings, locale } = useMarketplace();
  const secondaryCurrency = currency === 'USD' ? 'LBP' : 'USD';
  const sizeClass =
    size === 'lg' ? 'text-2xl md:text-3xl font-bold' : size === 'sm' ? 'text-sm font-medium' : 'text-base font-semibold';

  return (
    <div className="flex flex-wrap items-baseline gap-2 font-mono-tabular">
      <span className={`${sizeClass} text-[var(--bone)]`}>
        {formatMoney(usdCents, currency, settings.exchangeRateLbpPerUsd, locale)}
      </span>
      {compareAtUsdCents && compareAtUsdCents > usdCents && (
        <span className="text-xs line-through text-[var(--muted)]">
          {formatMoney(compareAtUsdCents, currency, settings.exchangeRateLbpPerUsd, locale)}
        </span>
      )}
      <span className="text-[11px] text-[var(--muted)]">
        / {formatMoney(usdCents, secondaryCurrency, settings.exchangeRateLbpPerUsd, locale)}
      </span>
    </div>
  );
}

export function QuantityStepper({
  value,
  min = 1,
  max = 99,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="inline-flex items-center border border-[var(--line)] bg-[var(--ink)]">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className="w-9 h-9 flex items-center justify-center text-[var(--bone)] hover:bg-[var(--graphite)] disabled:opacity-40 cursor-pointer"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="w-10 text-center text-sm font-mono-tabular text-[var(--bone)]">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase quantity"
        className="w-9 h-9 flex items-center justify-center text-[var(--bone)] hover:bg-[var(--graphite)] disabled:opacity-40 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function RatingInline({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-xs font-mono-tabular text-[var(--muted)]">
      <Star className="w-3.5 h-3.5 fill-current text-[var(--gold)]" aria-hidden="true" />
      <span className="text-[var(--bone)] font-medium">{rating.toFixed(1)}</span>
      <span aria-hidden="true">·</span>
      <span>({count})</span>
    </div>
  );
}

export function ProductCard({
  product,
  seller,
}: {
  product: Product;
  seller?: Seller;
}) {
  const { locale, navigate, addToCart, wishlist, toggleWishlist, t, offers } = useMarketplace();
  const isWished = wishlist.includes(product.id);
  const defaultVariant = product.variants.find((v) => v.stock > 0) || product.variants[0];
  const inStock = product.variants.some((v) => v.stock > 0);
  const accent = getDepartmentAccent(product.department);
  const resolved = resolveUnitOfferPrice(product.basePriceUsdCents, product, offers);

  return (
    <article
      className="group hairline-cell flex flex-col justify-between p-4 md:p-5 relative transition-colors"
      style={{ borderRadius: '0px' }}
    >
      <div>
        <div className="relative mb-4">
          <button
            type="button"
            onClick={() => navigate(`/product/${product.slug}`)}
            className="block w-full text-start cursor-pointer"
          >
            <ResilientImage
              src={product.images[0]}
              alt={product.title[locale]}
              aspectClass="aspect-[4/3]"
            />
          </button>
          <button
            type="button"
            onClick={() => toggleWishlist(product.id)}
            aria-label={isWished ? 'Remove from wishlist' : 'Add to wishlist'}
            className="absolute top-2.5 end-2.5 w-9 h-9 flex items-center justify-center bg-[var(--ink)]/85 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
          >
            <Heart className={`w-4 h-4 ${isWished ? 'fill-[var(--ember)] text-[var(--ember)]' : ''}`} />
          </button>
        </div>

        {/* Clean unboxed metadata with typographic separator */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)] mb-1.5">
          <span style={{ color: accent }} className="font-medium uppercase tracking-wider">
            {product.department.replace('-', ' ')}
          </span>
          {seller && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => navigate(`/store/${seller.slug}`)}
                className="editorial-link hover:text-[var(--bone)] cursor-pointer"
              >
                {seller.name[locale]}
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate(`/product/${product.slug}`)}
          className="text-start w-full cursor-pointer"
        >
          <h3 className="text-base font-semibold text-[var(--bone)] group-hover:text-[var(--ember)] transition-colors line-clamp-2">
            {product.title[locale]}
          </h3>
        </button>

        <p className="mt-1 text-xs text-[var(--muted)] line-clamp-1">{product.subtitle[locale]}</p>
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-end justify-between gap-3">
        <div>
          {resolved.appliedOffer && (
            <p className="text-[11px] font-mono-tabular uppercase tracking-wider text-[var(--ember)] mb-1">
              {resolved.appliedOffer.offerType === 'fixed_usd_cents'
                ? `-$${(resolved.appliedOffer.discountValue / 100).toFixed(2)}`
                : `-${resolved.appliedOffer.discountValue}%`}{' '}
              · {resolved.appliedOffer.title[locale]}
            </p>
          )}
          <PriceDisplay usdCents={resolved.effectiveUsdCents} compareAtUsdCents={resolved.compareAtUsdCents} size="sm" />
          <div className="mt-1.5 flex items-center gap-2">
            <RatingInline rating={product.rating} count={product.reviewCount} />
            <span aria-hidden="true" className="text-[var(--muted)]">·</span>
            <span className={`text-[11px] font-medium ${inStock ? 'text-[var(--cedar)]' : 'text-[var(--muted)]'}`}>
              {inStock ? t.inStock : t.outOfStock}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={!inStock || !defaultVariant}
          onClick={() => defaultVariant && addToCart(product.id, defaultVariant.id, 1)}
          className="shrink-0 h-9 px-3 text-xs font-semibold border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] hover:bg-[var(--ember)] hover:text-[var(--ember-fg)] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
        >
          {t.addToCart}
        </button>
      </div>
    </article>
  );
}

export function SkeletonCell() {
  return (
    <div className="hairline-cell p-5 animate-pulse">
      <div className="aspect-[4/3] w-full bg-[var(--ink)] border border-[var(--line)] mb-4" />
      <div className="h-3 w-24 bg-[var(--line)] mb-2" />
      <div className="h-5 w-3/4 bg-[var(--line)] mb-2" />
      <div className="h-4 w-1/2 bg-[var(--line)]" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="hairline-cell p-10 text-center border border-[var(--line)]">
      <Package className="w-8 h-8 mx-auto mb-3 text-[var(--muted)]" aria-hidden="true" />
      <h3 className="font-display text-xl font-bold text-[var(--bone)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--muted)] max-w-md mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 px-5 py-2.5 text-xs font-semibold bg-[var(--ember)] text-[var(--ember-fg)] hover:opacity-90 cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function StatusLabel({
  status,
  tone,
}: {
  status: string;
  tone: 'cedar' | 'gold' | 'ember' | 'muted';
}) {
  const color =
    tone === 'cedar'
      ? 'var(--cedar)'
      : tone === 'gold'
        ? 'var(--gold)'
        : tone === 'ember'
          ? 'var(--ember)'
          : 'var(--muted)';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-mono-tabular uppercase" style={{ color }}>
      <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
