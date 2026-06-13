import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';
import { securityService, type SecurityTier } from '../../services/api/security.service';
import { SecurityTierPoles } from '../../components/settings/SecurityTierPoles';
import { GameEntrySection } from '../../components/games/GameEntrySection';
import { LanguagePicker } from '../../components/settings/LanguagePicker';

export default function DriverSettingsScreen() {
  const router = useRouter();
  const { push } = useAppNavigation();
  const { t } = useTranslation();
  const { colors, isDark, toggleTheme } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [securityTier, setSecurityTier] = useState<SecurityTier | null>(null);
  const [showIdCopied, setShowIdCopied] = useState(false);
  const idCopyHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (idCopyHideTimerRef.current) clearTimeout(idCopyHideTimerRef.current);
    };
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
      void loadSecurityTier();
    }, [loadSecurityTier]),
  );

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

  const goEditProfile = () =>
    router.push({
      pathname: '/(driver)/edit-profile',
      params: { returnTo: 'settings' },
    } as never);
  const goDocuments = () =>
    router.push({
      pathname: '/(driver)/documents',
      params: { returnTo: 'settings' },
    } as never);
  const goAddresses = () =>
    router.push({
      pathname: '/(driver)/addresses',
      params: { returnTo: 'settings' },
    } as never);
  const goRestrictions = () =>
    router.push({
      pathname: '/(driver)/restrictions',
      params: { returnTo: 'settings' },
    } as never);
  const goBankDetails = () =>
    router.push({
      pathname: '/(driver)/bank-details',
      params: { returnTo: 'settings' },
    } as never);
  const goSecurity = () =>
    router.push({
      pathname: '/(driver)/security',
      params: { returnTo: 'settings' },
    } as never);

  const actionItems: { key: string; label: string; onPress: () => void }[] = [
    { key: 'editProfile', label: t('driverSettings.editProfile'), onPress: goEditProfile },
    { key: 'notificationSettings', label: t('driverSettings.notificationSettings'), onPress: () => push('/(driver)/notifications-settings') },
    { key: 'security', label: t('driverSettings.security'), onPress: goSecurity },
    { key: 'myDocuments', label: t('driverSettings.myDocuments'), onPress: goDocuments },
    { key: 'myAddresses', label: t('driverSettings.myAddresses'), onPress: goAddresses },
    { key: 'restrictions', label: t('driverSettings.restrictions'), onPress: goRestrictions },
    { key: 'payoutBankDetails', label: t('driverSettings.payoutBankDetails'), onPress: goBankDetails },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
    >
      <GameEntrySection placement="DRIVER_SETTINGS" role="driver" />
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
          <Text style={[styles.linkLabel, { color: colors.text }]}>{t('driverSettings.appearance')}</Text>
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

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('driverSettings.account')}</Text>
      <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.idRow, { borderBottomColor: colors.border }]}
          onPress={() => void copyUserId()}
          activeOpacity={userId ? 0.65 : 1}
          disabled={!userId}
          accessibilityRole="button"
          accessibilityLabel={t('common.copyId')}
        >
          <Text style={[styles.linkLabel, { color: colors.text }]}>{t('driverSettings.idLabel')}</Text>
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
});
