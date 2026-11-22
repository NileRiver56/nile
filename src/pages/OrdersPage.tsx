import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Search, Truck } from 'lucide-react';
import type { Order } from '../shared/types.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, PriceDisplay, SectionHeading, StatusLabel } from '../components/HairlineUI.tsx';

export function OrdersPage() {
  const { locale, t, apiFetch, navigate, authUser } = useMarketplace();
  const [orders, setOrders] = useState<Order[]>([]);
  const [lookupNumber, setLookupNumber] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const loadOrders = useCallback(
    async (num = '', phone = '') => {
      if (!authUser && (!num.trim() || !phone.trim())) {
        setOrders([]);
        return;
      }
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (num.trim()) qs.set('orderNumber', num.trim());
        if (phone.trim()) qs.set('phone', phone.trim());
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        const data = await apiFetch<{ orders: Order[] }>(`/api/orders/lookup${suffix}`);
        setOrders(data.orders || []);
      } finally {
        setLoading(false);
      }
    },
    [authUser, apiFetch]
  );

  useEffect(() => {
    if (authUser) void loadOrders();
  }, [authUser, loadOrders]);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    void loadOrders(lookupNumber, lookupPhone);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-6">
      <SectionHeading
        title={t.myOrders}
        subtitle={
          locale === 'ar'
            ? 'تتبع حالة كل طلب فرعي لكل بائع على حدة.'
            : 'Track live fulfillment status across each seller sub-order.'
        }
      />

      <form onSubmit={handleLookup} className="flex flex-wrap max-w-2xl border border-[var(--line)] bg-[var(--graphite)]">
        <input
          type="text"
          value={lookupNumber}
          onChange={(e) => setLookupNumber(e.target.value)}
          placeholder={locale === 'ar' ? 'رقم الطلب (مثال: NL-2026-...)' : 'Order number (e.g. NL-2026-...)'}
          aria-label="Order number lookup"
          className="flex-1 min-w-[180px] bg-transparent px-3 py-2.5 text-sm font-mono-tabular text-[var(--bone)]"
        />
        {!authUser && (
          <input
            type="tel"
            required
            value={lookupPhone}
            onChange={(e) => setLookupPhone(e.target.value)}
            placeholder={locale === 'ar' ? 'رقم الهاتف المسجل' : 'Checkout phone number'}
            aria-label="Checkout phone verification"
            className="flex-1 min-w-[180px] bg-transparent border-s border-[var(--line)] px-3 py-2.5 text-sm font-mono-tabular text-[var(--bone)]"
          />
        )}
        <button
          type="submit"
          className="px-4 py-2.5 border-s border-[var(--line)] text-xs font-semibold text-[var(--bone)] inline-flex items-center gap-1.5 hover:bg-[var(--ember)] hover:text-[var(--ember-fg)] cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
          <span>{locale === 'ar' ? 'تتبع' : 'Track'}</span>
        </button>
      </form>

      {loading ? (
        <div className="hairline-cell h-48 animate-pulse border border-[var(--line)]" />
      ) : orders.length === 0 ? (
        <EmptyState
          title={locale === 'ar' ? 'لا توجد طلبات معروضة' : 'No orders to display'}
          description={
            authUser
              ? locale === 'ar'
                ? 'لم تقم بأي طلبات بعد.'
                : 'You have not placed any orders yet.'
              : locale === 'ar'
                ? 'أدخل رقم الطلب ورقم الهاتف المستخدم عند الشراء لعرض تفاصيل الشحن.'
                : 'Enter both your order number and checkout phone number to verify and view live shipment status.'
          }
          actionLabel={t.navCatalog}
          onAction={() => navigate('/catalog')}
        />
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div key={order.id} className="border border-[var(--line)] bg-[var(--graphite)]">
              <div className="p-5 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-mono-tabular text-lg font-bold text-[var(--bone)]">{order.orderNumber}</h2>
                    <StatusLabel
                      status={order.paymentStatus.replace('_', ' ')}
                      tone={order.paymentStatus === 'paid' ? 'cedar' : 'gold'}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {order.customerName} · {order.governorate} / {order.district} / {order.town} ·{' '}
                    {order.paymentMethod.toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <PriceDisplay usdCents={order.grandTotalUsdCents} size="md" />
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`NileLink Order ${order.orderNumber}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 border border-[var(--line)] text-[var(--cedar)] hover:border-[var(--cedar)]"
                    aria-label="Share order via WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                </div>
              </div>

              <div className="divide-y divide-[var(--line)]">
                {order.subOrders.map((sub) => (
                  <div key={sub.id} className="p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 text-sm">
                        <Truck className="w-4 h-4 text-[var(--cyan)]" aria-hidden="true" />
                        <span className="font-semibold text-[var(--bone)]">{sub.sellerName[locale]}</span>
                        <span className="font-mono-tabular text-xs text-[var(--muted)]">({sub.id})</span>
                      </div>
                      <StatusLabel
                        status={sub.status}
                        tone={sub.status === 'delivered' ? 'cedar' : sub.status === 'cancelled' ? 'ember' : 'gold'}
                      />
                    </div>

                    {sub.trackingCode && (
                      <p className="text-xs font-mono-tabular text-[var(--muted)]">
                        Courier: {sub.courierName} · Tracking: {sub.trackingCode}
                      </p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {sub.items.map((item) => (
                        <div
                          key={item.id}
                          className="border border-[var(--line)] bg-[var(--ink)] p-3 flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-semibold text-[var(--bone)]">{item.titleSnapshot[locale]}</p>
                            <p className="text-[var(--muted)]">
                              {item.variantLabel} · Qty {item.quantity}
                            </p>
                          </div>
                          <PriceDisplay usdCents={item.lineTotalUsdCents} size="sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
