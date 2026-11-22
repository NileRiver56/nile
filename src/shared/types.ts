export type Locale = 'en' | 'ar';
export type ThemeMode = 'dark' | 'light';
export type Currency = 'USD' | 'LBP';
export type DepartmentSlug = 'fashion' | 'electronics' | 'home-gadgets';
export type UserRole =
  | 'customer'
  | 'seller_owner'
  | 'seller_staff'
  | 'admin_super'
  | 'admin_staff';
export type SellerStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
export type SubscriptionTier = 'free' | 'basic' | 'pro';
export type DeliveryMode = 'platform' | 'self';
export type PaymentMethod = 'cod' | 'whish_manual' | 'card';
export type PaymentStatus = 'pending' | 'pending_verification' | 'paid' | 'failed' | 'refunded';
export type SubOrderStatus = 'pending' | 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';

export interface LocalizedText {
  en: string;
  ar: string;
}

export type StorefrontThemeId = 'obsidian-ember' | 'sand-atelier' | 'cyan-lab' | 'sage-studio';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleKey: UserRole;
  sellerId?: string;
  totpEnabled: boolean;
  preferredLocale: Locale;
  preferredCurrency: Currency;
  permissions: string[];
}

export interface Seller {
  id: string;
  slug: string;
  userId: string;
  name: LocalizedText;
  tagline: LocalizedText;
  about: LocalizedText;
  department: DepartmentSlug;
  status: SellerStatus;
  statusReason?: string | null;
  verified: boolean;
  rating: number;
  reviewCount: number;
  governorate: string;
  district: string;
  cityAddress?: string;
  whatsappPhone: string;
  payoutMethod: 'whish' | 'omt' | 'bank';
  payoutAccount: string;
  commercialRegRef: string;
  customCommissionBps?: number | null;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: 'active' | 'past_due' | 'suspended';
  subscriptionNextDue: string;
  deliveryMode: DeliveryMode;
  selfDeliveryFeesUsdCents: Record<string, number>;
  storefrontTheme: StorefrontThemeId;
  announcement?: LocalizedText | null;
  bannerImage: string;
  logoImage?: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  parentId?: string | null;
  slug: string;
  department: DepartmentSlug;
  name: LocalizedText;
  commissionBps?: number | null;
}

export interface ProductVariant {
  id: string;
  sku: string;
  size?: string;
  color: string;
  colorHex: string;
  stock: number;
  priceDeltaUsdCents: number;
}

export interface ProductSpec {
  key: LocalizedText;
  value: LocalizedText;
}

export interface Product {
  id: string;
  slug: string;
  sellerId: string;
  categoryId: string;
  department: DepartmentSlug;
  title: LocalizedText;
  subtitle: LocalizedText;
  description: LocalizedText;
  basePriceUsdCents: number;
  compareAtUsdCents?: number | null;
  sellerCurrency: Currency;
  images: string[];
  model3dUrl?: string | null;
  rating: number;
  reviewCount: number;
  isDeal?: boolean;
  isFeatured?: boolean;
  published: boolean;
  moderationStatus?: string;
  variants: ProductVariant[];
  specs: ProductSpec[];
  tags: string[];
  createdAt: string;
}

export interface Review {
  id: string;
  productId: string;
  sellerId: string;
  userId: string;
  authorName: string;
  rating: number;
  comment: string;
  verifiedBuyer: boolean;
  sellerReply?: string;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  sellerId: string | null;
  discountPercent: number;
  minOrderUsdCents: number;
  active: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  titleSnapshot: LocalizedText;
  variantLabel: string;
  sku: string;
  quantity: number;
  unitPriceUsdCents: number;
  lineTotalUsdCents: number;
  commissionBpsSnapshot: number;
  commissionUsdCents: number;
}

export interface SubOrder {
  id: string;
  orderId: string;
  sellerId: string;
  sellerName: LocalizedText;
  status: SubOrderStatus;
  deliveryMode: DeliveryMode;
  deliveryFeeUsdCents: number;
  subtotalUsdCents: number;
  discountUsdCents: number;
  commissionUsdCents: number;
  sellerNetUsdCents: number;
  codCollected: boolean;
  courierName?: string | null;
  trackingCode?: string | null;
  items: OrderItem[];
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string | null;
  customerName: string;
  customerPhone: string;
  governorate: string;
  district: string;
  town: string;
  addressNotes: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  transferReference?: string | null;
  couponCode?: string | null;
  exchangeRateSnapshot: number;
  subtotalUsdCents: number;
  deliveryTotalUsdCents: number;
  codFeeUsdCents: number;
  discountTotalUsdCents: number;
  grandTotalUsdCents: number;
  subOrders: SubOrder[];
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  sellerId: string;
  subOrderId?: string | null;
  orderNumber?: string | null;
  type:
    | 'ORDER_GROSS'
    | 'PLATFORM_COMMISSION'
    | 'DELIVERY_FEE'
    | 'COD_COLLECTED'
    | 'HOLD_RELEASED'
    | 'PAYOUT_REQUEST'
    | 'PAYOUT_SETTLED'
    | 'SUBSCRIPTION_FEE';
  direction: 'credit' | 'debit';
  amountUsdCents: number;
  availability: 'pending' | 'available' | 'settled';
  note: string;
  createdAt: string;
}

