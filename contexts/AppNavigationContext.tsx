import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useTheme } from './ThemeContext';
import { isSameAppRoute } from '../utils/appRoutes';

/** Only show loading if navigation takes longer than this (fast screens stay clean). */
const NAV_OVERLAY_SHOW_DELAY_MS = 300;
/** Always clear pending navigation UI after this (safety). */
const NAV_OVERLAY_MAX_WAIT_MS = 5000;

type Ctx = {
  /** Navigation with optional delayed overlay; skips duplicate taps and no-op when already on route. */
  push: (href: string) => void;
};

const AppNavigationContext = createContext<Ctx | null>(null);

export function useAppNavigation() {
  const v = useContext(AppNavigationContext);
  if (!v) {
    throw new Error('useAppNavigation must be used within AppNavigationProvider');
  }
  return v;
}

function NavigationOverlay({ visible }: { visible: boolean }) {
  const { colors, isDark } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlayRoot} pointerEvents="box-none">
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: isDark ? '#000' : '#0f172a',
            },
          ]}
        >
          <View style={[styles.ring, { borderColor: colors.primary + '55' }]}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Loading</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>Preparing your screen…</Text>
        </View>
      </View>
    </Modal>
  );
}

export function AppNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [overlay, setOverlay] = useState(false);
  const lastPushRef = useRef<{ href: string; at: number } | null>(null);
  const pendingHrefRef = useRef<string | null>(null);
  const navEpochRef = useRef(0);
  const showDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNavTimers = useCallback(() => {
    if (showDelayTimerRef.current) {
      clearTimeout(showDelayTimerRef.current);
      showDelayTimerRef.current = null;
    }
    if (maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const pending = pendingHrefRef.current;
    if (!pending) return;
    if (!isSameAppRoute(pathname, pending)) return;
    pendingHrefRef.current = null;
    navEpochRef.current += 1;
    clearNavTimers();
    setOverlay(false);
  }, [pathname, clearNavTimers]);

  useEffect(() => () => clearNavTimers(), [clearNavTimers]);

  const push = useCallback(
    (href: string) => {
      if (!href) return;
      if (isSameAppRoute(pathname, href)) return;
      const now = Date.now();
      const prev = lastPushRef.current;
      if (prev && prev.href === href && now - prev.at < 900) return;
      lastPushRef.current = { href, at: now };

      clearNavTimers();
      setOverlay(false);
      navEpochRef.current += 1;
      const epoch = navEpochRef.current;
      pendingHrefRef.current = href;

      showDelayTimerRef.current = setTimeout(() => {
        if (navEpochRef.current !== epoch || pendingHrefRef.current !== href) return;
        setOverlay(true);
      }, NAV_OVERLAY_SHOW_DELAY_MS);

      maxWaitTimerRef.current = setTimeout(() => {
        if (navEpochRef.current !== epoch) return;
        pendingHrefRef.current = null;
        navEpochRef.current += 1;
        clearNavTimers();
        setOverlay(false);
      }, NAV_OVERLAY_MAX_WAIT_MS);

      try {
        router.push(href as never);
      } catch {
        pendingHrefRef.current = null;
        navEpochRef.current += 1;
        clearNavTimers();
        setOverlay(false);
      }
    },
    [router, pathname, clearNavTimers],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <AppNavigationContext.Provider value={value}>
      {children}
      <NavigationOverlay visible={overlay} />
    </AppNavigationContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  ring: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: 13, fontWeight: '600', marginTop: 6, textAlign: 'center', lineHeight: 18 },
});
