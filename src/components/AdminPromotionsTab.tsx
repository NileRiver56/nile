import React, { useState } from 'react';
import { Award, BarChart3, Calendar, Layers, Mail, Megaphone, ShieldCheck, Sparkles, Tag, Ticket, Users, Workflow, Zap } from 'lucide-react';
import type {
  AutomationFlow,
  Campaign,
  Category,
  Coupon,
  CustomerSegment,
  EmailCampaign,
  FeaturedPlacement,
  FlashSale,
  MarketingAnalyticsSummary,
  MarketingPopup,
  NewsletterSubscriber,
  Offer,
  OfferBanner,
  Seller,
  SellerPromoRules,
} from '../shared/types.ts';
import { BannersManagerPanel } from './marketing/BannersManagerPanel.tsx';
import { PopupsManagerPanel } from './marketing/PopupsManagerPanel.tsx';
import { FeaturedPlacementsPanel } from './marketing/FeaturedPlacementsPanel.tsx';
import { OffersWizardPanel } from './marketing/OffersWizardPanel.tsx';
import { CouponsManagerPanel } from './marketing/CouponsManagerPanel.tsx';
import { FlashSalesPanel } from './marketing/FlashSalesPanel.tsx';
import { CampaignsCalendarPanel } from './marketing/CampaignsCalendarPanel.tsx';
import { SegmentsPanel } from './marketing/SegmentsPanel.tsx';
import { EmailBuilderPanel } from './marketing/EmailBuilderPanel.tsx';
import { AutomationsPanel } from './marketing/AutomationsPanel.tsx';
import { SellerModerationPanel } from './marketing/SellerModerationPanel.tsx';
import { MarketingAnalyticsPanel } from './marketing/MarketingAnalyticsPanel.tsx';

type MarketingHubSubTab =
  | 'offers'
  | 'coupons'
  | 'flash_sales'
  | 'campaigns'
  | 'banners'
  | 'popups'
  | 'featured'
  | 'email_campaigns'
  | 'segments'
  | 'automations'
  | 'seller_moderation'
  | 'analytics';

