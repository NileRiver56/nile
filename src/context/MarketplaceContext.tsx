import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  Category,
  Currency,
  DeliveryZone,
  FeaturedPlacement,
  HomeSection,
  Locale,
  MarketingPopup,
  Offer,
  OfferBanner,
  PaymentConfig,
  PlatformSettings,
  Product,
  Seller,
  SiteChromeSettings,
  SubscriptionPlan,
  ThemeMode,
  UserRole,
} from '../shared/types.ts';
import { DEFAULT_SITE_CHROME } from '../shared/homeSections.ts';
import { getCopy } from '../shared/i18n.ts';

export interface CartItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface AuthSessionUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleKey: UserRole;
  sellerId?: string;
  totpEnabled: boolean;
  permissions: string[];
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface MarketplaceContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (t: ThemeMode) => void;
  locale: Locale;
  toggleLocale: () => void;
  setLocale: (l: Locale) => void;
  currency: Currency;
  toggleCurrency: () => void;
  setCurrency: (c: Currency) => void;
  t: ReturnType<typeof getCopy>;
  route: string;
  navigate: (to: string) => void;
  settings: PlatformSettings;
  paymentsConfig: PaymentConfig;
  categories: Category[];
  sellers: Seller[];
  products: Product[];
  subscriptionPlans: SubscriptionPlan[];
  deliveryZones: DeliveryZone[];
  homeSections: HomeSection[];
  siteChrome: SiteChromeSettings;
  banners: OfferBanner[];
  popups: MarketingPopup[];
  featuredPlacements: FeaturedPlacement[];
  offers: Offer[];
  previewDrafts: boolean;
  setPreviewDrafts: (v: boolean) => void;
  loading: boolean;
  refreshBootstrap: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  cart: CartItem[];
  addToCart: (productId: string, variantId: string, quantity?: number) => void;
  updateCartQty: (productId: string, variantId: string, quantity: number) => void;
  removeFromCart: (productId: string, variantId: string) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  wishlist: string[];
  toggleWishlist: (productId: string) => void;
  authUser: AuthSessionUser | null;
  setAuthUser: (user: AuthSessionUser | null) => void;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  toast: ToastMessage | null;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  apiFetch: <T = unknown>(url: string, init?: RequestInit) => Promise<T>;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  exchangeRateLbpPerUsd: 89500,
  defaultCommissionBps: 1000,
  codFeeUsdCents: 150,
  holdPeriodDays: 3,
  announcement: { en: '', ar: '' },
};

const DEFAULT_PAYMENTS: PaymentConfig = {
  codEnabled: true,
  whishManualEnabled: false,
  whishAccountNumber: '',
  whishInstructions: { en: '', ar: '' },
  cardEnabled: false,
  cardGatewayConfigured: false,
};

