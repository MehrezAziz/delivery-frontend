import { useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useRouter,
  usePathname,
  useSegments,
  useGlobalSearchParams,
  useUnstableGlobalHref,
} from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import { useAppMenu } from '../contexts/AppMenuContext';
import { ThemeToggle } from './ThemeToggle';
import { HeaderLanguagePicker } from './settings/HeaderLanguagePicker';
import { NotificationPreviewModal } from './NotificationPreviewModal';
import { notificationService } from '../services/api/notification.service';
import { subscribeUnreadBadgeRefresh } from '../services/notifications';
import {
  getAuthRouteTitle,
  getCustomerRouteTitle,
  getDriverRouteTitle,
} from '../constants/screenTitles';
import {
  getNestedDefaultReturnHref,
  isNestedTabScreen,
  parseReturnToFromSearch,
  resolveReturnToHref,
  type AppRole,
} from '../utils/navigationReturnTo';
import { isSameAppRoute } from '../utils/appRoutes';
import {
  getCustomerStatusDotColor,
  getDriverStatusDotColor,
  resolveUserProfileImageUri,
} from '../utils/customerStatus';

/** Main “home” tab only — avoids back → login confusion and limits chrome actions to home. */
function isMainHomeScreen(role: AppChromeRole, segments: string[], pathname: string): boolean {
  const norm = (pathname || '/').replace(/\/$/, '') || '/';
  const routeOnly = segments.filter((s) => !s.startsWith('('));
  const leaf = routeOnly[routeOnly.length - 1];
  if (role === 'customer') {
    if (leaf === 'home' && segments.includes('(customer)')) return true;
    return norm === '/(customer)/home' || norm.endsWith('/(customer)/home');
  }
  if (role === 'driver') {
    if (leaf === 'home' && segments.includes('(driver)')) return true;
    return norm === '/(driver)/home' || norm.endsWith('/(driver)/home');
  }
  return false;
}

/** Bottom tab surfaces (Home, Orders, …) — bell + unread badge + preview modal. Nested routes (order-chat, …) omit. */
function isPrimaryTabsNotificationSurface(role: AppChromeRole, segments: string[]): boolean {
  const routeOnly = segments.filter((s) => !s.startsWith('('));
  const leaf = routeOnly[routeOnly.length - 1] || '';
  if (role === 'customer' && segments.includes('(customer)')) {
    return ['home', 'orders', 'wallet', 'profile'].includes(leaf);
  }
  if (role === 'driver' && segments.includes('(driver)')) {
    return ['home', 'my-orders', 'available-orders', 'profile'].includes(leaf);
  }
  return false;
}

export type AppChromeRole = 'guest' | 'customer' | 'driver';

