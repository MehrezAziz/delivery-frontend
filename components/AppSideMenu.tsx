import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import { clearSession } from '../services/auth-session';
import { clearPushToken } from '../services/api/notification.service';
import { stopOrderTrackingSilently } from '../services/notifications';
import { isSameAppRoute } from '../utils/appRoutes';
import { resetOrderConfirmIdentitySession } from '../utils/createOrderStepUpSession';

/** @deprecated Use `isSameAppRoute` from `utils/appRoutes`. */
export const isSideMenuRouteActive = isSameAppRoute;

type Role = 'guest' | 'customer' | 'driver';
export type AppMenuRole = Role;

type LinkItem = { labelKey: string; icon: keyof typeof Ionicons.glyphMap; href: string };

const GUEST_LINKS: LinkItem[] = [
  { labelKey: 'sideMenu.welcome', icon: 'home-outline', href: '/' },
  { labelKey: 'sideMenu.customerSignIn', icon: 'person-outline', href: '/(auth)/customer-login' },
  { labelKey: 'sideMenu.driverSignIn', icon: 'car-outline', href: '/(auth)/driver-login' },
  { labelKey: 'sideMenu.termsAndPrivacy', icon: 'document-text-outline', href: '/(auth)/terms' },
];

const CUSTOMER_LINKS: LinkItem[] = [
  { labelKey: 'sideMenu.home', icon: 'home-outline', href: '/(customer)/home' },
  { labelKey: 'sideMenu.myOrders', icon: 'receipt-outline', href: '/(customer)/orders' },
  { labelKey: 'sideMenu.wallet', icon: 'wallet-outline', href: '/(customer)/wallet' },
  { labelKey: 'sideMenu.profile', icon: 'person-outline', href: '/(customer)/profile' },
  { labelKey: 'sideMenu.addresses', icon: 'location-outline', href: '/(customer)/addresses' },
  { labelKey: 'sideMenu.notifications', icon: 'notifications-outline', href: '/(customer)/notifications' },
  { labelKey: 'sideMenu.support', icon: 'headset-outline', href: '/(customer)/support' },
  { labelKey: 'sideMenu.settings', icon: 'settings-outline', href: '/(customer)/settings' },
];

/** Driver: Settings / documents / addresses / earnings / ratings / transactions live on Settings, Home, or Profile — keep menu lean. */
const DRIVER_LINKS: LinkItem[] = [
  { labelKey: 'sideMenu.home', icon: 'home-outline', href: '/(driver)/home' },
  { labelKey: 'sideMenu.myDeliveries', icon: 'list-outline', href: '/(driver)/my-orders' },
  { labelKey: 'sideMenu.availableOrders', icon: 'cube-outline', href: '/(driver)/available-orders' },
  { labelKey: 'sideMenu.profile', icon: 'person-outline', href: '/(driver)/profile' },
  { labelKey: 'sideMenu.notifications', icon: 'notifications-outline', href: '/(driver)/notifications' },
  { labelKey: 'sideMenu.support', icon: 'headset-outline', href: '/(driver)/support' },
];

