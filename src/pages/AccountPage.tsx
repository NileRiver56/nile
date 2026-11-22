import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, KeyRound, LogOut, MapPin, ShieldCheck, Trash2 } from 'lucide-react';
import type {
  Currency,
  CustomerAddress,
  Locale,
  NotificationItem,
  OrderDispute,
  ReturnRequest,
  SupportTicket,
} from '../shared/types.ts';
import { LEBANON_GOVERNORATES } from '../shared/lebanon.ts';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { EmptyState, PriceDisplay, ProductCard, SectionHeading, StatusLabel } from '../components/HairlineUI.tsx';

type AccountTab = 'profile' | 'addresses' | 'notifications' | 'wishlist' | 'cases';
type AuthMode = 'login' | 'register' | 'reset';

export function AccountPage() {
  const {
    locale,
    setLocale,
    setCurrency,
    t,
    route,
    navigate,
    authUser,
    refreshAuth,
    logout,
    logoutAllDevices,
    apiFetch,
    showToast,
    products,
    sellers,
    wishlist,
    unreadNotificationsCount,
    refreshNotifications,
  } = useMarketplace();

  const initialTab = useMemo<AccountTab>(() => {
    const qs = new URLSearchParams(route.split('?')[1] || '');
    const tab = qs.get('tab');
    if (tab === 'addresses' || tab === 'notifications' || tab === 'wishlist' || tab === 'cases') return tab;
    return 'profile';
  }, [route]);

  const initialResetToken = useMemo(() => {
    const qs = new URLSearchParams(route.split('?')[1] || '');
    return qs.get('resetToken') || '';
  }, [route]);

  const [tab, setTab] = useState<AccountTab>(initialTab);
  const [authMode, setAuthMode] = useState<AuthMode>(initialResetToken ? 'reset' : 'login');

  // Guest Auth state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginTotp, setLoginTotp] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('+961 ');
  const [regPassword, setRegPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [newPassword, setNewPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Profile & 2FA state
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [prefLocale, setPrefLocale] = useState<Locale>(locale);
  const [prefCurrency, setPrefCurrency] = useState<Currency>('USD');
  const [savingProfile, setSavingProfile] = useState(false);
  const [totpEnrollData, setTotpEnrollData] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');

  // Addresses state
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addrLabel, setAddrLabel] = useState('');
  const [addrGov, setAddrGov] = useState('beirut');
  const [addrDistrict, setAddrDistrict] = useState('achrafieh');
  const [addrTown, setAddrTown] = useState('Gemmayze');
  const [addrPhone, setAddrPhone] = useState('+961 ');
  const [addrNotes, setAddrNotes] = useState('');
  const [addrDefault, setAddrDefault] = useState(false);
  const [addrBusy, setAddrBusy] = useState(false);

  // Notifications & Cases state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [casesData, setCasesData] = useState<{
    returns: ReturnRequest[];
    disputes: OrderDispute[];
    tickets: SupportTicket[];
  }>({ returns: [], disputes: [], tickets: [] });

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (authUser) {
      setProfileName(authUser.name);
      setProfilePhone(authUser.phone);
      setPrefLocale(authUser.preferredLocale || locale);
      setPrefCurrency(authUser.preferredCurrency || 'USD');
      setAddrPhone(authUser.phone || '+961 ');
    }
  }, [authUser, locale]);

  const loadAccountData = useCallback(async () => {
    if (!authUser) return;
    try {
      const [addrRes, notifRes, casesRes, tktRes] = await Promise.all([
        apiFetch<{ addresses: CustomerAddress[] }>('/api/account/addresses'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/account/notifications'),
        apiFetch<{ returns: ReturnRequest[]; disputes: OrderDispute[] }>('/api/account/cases'),
        apiFetch<{ tickets: SupportTicket[] }>('/api/support-tickets'),
      ]);
      setAddresses(addrRes.addresses || []);
      setNotifications(notifRes.notifications || []);
      setCasesData({
        returns: casesRes.returns || [],
        disputes: casesRes.disputes || [],
        tickets: tktRes.tickets || [],
      });
    } catch {
      // ignore transient
    }
  }, [authUser, apiFetch]);

  useEffect(() => {
    void loadAccountData();
  }, [loadAccountData]);

  const selectedGov = useMemo(
    () => LEBANON_GOVERNORATES.find((g) => g.code === addrGov) || LEBANON_GOVERNORATES[0],
    [addrGov]
  );
  const selectedDist = useMemo(
    () => selectedGov.districts.find((d) => d.code === addrDistrict) || selectedGov.districts[0],
    [selectedGov, addrDistrict]
  );

  const wishlistProducts = useMemo(
    () => products.filter((p) => wishlist.includes(p.id)),
    [products, wishlist]
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
          totpCode: loginTotp.trim() || undefined,
        }),
      });
      await refreshAuth();
      showToast(locale === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Signed in successfully', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          phone: regPhone.trim(),
          password: regPassword,
          locale,
        }),
      });
      await refreshAuth();
      showToast(locale === 'ar' ? 'تم إنشاء الحساب بنجاح' : 'Account created', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; devResetToken?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      setDevResetToken(res.devResetToken || null);
      if (res.devResetToken) setResetToken(res.devResetToken);
      showToast(
        locale === 'ar'
          ? 'إذا كان البريد مسجلاً، تم إنشاء رمز إعادة التعيين.'
          : 'If that email is registered, reset instructions have been generated.',
        'info'
      );
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken.trim(), newPassword }),
      });
      setAuthMode('login');
      setResetToken('');
      setNewPassword('');
      setDevResetToken(null);
      showToast(
        locale === 'ar' ? 'تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.' : 'Password updated. You can sign in now.',
        'success'
      );
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiFetch('/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profileName.trim(),
          phone: profilePhone.trim(),
          preferredLocale: prefLocale,
          preferredCurrency: prefCurrency,
        }),
      });
      setLocale(prefLocale);
      setCurrency(prefCurrency);
      await refreshAuth();
      showToast(locale === 'ar' ? 'تم حفظ الملف الشخصي' : 'Profile updated', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleStart2fa = async () => {
    try {
      const res = await apiFetch<{ secret: string; otpauthUri: string }>('/api/auth/2fa/enroll', { method: 'POST' });
      setTotpEnrollData(res);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: totpVerifyCode.trim() }),
      });
      setTotpEnrollData(null);
      setTotpVerifyCode('');
      await refreshAuth();
      showToast(locale === 'ar' ? 'تم تفعيل المصادقة الثنائية' : 'Two-factor authentication enabled', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddrBusy(true);
    try {
      await apiFetch('/api/account/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: addrLabel.trim(),
          governorate: addrGov,
          district: addrDistrict,
          town: addrTown,
          phone: addrPhone.trim(),
          notes: addrNotes.trim(),
          isDefault: addrDefault,
        }),
      });
      setAddrLabel('');
      setAddrNotes('');
      setAddrDefault(false);
      await loadAccountData();
      showToast(locale === 'ar' ? 'تم حفظ العنوان' : 'Address saved', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setAddrBusy(false);
    }
  };

  const handleSetDefaultAddress = async (id: string) => {
    try {
      await apiFetch(`/api/account/addresses/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDefault: true }),
      });
      await loadAccountData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      await apiFetch(`/api/account/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadAccountData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleMarkNotificationRead = async (idOrAll: string) => {
    try {
      await apiFetch(`/api/account/notifications/${encodeURIComponent(idOrAll)}/read`, { method: 'POST' });
      await Promise.all([loadAccountData(), refreshNotifications()]);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  if (!authUser) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-10 space-y-6">
        <SectionHeading
          title={t.navAccount}
          subtitle={
            locale === 'ar'
              ? 'سجل الدخول لإدارة عناوينك في لبنان وإشعارات الطلبات والمفضلة.'
              : 'Sign in to manage Lebanese delivery addresses, notifications, wishlist, and order cases.'
          }
        />

        <div className="border border-[var(--line)] bg-[var(--graphite)]">
          <div className="grid grid-cols-3 border-b border-[var(--line)] text-xs font-mono-tabular uppercase">
            {(
              [
                ['login', t.signIn],
                ['register', t.register],
                ['reset', t.resetPassword],
              ] as const
            ).map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                onClick={() => setAuthMode(m)}
                className={`py-3 px-2 border-e last:border-e-0 border-[var(--line)] cursor-pointer ${
                  authMode === m
                    ? 'bg-[var(--ember)] text-[var(--ember-fg)] font-bold'
                    : 'text-[var(--muted)] hover:text-[var(--bone)]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {authMode === 'login' && (
            <form onSubmit={handleLogin} className="p-6 space-y-4">
              <label className="block space-y-1.5 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Email</span>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                />
              </label>
              <label className="block space-y-1.5 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Password</span>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                />
              </label>
              <label className="block space-y-1.5 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">
                  2FA Code ({locale === 'ar' ? 'اختياري' : 'if enabled'})
                </span>
                <input
                  type="text"
                  value={loginTotp}
                  onChange={(e) => setLoginTotp(e.target.value)}
                  placeholder="6-digit code"
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm font-mono-tabular text-[var(--bone)]"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="submit"
                  disabled={authBusy}
                  className="px-6 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer disabled:opacity-50"
                >
                  {authBusy ? '...' : t.signIn}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('reset')}
                  className="editorial-link text-xs text-[var(--muted)] cursor-pointer"
                >
                  {t.forgotPassword}
                </button>
              </div>
            </form>
          )}

          {authMode === 'register' && (
            <form onSubmit={handleRegister} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block space-y-1.5 text-xs">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.fullName}</span>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                  />
                </label>
                <label className="block space-y-1.5 text-xs">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.phone}</span>
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm font-mono-tabular text-[var(--bone)]"
                  />
                </label>
              </div>
              <label className="block space-y-1.5 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">Email</span>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                />
              </label>
              <label className="block space-y-1.5 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">
                  Password (8+ chars, letters & numbers)
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--bone)]"
                />
              </label>
              <button
                type="submit"
                disabled={authBusy}
                className="px-6 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer disabled:opacity-50"
              >
                {authBusy ? '...' : t.register}
              </button>
            </form>
          )}

          {authMode === 'reset' && (
            <div className="p-6 space-y-6">
              <form onSubmit={handleForgotPassword} className="space-y-3 border-b border-[var(--line)] pb-6">
                <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">
                  1 · {t.forgotPassword}
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@beirut.lb"
                    className="flex-1 min-w-[200px] bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
                  />
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="px-4 py-2 border border-[var(--line)] text-xs font-semibold uppercase text-[var(--bone)] hover:border-[var(--ember)] cursor-pointer"
                  >
                    {locale === 'ar' ? 'طلب رمز إعادة التعيين' : 'Send Reset Token'}
                  </button>
                </div>
                {devResetToken && (
                  <div className="border border-[var(--gold)] bg-[var(--ink)] p-3 text-xs space-y-1">
                    <p className="font-mono-tabular uppercase text-[var(--gold)]">
                      Development Preview Token (SMTP unconfigured)
                    </p>
                    <p className="font-mono-tabular break-all text-[var(--bone)]">{devResetToken}</p>
                  </div>
                )}
              </form>

              <form onSubmit={handleResetPassword} className="space-y-3">
                <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">
                  2 · {t.resetPassword}
                </p>
                <label className="block space-y-1 text-xs">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">Reset Token</span>
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm font-mono-tabular text-[var(--bone)]"
                  />
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="font-mono-tabular uppercase text-[var(--muted)]">New Password</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={authBusy}
                  className="px-6 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
                >
                  {t.resetPassword}
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="border border-[var(--line)] bg-[var(--graphite)] p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
          <span>{locale === 'ar' ? 'تريد فتح متجر أو تتبع طلبك كضيف؟' : 'Looking for merchant onboarding or guest order tracking?'}</span>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => navigate('/orders')} className="editorial-link text-[var(--bone)] cursor-pointer">
              {t.myOrders}
            </button>
            <button type="button" onClick={() => navigate('/seller')} className="editorial-link text-[var(--ember)] cursor-pointer">
              {t.navSell}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">
            {authUser.roleKey.replace('_', ' ')} · {authUser.email}
          </p>
          <h1 className="font-display text-3xl font-bold text-[var(--bone)]">{authUser.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(authUser.roleKey === 'seller_owner' || authUser.roleKey === 'seller_staff') && (
            <button
              type="button"
              onClick={() => navigate('/seller')}
              className="px-4 py-2 border border-[var(--ember)] text-xs font-semibold text-[var(--ember)] cursor-pointer"
            >
              {t.navSell}
            </button>
          )}
          {(authUser.roleKey === 'admin_super' || authUser.roleKey === 'admin_staff') && (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="px-4 py-2 border border-[var(--cyan)] text-xs font-semibold text-[var(--cyan)] cursor-pointer"
            >
              {t.adminPanel}
            </button>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="px-4 py-2 border border-[var(--line)] text-xs font-semibold text-[var(--bone)] inline-flex items-center gap-1.5 hover:border-[var(--ember)] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{locale === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>
          </button>
        </div>
      </div>

      {/* Hairline Tabs */}
      <div className="flex flex-wrap border border-[var(--line)] bg-[var(--graphite)] text-xs font-mono-tabular uppercase">
        {(
          [
            ['profile', t.profileSettings],
            ['addresses', `${t.savedAddresses} (${addresses.length})`],
            ['notifications', `${t.notifications}${unreadNotificationsCount > 0 ? ` · ${unreadNotificationsCount}` : ''}`],
            ['wishlist', `${t.wishlist} (${wishlistProducts.length})`],
            ['cases', locale === 'ar' ? 'الطلبات والدعم' : 'Cases & Support'],
          ] as const
        ).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-3 border-e border-b sm:border-b-0 border-[var(--line)] cursor-pointer ${
              tab === k
                ? 'bg-[var(--ember)] text-[var(--ember-fg)] font-bold'
                : 'text-[var(--muted)] hover:text-[var(--bone)]'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* Tab 1: Profile & Security */}
      {tab === 'profile' && (
        <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
          <form onSubmit={handleSaveProfile} className="hairline-cell lg:col-span-7 p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-[var(--bone)]">{t.profileSettings}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.fullName}</span>
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.phone}</span>
                <input
                  type="tel"
                  required
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm font-mono-tabular text-[var(--bone)]"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">
                  {locale === 'ar' ? 'اللغة المفضلة' : 'Preferred Language'}
                </span>
                <select
                  value={prefLocale}
                  onChange={(e) => setPrefLocale(e.target.value === 'ar' ? 'ar' : 'en')}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
                >
                  <option value="en">English (LTR)</option>
                  <option value="ar">العربية (RTL)</option>
                </select>
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">
                  {locale === 'ar' ? 'العملة المفضلة' : 'Preferred Currency'}
                </span>
                <select
                  value={prefCurrency}
                  onChange={(e) => setPrefCurrency(e.target.value === 'LBP' ? 'LBP' : 'USD')}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm font-mono-tabular text-[var(--bone)]"
                >
                  <option value="USD">USD ($)</option>
                  <option value="LBP">LBP (ل.ل)</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
            >
              {savingProfile ? '...' : locale === 'ar' ? 'حفظ التغييرات' : 'Save Preferences'}
            </button>
          </form>

          <div className="hairline-cell lg:col-span-5 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--cedar)]" />
                <h2 className="font-display text-xl font-bold text-[var(--bone)]">{t.twoFactorAuth}</h2>
              </div>
              <StatusLabel
                status={authUser.totpEnabled ? 'enabled' : 'off'}
                tone={authUser.totpEnabled ? 'cedar' : 'gold'}
              />
            </div>

            {!authUser.totpEnabled && !totpEnrollData && (
              <button
                type="button"
                onClick={handleStart2fa}
                className="px-4 py-2 border border-[var(--line)] text-xs font-semibold text-[var(--bone)] hover:border-[var(--ember)] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{locale === 'ar' ? 'إعداد تطبيق المصادقة' : 'Enroll TOTP Authenticator'}</span>
              </button>
            )}

            {totpEnrollData && (
              <form onSubmit={handleVerify2fa} className="space-y-3 border border-[var(--line)] bg-[var(--ink)] p-4 text-xs">
                <p className="font-mono-tabular text-[var(--gold)] uppercase">Authenticator Secret</p>
                <p className="font-mono-tabular break-all text-[var(--bone)]">{totpEnrollData.secret}</p>
                <p className="text-[11px] font-mono-tabular break-all text-[var(--muted)]">{totpEnrollData.otpauthUri}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={totpVerifyCode}
                    onChange={(e) => setTotpVerifyCode(e.target.value)}
                    placeholder="123456"
                    className="flex-1 bg-[var(--graphite)] border border-[var(--line)] px-3 py-2 font-mono-tabular text-[var(--bone)]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[var(--cedar)] text-white font-bold uppercase cursor-pointer"
                  >
                    Verify
                  </button>
                </div>
              </form>
            )}

            <div className="pt-4 border-t border-[var(--line)] space-y-2">
              <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">
                {locale === 'ar' ? 'الأمان والجلسات' : 'Active Sessions'}
              </p>
              <button
                type="button"
                onClick={() => void logoutAllDevices()}
                className="px-4 py-2 border border-[var(--ember)] text-xs font-semibold text-[var(--ember)] cursor-pointer"
              >
                {t.logoutAllDevices}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Saved Addresses */}
      {tab === 'addresses' && (
        <div className="hairline-grid grid-cols-1 lg:grid-cols-12">
          <div className="hairline-cell lg:col-span-7 p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-[var(--bone)]">{t.savedAddresses}</h2>
            {addresses.length === 0 ? (
              <EmptyState
                title={locale === 'ar' ? 'لا توجد عناوين محفوظة' : 'No saved addresses yet'}
                description={locale === 'ar' ? 'أضف عنوانك في لبنان لإتمام الشراء بسرعة.' : 'Add a Lebanese delivery address for one-click checkout.'}
              />
            ) : (
              <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
                {addresses.map((adr) => (
                  <div key={adr.id} className="p-4 flex flex-wrap items-start justify-between gap-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[var(--ember)]" />
                        <span className="font-semibold text-sm text-[var(--bone)]">{adr.label}</span>
                        {adr.isDefault && <StatusLabel status="default" tone="cedar" />}
                      </div>
                      <p className="text-[var(--muted)]">
                        {adr.governorate} · {adr.district} · {adr.town}
                      </p>
                      <p className="font-mono-tabular text-[var(--muted)]">{adr.phone}</p>
                      {adr.notes && <p className="text-[var(--bone)]">{adr.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {!adr.isDefault && (
                        <button
                          type="button"
                          onClick={() => void handleSetDefaultAddress(adr.id)}
                          className="px-2.5 py-1.5 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--cedar)] cursor-pointer"
                        >
                          {locale === 'ar' ? 'تعيين كافتراضي' : 'Set Default'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteAddress(adr.id)}
                        aria-label="Delete address"
                        className="p-1.5 border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ember)] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleCreateAddress} className="hairline-cell lg:col-span-5 p-6 space-y-3">
            <h3 className="font-display text-lg font-bold text-[var(--bone)]">
              {locale === 'ar' ? 'إضافة عنوان جديد' : 'Add Lebanese Address'}
            </h3>
            <label className="block space-y-1 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">
                {locale === 'ar' ? 'تسمية العنوان' : 'Label (Home / Office)'}
              </span>
              <input
                type="text"
                required
                value={addrLabel}
                onChange={(e) => setAddrLabel(e.target.value)}
                placeholder="Gemmayze Studio"
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.governorate}</span>
                <select
                  value={addrGov}
                  onChange={(e) => {
                    const g = LEBANON_GOVERNORATES.find((item) => item.code === e.target.value);
                    setAddrGov(e.target.value);
                    if (g?.districts[0]) {
                      setAddrDistrict(g.districts[0].code);
                      setAddrTown(g.districts[0].towns[0]?.en || '');
                    }
                  }}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-xs text-[var(--bone)]"
                >
                  {LEBANON_GOVERNORATES.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.name[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.district}</span>
                <select
                  value={addrDistrict}
                  onChange={(e) => {
                    const d = selectedGov.districts.find((item) => item.code === e.target.value);
                    setAddrDistrict(e.target.value);
                    if (d?.towns[0]) setAddrTown(d.towns[0].en);
                  }}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-xs text-[var(--bone)]"
                >
                  {selectedGov.districts.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.town}</span>
                <select
                  value={addrTown}
                  onChange={(e) => setAddrTown(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--line)] px-2.5 py-2 text-xs text-[var(--bone)]"
                >
                  {selectedDist.towns.map((tw) => (
                    <option key={tw.en} value={tw.en}>
                      {tw[locale]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.phone}</span>
              <input
                type="tel"
                required
                value={addrPhone}
                onChange={(e) => setAddrPhone(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm font-mono-tabular text-[var(--bone)]"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-mono-tabular uppercase text-[var(--muted)]">{t.addressNotes}</span>
              <input
                type="text"
                value={addrNotes}
                onChange={(e) => setAddrNotes(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--bone)]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--bone)] cursor-pointer">
              <input type="checkbox" checked={addrDefault} onChange={(e) => setAddrDefault(e.target.checked)} />
              <span>{locale === 'ar' ? 'تعيين كعنوان افتراضي' : 'Set as default delivery address'}</span>
            </label>
            <button
              type="submit"
              disabled={addrBusy}
              className="px-5 py-2.5 bg-[var(--ember)] text-[var(--ember-fg)] text-xs font-bold uppercase cursor-pointer"
            >
              {addrBusy ? '...' : locale === 'ar' ? 'حفظ العنوان' : 'Save Address'}
            </button>
          </form>
        </div>
      )}

      {/* Tab 3: Notifications */}
      {tab === 'notifications' && (
        <div className="border border-[var(--line)] bg-[var(--graphite)] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[var(--ember)]" />
              <h2 className="font-display text-xl font-bold text-[var(--bone)]">{t.notifications}</h2>
            </div>
            {unreadNotificationsCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkNotificationRead('all')}
                className="px-3 py-1.5 border border-[var(--line)] text-xs font-semibold text-[var(--bone)] inline-flex items-center gap-1.5 hover:border-[var(--cedar)] cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{locale === 'ar' ? 'تحديد الكل كمقروء' : 'Mark all read'}</span>
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <EmptyState
              title={locale === 'ar' ? 'لا توجد إشعارات' : 'Inbox clear'}
              description={locale === 'ar' ? 'ستظهر هنا تحديثات الطلبات والموافقات.' : 'Order milestones, return updates, and approvals appear here.'}
            />
          ) : (
            <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 flex flex-wrap items-start justify-between gap-4 text-xs ${
                    n.readAt ? 'bg-[var(--ink)] opacity-80' : 'bg-[var(--graphite)]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {!n.readAt && <span className="w-2 h-2 bg-[var(--ember)] inline-block" aria-hidden="true" />}
                      <p className="font-semibold text-sm text-[var(--bone)]">{n.title[locale] || n.title.en}</p>
                    </div>
                    <p className="text-[var(--muted)]">{n.body[locale] || n.body.en}</p>
                    <p className="font-mono-tabular text-[11px] text-[var(--muted)]">{n.createdAt}</p>
                  </div>
                  {!n.readAt && (
                    <button
                      type="button"
                      onClick={() => void handleMarkNotificationRead(n.id)}
                      className="px-3 py-1 border border-[var(--line)] text-[var(--bone)] hover:border-[var(--cedar)] cursor-pointer"
                    >
                      {locale === 'ar' ? 'مقروء' : 'Mark Read'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Wishlist */}
      {tab === 'wishlist' && (
        <div className="space-y-4">
          {wishlistProducts.length === 0 ? (
            <EmptyState
              title={locale === 'ar' ? 'قائمة المفضلة فارغة' : 'Wishlist is empty'}
              description={locale === 'ar' ? 'احفظ المنتجات من الكتالوج للعودة إليها لاحقاً.' : 'Save products from the catalog to compare them later.'}
              actionLabel={t.navCatalog}
              onAction={() => navigate('/catalog')}
            />
          ) : (
            <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {wishlistProducts.map((p) => (
                <ProductCard key={p.id} product={p} seller={sellers.find((s) => s.id === p.sellerId)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Returns, Disputes & Support Tickets */}
      {tab === 'cases' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-[var(--bone)]">
              {locale === 'ar' ? 'الإرجاعات والنزاعات وتذاكر الدعم' : 'Returns, Disputes & Support Tickets'}
            </h2>
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                onClick={() => navigate('/orders')}
                className="px-4 py-2 border border-[var(--line)] text-[var(--bone)] cursor-pointer"
              >
                {t.myOrders}
              </button>
              <button
                type="button"
                onClick={() => navigate('/support')}
                className="px-4 py-2 bg-[var(--ember)] text-[var(--ember-fg)] font-bold uppercase cursor-pointer"
              >
                {t.navSupport}
              </button>
            </div>
          </div>

          <div className="hairline-grid grid-cols-1 lg:grid-cols-3">
            <div className="hairline-cell p-5 space-y-3">
              <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">
                Returns ({casesData.returns.length})
              </p>
              {casesData.returns.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No return requests.</p>
              ) : (
                <div className="space-y-2">
                  {casesData.returns.map((r) => (
                    <div key={r.id} className="border border-[var(--line)] bg-[var(--ink)] p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-mono-tabular text-[var(--bone)]">{r.orderNumber || r.subOrderId}</span>
                        <StatusLabel status={r.status} tone={r.status === 'refunded' ? 'cedar' : 'gold'} />
                      </div>
                      <p className="text-[var(--muted)]">{r.reason}</p>
                      <PriceDisplay usdCents={r.refundUsdCents} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="hairline-cell p-5 space-y-3">
              <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">
                Disputes ({casesData.disputes.length})
              </p>
              {casesData.disputes.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No order disputes.</p>
              ) : (
                <div className="space-y-2">
                  {casesData.disputes.map((d) => (
                    <div key={d.id} className="border border-[var(--line)] bg-[var(--ink)] p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-mono-tabular text-[var(--bone)]">{d.orderNumber || d.subOrderId}</span>
                        <StatusLabel status={d.status.replace('_', ' ')} tone={d.status.startsWith('resolved') ? 'cedar' : 'ember'} />
                      </div>
                      <p className="text-[var(--muted)]">{d.reason}</p>
                      {d.resolutionNote && <p className="text-[var(--cedar)]">{d.resolutionNote}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="hairline-cell p-5 space-y-3">
              <p className="text-xs font-mono-tabular uppercase text-[var(--muted)]">
                Support Tickets ({casesData.tickets.length})
              </p>
              {casesData.tickets.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No support tickets submitted.</p>
              ) : (
                <div className="space-y-2">
                  {casesData.tickets.map((tkt) => (
                    <div key={tkt.id} className="border border-[var(--line)] bg-[var(--ink)] p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-semibold text-[var(--bone)]">{tkt.subject}</span>
                        <StatusLabel status={tkt.status.replace('_', ' ')} tone={tkt.status === 'resolved' ? 'cedar' : 'gold'} />
                      </div>
                      <p className="text-[var(--muted)]">{tkt.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