export interface PayoutRequest {
  id: string;
  sellerId: string;
  sellerName: LocalizedText;
  amountUsdCents: number;
  method: 'whish' | 'omt' | 'bank';
  accountDetails: string;
  status: 'pending' | 'paid' | 'rejected';
  referenceCode?: string | null;
  createdAt: string;
  settledAt?: string | null;
}

export interface DeliveryZone {
  governorateCode: string;
  name: LocalizedText;
  platformFeeUsdCents: number;
  etaDays: string;
}

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: LocalizedText;
  monthlyFeeUsdCents: number;
  productLimit: number | null;
  commissionDiscountBps: number;
  features: LocalizedText[];
}

export interface PlatformSettings {
  siteName?: string;
  exchangeRateLbpPerUsd: number;
  defaultCommissionBps: number;
  codFeeUsdCents: number;
  holdPeriodDays: number;
  maintenanceMode?: boolean;
  announcement: LocalizedText;
}

export interface PaymentConfig {
  codEnabled: boolean;
  whishManualEnabled: boolean;
  whishAccountNumber: string;
  whishInstructions: LocalizedText;
  cardEnabled: boolean;
  cardGatewayConfigured: boolean;
}

export interface PageContent {
  id: string;
  slug: string;
  title: LocalizedText;
  body: LocalizedText;
  published: boolean;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: string | null;
  afterJson?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface NaturalSearchParsed {
  rawQuery: string;
  keywords: string[];
  maxPriceUsdCents?: number;
  minPriceUsdCents?: number;
  department?: DepartmentSlug;
  size?: string;
  color?: string;
  inStockOnly?: boolean;
}

export type HomeSectionType =
  | 'hero_split'
  | 'trust_strip'
  | 'departments_bento'
  | 'dynamic_products_grid'
  | 'verified_stores_grid'
  | 'category_spotlight'
  | 'flash_deals_countdown'
  | 'promo_announcement_split'
  | 'brand_manifesto_band'
  | 'seller_recruitment_cta'
  | 'governorates_coverage_grid'
  | 'comparison_table'
  | 'newsletter_dispatch'
  | 'faq_accordion'
  | 'custom_rich_editorial';

export type HomeSectionStatus = 'draft' | 'published' | 'archived';
export type HomeSectionAudience = 'all' | 'guest' | 'logged_in' | 'arabic' | 'english';

export interface HomeSection {
  id: string;
  sectionType: HomeSectionType;
  title: LocalizedText;
  content: Record<string, unknown>;
  sortOrder: number;
  status: HomeSectionStatus;
  audience: HomeSectionAudience;
  startsAt?: string | null;
  endsAt?: string | null;
  version: number;
  updatedAt: string;
}

export interface HomeSectionVersion {
  id: string;
  sectionId: string;
  version: number;
  snapshot: {
    sectionType: HomeSectionType;
    title: LocalizedText;
    content: Record<string, unknown>;
    status: HomeSectionStatus;
    audience: HomeSectionAudience;
    startsAt?: string | null;
    endsAt?: string | null;
  };
  editedByUserId?: string | null;
  createdAt: string;
}

export type BannerPageScope = 'home' | 'catalog' | 'checkout' | 'store';
export type BannerBgToken = 'graphite' | 'ember' | 'cedar' | 'gold' | 'cyan' | 'sand';

export interface OfferBanner {
  id: string;
  title: LocalizedText;
  ctaLabel?: LocalizedText;
  bgToken: BannerBgToken;
  targetUrl: string;
  pages: BannerPageScope[];
  priority: number;
  impressions: number;
  clicks: number;
  startsAt?: string | null;
  endsAt?: string | null;
  active: boolean;
}

export type OfferType = 'percent' | 'fixed_usd_cents' | 'flash_percent';
export type OfferTargetType = 'all' | 'department' | 'category' | 'seller' | 'product';
export type OfferApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Offer {
  id: string;
  sellerId?: string | null;
  sellerName?: LocalizedText | null;
  title: LocalizedText;
  offerType: OfferType;
  discountValue: number;
  targetType: OfferTargetType;
  targetId?: string | null;
  approvalStatus: OfferApprovalStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  active: boolean;
}