export function AppSideMenu({
  visible,
  onClose,
  role,
  topOffset = 0,
  bottomOffset = 0,
}: {
  visible: boolean;
  onClose: () => void;
  role: Role;
  /** Measured AppChromeHeader height — sidebar starts directly beneath it. */
  topOffset?: number;
  /** Space reserved above the bottom tab bar / home indicator. */
  bottomOffset?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { push } = useAppNavigation();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [signOutVisible, setSignOutVisible] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  const links = role === 'guest' ? GUEST_LINKS : role === 'customer' ? CUSTOMER_LINKS : DRIVER_LINKS;

  const go = (href: string) => {
    if (isSameAppRoute(pathname, href)) {
      onClose();
      return;
    }
    onClose();
    setTimeout(() => push(href), 0);
  };

  const fallbackTop = insets.top + 60;
  const sidebarTop = topOffset > 0 ? topOffset : fallbackTop;
  const sidebarBottom = bottomOffset > 0 ? bottomOffset : insets.bottom;

  const signOutOverlayTint = isDark ? 'rgba(0,0,0,0.72)' : 'rgba(15,23,42,0.48)';

  const signOutBody =
    role === 'driver'
      ? t('sideMenu.signOutDriverBody')
      : t('sideMenu.signOutCustomerBody');

  const performSignOut = async () => {
    setSignOutBusy(true);
    try {
      await stopOrderTrackingSilently();
      await clearPushToken();
      await clearSession();
      if (role === 'customer') resetOrderConfirmIdentitySession();
    } catch (e) {
      console.error('Sign out cleanup failed:', e);
      try {
        await clearSession();
        if (role === 'customer') resetOrderConfirmIdentitySession();
      } catch {
        /* ignore */
      }
    } finally {
      setSignOutVisible(false);
      onClose();
      if (role === 'customer') router.replace('/(auth)/customer-login');
      else if (role === 'driver') router.replace('/(auth)/driver-login');
      else router.replace('/');
      setSignOutBusy(false);
    }
  };

  if (!visible && !signOutVisible) return null;

  return (
    <>
    {visible ? (
      <View style={styles.portal} pointerEvents="box-none">
        {sidebarTop > 0 ? <View style={{ height: sidebarTop }} pointerEvents="none" /> : null}
        <View style={[styles.overlay, { marginBottom: sidebarBottom }]}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            bounces
          >
            {links.map((item) => {
              const active = isSameAppRoute(pathname, item.href);
              return (
                <TouchableOpacity
                  key={item.href + item.labelKey}
                  style={[
                    styles.row,
                    {
                      backgroundColor: active ? (isDark ? 'rgba(14,165,233,0.18)' : colors.primaryLight) : colors.surfaceVariant,
                      borderWidth: active ? 1.5 : 0,
                      borderColor: active ? colors.primary : 'transparent',
                    },
                  ]}
                  onPress={() => go(item.href)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.rowIcon,
                      {
                        backgroundColor: active
                          ? (isDark ? 'rgba(14,165,233,0.35)' : '#bae6fd')
                          : isDark
                            ? colors.primaryLight
                            : colors.primaryLight,
                      },
                    ]}
                  >
                    <Ionicons name={item.icon} size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.text, fontWeight: active ? '800' : '600' }]}>
                    {t(item.labelKey)}
                  </Text>
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'chevron-forward'}
                    size={active ? 18 : 16}
                    color={active ? colors.primary : colors.textTertiary}
                  />
                </TouchableOpacity>
              );
            })}
            {role !== 'guest' && (
              <TouchableOpacity
                style={[styles.logoutRow, { borderColor: colors.border }]}
                onPress={() => setSignOutVisible(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                <Text style={[styles.logoutText, { color: colors.danger }]}>{t('sideMenu.signOut')}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          </View>
        </View>
      </View>
    ) : null}

    {role !== 'guest' && (
      <Modal
        visible={signOutVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !signOutBusy && setSignOutVisible(false)}
      >
        <View style={styles.signOutModalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: signOutOverlayTint }]}
            onPress={() => !signOutBusy && setSignOutVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={t('sideMenu.dismiss')}
          />
          <View style={styles.signOutModalAlign} pointerEvents="box-none">
            <View
              style={[styles.signOutDialog, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityViewIsModal
            >
              <Text style={[styles.signOutDialogTitle, { color: colors.text }]}>{t('sideMenu.signOut')}</Text>
              <Text style={[styles.signOutDialogBody, { color: colors.textSecondary }]}>{signOutBody}</Text>
              <View style={styles.signOutDialogActions}>
                <TouchableOpacity
                  style={[
                    styles.signOutBtnSecondary,
                    { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                  ]}
                  onPress={() => setSignOutVisible(false)}
                  disabled={signOutBusy}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.signOutBtnSecondaryText, { color: colors.text }]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.signOutBtnPrimary, { backgroundColor: colors.danger }]}
                  onPress={() => void performSignOut()}
                  disabled={signOutBusy}
                  activeOpacity={0.85}
                >
                  {signOutBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.signOutBtnPrimaryText}>{t('sideMenu.signOut')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  portal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  overlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    width: '78%',
    maxWidth: 320,
    marginRight: 0,
    marginLeft: 0,
    alignSelf: 'stretch',
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRightWidth: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 12, paddingHorizontal: 10, paddingBottom: 12, gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 0,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  logoutText: { fontSize: 14, fontWeight: '700' },

  signOutModalRoot: { flex: 1 },
  signOutModalAlign: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  signOutDialog: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  signOutDialogTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  signOutDialogBody: { fontSize: 15, lineHeight: 22, marginBottom: 22 },
  signOutDialogActions: { flexDirection: 'row', gap: 12 },
  signOutBtnSecondary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtnSecondaryText: { fontSize: 15, fontWeight: '600' },
  signOutBtnPrimary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  signOutBtnPrimaryText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
