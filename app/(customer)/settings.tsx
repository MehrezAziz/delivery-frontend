import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Share,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../contexts/ThemeContext';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function CustomerSettingsScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<any | null>(null);
  const [referralStats, setReferralStats] = useState<any | null>(null);
  const [loadingReferral, setLoadingReferral] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReferralData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) return;

      const [codeResponse, statsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/referral/my-code`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/referral/statistics`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        }),
      ]);

      if (codeResponse.ok) {
        const codeData = await codeResponse.json();
        setReferralCode(codeData);
      } else {
        setReferralCode(null);
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setReferralStats(statsData);
      } else {
        setReferralStats(null);
      }
    } catch {
      setReferralCode(null);
      setReferralStats(null);
    } finally {
      setLoadingReferral(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem('user');
        if (raw) {
          const u = JSON.parse(raw) as { id?: string };
          if (u?.id) setUserId(u.id);
        }
      } catch {
        setUserId(null);
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoadingReferral(true);
      void loadReferralData();
    }, [loadReferralData]),
  );

  const handleShareReferralCode = async () => {
    if (!referralCode) return;
    try {
      const discountText =
        referralCode.type === 'PERCENTAGE'
          ? `${referralCode.value}% discount`
          : `${referralCode.value} TND discount`;
      await Share.share({
        message: `Join Fast Delivery using my referral code: ${referralCode.code} and get ${discountText} on your first order!`,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyReferralCode = async () => {
    if (!referralCode) return;
    try {
      await Clipboard.setStringAsync(referralCode.code);
      Alert.alert('Copied', 'Referral code copied to clipboard');
    } catch {
      Alert.alert('Error', 'Failed to copy referral code');
    }
  };

  const actionItems: { label: string; onPress: () => void; right?: string }[] = [
    { label: 'Edit profile', onPress: () => router.push('/(customer)/edit-profile') },
    { label: 'Add address', onPress: () => router.push('/(auth)/customer-setup') },
    { label: 'My addresses', onPress: () => router.push('/(customer)/addresses') },
    { label: 'My restrictions', onPress: () => router.push('/(customer)/restrictions') },
    { label: 'Appearance', onPress: toggleTheme, right: isDark ? 'Dark' : 'Light' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadReferralData();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {actionItems.map((item, i) => (
          <TouchableOpacity
            key={item.label}
            style={[
              styles.linkRow,
              { borderBottomColor: colors.border },
              i === actionItems.length - 1 && styles.linkRowLast,
            ]}
            onPress={item.onPress}
            activeOpacity={0.7}
          >
            <Text style={[styles.linkLabel, { color: colors.text }]}>{item.label}</Text>
            {item.right != null ? (
              <Text style={[styles.linkRight, { color: colors.textSecondary }]}>{item.right}</Text>
            ) : (
              <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Referral</Text>
      <View style={[styles.referralWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {loadingReferral ? (
          <View style={styles.referralLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : referralCode && referralStats ? (
          <>
            <Text style={[styles.referralHeading, { color: colors.text }]}>My referral code</Text>
            <Text style={[styles.referralHint, { color: colors.textSecondary }]}>
              Share your code; friends get a discount on their first order.
            </Text>

            <View
              style={[
                styles.codeBox,
                {
                  borderColor: colors.primary,
                  backgroundColor: isDark ? 'rgba(56,189,248,0.1)' : colors.surfaceVariant,
                },
              ]}
            >
              <View style={styles.codeRow}>
                <View style={styles.codeTextCol}>
                  <Text style={[styles.codeText, { color: colors.primary }]}>{referralCode.code}</Text>
                  <Text style={[styles.codeBenefit, { color: colors.textSecondary }]}>
                    {referralCode.type === 'PERCENTAGE'
                      ? `${referralCode.value}% off first order`
                      : `${referralCode.value} TND off first order`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.copyBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCopyReferralCode}
                  activeOpacity={0.75}
                >
                  <Text style={styles.copyBtnLabel}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: colors.primary }]}
              onPress={handleShareReferralCode}
              activeOpacity={0.8}
            >
              <Text style={styles.shareBtnText}>Share code</Text>
            </TouchableOpacity>

            <View style={[styles.statsRow, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.statCell}>
                <Text style={[styles.statVal, { color: colors.text }]}>{referralStats.totalReferrals}</Text>
                <Text style={[styles.statLab, { color: colors.textSecondary }]}>Referrals</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statCell}>
                <Text style={[styles.statVal, { color: colors.text }]}>
                  {referralStats.totalCommission.toFixed(2)} TND
                </Text>
                <Text style={[styles.statLab, { color: colors.textSecondary }]}>Total earned</Text>
              </View>
            </View>

            <View style={styles.commissionBlock}>
              <View style={styles.commissionLine}>
                <Text style={[styles.commissionLab, { color: colors.textSecondary }]}>Pending</Text>
                <Text style={[styles.commissionVal, { color: colors.warning }]}>
                  {referralStats.pendingCommission.toFixed(2)} TND
                </Text>
              </View>
              <View style={styles.commissionLine}>
                <Text style={[styles.commissionLab, { color: colors.textSecondary }]}>Paid</Text>
                <Text style={[styles.commissionVal, { color: colors.success }]}>
                  {referralStats.paidCommission.toFixed(2)} TND
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.refreshBtn, { borderColor: colors.border }]}
              onPress={() => {
                setLoadingReferral(true);
                void loadReferralData();
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.refreshBtnText, { color: colors.primary }]}>Refresh statistics</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={[styles.referralEmpty, { color: colors.textSecondary }]}>
            Referral information is not available right now.
          </Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Account</Text>
      <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.idRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.linkLabel, { color: colors.text }]}>User ID</Text>
          <Text style={[styles.idValue, { color: colors.textSecondary }]} selectable>
            {userId ?? '—'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 8,
    marginLeft: 4,
  },
  group: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkRowLast: { borderBottomWidth: 0 },
  linkLabel: { fontSize: 16, fontWeight: '600' },
  linkRight: { fontSize: 15, fontWeight: '600' },
  chevron: { fontSize: 22, fontWeight: '300' },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 0,
  },
  idValue: { fontSize: 12, fontWeight: '600', maxWidth: '62%', textAlign: 'right' },
  referralWrap: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  referralLoading: { paddingVertical: 28, alignItems: 'center' },
  referralEmpty: { fontSize: 14, lineHeight: 20, paddingVertical: 8 },
  referralHeading: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  referralHint: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  codeBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  codeTextCol: { flex: 1 },
  codeText: { fontSize: 22, fontWeight: '800', letterSpacing: 2 },
  codeBenefit: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  copyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  copyBtnLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  shareBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  statVal: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  statLab: { fontSize: 12, fontWeight: '600' },
  commissionBlock: { gap: 10, marginBottom: 14 },
  commissionLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commissionLab: { fontSize: 14, fontWeight: '500' },
  commissionVal: { fontSize: 14, fontWeight: '700' },
  refreshBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  refreshBtnText: { fontSize: 14, fontWeight: '700' },
});
