import React from 'react';
import { MotionConfig } from 'motion/react';
import { MarketplaceProvider, useMarketplace } from './context/MarketplaceContext.tsx';
import { Header } from './components/Header.tsx';
import { MiniCartDrawer } from './components/MiniCartDrawer.tsx';
import { MobileBottomNav } from './components/MobileBottomNav.tsx';
import { Footer } from './components/Footer.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { CatalogPage } from './pages/CatalogPage.tsx';
import { ProductDetailPage } from './pages/ProductDetailPage.tsx';
import { StorefrontPage } from './pages/StorefrontPage.tsx';
import { CheckoutPage } from './pages/CheckoutPage.tsx';
import { OrdersPage } from './pages/OrdersPage.tsx';
import { SellerDashboardPage } from './pages/SellerDashboardPage.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { StyleguidePage } from './pages/StyleguidePage.tsx';
import { LegalPage } from './pages/LegalPage.tsx';

function ToastBanner() {
  const { toast } = useMarketplace();
  if (!toast) return null;
  const borderColor =
    toast.type === 'error'
      ? 'var(--ember)'
      : toast.type === 'success'
        ? 'var(--cedar)'
        : 'var(--line)';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 md:bottom-6 end-4 md:end-8 z-50 border bg-[var(--graphite)] px-4 py-3 text-xs font-medium text-[var(--bone)] max-w-sm"
      style={{ borderColor }}
    >
      {toast.text}
    </div>
  );
}

function RouterView() {
  const { route } = useMarketplace();
  const pathname = route.split('?')[0] || '/';

  if (pathname === '/' || pathname === '') return <HomePage />;
  if (pathname === '/catalog') return <CatalogPage />;
  if (pathname.startsWith('/product/')) {
    const slug = pathname.replace('/product/', '');
    return <ProductDetailPage slug={slug} />;
  }
  if (pathname.startsWith('/store/')) {
    const slug = pathname.replace('/store/', '');
    return <StorefrontPage slug={slug} />;
  }
  if (pathname === '/checkout') return <CheckoutPage />;
  if (pathname === '/orders') return <OrdersPage />;
  if (pathname === '/seller') return <SellerDashboardPage />;
  if (pathname === '/admin') return <AdminDashboardPage />;
  if (pathname === '/styleguide') return <StyleguidePage />;
  if (pathname === '/legal') return <LegalPage />;

  return <HomePage />;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <MarketplaceProvider>
        <div className="min-h-screen flex flex-col bg-[var(--ink)] text-[var(--bone)]">
          <Header />
          <main id="main-content" className="flex-1">
            <RouterView />
          </main>
          <Footer />
          <MiniCartDrawer />
          <MobileBottomNav />
          <ToastBanner />
        </div>
      </MarketplaceProvider>
    </MotionConfig>
  );
}
