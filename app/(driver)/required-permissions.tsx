import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getDriverOperationalPermissionStatus,
  allDriverOperationalPermissionsGranted,
  type DriverOperationalPermissionStatus,
} from '../../utils/driverOperationalPermissions';
import {
  openDriverPermissionSystemScreen,
  openAndroidBatteryOptimizationForApp,
  type DriverPermissionScreenTarget,
} from '../../utils/openDriverPermissionSystemScreen';

const REQUIRED_ITEMS: {
  key: keyof DriverOperationalPermissionStatus;
  target: DriverPermissionScreenTarget;
  title: string;
  androidSteps: string;
  iosSteps: string;
}[] = [
  {
    key: 'notificationsOk',
    target: 'notifications',
    title: 'Push notifications',
    androidSteps:
      'The button below opens this app’s notification screen directly. Turn on all categories, especially order alerts and delivery updates.',
    iosSteps:
      'Settings → {{APP}} → Notifications → turn Allow Notifications on. Enable Sounds and Banners if you want alerts while driving.',
  },
  {
    key: 'foregroundLocationOk',
    target: 'foregroundLocation',
    title: 'Location while using the app',
    androidSteps:
      'The button below opens this app’s system page. Tap Permissions → Location → Allow only while using the app (or Ask every time). Turn Precise location on if you see it.',
    iosSteps:
      'Settings → Privacy & Security → Location Services (master switch on) → {{APP}} → While Using the App, and turn Precise Location on.',
  },
  {
    key: 'backgroundLocationOk',
    target: 'backgroundLocation',
    title: 'Location all the time (background)',
    androidSteps:
      'Tap the card below: Android should show a system dialog — choose **Allow all the time** (arrière-plan / background). That is different from “While using the app”. If no dialog appears, we open App info → Permissions → Location so you can pick “Allow all the time” manually. For reliable tracking when the screen is off, also use **Open battery settings** and allow unrestricted / no restrictions for this app.',
    iosSteps:
      'Location Services → {{APP}} → Always (background). This also helps ongoing delivery notifications stay reliable when the app is not on screen.',
  },
];

export default function DriverRequiredPermissionsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = params.returnTo ? decodeURIComponent(params.returnTo) : '/(driver)/available-orders';

  const [status, setStatus] = useState<DriverOperationalPermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getDriverOperationalPermissionStatus();
      setStatus(s);
    } catch {
      setStatus({
        notificationsOk: false,
        foregroundLocationOk: false,
        backgroundLocationOk: false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const openSettings = () => {
    void Linking.openSettings();
  };

  const requestNotifications = async () => {
    await Notifications.requestPermissionsAsync();
    void refresh();
  };

  const allOk = status ? allDriverOperationalPermissionsGranted(status) : false;
  const appLabel = Constants.expoConfig?.name ?? 'this app';

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="shield-checkmark-outline" size={40} color={colors.primary} />
        <Text style={[styles.heroTitle, { color: colors.text }]}>Permissions required</Text>
        <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
          To accept orders, {appLabel} needs the permissions below — including background (arrière-plan) location and battery where needed — so persistent delivery notifications work correctly. Tap a card to jump to the right system screen, then use Check again.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        onPress={openSettings}
        activeOpacity={0.85}
      >
        <Ionicons name="open-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.primaryBtnText}>Open app settings</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={requestNotifications}
        activeOpacity={0.85}
      >
        <Ionicons name="notifications-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Ask for notification permission</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={() => void refresh()}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Ionicons name="refresh" size={20} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Check again</Text>
          </>
        )}
      </TouchableOpacity>

      {REQUIRED_ITEMS.map((item) => {
        const ok = status ? status[item.key] : false;
        const raw = Platform.OS === 'ios' ? item.iosSteps : item.androidSteps;
        const steps = raw.replace(/\{\{APP\}\}/g, appLabel);
        return (
          <View
            key={item.key}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
              ok && { borderColor: '#22c55e', borderWidth: 1.5 },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. Tap to open system settings for this permission.`}
              onPress={() => void openDriverPermissionSystemScreen(item.target)}
            >
              <View style={styles.cardHeader}>
                <Ionicons
                  name={ok ? 'checkmark-circle' : 'alert-circle'}
                  size={26}
                  color={ok ? '#16a34a' : '#ea580c'}
                />
                <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                <Ionicons name="chevron-forward" size={22} color={colors.textTertiary} />
              </View>
              <View style={[styles.statusPill, { backgroundColor: ok ? '#dcfce7' : isDark ? 'rgba(234,88,12,0.2)' : '#ffedd5' }]}>
                <Text style={{ color: ok ? '#166534' : '#c2410c', fontWeight: '800', fontSize: 13 }}>
                  {ok ? 'Granted' : 'Not granted — action needed'}
                </Text>
              </View>
              <Text style={[styles.steps, { color: colors.textSecondary }]}>{steps}</Text>
              <View style={[styles.cardTapRow, { borderTopColor: colors.border }]}>
                <Ionicons name="open-outline" size={18} color={colors.primary} />
                <Text style={[styles.cardTapText, { color: colors.primary }]}>
                  {Platform.OS === 'ios'
                    ? 'Tap to request permission, then Settings if needed'
                    : item.target === 'notifications'
                      ? 'Tap to open notification settings'
                      : item.target === 'foregroundLocation'
                        ? 'Tap to allow location while using the app (or App info if denied)'
                        : 'Tap for Android “Allow all the time” prompt, or App info if needed'}
                </Text>
              </View>
            </TouchableOpacity>
            {Platform.OS === 'android' && item.key === 'backgroundLocationOk' && (
              <TouchableOpacity
                style={[styles.batteryLink, { borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={() => void openAndroidBatteryOptimizationForApp()}
                activeOpacity={0.8}
              >
                <Ionicons name="battery-charging-outline" size={18} color={colors.primary} />
                <Text style={[styles.batteryLinkText, { color: colors.primary }]}>
                  Open battery / unrestricted settings (recommended)
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {allOk && (
        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: '#16a34a' }]}
          onPress={() => router.replace(returnTo as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>Continue to orders</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
        <Text style={[styles.backLinkText, { color: colors.textTertiary }]}>Go back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  hero: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  heroTitle: { fontSize: 22, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  heroSub: { fontSize: 14, lineHeight: 21, marginTop: 10, textAlign: 'center', fontWeight: '500' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardTitle: { fontSize: 17, fontWeight: '800', flex: 1, flexShrink: 1 },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginBottom: 12 },
  steps: { fontSize: 14, lineHeight: 22, fontWeight: '500' },
  cardTapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardTapText: { flex: 1, fontSize: 13, fontWeight: '800' },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  backLink: { alignItems: 'center', paddingVertical: 12 },
  backLinkText: { fontSize: 15, fontWeight: '600' },
  batteryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  batteryLinkText: { flex: 1, fontSize: 13, fontWeight: '700' },
});