export function AdminPromotionsTab({
  banners,
  popups = [],
  featuredPlacements = [],
  offers,
  coupons = [],
  flashSales = [],
  campaigns = [],
  segments = [],
  emailCampaigns = [],
  automationFlows = [],
  newsletterSubscribers = [],
  emailLog = [],
  sellerPromoRules,
  marketingAnalytics,
  categories,
  sellers,
  onReload,
}: {
  banners: OfferBanner[];
  popups?: MarketingPopup[];
  featuredPlacements?: FeaturedPlacement[];
  offers: Offer[];
  coupons?: Coupon[];
  flashSales?: FlashSale[];
  campaigns?: Campaign[];
  segments?: CustomerSegment[];
  emailCampaigns?: EmailCampaign[];
  automationFlows?: AutomationFlow[];
  newsletterSubscribers?: NewsletterSubscriber[];
  emailLog?: Array<{ id: string; recipient_email: string; template_key: string; status: string; error_message: string | null }>;
  sellerPromoRules?: SellerPromoRules;
  marketingAnalytics?: MarketingAnalyticsSummary;
  categories: Category[];
  sellers: Seller[];
  onReload: () => Promise<void>;
}) {
  const [subTab, setSubTab] = useState<MarketingHubSubTab>('offers');

  const activeBanners = banners.filter((b) => b.active).length;
  const activePopups = popups.filter((p) => p.active).length;
  const activeFeatured = featuredPlacements.filter((f) => f.active).length;
  const activeFlashSales = flashSales.filter((f) => f.status === 'active').length;
  const activeFlows = automationFlows.filter((f) => f.active).length;
  const pendingSellerOffers = offers.filter((o) => o.approvalStatus === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Marketing Hub Header & KPI Strip */}
      <div className="border border-[var(--line)] bg-[var(--graphite)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[var(--ember)] text-xs font-mono-tabular uppercase">
              <Megaphone className="w-4 h-4" />
              <span>NileLink Marketing Hub</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-[var(--bone)] mt-1">
              Offers, Coupons, Flash Sales, Campaigns, Email &amp; Attribution
            </h2>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-mono-tabular">
            <div className="border border-[var(--line)] bg-[var(--ink)] px-3 py-1.5">
              <span className="text-[var(--muted)]">Offers: </span>
              <span className="text-[var(--cedar)] font-bold">{offers.length}</span>
            </div>
            <div className="border border-[var(--line)] bg-[var(--ink)] px-3 py-1.5">
              <span className="text-[var(--muted)]">Coupons: </span>
              <span className="text-[var(--gold)] font-bold">{coupons.length}</span>
            </div>
            <div className="border border-[var(--line)] bg-[var(--ink)] px-3 py-1.5">
              <span className="text-[var(--muted)]">Flash Live: </span>
              <span className="text-[var(--ember)] font-bold">{activeFlashSales}/{flashSales.length}</span>
            </div>
            <div className="border border-[var(--line)] bg-[var(--ink)] px-3 py-1.5">
              <span className="text-[var(--muted)]">Campaigns: </span>
              <span className="text-[var(--cyan)] font-bold">{campaigns.length}</span>
            </div>
            <div className="border border-[var(--line)] bg-[var(--ink)] px-3 py-1.5">
              <span className="text-[var(--muted)]">Email/Seg/Flows: </span>
              <span className="text-[var(--bone)] font-bold">
                {emailCampaigns.length}/{segments.length}/{activeFlows}
              </span>
            </div>
            <div className="border border-[var(--line)] bg-[var(--ink)] px-3 py-1.5">
              <span className="text-[var(--muted)]">Banners/Popups/Slots: </span>
              <span className="text-[var(--bone)] font-bold">
                {activeBanners}/{activePopups}/{activeFeatured}
              </span>
            </div>
            {pendingSellerOffers > 0 && (
              <div className="border border-[var(--ember)] bg-[var(--ink)] px-3 py-1.5">
                <span className="text-[var(--ember)] font-bold">{pendingSellerOffers} Pending Approval</span>
              </div>
            )}
          </div>
        </div>

        {/* Hub Sub-Navigation */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--line)]">
          {[
            { id: 'offers' as const, label: `Offers Wizard (${offers.length})`, icon: Tag },
            { id: 'coupons' as const, label: `Coupons & Bulk CSV (${coupons.length})`, icon: Ticket },
            { id: 'flash_sales' as const, label: `Flash Sales (${flashSales.length})`, icon: Zap },
            { id: 'campaigns' as const, label: `Campaigns & Calendar (${campaigns.length})`, icon: Calendar },
            { id: 'banners' as const, label: `Banners & Placements (${banners.length})`, icon: Layers },
            { id: 'popups' as const, label: `Popups & Caps (${popups.length})`, icon: Sparkles },
            { id: 'featured' as const, label: `Featured Slots (${featuredPlacements.length})`, icon: Award },
            { id: 'email_campaigns' as const, label: `Email & Newsletters (${emailCampaigns.length})`, icon: Mail },
            { id: 'segments' as const, label: `Customer Segments (${segments.length})`, icon: Users },
            { id: 'automations' as const, label: `Automated Flows (${automationFlows.length})`, icon: Workflow },
            {
              id: 'seller_moderation' as const,
              label: `Seller Moderation (${pendingSellerOffers} pending)`,
              icon: ShieldCheck,
            },
            { id: 'analytics' as const, label: 'Analytics & Attribution', icon: BarChart3 },
          ].map((item) => {
            const Icon = item.icon;
            const selected = subTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab(item.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border cursor-pointer ${
                  selected
                    ? 'border-[var(--ember)] bg-[var(--ember)] text-[var(--ember-fg)]'
                    : 'border-[var(--line)] bg-[var(--ink)] text-[var(--bone)] hover:border-[var(--ember)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {subTab === 'offers' && (
        <OffersWizardPanel
          offers={offers}
          categories={categories}
          sellers={sellers}
          campaigns={campaigns}
          onReload={onReload}
        />
      )}

      {subTab === 'coupons' && (
        <CouponsManagerPanel coupons={coupons} campaigns={campaigns} onReload={onReload} />
      )}

      {subTab === 'flash_sales' && <FlashSalesPanel flashSales={flashSales} onReload={onReload} />}

      {subTab === 'campaigns' && (
        <CampaignsCalendarPanel
          campaigns={campaigns}
          offers={offers}
          coupons={coupons}
          flashSales={flashSales}
          banners={banners}
          onReload={onReload}
        />
      )}

      {subTab === 'banners' && <BannersManagerPanel banners={banners} onReload={onReload} />}

      {subTab === 'popups' && <PopupsManagerPanel popups={popups} onReload={onReload} />}

      {subTab === 'featured' && (
        <FeaturedPlacementsPanel placements={featuredPlacements} sellers={sellers} onReload={onReload} />
      )}

      {subTab === 'email_campaigns' && (
        <EmailBuilderPanel
          emailCampaigns={emailCampaigns}
          segments={segments}
          coupons={coupons}
          emailLog={emailLog}
          onReload={onReload}
        />
      )}

      {subTab === 'segments' && (
        <SegmentsPanel
          segments={segments}
          subscribers={newsletterSubscribers}
          onReload={onReload}
        />
      )}

      {subTab === 'automations' && (
        <AutomationsPanel
          automationFlows={automationFlows}
          coupons={coupons}
          onReload={onReload}
        />
      )}

      {subTab === 'seller_moderation' && (
        <SellerModerationPanel
          offers={offers}
          coupons={coupons}
          sellers={sellers}
          sellerPromoRules={sellerPromoRules}
          onReload={onReload}
        />
      )}

      {subTab === 'analytics' && (
        <MarketingAnalyticsPanel analytics={marketingAnalytics} onReload={onReload} />
      )}
    </div>
  );
}