function readCookie(name: string): string {
  const prefix = `${name}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return '';
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('nl_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('nl_locale');
    return saved === 'ar' ? 'ar' : 'en';
  });

  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = localStorage.getItem('nl_currency');
    return saved === 'LBP' ? 'LBP' : 'USD';
  });

  const [route, setRoute] = useState<string>(() => window.location.pathname + window.location.search || '/');
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [paymentsConfig, setPaymentsConfig] = useState<PaymentConfig>(DEFAULT_PAYMENTS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [homeSections, setHomeSections] = useState<HomeSection[]>([]);
  const [siteChrome, setSiteChrome] = useState<SiteChromeSettings>(DEFAULT_SITE_CHROME);
  const [banners, setBanners] = useState<OfferBanner[]>([]);
  const [popups, setPopups] = useState<MarketingPopup[]>([]);
  const [featuredPlacements, setFeaturedPlacements] = useState<FeaturedPlacement[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [previewDrafts, setPreviewDrafts] = useState<boolean>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('previewDrafts') === '1' || p.get('previewDrafts') === 'true';
  });
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('nl_cart');
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('nl_wishlist');
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [authUser, setAuthUser] = useState<AuthSessionUser | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('nl_theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = locale === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('nl_locale', locale);
  }, [locale]);

  useEffect(() => {
    localStorage.setItem('nl_currency', currency);
  }, [currency]);

  useEffect(() => {
    localStorage.setItem('nl_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('nl_wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  useEffect(() => {
    const onPop = () => {
      const nextRoute = window.location.pathname + window.location.search || '/';
      setRoute(nextRoute);
      const p = new URLSearchParams(window.location.search);
      setPreviewDrafts(p.get('previewDrafts') === '1' || p.get('previewDrafts') === 'true');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = String(Date.now());
    setToast({ id, type, text });
    window.setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 3600);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname + window.location.search) {
      window.history.pushState({}, '', to);
      setRoute(to);
      const qs = to.split('?')[1] || '';
      const p = new URLSearchParams(qs);
      if (p.has('previewDrafts')) {
        setPreviewDrafts(p.get('previewDrafts') === '1' || p.get('previewDrafts') === 'true');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const apiFetch = useCallback(async <T = unknown>(url: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers || {});
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    const method = (init.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      const csrf = readCookie('nl_csrf');
      if (csrf) headers.set('X-CSRF-Token', csrf);
    }
    const res = await fetch(url, { ...init, headers, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data as T;
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        locale,
        includeDrafts: previewDrafts ? 'true' : 'false',
      });
      const res = await fetch(`/api/bootstrap?${qs.toString()}`, { credentials: 'include' });
      const data = await res.json();
      setSettings(data.settings || DEFAULT_SETTINGS);
      setPaymentsConfig(data.paymentsConfig || DEFAULT_PAYMENTS);
      setCategories(data.categories || []);
      setSellers(data.sellers || []);
      setProducts(data.products || []);
      setSubscriptionPlans(data.subscriptionPlans || []);
      setDeliveryZones(data.deliveryZones || []);
      setHomeSections(data.homeSections || []);
      setSiteChrome(data.siteChrome || DEFAULT_SITE_CHROME);
      setBanners(data.banners || []);
      setPopups(data.popups || []);
      setFeaturedPlacements(data.featuredPlacements || []);
      setOffers(data.offers || []);
    } catch {
      showToast('Failed to load marketplace catalog.', 'error');
    } finally {
      setLoading(false);
    }
  }, [locale, previewDrafts, showToast]);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data.user) {
        setAuthUser(data.user);
        if (Array.isArray(data.cart) && data.cart.length > 0) setCart(data.cart);
        if (Array.isArray(data.wishlist)) setWishlist(data.wishlist);
      } else {
        setAuthUser(null);
      }
    } catch {
      setAuthUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap, authUser?.id]);

  const syncCartRemote = useCallback(
    (nextCart: CartItem[]) => {
      if (!authUser) return;
      void apiFetch('/api/account/cart', {
        method: 'PUT',
        body: JSON.stringify({ items: nextCart }),
      }).catch(() => {});
    },
    [authUser, apiFetch]
  );

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuthUser(null);
    showToast(locale === 'ar' ? 'تم تسجيل الخروج' : 'Signed out', 'info');
  }, [apiFetch, locale, showToast]);

  const logoutAllDevices = useCallback(async () => {
    await apiFetch('/api/auth/logout-all', { method: 'POST' }).catch(() => {});
    setAuthUser(null);
    showToast(locale === 'ar' ? 'تم تسجيل الخروج من جميع الأجهزة' : 'Signed out of all devices', 'info');
  }, [apiFetch, locale, showToast]);

  const addToCart = useCallback(
    (productId: string, variantId: string, quantity = 1) => {
      setCart((prev) => {
        const idx = prev.findIndex((i) => i.productId === productId && i.variantId === variantId);
        const next =
          idx >= 0
            ? prev.map((it, i) => (i === idx ? { ...it, quantity: it.quantity + quantity } : it))
            : [...prev, { productId, variantId, quantity }];
        syncCartRemote(next);
        return next;
      });
      setIsCartOpen(true);
      showToast(locale === 'ar' ? 'تمت الإضافة إلى الحقيبة' : 'Added to bag', 'success');
    },
    [locale, showToast, syncCartRemote]
  );

  const updateCartQty = useCallback(
    (productId: string, variantId: string, quantity: number) => {
      setCart((prev) => {
        const next =
          quantity <= 0
            ? prev.filter((i) => !(i.productId === productId && i.variantId === variantId))
            : prev.map((i) => (i.productId === productId && i.variantId === variantId ? { ...i, quantity } : i));
        syncCartRemote(next);
        return next;
      });
    },
    [syncCartRemote]
  );

  const removeFromCart = useCallback(
    (productId: string, variantId: string) => {
      setCart((prev) => {
        const next = prev.filter((i) => !(i.productId === productId && i.variantId === variantId));
        syncCartRemote(next);
        return next;
      });
    },
    [syncCartRemote]
  );

  const clearCart = useCallback(() => {
    setCart([]);
    syncCartRemote([]);
  }, [syncCartRemote]);

  const toggleWishlist = useCallback(
    (productId: string) => {
      if (authUser) {
        void apiFetch<{ wished: boolean; wishlist: string[] }>('/api/account/wishlist/toggle', {
          method: 'POST',
          body: JSON.stringify({ productId }),
        })
          .then((res) => {
            setWishlist(res.wishlist);
            showToast(
              res.wished
                ? locale === 'ar'
                  ? 'تم الحفظ في المفضلة'
                  : 'Saved to wishlist'
                : locale === 'ar'
                  ? 'تمت الإزالة من المفضلة'
                  : 'Removed from wishlist',
              'info'
            );
          })
          .catch(() => {});
        return;
      }

      setWishlist((prev) => {
        const exists = prev.includes(productId);
        const next = exists ? prev.filter((id) => id !== productId) : [...prev, productId];
        showToast(
          exists
            ? locale === 'ar'
              ? 'تمت الإزالة من المفضلة'
              : 'Removed from wishlist'
            : locale === 'ar'
              ? 'تم الحفظ في المفضلة'
              : 'Saved to wishlist',
          'info'
        );
        return next;
      });
    },
    [authUser, apiFetch, locale, showToast]
  );

  const t = useMemo(() => getCopy(locale), [locale]);

  return (
    <MarketplaceContext.Provider
      value={{
        theme,
        toggleTheme: () => setThemeState((p) => (p === 'dark' ? 'light' : 'dark')),
        setTheme: setThemeState,
        locale,
        toggleLocale: () => setLocaleState((p) => (p === 'en' ? 'ar' : 'en')),
        setLocale: setLocaleState,
        currency,
        toggleCurrency: () => setCurrencyState((p) => (p === 'USD' ? 'LBP' : 'USD')),
        setCurrency: setCurrencyState,
        t,
        route,
        navigate,
        settings,
        paymentsConfig,
        categories,
        sellers,
        products,
        subscriptionPlans,
        deliveryZones,
        homeSections,
        siteChrome,
        banners,
        popups,
        featuredPlacements,
        offers,
        previewDrafts,
        setPreviewDrafts,
        loading,
        refreshBootstrap,
        refreshAuth,
        cart,
        addToCart,
        updateCartQty,
        removeFromCart,
        clearCart,
        isCartOpen,
        setIsCartOpen,
        wishlist,
        toggleWishlist,
        authUser,
        setAuthUser,
        logout,
        logoutAllDevices,
        toast,
        showToast,
        apiFetch,
      }}
    >
      {children}
    </MarketplaceContext.Provider>
  );
}

export function useMarketplace() {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) throw new Error('useMarketplace must be used inside MarketplaceProvider');
  return ctx;
}
