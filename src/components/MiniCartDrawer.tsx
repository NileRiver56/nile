import React from 'react';
import { ArrowRight, ShoppingBag, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { resolveUnitOfferPrice } from '../shared/offers.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { PriceDisplay, QuantityStepper, ResilientImage } from './HairlineUI.tsx';

export function MiniCartDrawer() {
  const {
    isCartOpen,
    setIsCartOpen,
    cart,
    products,
    sellers,
    offers,
    updateCartQty,
    removeFromCart,
    locale,
    t,
    navigate,
  } = useMarketplace();

  // Group items by sellerId to preview split sub-orders
  const grouped = new Map<
    string,
    {
      sellerName: string;
      lines: {
        productId: string;
        variantId: string;
        quantity: number;
        title: string;
        variantLabel: string;
        unitPriceUsdCents: number;
        compareAtUsdCents: number | null;
        image: string;
        stock: number;
      }[];
    }
  >();

  let subtotalUsdCents = 0;

  if (isCartOpen) {
    for (const item of cart) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;
      const variant = product.variants.find((v) => v.id === item.variantId) || product.variants[0];
      if (!variant) continue;
      const seller = sellers.find((s) => s.id === product.sellerId);
      const baseUnit = product.basePriceUsdCents + variant.priceDeltaUsdCents;
      const resolved = resolveUnitOfferPrice(baseUnit, product, offers);
      const unitPriceUsdCents = resolved.effectiveUsdCents;
      subtotalUsdCents += unitPriceUsdCents * item.quantity;

      const entry = grouped.get(product.sellerId) || {
        sellerName: seller ? seller.name[locale] : 'Storefront',
        lines: [],
      };
      entry.lines.push({
        productId: product.id,
        variantId: variant.id,
        quantity: item.quantity,
        title: product.title[locale],
        variantLabel: `${variant.size || ''} · ${variant.color}`.replace(/^ · /, ''),
        unitPriceUsdCents,
        compareAtUsdCents: resolved.savingsUsdCents > 0 ? baseUnit : null,
        image: product.images[0],
        stock: variant.stock,
      });
      grouped.set(product.sellerId, entry);
    }
  }

  return (
    <AnimatePresence>
      {isCartOpen && (
        <motion.div
          key="mini-cart-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[1px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCartOpen(false);
          }}
        >
          <motion.div
            key="mini-cart-panel"
            initial={{ x: locale === 'ar' ? -40 : 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: locale === 'ar' ? -40 : 40, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md bg-[var(--ink)] border-s border-[var(--line)] h-full flex flex-col justify-between"
            role="dialog"
            aria-label={t.yourBag}
          >
            <div className="p-5 border-b border-[var(--line)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4 text-[var(--ember)]" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold text-[var(--bone)]">{t.yourBag}</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                aria-label="Close bag"
                className="w-9 h-9 flex items-center justify-center border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {cart.length === 0 ? (
                <div className="py-16 text-center text-sm text-[var(--muted)]">
                  <p>{t.emptyBag}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCartOpen(false);
                      navigate('/catalog');
                    }}
                    className="mt-4 px-4 py-2 text-xs font-semibold border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                  >
                    {t.heroPrimaryCta}
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-[var(--muted)] border border-[var(--line)] bg-[var(--graphite)] p-3">
                    {t.splitNotice}
                  </p>

                  {Array.from(grouped.entries()).map(([sellerId, group], idx) => (
                    <div key={sellerId} className="border border-[var(--line)] bg-[var(--graphite)]">
                      <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center justify-between text-xs font-mono-tabular">
                        <span className="font-semibold text-[var(--bone)]">{group.sellerName}</span>
                        <span className="text-[var(--muted)]">
                          {locale === 'ar' ? `طلب فرعي #${idx + 1}` : `Sub-Order #${idx + 1}`}
                        </span>
                      </div>
                      <div className="divide-y divide-[var(--line)]">
                        {group.lines.map((line) => (
                          <div key={`${line.productId}-${line.variantId}`} className="p-4 flex gap-3.5">
                            <div className="w-20 shrink-0">
                              <ResilientImage src={line.image} alt={line.title} aspectClass="aspect-square" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[var(--bone)] truncate">{line.title}</p>
                              <p className="text-xs text-[var(--muted)] mt-0.5">{line.variantLabel}</p>
                              <div className="mt-2">
                                <PriceDisplay
                                  usdCents={line.unitPriceUsdCents * line.quantity}
                                  compareAtUsdCents={
                                    line.compareAtUsdCents ? line.compareAtUsdCents * line.quantity : null
                                  }
                                  size="sm"
                                />
                              </div>
                              <div className="mt-3 flex items-center justify-between">
                                <QuantityStepper
                                  value={line.quantity}
                                  max={Math.max(1, line.stock)}
                                  onChange={(next) => updateCartQty(line.productId, line.variantId, next)}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(line.productId, line.variantId)}
                                  aria-label="Remove item"
                                  className="text-[var(--muted)] hover:text-[var(--ember)] p-1.5 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-5 border-t border-[var(--line)] bg-[var(--graphite)] space-y-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-[var(--muted)]">{t.subtotal}</span>
                  <PriceDisplay usdCents={subtotalUsdCents} size="md" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCartOpen(false);
                    navigate('/checkout');
                  }}
                  className="w-full py-3 px-4 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-90 cursor-pointer"
                >
                  <span>{t.proceedCheckout}</span>
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
