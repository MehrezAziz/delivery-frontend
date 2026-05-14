import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { clearPushToken } from '../../services/api/notification.service';
import { stopOrderTrackingSilently } from '../../services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';
import { persistDriverIdentityFromMe } from '../../utils/persistDriverIdentity';
import { consumeDriverProfileNeedsRefresh } from '../../utils/profileRefreshSignals';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function DriverProfileScreen() {
  const router = useRouter();
  const { push } = useAppNavigation();
  const { colors, isDark } = useTheme();
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signOutModalVisible, setSignOutModalVisible] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  type LoadKind = 'initial' | 'silent' | 'pull';

  const loadProfile = async (kind: LoadKind = 'initial') => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        if (kind === 'initial') router.replace('/(auth)/driver-login');
        return;
      }
      if (kind === 'initial') setLoading(true);
      if (kind === 'pull') setRefreshing(true);
      const res = await axios.get(`${API_URL}/drivers/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDriver(res.data);
      await persistDriverIdentityFromMe(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      if (kind === 'initial') setLoading(false);
      if (kind === 'pull') setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadProfile('initial');
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (consumeDriverProfileNeedsRefresh()) void loadProfile('silent');
    }, []),
  );

  const handleChangePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].base64
      ? `data:image/jpeg;base64,${result.assets[0].base64}`
      : result.assets[0].uri;
    try {
      const token = await AsyncStorage.getItem('accessToken');
      await axios.patch(`${API_URL}/auth/user/complete-profile`, { image: uri }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      void loadProfile('silent');
    } catch {
      Alert.alert('Error', 'Failed to update photo');
    }
  };

  const handleRemovePhoto = () => {
    Alert.alert('Remove Photo', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('accessToken');
            await axios.patch(`${API_URL}/auth/user/complete-profile`, { image: null }, {
              headers: { Authorization: `Bearer ${token}` },
            });
            void loadProfile('silent');
          } catch {
            Alert.alert('Error', 'Failed to remove photo');
          }
        },
      },
    ]);
  };

  const openPhotoOptions = () => {
    if (driver?.user?.image) {
      Alert.alert('Profile photo', 'What would you like to do?', [
        { text: 'Change photo', onPress: handleChangePhoto },
        { text: 'Remove photo', onPress: handleRemovePhoto, style: 'destructive' },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      handleChangePhoto();
    }
  };

  const performSignOut = async () => {
    setSignOutBusy(true);
    try {
      await stopOrderTrackingSilently();
      await clearPushToken();
      await AsyncStorage.clear();
      setSignOutModalVisible(false);
      router.replace('/(auth)/driver-login');
    } catch (err) {
      console.error('Error during logout:', err);
    } finally {
      setSignOutBusy(false);
    }
  };

  const handleLogout = () => setSignOutModalVisible(true);

  const signOutOverlayTint = isDark ? 'rgba(0,0,0,0.72)' : 'rgba(15,23,42,0.48)';

  const renderSignOutModal = () => (
    <Modal
      visible={signOutModalVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => !signOutBusy && setSignOutModalVisible(false)}
    >
      <View style={styles.signOutModalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: signOutOverlayTint }]}
          onPress={() => !signOutBusy && setSignOutModalVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.signOutModalAlign} pointerEvents="box-none">
          <View
            style={[styles.signOutDialog, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityViewIsModal
          >
            <Text style={[styles.signOutDialogTitle, { color: colors.text }]}>Sign out</Text>
            <Text style={[styles.signOutDialogBody, { color: colors.textSecondary }]}>
              You will be signed out on this device. Sign in again to accept deliveries and manage your account.
            </Text>
            <View style={styles.signOutDialogActions}>
              <TouchableOpacity
                style={[styles.signOutBtnSecondary, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                onPress={() => setSignOutModalVisible(false)}
                disabled={signOutBusy}
                activeOpacity={0.8}
              >
                <Text style={[styles.signOutBtnSecondaryText, { color: colors.text }]}>Cancel</Text>
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
                  <Text style={styles.signOutBtnPrimaryText}>Sign out</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        {renderSignOutModal()}
      </View>
    );
  }

  const firstName = driver?.user?.firstName || '';
  const secondName = driver?.user?.secondName || '';
  const initials = (firstName.charAt(0) + secondName.charAt(0)).toUpperCase() || 'D';
  const statusColor = driver?.status === 'VERIFIED'
    ? '#16a34a'
    : driver?.status === 'PENDING_REVIEW'
      ? '#ca8a04'
      : driver?.status === 'SUSPENDED'
        ? '#dc2626'
        : driver?.status === 'PAUSED'
          ? '#ea580c'
          : '#6b7280';
  const statusLabel =
    driver?.status === 'VERIFIED'
      ? 'Verified'
      : driver?.status === 'PENDING_REVIEW'
        ? 'Pending Review'
        : driver?.status === 'INCOMPLETE'
          ? 'Incomplete'
          : driver?.status === 'SUSPENDED'
            ? 'Suspended'
            : driver?.status === 'PAUSED'
              ? 'Paused'
              : driver?.status || 'Unknown';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderSignOutModal()}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadProfile('pull')}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          <View style={styles.avatarWrap}>
            {driver?.user?.image ? (
              <Image source={{ uri: driver.user.image }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={[styles.statusDot, { backgroundColor: statusColor, borderColor: colors.card }]} />
          </View>
          <TouchableOpacity onPress={openPhotoOptions} activeOpacity={0.7} style={styles.photoLinkTouch}>
            <Text style={[styles.photoLinkText, { color: colors.primary }]}>
              {driver?.user?.image ? 'Change or remove photo' : 'Add profile photo'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.name, { color: colors.text }]}>
            {firstName} {secondName}
          </Text>
          <Text style={[styles.phone, { color: colors.textSecondary }]}>{driver?.user?.phone || ''}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <View style={[styles.statusDotSmall, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          <View style={styles.infoSection}>
            {driver?.account && (
              <View style={[styles.infoBlock, { backgroundColor: colors.surfaceVariant }]}>
                <View style={styles.infoRowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Account balance</Text>
                    <Text
                      style={[
                        styles.infoValue,
                        { color: driver.account.balance < 0 ? colors.danger : '#16a34a' },
                      ]}
                    >
                      {driver.account.balance.toFixed(2)} {driver.account.currency}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Deliveries</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{driver.account.completedDeliveries}</Text>
                  </View>
                </View>
              </View>
            )}
            <View
              style={[
                styles.comingSoonBox,
                { borderColor: colors.border, backgroundColor: colors.surfaceVariant },
              ]}
            >
              <Text style={[styles.comingSoonTitle, { color: colors.text }]}>Buy coins</Text>
              <Text style={[styles.comingSoonBody, { color: colors.textSecondary }]}>
                Top up your driver balance. <Text style={{ fontWeight: '700', color: colors.text }}>Coming soon.</Text>
              </Text>
            </View>

            {driver?.account?.balance < 0 && driver?.account?.daysRemainingToPay !== undefined && (
              <View
                style={[
                  styles.warningBanner,
                  {
                    backgroundColor: driver.account.daysRemainingToPay <= 0 ? colors.dangerBg : '#fff7ed',
                    borderColor: driver.account.daysRemainingToPay <= 0 ? colors.danger : '#fed7aa',
                  },
                ]}
              >
                {driver.account.daysRemainingToPay <= 0 ? (
                  <>
                    <Text style={[styles.warningTitle, { color: colors.danger }]}>Account paused</Text>
                    <Text style={[styles.warningBody, { color: colors.textSecondary }]}>
                      Your account has been paused due to unpaid fees. Please pay your balance to resume.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.warningTitle, { color: '#ea580c' }]}>
                      {driver.account.daysRemainingToPay} day{driver.account.daysRemainingToPay !== 1 ? 's' : ''}{' '}
                      remaining
                    </Text>
                    <Text style={[styles.warningBody, { color: colors.textSecondary }]}>
                      Pay your fees ({Math.abs(driver.account.balance).toFixed(2)} {driver.account.currency}) or your
                      account will be paused.
                    </Text>
                  </>
                )}
              </View>
            )}
            {driver?.vehicleType && (
              <View style={[styles.infoBlock, { backgroundColor: colors.surfaceVariant }]}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Vehicle</Text>
                <Text style={[styles.infoValue, { color: colors.text, marginTop: 4 }]}>{driver.vehicleType}</Text>
              </View>
            )}
            {driver?.description && (
              <View style={[styles.infoBlock, { backgroundColor: colors.surfaceVariant }]}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Description</Text>
                <Text style={[styles.infoValue, { color: colors.text, marginTop: 4 }]}>{driver.description}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.menuContainer}>
          <Text style={[styles.actionsSectionTitle, { color: colors.textSecondary }]}>Quick actions</Text>
          {(
            [
              {
                icon: 'cash-outline' as const,
                title: 'Earnings',
                subtitle: 'View payouts and delivery income',
                route: '/(driver)/earnings',
                tintLight: '#fef9c3',
                tintDark: '#422006',
                accent: '#ca8a04',
              },
              {
                icon: 'swap-horizontal-outline' as const,
                title: 'Send coins',
                subtitle: 'P2P transfers to other users',
                route: '/(driver)/send-coins',
                tintLight: '#ccfbf1',
                tintDark: '#134e4a',
                accent: '#0d9488',
              },
              {
                icon: 'receipt-outline' as const,
                title: 'Transaction history',
                subtitle: 'Payments, fees, and top-ups',
                route: '/(driver)/transactions',
                tintLight: '#e0f2fe',
                tintDark: '#0c4a6e',
                accent: '#0284c7',
              },
              {
                icon: 'star-outline' as const,
                title: 'My ratings',
                subtitle: 'Feedback from customers',
                route: '/(driver)/my-ratings',
                tintLight: '#ffedd5',
                tintDark: '#431407',
                accent: '#ea580c',
              },
              {
                icon: 'headset-outline' as const,
                title: 'Help & support',
                subtitle: 'Get help or contact the team',
                route: '/(driver)/support',
                tintLight: '#dcfce7',
                tintDark: '#052e16',
                accent: '#16a34a',
              },
            ] as const
          ).map((item) => (
            <TouchableOpacity
              key={item.route}
              style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => push(item.route)}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.actionIconWrap,
                  { backgroundColor: isDark ? item.tintDark : item.tintLight },
                ]}
              >
                <Ionicons name={item.icon} size={22} color={item.accent} />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.signOutCompact, { borderColor: colors.border, marginTop: 24 }]}
            onPress={handleLogout}
            activeOpacity={0.75}
          >
            <Text style={[styles.signOutCompactText, { color: colors.danger }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 40 },

  profileCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarWrap: { position: 'relative', marginBottom: 8 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
  },
  photoLinkTouch: { marginBottom: 12 },
  photoLinkText: { fontSize: 14, fontWeight: '600' },
  name: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  phone: { fontSize: 14, marginBottom: 12 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDotSmall: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },

  infoSection: { width: '100%', marginTop: 18, gap: 12 },
  infoBlock: { borderRadius: 12, padding: 12 },
  infoRowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  infoLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: '600' },
  comingSoonBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 0,
  },
  comingSoonTitle: { fontSize: 12, fontWeight: '700' },
  comingSoonBody: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  warningBanner: { borderRadius: 12, padding: 14, borderWidth: 1 },
  warningTitle: { fontSize: 14, fontWeight: '700' },
  warningBody: { fontSize: 12, marginTop: 6, lineHeight: 18 },

  menuContainer: {
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 8,
  },
  actionsSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextCol: { flex: 1, minWidth: 0 },
  actionTitle: { fontSize: 16, fontWeight: '700' },
  actionSubtitle: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  signOutCompact: {
    alignSelf: 'center',
    minWidth: 160,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutCompactText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },

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
