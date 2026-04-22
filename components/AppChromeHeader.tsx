import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname, useSegments } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import { ThemeToggle } from './ThemeToggle';
import { AppSideMenu } from './AppSideMenu';
import {
  AUTH_ROUTE_TITLES,
  CUSTOMER_ROUTE_TITLES,
  DRIVER_ROUTE_TITLES,
} from '../constants/screenTitles';

const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/?api\/?$/i, '');

/** Main “home” tab only — avoids back → login confusion and limits chrome actions to home. */
function isMainHomeScreen(role: AppChromeRole, segments: string[], pathname: string): boolean {
  const norm = (pathname || '/').replace(/\/$/, '') || '/';
  if (role === 'customer') {
    if (segments.includes('(customer)') && segments[segments.length - 1] === 'home') return true;
    return norm === '/(customer)/home' || norm.endsWith('/(customer)/home');
  }
  if (role === 'driver') {
    if (segments.includes('(driver)') && segments[segments.length - 1] === 'home') return true;
    return norm === '/(driver)/home' || norm.endsWith('/(driver)/home');
  }
  return false;
}

function resolveAvatarUri(image: string | null | undefined): string | null {
  if (!image || typeof image !== 'string') return null;
  const t = image.trim();
  if (!t) return null;
  if (t.startsWith('data:') || t.startsWith('file:') || t.startsWith('http')) return t;
  const path = t.startsWith('/') ? t : `/${t}`;
  return `${API_ORIGIN}${path}`;
}

export type AppChromeRole = 'guest' | 'customer' | 'driver';

export function AppChromeHeader({
  title: titleProp,
  role,
  subtitle,
  showMenu = true,
  showProfile,
  showThemeToggle,
  hideBack,
  /** Customer/driver sign-in: header back always opens welcome (`/`). */
  guestLoginBackToWelcome,
}: {
  title?: string;
  role: AppChromeRole;
  subtitle?: string;
  showMenu?: boolean;
  /** When omitted: only on main Home tab (customer/driver). */
  showProfile?: boolean;
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
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const loadAvatar = useCallback(async () => {
    if (role === 'guest') {
      setAvatarUri(null);
      return;
    }
    try {
      const raw = await AsyncStorage.getItem('user');
      if (!raw) {
        setAvatarUri(null);
        return;
      }
      const u = JSON.parse(raw) as { image?: string | null };
      setAvatarUri(resolveAvatarUri(u?.image));
    } catch {
      setAvatarUri(null);
    }
  }, [role]);

  useFocusEffect(
    useCallback(() => {
      void loadAvatar();
    }, [loadAvatar]),
  );

  const isMainHome = useMemo(() => isMainHomeScreen(role, segments, pathname), [role, segments, pathname]);

  const resolvedTitle = useMemo(() => {
    if (titleProp) return titleProp;
    const parts = pathname.replace(/^\//, '').split('/').filter(Boolean);
    const leaf = parts.filter((p) => !p.startsWith('(')).pop() || 'home';
    if (role === 'customer') return CUSTOMER_ROUTE_TITLES[leaf] || leaf.replace(/-/g, ' ');
    if (role === 'driver') return DRIVER_ROUTE_TITLES[leaf] || leaf.replace(/-/g, ' ');
    return 'App';
  }, [titleProp, pathname, role]);

  const resolvedHideBack =
    role === 'guest' ? !!hideBack : hideBack === true || (hideBack !== false && isMainHome);

  const resolvedShowProfile =
    showProfile !== undefined ? showProfile : role !== 'guest' && isMainHome;

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

  const onAvatar = () => {
    if (role === 'customer') push('/(customer)/profile');
    else if (role === 'driver') push('/(driver)/profile');
  };

  const headerBg = role === 'guest' ? colors.card : colors.headerBg;
  const textColor = role === 'guest' ? colors.text : '#fff';
  const subColor = role === 'guest' ? colors.textSecondary : 'rgba(255,255,255,0.82)';
  const iconBtnBg =
    role === 'guest'
      ? colors.surfaceVariant
      : isDark
        ? 'rgba(255,255,255,0.14)'
        : 'rgba(255,255,255,0.22)';

  return (
    <>
      <View style={{ paddingTop: insets.top, backgroundColor: headerBg }}>
        <View style={styles.row}>
          {resolvedHideBack ? (
            <View style={styles.iconBtn} />
          ) : (
            <TouchableOpacity onPress={onBack} style={[styles.iconBtn, { backgroundColor: iconBtnBg }]} activeOpacity={0.75}>
              <Ionicons name="chevron-back" size={22} color={textColor} />
            </TouchableOpacity>
          )}

          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
              {resolvedTitle}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: subColor }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={styles.rightCluster}>
            {resolvedShowProfile && role !== 'guest' ? (
              <TouchableOpacity onPress={onAvatar} style={[styles.avatarRing, { borderColor: textColor }]} activeOpacity={0.8}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="person" size={18} color={textColor} />
                )}
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
        </View>
      </View>
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
  avatarRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
});
