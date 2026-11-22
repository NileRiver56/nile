import React, { useEffect, useState } from 'react';
import { HelpCircle, LifeBuoy, Truck } from 'lucide-react';
import type { SupportTicket } from '../shared/types.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { PriceDisplay, SectionHeading, StatusLabel } from '../components/HairlineUI.tsx';

export function SupportPage() {
  const { locale, t, deliveryZones, authUser, apiFetch, showToast, navigate } = useMarketplace();
  const [email, setEmail] = useState(authUser?.email || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<SupportTicket | null>(null);
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);

  useEffect(() => {
    if (authUser?.email) setEmail(authUser.email);
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      setMyTickets([]);
      return;
    }
    void apiFetch<{ tickets: SupportTicket[] }>('/api/support-tickets')
      .then((res) => setMyTickets(res.tickets || []))
      .catch(() => {});
  }, [authUser, apiFetch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{ ticket: SupportTicket }>('/api/support-tickets', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      setSubmittedTicket(res.ticket);
      setSubject('');
      setMessage('');
      if (authUser) setMyTickets((prev) => [res.ticket, ...prev]);
      showToast(locale === 'ar' ? 'تم استلام تذكرة الدعم' : 'Support ticket submitted', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const faqItems =
    locale === 'ar'
      ? [
          {
            q: 'كيف يتم تقسيم الطلبات متعددة المتاجر؟',
            a: 'عند الشراء من أكثر من بائع، يتم إنشاء طلب فرعي مستقل لكل بائع برسوم توصيل واضحة وتتبع خاص.',
          },
          {
            q: 'ما هي طرق الدفع المتاحة في لبنان؟',
            a: 'الدفع عند الاستلام (COD)، والتحويل اليدوي عبر Whish Money / OMT مع إدخال مرجع الإيصال، والبطاقة المصرفية عند تفعيلها.',
          },
          {
            q: 'كيف أطلب إرجاعاً أو أفتح نزاعاً؟',
            a: 'انتقل إلى صفحة تتبع الطلبات وأدخل رقم الطلب، ثم اختر طلب إرجاع أو فتح نزاع أسفل الشحنة المطلوبة.',
          },
        ]
      : [
          {
            q: 'How do multi-seller split sub-orders work?',
            a: 'Items from different merchants are grouped automatically into independent seller sub-orders, each with transparent delivery fees and courier tracking.',
          },
          {
            q: 'Which payment methods are supported across Lebanon?',
            a: 'Cash on Delivery (COD), manual Whish Money / OMT transfer receipts verified by operations, and card gateway checkout when enabled.',
          },
          {
            q: 'How do I request a return or open an order dispute?',
            a: 'Open Orders & Tracking, locate your shipment sub-order, and submit an inline Return Request or Dispute.',
          },
        ];

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-8">
      <SectionHeading
        title={t.supportCenter}
        subtitle={
          locale === 'ar'
            ? 'الأسئلة الشائعة، جداول التوصيل عبر المحافظات، وتذاكر الدعم المباشر.'
            : 'Delivery coverage across 8 Lebanese governorates, order help, and direct support tickets.'
        }
      />

      <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
        {/* Left: Help topics & Governorate coverage */}
        <div className="hairline-cell lg:col-span-7 p-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono-tabular uppercase text-[var(--ember)]">
              <HelpCircle className="w-4 h-4" />
              <span>{locale === 'ar' ? 'الأسئلة المتكررة' : 'Marketplace Help Topics'}</span>
            </div>
            <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
              {faqItems.map((item, idx) => (
                <div key={idx} className="p-4 space-y-1.5">
                  <h2 className="font-semibold text-sm text-[var(--bone)]">{item.q}</h2>
                  <p className="text-xs leading-relaxed text-[var(--muted)]">{item.a}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono-tabular uppercase text-[var(--cedar)]">
              <Truck className="w-4 h-4" />
              <span>{locale === 'ar' ? 'التوصيل حسب المحافظة' : 'Governorate Delivery Matrix'}</span>
            </div>
            <div className="overflow-x-auto border border-[var(--line)]">
              <table className="w-full text-xs text-start">
                <thead className="border-b border-[var(--line)] bg-[var(--ink)] font-mono-tabular uppercase text-[var(--muted)]">
                  <tr>
                    <th className="p-3 text-start">{t.governorate}</th>
                    <th className="p-3 text-start">ETA</th>
                    <th className="p-3 text-start">{locale === 'ar' ? 'تعرفة المنصة' : 'Platform Courier Fee'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {deliveryZones.map((z) => (
                    <tr key={z.governorateCode}>
                      <td className="p-3 font-medium text-[var(--bone)]">{z.name[locale]}</td>
                      <td className="p-3 font-mono-tabular text-[var(--muted)]">{z.etaDays}</td>
                      <td className="p-3">
                        <PriceDisplay usdCents={z.platformFeeUsdCents} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2 text-xs">
            <button
              type="button"
              onClick={() => navigate('/orders')}
              className="px-4 py-2 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
            >
              {t.myOrders}
            </button>
            <button
              type="button"
              onClick={() => navigate('/legal?tab=returns')}
              className="px-4 py-2 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
            >
              {t.legalReturns}
            </button>
          </div>
        </div>

        {/* Right: Ticket Submission & User Tickets */}
        <div className="hairline-cell lg:col-span-5 p-6 space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono-tabular uppercase text-[var(--ember)]">
              <LifeBuoy className="w-4 h-4" />
              <span>{locale === 'ar' ? 'فتح تذكرة دعم' : 'Open Support Ticket'}</span>
            </div>
            <p className="text-xs text-[var(--muted)]">
              {locale === 'ar'
                ? 'أرسل استفسارك أو رقم طلبك وسيرد عليك فريق العمليات.'
                : 'Include your order number if applicable and our Beirut operations desk will respond.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">Email *</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">
                {locale === 'ar' ? 'الموضوع' : 'Subject'} *
              </span>
              <input
                type="text"
                required
                minLength={3}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={locale === 'ar' ? 'استفسار عن شحنة...' : 'Delivery delay or Whish transfer check'}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">
                {locale === 'ar' ? 'الرسالة' : 'Details'} *
              </span>
              <textarea
                required
                minLength={10}
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer disabled:opacity-50"
            >
              {submitting ? '...' : locale === 'ar' ? 'إرسال التذكرة' : 'Submit Support Ticket'}
            </button>
          </form>

          {submittedTicket && (
            <div className="border border-[var(--cedar)] bg-[var(--ink)] p-4 text-xs space-y-1">
              <p className="font-mono-tabular text-[var(--cedar)] uppercase">Ticket Received · {submittedTicket.id}</p>
              <p className="font-semibold text-[var(--bone)]">{submittedTicket.subject}</p>
            </div>
          )}

          {myTickets.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-[var(--line)]">
              <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">
                {locale === 'ar' ? 'تذاكرك السابقة' : 'Your Recent Tickets'}
              </p>
              <div className="space-y-2">
                {myTickets.slice(0, 5).map((tkt) => (
                  <div key={tkt.id} className="border border-[var(--line)] bg-[var(--ink)] p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--bone)]">{tkt.subject}</span>
                      <StatusLabel status={tkt.status.replace('_', ' ')} tone={tkt.status === 'resolved' ? 'cedar' : 'gold'} />
                    </div>
                    <p className="text-[var(--muted)] line-clamp-2">{tkt.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
