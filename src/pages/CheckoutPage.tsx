import React, { useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, MessageCircle, Truck, Wallet } from 'lucide-react';
import type { Order, PaymentMethod } from '../shared/types.ts';
import { LEBANON_GOVERNORATES } from '../shared/lebanon.ts';
import { resolveUnitOfferPrice } from '../shared/offers.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, PriceDisplay, SectionHeading, StampBadge } from '../components/HairlineUI.tsx';
import { OfferBannerStrip } from '../components/OfferBannerStrip.tsx';

export function CheckoutPage() {
  const {
    cart,
    products,
    sellers,
    offers,
    deliveryZones,
    settings,
    paymentsConfig,
    locale,
    t,
    navigate,
    clearCart,
    apiFetch,
    showToast,
    authUser,
  } = useMarketplace();

  const [customerName, setCustomerName] = useState(authUser?.name || '');
  const [customerPhone, setCustomerPhone] = useState(authUser?.phone || '+961 ');
  const [governorate, setGovernorate] = useState('beirut');
  const [district, setDistrict] = useState('achrafieh');
  const [town, setTown] = useState('Gemmayze');
  const [addressNotes, setAddressNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    paymentsConfig.codEnabled ? 'cod' : 'whish_manual'
  );
  const [transferReference, setTransferReference] = useState('');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number; sellerId: string | null } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  const selectedGov = useMemo(
    () => LEBANON_GOVERNORATES.find((g) => g.code === governorate) || LEBANON_GOVERNORATES[0],
    [governorate]
  );
  const selectedDist = useMemo(
    () => selectedGov.districts.find((d) => d.code === district) || selectedGov.districts[0],
    [selectedGov, district]
  );

  const sellerPreview = useMemo(() => {
    const groups = new Map<
      string,
      {
        sellerName: string;
        deliveryMode: 'self' | 'platform';
        deliveryFeeUsdCents: number;
        subtotalUsdCents: number;
        itemCount: number;
      }
    >();

    for (const item of cart) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;
      const variant = product.variants.find((v) => v.id === item.variantId) || product.variants[0];
      const seller = sellers.find((s) => s.id === product.sellerId);
      if (!seller || !variant) continue;

      const baseUnit = product.basePriceUsdCents + variant.priceDeltaUsdCents;
      const effUnit = resolveUnitOfferPrice(baseUnit, product, offers).effectiveUsdCents;
      const lineTotal = effUnit * item.quantity;
      const zoneFee =
        seller.deliveryMode === 'self'
          ? seller.selfDeliveryFeesUsdCents[governorate] ?? 500
          : deliveryZones.find((z) => z.governorateCode === governorate)?.platformFeeUsdCents ?? 500;

      const curr = groups.get(seller.id);
      if (curr) {
        curr.subtotalUsdCents += lineTotal;
        curr.itemCount += item.quantity;
      } else {
        groups.set(seller.id, {
          sellerName: seller.name[locale],
          deliveryMode: seller.deliveryMode,
          deliveryFeeUsdCents: zoneFee,
          subtotalUsdCents: lineTotal,
          itemCount: item.quantity,
        });
      }
    }
    return groups;
  }, [cart, products, sellers, offers, governorate, deliveryZones, locale]);

  const subtotalUsdCents = Array.from(sellerPreview.values()).reduce((s, g) => s + g.subtotalUsdCents, 0);
  const deliveryTotalUsdCents = Array.from(sellerPreview.values()).reduce((s, g) => s + g.deliveryFeeUsdCents, 0);
  const discountUsdCents = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (!appliedCoupon.sellerId) {
      return Math.round((subtotalUsdCents * appliedCoupon.discountPercent) / 100);
    }
    const target = sellerPreview.get(appliedCoupon.sellerId);
    return target ? Math.round((target.subtotalUsdCents * appliedCoupon.discountPercent) / 100) : 0;
  }, [appliedCoupon, subtotalUsdCents, sellerPreview]);

  const codFeeUsdCents = paymentMethod === 'cod' ? settings.codFeeUsdCents : 0;
  const grandTotalUsdCents = subtotalUsdCents - discountUsdCents + deliveryTotalUsdCents + codFeeUsdCents;

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    try {
      const res = await apiFetch<{ coupon: { code: string; discountPercent: number; sellerId: string | null } }>(
        '/api/coupons/validate',
        {
          method: 'POST',
          body: JSON.stringify({
            code: couponInput.trim(),
            subtotalUsdCents,
            sellerIds: Array.from(sellerPreview.keys()),
          }),
        }
      );
      setAppliedCoupon(res.coupon);
      showToast(`Applied ${res.coupon.code} (${res.coupon.discountPercent}% off)`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName,
          customerPhone,
          governorate,
          district,
          town,
          addressNotes,
          paymentMethod,
          transferReference: paymentMethod === 'whish_manual' ? transferReference : undefined,
          couponCode: appliedCoupon?.code,
          items: cart,
        }),
      });
      setConfirmedOrder(res.order);
      clearCart();
      showToast(`${t.orderConfirmed}: ${res.order.orderNumber}`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmedOrder) {
    const shareWhatsapp = `https://wa.me/?text=${encodeURIComponent(
      `NileLink Order ${confirmedOrder.orderNumber} confirmed! Total: $${(
        confirmedOrder.grandTotalUsdCents / 100
      ).toFixed(2)} across ${confirmedOrder.subOrders.length} seller shipment(s).`
    )}`;

    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-12 space-y-6">
        <div className="hairline-cell border border-[var(--line)] p-6 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-7 h-7 text-[var(--cedar)]" aria-hidden="true" />
              <div>
                <p className="text-xs font-mono-tabular text-[var(--cedar)] uppercase">{t.orderConfirmed}</p>
                <h1 className="font-display text-3xl font-bold text-[var(--bone)]">
                  {confirmedOrder.orderNumber}
                </h1>
              </div>
            </div>
            <StampBadge label={confirmedOrder.paymentStatus.replace('_', ' ')} tone="gold" />
          </div>

          <p className="text-sm text-[var(--muted)]">
            {locale === 'ar'
              ? `تم تقسيم طلبك تلقائياً إلى ${confirmedOrder.subOrders.length} طلبات فرعية مستقلة حسب البائع.`
              : `Your checkout has been split into ${confirmedOrder.subOrders.length} independent seller sub-orders.`}
          </p>

          <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
            {confirmedOrder.subOrders.map((sub) => (
              <div key={sub.id} className="p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                <div>
                  <p className="font-semibold text-[var(--bone)]">{sub.sellerName[locale]}</p>
                  <p className="text-xs font-mono-tabular text-[var(--muted)]">
                    {sub.id} · {sub.items.length} SKU(s) · {sub.deliveryMode} delivery
                  </p>
                </div>
                <PriceDisplay usdCents={sub.subtotalUsdCents + sub.deliveryFeeUsdCents - sub.discountUsdCents} size="sm" />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/orders')}
                className="px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
              >
                {t.myOrders}
              </button>
              <a
                href={shareWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 border border-[var(--line)] text-xs font-semibold text-[var(--cedar)] inline-flex items-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{locale === 'ar' ? 'مشاركة عبر واتساب' : 'Share via WhatsApp'}</span>
              </a>
            </div>
            <PriceDisplay usdCents={confirmedOrder.grandTotalUsdCents} size="md" />
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-12">
        <EmptyState
          title={t.emptyBag}
          description={locale === 'ar' ? 'أضف منتجات إلى حقيبتك قبل إتمام الطلب.' : 'Add products to your bag before checking out.'}
          actionLabel={t.navCatalog}
          onAction={() => navigate('/catalog')}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-6">
      <OfferBannerStrip page="checkout" />
      <SectionHeading title={t.checkoutTitle} />

      <form onSubmit={handlePlaceOrder} className="hairline-grid grid-cols-1 lg:grid-cols-12">
        <div className="hairline-cell lg:col-span-7 p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.fullName} *</span>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={locale === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              />
            </label>
            <label className="block space-y-1.5 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.phone} *</span>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+961 ..."
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)] font-mono-tabular"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block space-y-1.5 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.governorate}</span>
              <select
                value={governorate}
                onChange={(e) => {
                  const nextGov = LEBANON_GOVERNORATES.find((g) => g.code === e.target.value);
                  setGovernorate(e.target.value);
                  if (nextGov?.districts[0]) {
                    setDistrict(nextGov.districts[0].code);
                    setTown(nextGov.districts[0].towns[0]?.en || '');
                  }
                }}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              >
                {LEBANON_GOVERNORATES.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name[locale]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.district}</span>
              <select
                value={district}
                onChange={(e) => {
                  const nextDist = selectedGov.districts.find((d) => d.code === e.target.value);
                  setDistrict(e.target.value);
                  if (nextDist?.towns[0]) setTown(nextDist.towns[0].en);
                }}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              >
                {selectedGov.districts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name[locale]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.town}</span>
              <select
                value={town}
                onChange={(e) => setTown(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              >
                {selectedDist.towns.map((tw) => (
                  <option key={tw.en} value={tw.en}>
                    {tw[locale]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5 text-xs">
            <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.addressNotes}</span>
            <input
              type="text"
              value={addressNotes}
              onChange={(e) => setAddressNotes(e.target.value)}
              placeholder={locale === 'ar' ? 'الشارع، المبنى، الطابق...' : 'Street, building, floor, nearby landmark'}
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
            />
          </label>

          {/* Live Payment Gateway Adapter Selection */}
          <div className="space-y-3 pt-2 border-t border-[var(--line)]">
            <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">{t.paymentMethod}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'cod' as const, label: t.payCod, icon: Truck, enabled: paymentsConfig.codEnabled },
                { id: 'whish_manual' as const, label: t.payWhish, icon: Wallet, enabled: paymentsConfig.whishManualEnabled },
                { id: 'card' as const, label: t.payCard, icon: CreditCard, enabled: paymentsConfig.cardEnabled },
              ].map((m) => {
                const Icon = m.icon;
                const active = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!m.enabled}
                    onClick={() => setPaymentMethod(m.id)}
                    className={`p-3.5 text-start border transition-colors ${
                      !m.enabled
                        ? 'border-[var(--line)] opacity-45 cursor-not-allowed text-[var(--muted)]'
                        : active
                          ? 'border-[var(--ember)] bg-[var(--ink)] text-[var(--bone)] cursor-pointer'
                          : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--bone)] cursor-pointer'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-2 ${active ? 'text-[var(--ember)]' : ''}`} />
                    <p className="text-xs font-semibold">{m.label}</p>
                    {!m.enabled && (
                      <p className="mt-1 text-[10px] font-mono-tabular">
                        {locale === 'ar' ? 'غير مفعّل بعد' : 'Not configured'}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'whish_manual' && paymentsConfig.whishManualEnabled && (
              <div className="border border-[var(--gold)] bg-[var(--ink)] p-4 space-y-3">
                <p className="text-xs text-[var(--bone)]">
                  {paymentsConfig.whishInstructions[locale] || ''} ({paymentsConfig.whishAccountNumber})
                </p>
                <label className="block space-y-1 text-xs">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.transferRef} *</span>
                  <input
                    type="text"
                    required
                    value={transferReference}
                    onChange={(e) => setTransferReference(e.target.value)}
                    placeholder="Transfer Receipt Reference"
                    className="w-full bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)] font-mono-tabular"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="hairline-cell lg:col-span-5 p-6 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <h2 className="font-display text-xl font-bold text-[var(--bone)]">
              {locale === 'ar' ? 'ملخص الشحنات المقسمة' : 'Split Sub-Orders'}
            </h2>

            <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
              {Array.from(sellerPreview.entries()).map(([sellerId, g]) => (
                <div key={sellerId} className="p-3.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-[var(--bone)]">
                    <span>{g.sellerName}</span>
                    <span>{g.itemCount} item(s)</span>
                  </div>
                  <div className="flex items-center justify-between text-[var(--muted)]">
                    <span>
                      {g.deliveryMode === 'self' ? 'Seller Fleet' : 'Platform Courier'} ({selectedGov.name[locale]})
                    </span>
                    <PriceDisplay usdCents={g.deliveryFeeUsdCents} size="sm" />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder={t.couponCode}
                aria-label={t.couponCode}
                className="flex-1 bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-xs font-mono-tabular uppercase text-[var(--bone)]"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                className="px-4 py-2 border border-[var(--line)] text-xs font-semibold text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
              >
                {t.applyCoupon}
              </button>
            </div>

            <div className="space-y-2 pt-3 border-t border-[var(--line)] text-sm">
              <div className="flex justify-between text-[var(--muted)]">
                <span>{t.subtotal}</span>
                <PriceDisplay usdCents={subtotalUsdCents} size="sm" />
              </div>
              <div className="flex justify-between text-[var(--muted)]">
                <span>{t.deliveryEst}</span>
                <PriceDisplay usdCents={deliveryTotalUsdCents} size="sm" />
              </div>
              {codFeeUsdCents > 0 && (
                <div className="flex justify-between text-[var(--muted)]">
                  <span>{t.codFee}</span>
                  <PriceDisplay usdCents={codFeeUsdCents} size="sm" />
                </div>
              )}
              {discountUsdCents > 0 && (
                <div className="flex justify-between text-[var(--cedar)]">
                  <span>
                    {t.discount} ({appliedCoupon?.code})
                  </span>
                  <PriceDisplay usdCents={-discountUsdCents} size="sm" />
                </div>
              )}
              <div className="flex justify-between items-baseline pt-3 border-t border-[var(--line)]">
                <span className="font-semibold text-[var(--bone)]">{t.total}</span>
                <PriceDisplay usdCents={grandTotalUsdCents} size="md" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? '...' : t.placeOrder}
          </button>
        </div>
      </form>
    </div>
  );
}