export function AppChromeHeader({
  title: titleProp,
  role,
  subtitle,
  showMenu = true,
  showProfile,
  showNotifications,
  showThemeToggle,
  showLanguagePicker = false,
  hideBack,
  /** Customer/driver sign-in: header back always opens welcome (`/`). */
  guestLoginBackToWelcome,
}: {
  title?: string;
  role: AppChromeRole;
  subtitle?: string;
  showMenu?: boolean;
  /** When omitted: only on main Home tab (customer/driver). Replaced by notification icon on home. */
  showProfile?: boolean;
  /** Main tab shell: bell → preview (default when showProfile omitted). */
  showNotifications?: boolean;
  /** When omitted: only on main Home tab (customer/driver); guest screens set explicitly. */
  showThemeToggle?: boolean;
  /** Language icon-button + dropdown (used on the welcome/role-selection screen). */
  showLanguagePicker?: boolean;
  /** When omitted: hidden on main Home tab (customer/driver); guest uses explicit value. */
  hideBack?: boolean;
  guestLoginBackToWelcome?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { push, getPreviousPath, getLastMainTabHref } = useAppNavigation();
  const pathname = usePathname();
  const globalSearchParams = useGlobalSearchParams();
  const unstableGlobalHref = useUnstableGlobalHref();
  const segments = useSegments() as string[];
  const { colors, isDark } = useTheme();
  const { t, i18n: i18nInstance } = useTranslation();
  const { toggle: toggleMenu, visible: menuOpen, setLayout } = useAppMenu();
  const [identityTitle, setIdentityTitle] = useState<string | null>(null);
  const [identitySubtitle, setIdentitySubtitle] = useState<string | null>(null);
  const [initials, setInitials] = useState('');
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [statusDotColor, setStatusDotColor] = useState('#9ca3af');
  const [notifPreviewOpen, setNotifPreviewOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chromeHeaderHeight, setChromeHeaderHeight] = useState(0);

  useEffect(() => {
    if (!showMenu) return;
    setLayout({
      topOffset: chromeHeaderHeight,
      bottomOffset: role === 'guest' ? insets.bottom : 60 + insets.bottom,
      role,
    });
  }, [showMenu, chromeHeaderHeight, insets.bottom, role, setLayout]);

  const isMainHome = useMemo(() => isMainHomeScreen(role, segments, pathname), [role, segments, pathname]);
  const showTabsNotifications = useMemo(
    () => isPrimaryTabsNotificationSurface(role, segments),
    [role, segments],
  );

  const loadHomeIdentity = useCallback(async () => {
    if (role === 'guest' || !isMainHome) {
      setIdentityTitle(null);
      setIdentitySubtitle(null);
      setInitials('');
      setProfileImageUri(null);
      setStatusDotColor('#9ca3af');
      return;
    }
    try {
      const rawUser = await AsyncStorage.getItem('user');
      const rawCust = await AsyncStorage.getItem('customer');
      const rawDrv = await AsyncStorage.getItem('driver');
      let title = '';
      let sub = '';
      let ini = '';
      let img: string | null = null;
      let dot = '#9ca3af';
      if (rawUser) {
        const u = JSON.parse(rawUser) as { firstName?: string; secondName?: string; image?: string | null };
        title = [u.firstName, u.secondName].filter(Boolean).join(' ').trim();
        const a = (u.firstName || '').trim().charAt(0);
        const b = (u.secondName || '').trim().charAt(0);
        ini = `${a}${b}`.toUpperCase() || (a || '?').toUpperCase();
        img = resolveUserProfileImageUri(u.image ?? null);
      }
      if (role === 'customer' && rawCust) {
        const c = JSON.parse(rawCust) as { customerStatus?: string };
        const st = c.customerStatus ? String(c.customerStatus) : '';
        sub = st ? st.replace(/_/g, ' ') : '';
        dot = st ? getCustomerStatusDotColor(st) : dot;
      } else if (role === 'driver' && rawDrv) {
        const d = JSON.parse(rawDrv) as { status?: string };
        const st = d.status ? String(d.status) : '';
        sub = st ? st.replace(/_/g, ' ') : '';
        dot = st ? getDriverStatusDotColor(st) : dot;
      }
      setIdentityTitle(title || null);
      setIdentitySubtitle(sub || null);
      setInitials(ini);
      setProfileImageUri(img);
      setStatusDotColor(dot);
    } catch {
      setIdentityTitle(null);
      setIdentitySubtitle(null);
      setInitials('');
      setProfileImageUri(null);
      setStatusDotColor('#9ca3af');
    }
  }, [role, isMainHome]);

  const resolvedShowNotifications =
    showNotifications !== undefined
      ? showNotifications
      : showProfile !== undefined
        ? showProfile
        : role !== 'guest' && showTabsNotifications;

  const loadUnread = useCallback(async () => {
    if (role === 'guest') return;
    try {
      const c = await notificationService.getUnreadCount();
      setUnreadCount(c.count ?? 0);
    } catch {
      setUnreadCount(0);
    }
  }, [role]);

  useEffect(() => {
    if (role === 'guest') return undefined;
    const unsub = subscribeUnreadBadgeRefresh(() => {
      void loadUnread();
    });
    return unsub;
  }, [role, loadUnread]);

  useFocusEffect(
    useCallback(() => {
      void loadHomeIdentity();
      void loadUnread();
    }, [loadHomeIdentity, loadUnread]),
  );

  useEffect(() => {
    void loadHomeIdentity();
  }, [pathname, loadHomeIdentity]);

  const resolvedTitle = useMemo(() => {
    if (titleProp) return titleProp;
    if (isMainHome && identityTitle) return identityTitle;
    const parts = pathname.replace(/^\//, '').split('/').filter(Boolean);
    const leaf = parts.filter((p) => !p.startsWith('(')).pop() || 'home';
    if (role === 'customer') return getCustomerRouteTitle(leaf);
    if (role === 'driver') return getDriverRouteTitle(leaf);
    return t('common.app');
    // i18nInstance.language is included so the title re-renders when language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleProp, pathname, role, isMainHome, identityTitle, i18nInstance.language]);

  const resolvedHideBack =
    role === 'guest' ? !!hideBack : hideBack === true || (hideBack !== false && isMainHome);

  const resolvedShowTheme =
    showThemeToggle !== undefined ? showThemeToggle : role !== 'guest' && isMainHome;

  const onBack = () => {
    if (role === 'guest' && guestLoginBackToWelcome) {
      router.replace('/');
      return;
    }

    const appRole: AppRole | null = role === 'customer' ? 'customer' : role === 'driver' ? 'driver' : null;

    if (appRole) {
      const returnToRaw = parseReturnToFromSearch(
        globalSearchParams.returnTo,
        pathname,
        unstableGlobalHref,
      );
      if (returnToRaw) {
        const target = resolveReturnToHref(appRole, returnToRaw);
        if (target) {
          router.replace(target as never);
          return;
        }
      }

      const defaultReturn = getNestedDefaultReturnHref(appRole, pathname);
      if (defaultReturn && isNestedTabScreen(appRole, pathname)) {
        router.replace(defaultReturn as never);
        return;
      }

      if (isNestedTabScreen(appRole, pathname)) {
        const previous = getPreviousPath();
        if (previous && !isSameAppRoute(previous, pathname)) {
          router.replace(previous as never);
          return;
        }
        const lastMainTab = getLastMainTabHref(appRole);
        if (lastMainTab) {
          router.replace(lastMainTab as never);
          return;
        }
      }
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    // Stack navigators only — tab `goBack()` jumps to the first tab (Home), not the prior screen.
    let nav: ReturnType<typeof useNavigation> | undefined = navigation;
    for (let depth = 0; depth < 8 && nav != null; depth++) {
      const state = nav.getState?.();
      if (state?.type === 'tab' || state?.type === 'drawer') {
        nav = nav.getParent();
        continue;
      }
      if (nav.canGoBack()) {
        nav.goBack();
        return;
      }
      nav = nav.getParent();
    }

    if (role === 'guest') router.replace('/');
    else if (role === 'customer') router.replace('/(customer)/home');
    else router.replace('/(driver)/home');
  };

  const onProfileNamePress = () => {
    if (role === 'customer') push('/(customer)/profile');
    else if (role === 'driver') push('/(driver)/profile');
  };
  const normalizedPath = (pathname || '').split('?')[0];
  const showDriverAddressesAdd =
    role === 'driver' &&
    (normalizedPath === '/(driver)/addresses' || normalizedPath.endsWith('/addresses'));
  const showDriverRestrictionsSupport =
    role === 'driver' &&
    (normalizedPath === '/(driver)/restrictions' || normalizedPath.endsWith('/restrictions'));
  const showCustomerAddressesAdd =
    role === 'customer' &&
    (normalizedPath === '/(customer)/addresses' || normalizedPath.endsWith('/addresses'));
  const showCustomerOrdersAdd =
    role === 'customer' &&
    (normalizedPath === '/(customer)/orders' || normalizedPath.endsWith('/orders'));
  const showCustomerProfileSettings =
    role === 'customer' &&
    (normalizedPath === '/(customer)/profile' || normalizedPath.endsWith('/profile'));
  const showDriverProfileSettings =
    role === 'driver' &&
    (normalizedPath === '/(driver)/profile' || normalizedPath.endsWith('/profile'));

  const headerBg = role === 'guest' ? colors.card : colors.headerBg;
  const textColor = role === 'guest' ? colors.text : '#fff';
  const subColor = role === 'guest' ? colors.textSecondary : 'rgba(255,255,255,0.82)';
  const iconBtnBg =
    role === 'guest'
      ? colors.surfaceVariant
      : isDark
        ? 'rgba(255,255,255,0.14)'
        : 'rgba(255,255,255,0.22)';

  const showHomeIdentity = (role === 'customer' || role === 'driver') && isMainHome;
  const notifBtnBg = role === 'guest' ? iconBtnBg : 'rgba(255,255,255,0.2)';
  const bellColor = role === 'guest' ? textColor : '#fff';

  const homeIdentityBlock = (
    <View style={[styles.titleBlock, showHomeIdentity && styles.titleBlockHome]}>
      {showHomeIdentity ? (
        <View style={styles.homeIdentityRow}>
          <TouchableOpacity
            activeOpacity={1}
            accessibilityRole="imagebutton"
            accessibilityLabel={t('chrome.profilePicture')}
          >
            {profileImageUri ? (
              <Image source={{ uri: profileImageUri }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatarPlaceholder, { backgroundColor: iconBtnBg }]}>
                <Text style={[styles.headerAvatarInitials, { color: textColor }]} numberOfLines={1}>
                  {initials || '?'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onProfileNamePress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t('chrome.openProfile')}
            style={styles.homeIdentityText}
          >
            <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
              {resolvedTitle}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: subColor }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : identitySubtitle ? (
              <View style={styles.subtitleWithDot}>
                <View style={[styles.statusDotSm, { backgroundColor: statusDotColor }]} />
                <Text style={[styles.subtitle, { color: subColor, marginTop: 0 }]} numberOfLines={1}>
                  {identitySubtitle}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
            {resolvedTitle}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: subColor }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );

  return (
    <>
      <View
        onLayout={(e) => setChromeHeaderHeight(e.nativeEvent.layout.height)}
        style={{ paddingTop: insets.top, backgroundColor: headerBg }}
      >
        <View style={styles.row}>
          {showHomeIdentity ? (
            <>
              {homeIdentityBlock}
              <View style={styles.rightCluster}>
                {showDriverAddressesAdd ? (
                  <TouchableOpacity
                    onPress={() => router.replace(`/(driver)/addresses?add=${Date.now()}` as never)}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="add" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {showDriverRestrictionsSupport ? (
                  <TouchableOpacity
                    onPress={() => push('/(driver)/support')}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                    accessibilityLabel={t('chrome.support')}
                  >
                    <Ionicons name="headset-outline" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {showCustomerAddressesAdd ? (
                  <TouchableOpacity
                    onPress={() => router.replace(`/(customer)/addresses?add=${Date.now()}` as never)}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="add" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {showCustomerOrdersAdd ? (
                  <TouchableOpacity
                    onPress={() => push('/(customer)/create-order')}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="add" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {showCustomerProfileSettings ? (
                  <TouchableOpacity
                    onPress={() => push('/(customer)/settings')}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                    accessibilityLabel={t('chrome.settings')}
                  >
                    <Ionicons name="settings-outline" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {showDriverProfileSettings ? (
                  <TouchableOpacity
                    onPress={() => push('/(driver)/settings')}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                    accessibilityLabel={t('chrome.settings')}
                  >
                    <Ionicons name="settings-outline" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {resolvedShowNotifications ? (
                  <TouchableOpacity
                    onPress={() => setNotifPreviewOpen(true)}
                    style={[styles.notifCornerBtn, { backgroundColor: notifBtnBg }]}
                    activeOpacity={0.85}
                    accessibilityLabel={t('chrome.notifications')}
                  >
                    <Ionicons name="notifications-outline" size={22} color={bellColor} />
                    {unreadCount > 0 ? (
                      <View style={styles.notifBadge}>
                        <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ) : null}
                {showLanguagePicker ? (
                  <HeaderLanguagePicker
                    iconColor={textColor}
                    buttonStyle={{ backgroundColor: iconBtnBg }}
                    anchorTop={insets.top + 52}
                  />
                ) : null}
                {resolvedShowTheme ? (
                  <ThemeToggle size={20} color="#fff" style={[styles.themeBtn, { backgroundColor: iconBtnBg }]} />
                ) : null}
                {showMenu ? (
                  <TouchableOpacity
                    onPress={toggleMenu}
                    style={[
                      styles.iconBtn,
                      {
                        backgroundColor: menuOpen
                          ? role === 'guest'
                            ? colors.primary + '22'
                            : 'rgba(255,255,255,0.32)'
                          : iconBtnBg,
                      },
                    ]}
                    activeOpacity={0.75}
                    accessibilityLabel={t('sideMenu.menu')}
                    accessibilityState={{ expanded: menuOpen }}
                  >
                    <Ionicons name="menu" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          ) : (
            <>
              {resolvedHideBack ? (
                <View style={styles.iconBtn} />
              ) : (
                <TouchableOpacity onPress={onBack} style={[styles.iconBtn, { backgroundColor: iconBtnBg }]} activeOpacity={0.75}>
                  <Ionicons name="chevron-back" size={22} color={textColor} />
                </TouchableOpacity>
              )}
              {homeIdentityBlock}
              <View style={styles.rightCluster}>
                {showDriverAddressesAdd ? (
                  <TouchableOpacity
                    onPress={() => router.replace(`/(driver)/addresses?add=${Date.now()}` as never)}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="add" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {showDriverRestrictionsSupport ? (
                  <TouchableOpacity
                    onPress={() => push('/(driver)/support')}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                    accessibilityLabel={t('chrome.support')}
                  >
                    <Ionicons name="headset-outline" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {showCustomerAddressesAdd ? (
                  <TouchableOpacity
                    onPress={() => router.replace(`/(customer)/addresses?add=${Date.now()}` as never)}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="add" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {showCustomerOrdersAdd ? (
                  <TouchableOpacity
                    onPress={() => push('/(customer)/create-order')}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="add" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {showCustomerProfileSettings ? (
                  <TouchableOpacity
                    onPress={() => push('/(customer)/settings')}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                    accessibilityLabel={t('chrome.settings')}
                  >
                    <Ionicons name="settings-outline" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {showDriverProfileSettings ? (
                  <TouchableOpacity
                    onPress={() => push('/(driver)/settings')}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                    accessibilityLabel={t('chrome.settings')}
                  >
                    <Ionicons name="settings-outline" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {resolvedShowNotifications && role !== 'guest' ? (
                  <TouchableOpacity
                    onPress={() => setNotifPreviewOpen(true)}
                    style={[styles.notifCornerBtn, { backgroundColor: notifBtnBg }]}
                    activeOpacity={0.85}
                    accessibilityLabel={t('chrome.notifications')}
                  >
                    <Ionicons name="notifications-outline" size={22} color={bellColor} />
                    {unreadCount > 0 ? (
                      <View style={styles.notifBadge}>
                        <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ) : null}
                {showLanguagePicker ? (
                  <HeaderLanguagePicker
                    iconColor={textColor}
                    buttonStyle={{ backgroundColor: iconBtnBg }}
                    anchorTop={insets.top + 52}
                  />
                ) : null}
                {resolvedShowTheme ? (
                  <ThemeToggle size={20} color={role === 'guest' ? colors.text : '#fff'} style={[styles.themeBtn, { backgroundColor: iconBtnBg }]} />
                ) : null}
                {showMenu ? (
                  <TouchableOpacity
                    onPress={toggleMenu}
                    style={[
                      styles.iconBtn,
                      {
                        backgroundColor: menuOpen
                          ? role === 'guest'
                            ? colors.primary + '22'
                            : 'rgba(255,255,255,0.32)'
                          : iconBtnBg,
                      },
                    ]}
                    activeOpacity={0.75}
                    accessibilityLabel={t('sideMenu.menu')}
                    accessibilityState={{ expanded: menuOpen }}
                  >
                    <Ionicons name="menu" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}
        </View>
      </View>
      {role !== 'guest' && showTabsNotifications ? (
        <NotificationPreviewModal
          visible={notifPreviewOpen}
          onClose={() => {
            setNotifPreviewOpen(false);
            void loadUnread();
          }}
          variant={role === 'driver' ? 'driver' : 'customer'}
          onOpenFullInbox={() => {
            setNotifPreviewOpen(false);
            if (role === 'customer') push('/(customer)/notifications');
            else if (role === 'driver') push('/(driver)/notifications');
          }}
          onMarkAllRead={() => setUnreadCount(0)}
        />
      ) : null}
    </>
  );
}

/** Use inside Stack `screenOptions` for auth routes. */
export function AuthChromeHeader({ routeName }: { routeName: string }) {
  const { t, i18n: i18nInstance } = useTranslation();
  const title = useMemo(() => {
    const tr = getAuthRouteTitle(routeName);
    return tr || t('common.account');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeName, i18nInstance.language]);
  const guestLoginBackToWelcome = routeName === 'customer-login' || routeName === 'driver-login';
  return (
    <AppChromeHeader
      role="guest"
      title={title}
      showProfile={false}
      showThemeToggle={false}
      guestLoginBackToWelcome={guestLoginBackToWelcome}
    />
  );
}

export function CustomerTabsHeader() {
  return <AppChromeHeader role="customer" />;
}

export function DriverStackHeader() {
  return <AppChromeHeader role="driver" />;
}

export function DriverTabsHeader() {
  return <AppChromeHeader role="driver" />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  titleBlockHome: {
    paddingHorizontal: 0,
  },
  notifCornerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  homeIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: 1,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarInitials: {
    fontSize: 14,
    fontWeight: '800',
  },
  homeIdentityText: {
    flex: 1,
    minWidth: 0,
  },
  subtitleWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    minWidth: 0,
  },
  statusDotSm: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

