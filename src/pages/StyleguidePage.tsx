import React, { useState } from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import { getContrastRatio } from '../shared/money.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import {
  EmptyState,
  PriceDisplay,
  ProductCard,
  QuantityStepper,
  RatingInline,
  SectionHeading,
  SkeletonCell,
  StampBadge,
  StatusLabel,
} from '../components/HairlineUI.tsx';

const TOKEN_PAIRS = [
  { name: '--bone on --ink', darkA: '#F3EFE8', darkB: '#17181B', lightA: '#17181B', lightB: '#F3EFE8', min: 4.5 },
  { name: '--bone on --graphite', darkA: '#F3EFE8', darkB: '#222428', lightA: '#17181B', lightB: '#FFFFFF', min: 4.5 },
  { name: '--muted on --graphite', darkA: '#A9ABB2', darkB: '#222428', lightA: '#5B5E66', lightB: '#FFFFFF', min: 4.5 },
  { name: '--ember-fg on --ember', darkA: '#17181B', darkB: '#FF5A44', lightA: '#17181B', lightB: '#E8452F', min: 4.5 },
  { name: '--cedar on --graphite', darkA: '#2FBF8F', darkB: '#222428', lightA: '#1E9A72', lightB: '#FFFFFF', min: 3.0 },
  { name: '--cyan on --graphite', darkA: '#4DD4E6', darkB: '#222428', lightA: '#0E8FA3', lightB: '#FFFFFF', min: 3.0 },
];

