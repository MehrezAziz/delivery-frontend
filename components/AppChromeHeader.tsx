import { useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname, useSegments } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import { ThemeToggle } from './ThemeToggle';
import { AppSideMenu } from './AppSideMenu';
import { NotificationPreviewModal } from './NotificationPreviewModal';
import { notificationService } from '../services/api/notification.service';
import { subscribeUnreadBadgeRefresh } from '../services/notifications';
import {
  AUTH_ROUTE_TITLES,
  CUSTOMER_ROUTE_TITLES,
  DRIVER_ROUTE_TITLES,
} from '../constants/screenTitles';
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

export type AppChromeRole = 'guest' | 'customer' | 'driver';

export function AppChromeHeader({
  title: titleProp,
  role,
  subtitle,
  showMenu = true,
  showProfile,
  showNotifications,
  showThemeToggle,
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
  /** Main home: show bell → notifications (default true when showProfile would have been true). */
  showNotifications?: boolean;
  /** When omitted: only on main Home tab (customer/driver); guest screens set explicitly. */
  showThemeToggle?: boolean;
  /** When omitted: hidden on main Home tab (customer/driver); guest uses explicit value. */
  hideBack?: boolean;
  guestLoginBackToWelcome?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { push } = useAppNavigation();
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const { colors, isDark } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [identityTitle, setIdentityTitle] = useState<string | null>(null);
  const [identitySubtitle, setIdentitySubtitle] = useState<string | null>(null);
  const [initials, setInitials] = useState('');
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [statusDotColor, setStatusDotColor] = useState('#9ca3af');
  const [notifPreviewOpen, setNotifPreviewOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isMainHome = useMemo(() => isMainHomeScreen(role, segments, pathname), [role, segments, pathname]);

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
        : role !== 'guest' && isMainHome;

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
    if (role === 'customer') return CUSTOMER_ROUTE_TITLES[leaf] || leaf.replace(/-/g, ' ');
    if (role === 'driver') return DRIVER_ROUTE_TITLES[leaf] || leaf.replace(/-/g, ' ');
    return 'App';
  }, [titleProp, pathname, role, isMainHome, identityTitle]);

  const resolvedHideBack =
    role === 'guest' ? !!hideBack : hideBack === true || (hideBack !== false && isMainHome);

  const resolvedShowTheme =
    showThemeToggle !== undefined ? showThemeToggle : role !== 'guest' && isMainHome;

  const onBack = () => {
    if (role === 'guest' && guestLoginBackToWelcome) {
      router.replace('/');
      return;
    }
    if (router.canGoBack()) router.back();
    else if (role === 'guest') router.replace('/');
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
            accessibilityLabel="Profile picture"
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
            accessibilityLabel="Open profile"
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
      <View style={{ paddingTop: insets.top, backgroundColor: headerBg }}>
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
                    accessibilityLabel="Support"
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
                    accessibilityLabel="Settings"
                  >
                    <Ionicons name="settings-outline" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {resolvedShowNotifications ? (
                  <TouchableOpacity
                    onPress={() => setNotifPreviewOpen(true)}
                    style={[styles.notifCornerBtn, { backgroundColor: notifBtnBg }]}
                    activeOpacity={0.85}
                    accessibilityLabel="Notifications"
                  >
                    <Ionicons name="notifications-outline" size={22} color={bellColor} />
                    {unreadCount > 0 ? (
                      <View style={styles.notifBadge}>
                        <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ) : null}
                {resolvedShowTheme ? (
                  <ThemeToggle size={20} color="#fff" style={[styles.themeBtn, { backgroundColor: iconBtnBg }]} />
                ) : null}
                {showMenu ? (
                  <TouchableOpacity
                    onPress={() => setMenuOpen(true)}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
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
                    accessibilityLabel="Support"
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
                    accessibilityLabel="Settings"
                  >
                    <Ionicons name="settings-outline" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
                {resolvedShowNotifications && role !== 'guest' ? (
                  <TouchableOpacity
                    onPress={() => setNotifPreviewOpen(true)}
                    style={[styles.notifCornerBtn, { backgroundColor: notifBtnBg }]}
                    activeOpacity={0.85}
                    accessibilityLabel="Notifications"
                  >
                    <Ionicons name="notifications-outline" size={22} color={bellColor} />
                    {unreadCount > 0 ? (
                      <View style={styles.notifBadge}>
                        <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ) : null}
                {resolvedShowTheme ? (
                  <ThemeToggle size={20} color={role === 'guest' ? colors.text : '#fff'} style={[styles.themeBtn, { backgroundColor: iconBtnBg }]} />
                ) : null}
                {showMenu ? (
                  <TouchableOpacity
                    onPress={() => setMenuOpen(true)}
                    style={[styles.iconBtn, { backgroundColor: iconBtnBg }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="menu" size={22} color={textColor} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}
        </View>
      </View>
      {role !== 'guest' && isMainHome ? (
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
      {showMenu ? (
        <AppSideMenu visible={menuOpen} onClose={() => setMenuOpen(false)} role={role} />
      ) : null}
    </>
  );
}

/** Use inside Stack `screenOptions` for auth routes. */
export function AuthChromeHeader({ routeName }: { routeName: string }) {
  const title = AUTH_ROUTE_TITLES[routeName] || 'Account';
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
