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
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { securityService, type SecurityTier } from '../../services/api/security.service';
import { SecurityTierPoles } from '../../components/settings/SecurityTierPoles';
import { GameEntrySection } from '../../components/games/GameEntrySection';
import { LanguagePicker } from '../../components/settings/LanguagePicker';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function CustomerSettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, isDark, toggleTheme } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<any | null>(null);
  const [referralStats, setReferralStats] = useState<any | null>(null);
  const [loadingReferral, setLoadingReferral] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [securityTier, setSecurityTier] = useState<SecurityTier | null>(null);
  const [showIdCopied, setShowIdCopied] = useState(false);
  const idCopyHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (idCopyHideTimerRef.current) clearTimeout(idCopyHideTimerRef.current);
    };
  }, []);

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

  const loadSecurityTier = useCallback(async () => {
    try {
      const s = await securityService.getSummary();
      setSecurityTier(s.securityTier);
    } catch {
      setSecurityTier(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoadingReferral(true);
      void loadReferralData();
      void loadSecurityTier();
    }, [loadReferralData, loadSecurityTier]),
  );

  const handleShareReferralCode = async () => {
    if (!referralCode) return;
    try {
      const discountText =
        referralCode.type === 'PERCENTAGE'
          ? t('customerSettings.discountPct', { value: referralCode.value })
          : t('customerSettings.discountTnd', { value: referralCode.value });
      await Share.share({
        message: t('customerSettings.shareMessage', {
          code: referralCode.code,
          discount: discountText,
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyReferralCode = async () => {
    if (!referralCode) return;
    try {
      await Clipboard.setStringAsync(referralCode.code);
      Alert.alert(t('common.copied'), t('customerSettings.referralCopied'));
    } catch {
      Alert.alert(t('common.error'), t('customerSettings.failedToCopyReferral'));
    }
  };

  const copyUserId = async () => {
    if (!userId) return;
    try {
      await Clipboard.setStringAsync(userId);
      if (idCopyHideTimerRef.current) clearTimeout(idCopyHideTimerRef.current);
      setShowIdCopied(true);
      idCopyHideTimerRef.current = setTimeout(() => {
        setShowIdCopied(false);
        idCopyHideTimerRef.current = null;
      }, 3000);
    } catch {
      Alert.alert(t('common.error'), t('common.failedToCopyId'));
    }
  };

  /** Route params + query (below) so the header can return here — tab siblings have no stack to pop. */
  const goEditProfile = () =>
    router.push({
      pathname: '/(customer)/edit-profile',
      params: { returnTo: 'settings' },
    } as never);
  const goAddresses = () =>
    router.push({
      pathname: '/(customer)/addresses',
      params: { returnTo: 'settings' },
    } as never);
  const goRestrictions = () =>
    router.push({
      pathname: '/(customer)/restrictions',
      params: { returnTo: 'settings' },
    } as never);
  const goBankDetails = () =>
    router.push({
      pathname: '/(customer)/bank-details',
      params: { returnTo: 'settings' },
    } as never);
  const goSecurity = () =>
    router.push({
      pathname: '/(customer)/security',
      params: { returnTo: 'settings' },
    } as never);
  const goNotifications = () =>
    router.push({
      pathname: '/(customer)/notifications-settings',
      params: { returnTo: 'settings' },
    } as never);

  const actionItems: { key: string; label: string; onPress: () => void }[] = [
    { key: 'editProfile', label: t('customerSettings.editProfile'), onPress: goEditProfile },
    { key: 'notifications', label: t('customerSettings.notifications'), onPress: goNotifications },
    { key: 'security', label: t('customerSettings.security'), onPress: goSecurity },
    { key: 'addAddress', label: t('customerSettings.addAddress'), onPress: () => router.push('/(auth)/customer-setup') },
    { key: 'myAddresses', label: t('customerSettings.myAddresses'), onPress: goAddresses },
    { key: 'myRestrictions', label: t('customerSettings.myRestrictions'), onPress: goRestrictions },
    { key: 'payoutBankDetails', label: t('customerSettings.payoutBankDetails'), onPress: goBankDetails },
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
            void loadSecurityTier();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <GameEntrySection placement="CUSTOMER_SETTINGS" role="customer" />
      <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {actionItems.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.linkRow, { borderBottomColor: colors.border }]}
            onPress={item.onPress}
            activeOpacity={0.7}
          >
            <Text style={[styles.linkLabel, { color: colors.text }]}>{item.label}</Text>
            <View style={styles.linkRowRight}>
              {item.key === 'security' && securityTier != null ? (
                <SecurityTierPoles tier={securityTier} colors={colors} compact />
              ) : null}
              <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
            </View>
          </TouchableOpacity>
        ))}
        <LanguagePicker />
        <View style={[styles.linkRow, styles.linkRowLast, { borderBottomColor: colors.border }]}>
          <Text style={[styles.linkLabel, { color: colors.text }]}>{t('customerSettings.appearance')}</Text>
          <TouchableOpacity
            onPress={toggleTheme}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 10, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={isDark ? t('customerSettings.switchToLight') : t('customerSettings.switchToDark')}
          >
            <Text style={[styles.linkRight, { color: colors.textSecondary }]}>
              {isDark ? t('customerSettings.appearanceDark') : t('customerSettings.appearanceLight')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('customerSettings.referral')}</Text>
      <View style={[styles.referralWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {loadingReferral ? (
          <View style={styles.referralLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : referralCode && referralStats ? (
          <>
            <Text style={[styles.referralHeading, { color: colors.text }]}>{t('customerSettings.myReferralCode')}</Text>
            <Text style={[styles.referralHint, { color: colors.textSecondary }]}>
              {t('customerSettings.referralShareHint')}
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
                      ? t('customerSettings.pctOff', { value: referralCode.value })
                      : t('customerSettings.tndOff', { value: referralCode.value })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.copyBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCopyReferralCode}
                  activeOpacity={0.75}
                >
                  <Text style={styles.copyBtnLabel}>{t('common.copy')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: colors.primary }]}
              onPress={handleShareReferralCode}
              activeOpacity={0.8}
            >
              <Text style={styles.shareBtnText}>{t('customerSettings.shareCode')}</Text>
            </TouchableOpacity>

            <View style={[styles.statsRow, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.statCell}>
                <Text style={[styles.statVal, { color: colors.text }]}>{referralStats.totalReferrals}</Text>
                <Text style={[styles.statLab, { color: colors.textSecondary }]}>{t('customerSettings.referrals')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statCell}>
                <Text style={[styles.statVal, { color: colors.text }]}>
                  {referralStats.totalCommission.toFixed(2)} {t('common.tnd')}
                </Text>
                <Text style={[styles.statLab, { color: colors.textSecondary }]}>{t('customerSettings.totalEarned')}</Text>
              </View>
            </View>

            <View style={styles.commissionBlock}>
              <View style={styles.commissionLine}>
                <Text style={[styles.commissionLab, { color: colors.textSecondary }]}>{t('customerSettings.pending')}</Text>
                <Text style={[styles.commissionVal, { color: colors.warning }]}>
                  {referralStats.pendingCommission.toFixed(2)} {t('common.tnd')}
                </Text>
              </View>
              <View style={styles.commissionLine}>
                <Text style={[styles.commissionLab, { color: colors.textSecondary }]}>{t('customerSettings.paid')}</Text>
                <Text style={[styles.commissionVal, { color: colors.success }]}>
                  {referralStats.paidCommission.toFixed(2)} {t('common.tnd')}
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
              <Text style={[styles.refreshBtnText, { color: colors.primary }]}>{t('common.refreshStatistics')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={[styles.referralEmpty, { color: colors.textSecondary }]}>
            {t('customerSettings.referralUnavailable')}
          </Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('customerSettings.account')}</Text>
      <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.idRow, { borderBottomColor: colors.border }]}
          onPress={() => void copyUserId()}
          activeOpacity={userId ? 0.65 : 1}
          disabled={!userId}
          accessibilityRole="button"
          accessibilityLabel={t('common.copyId')}
        >
          <Text style={[styles.linkLabel, { color: colors.text }]}>{t('customerSettings.idLabel')}</Text>
          <View style={styles.idRowRight}>
            <Text style={[styles.idValue, { color: colors.textSecondary }]} numberOfLines={1} selectable>
              {userId ?? '—'}
            </Text>
            {userId ? <Ionicons name="copy-outline" size={20} color={colors.primary} /> : null}
          </View>
        </TouchableOpacity>
        {showIdCopied ? (
          <Text style={[styles.idCopiedHint, { color: colors.success }]}>{t('common.idCopied')}</Text>
        ) : null}
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
  linkRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  idRowRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 },
  idValue: { fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  idCopiedHint: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 0,
  },
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
