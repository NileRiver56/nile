import React from 'react';
import { Grid, Home, Package, ShoppingBag, User } from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';

export function MobileBottomNav() {
  const { route, navigate, cart, setIsCartOpen, locale } = useMarketplace();
  const bagCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const items = [
    {
      id: 'home',
      label: locale === 'ar' ? 'الرئيسية' : 'Home',
      icon: Home,
      active: route === '/',
      onClick: () => navigate('/'),
    },
    {
      id: 'catalog',
      label: locale === 'ar' ? 'الأقسام' : 'Catalog',
      icon: Grid,
      active: route.startsWith('/catalog'),
      onClick: () => navigate('/catalog'),
    },
    {
      id: 'orders',
      label: locale === 'ar' ? 'الطلبات' : 'Orders',
      icon: Package,
      active: route.startsWith('/orders'),
      onClick: () => navigate('/orders'),
    },
    {
      id: 'bag',
      label: locale === 'ar' ? `الحقيبة (${bagCount})` : `Bag (${bagCount})`,
      icon: ShoppingBag,
      active: false,
      onClick: () => setIsCartOpen(true),
    },
    {
      id: 'account',
      label: locale === 'ar' ? 'حسابي' : 'Account',
      icon: User,
      active: route.startsWith('/account') || route.startsWith('/seller') || route.startsWith('/admin'),
      onClick: () => navigate('/account'),
    },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-[var(--graphite)] border-t border-[var(--line)] grid grid-cols-5"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] cursor-pointer ${
              item.active ? 'text-[var(--ember)] font-semibold' : 'text-[var(--muted)]'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span className="truncate max-w-full px-1">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