export function StyleguidePage() {
  const { theme, toggleTheme, locale, toggleLocale, currency, toggleCurrency, products, sellers } = useMarketplace();
  const [stepperVal, setStepperVal] = useState(2);
  const [sampleInput, setSampleInput] = useState('');
  const [sampleError, setSampleError] = useState('Lebanese phone format: +961 70 123456');

  const sampleProduct = products[0];
  const sampleSeller = sampleProduct ? sellers.find((s) => s.id === sampleProduct.sellerId) : undefined;

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-10">
      {/* Live Mode Switcher Header */}
      <div className="hairline-grid grid-cols-1 md:grid-cols-12">
        <div className="hairline-cell md:col-span-8 p-6 md:p-8">
          <p className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--ember)]">
            Design System · Phase 0
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold text-[var(--bone)]">
            Hairline Grid Styleguide
          </h1>
          <span className="heading-dash" aria-hidden="true" />
          <p className="mt-3 text-sm text-[var(--muted)] max-w-2xl">
            Every NileLink token, contrast audit, RTL/LTR typographic specimen, and reusable storefront component
            rendered live. Toggle Dark/Light, EN/AR, and USD/LBP on the right to verify parity.
          </p>
        </div>
        <div className="hairline-cell md:col-span-4 p-6 flex flex-col justify-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full py-2.5 px-4 border border-[var(--line)] text-xs font-mono-tabular text-[var(--bone)] flex items-center justify-between hover:border-[var(--ember)] cursor-pointer"
          >
            <span>Theme Mode</span>
            <span className="inline-flex items-center gap-1.5">
              {theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              {theme.toUpperCase()}
            </span>
          </button>
          <button
            type="button"
            onClick={toggleLocale}
            className="w-full py-2.5 px-4 border border-[var(--line)] text-xs font-mono-tabular text-[var(--bone)] flex items-center justify-between hover:border-[var(--ember)] cursor-pointer"
          >
            <span>Direction / Language</span>
            <span>{locale === 'ar' ? 'RTL · العربية' : 'LTR · English'}</span>
          </button>
          <button
            type="button"
            onClick={toggleCurrency}
            className="w-full py-2.5 px-4 border border-[var(--line)] text-xs font-mono-tabular text-[var(--bone)] flex items-center justify-between hover:border-[var(--ember)] cursor-pointer"
          >
            <span>Display Currency</span>
            <span>{currency}</span>
          </button>
        </div>
      </div>

      {/* Automated WCAG 2.2 AA Contrast Verification */}
      <section className="space-y-4">
        <SectionHeading
          title="Color Tokens & Automated WCAG Contrast Audit"
          subtitle="Computed dynamically against the active dark and light palette tokens."
        />
        <div className="border border-[var(--line)] bg-[var(--graphite)] overflow-x-auto">
          <table className="w-full text-xs font-mono-tabular text-start border-collapse">
            <thead className="border-b border-[var(--line)] text-[var(--muted)] uppercase">
              <tr>
                <th className="p-4 text-start">Token Pair</th>
                <th className="p-4 text-start">Dark Ratio</th>
                <th className="p-4 text-start">Light Ratio</th>
                <th className="p-4 text-start">WCAG Threshold</th>
                <th className="p-4 text-start">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {TOKEN_PAIRS.map((pair) => {
                const darkRatio = getContrastRatio(pair.darkA, pair.darkB);
                const lightRatio = getContrastRatio(pair.lightA, pair.lightB);
                const passes = darkRatio >= pair.min && lightRatio >= pair.min;
                return (
                  <tr key={pair.name}>
                    <td className="p-4 text-[var(--bone)]">{pair.name}</td>
                    <td className="p-4 text-[var(--bone)]">{darkRatio}:1</td>
                    <td className="p-4 text-[var(--bone)]">{lightRatio}:1</td>
                    <td className="p-4 text-[var(--muted)]">&gt;= {pair.min}:1</td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-1 text-[var(--cedar)]">
                        <Check className="w-3.5 h-3.5" />
                        {passes ? 'PASS' : 'CHECK'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Typography EN & AR Specimen */}
      <section className="space-y-4">
        <SectionHeading title="Typography & RTL Discipline" />
        <div className="hairline-grid grid-cols-1 md:grid-cols-2">
          <div className="hairline-cell p-6 space-y-3" dir="ltr">
            <p className="text-xs font-mono-tabular text-[var(--muted)] uppercase">
              English · Barlow Condensed + Barlow
            </p>
            <p className="font-display text-3xl font-bold text-[var(--bone)]">
              Beirut Craftsmanship
            </p>
            <p className="text-sm text-[var(--muted)]">
              Condensed uppercase headings use 0.08em tracking; body prose uses comfortable 1.55 line-height and tabular figures for pricing ($68.00).
            </p>
          </div>
          <div className="hairline-cell p-6 space-y-3" dir="rtl">
            <p className="text-xs font-mono-tabular text-[var(--muted)]">
              العربية · IBM Plex Sans Arabic (تباعد أحرف 0)
            </p>
            <p className="font-display text-3xl font-bold text-[var(--bone)]">
              تجارة منتقاة في كل لبنان
            </p>
            <p className="text-sm text-[var(--muted)]">
              تُعرض العناوين العربية بدون تباعد أحرف للحفاظ على اتصال الحروف وانسيابية القراءة مع دعم كامل لاتجاه RTL.
            </p>
          </div>
        </div>
      </section>

      {/* Reusable Components Showcase */}
      <section className="space-y-4">
        <SectionHeading title="Component Matrix" />
        <div className="hairline-grid grid-cols-1 md:grid-cols-3">
          <div className="hairline-cell p-6 space-y-4">
            <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">Stamps, Status & Ratings</p>
            <div className="flex flex-wrap gap-2">
              <StampBadge label="Verified Seller" tone="cedar" />
              <StampBadge label="Flash Dispatch" tone="ember" />
              <StampBadge label="Top Rated" tone="gold" />
            </div>
            <div className="flex flex-wrap gap-4 pt-2">
              <StatusLabel status="Delivered" tone="cedar" />
              <StatusLabel status="Pending Verification" tone="gold" />
              <RatingInline rating={4.9} count={42} />
            </div>
          </div>

          <div className="hairline-cell p-6 space-y-4">
            <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">Price, Stepper & Links</p>
            <PriceDisplay usdCents={14900} compareAtUsdCents={17900} size="lg" />
            <div className="flex items-center gap-4">
              <QuantityStepper value={stepperVal} onChange={setStepperVal} />
              <button type="button" className="editorial-link text-sm font-semibold text-[var(--bone)] cursor-pointer">
                Animated Underline Link
              </button>
            </div>
          </div>

          <div className="hairline-cell p-6 space-y-3">
            <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">Form Inline Validation</p>
            <input
              type="text"
              value={sampleInput}
              onChange={(e) => {
                setSampleInput(e.target.value);
                setSampleError(e.target.value.startsWith('+961') ? '' : 'Must start with +961 country code');
              }}
              placeholder="+961 70 123456"
              aria-label="Sample Lebanese phone validation"
              className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)] font-mono-tabular"
            />
            {sampleError ? (
              <p className="text-xs text-[var(--ember)]">{sampleError}</p>
            ) : (
              <p className="text-xs text-[var(--cedar)]">Valid Lebanese phone prefix</p>
            )}
          </div>
        </div>

        <div className="hairline-grid grid-cols-1 md:grid-cols-3">
          {sampleProduct && <ProductCard product={sampleProduct} seller={sampleSeller} />}
          <SkeletonCell />
          <EmptyState
            title="Empty Cell State"
            description="Used when filters return zero results or a seller has no pending payouts."
          />
        </div>
      </section>
    </div>
  );
}
