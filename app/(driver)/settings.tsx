import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../contexts/ThemeContext';

export default function DriverSettingsScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);

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

  const actionItems: { label: string; onPress: () => void }[] = [
    { label: 'Edit profile', onPress: goEditProfile },
    { label: 'My documents', onPress: goDocuments },
    { label: 'My addresses', onPress: goAddresses },
    { label: 'Restrictions', onPress: goRestrictions },
    { label: 'Payout bank details', onPress: goBankDetails },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {actionItems.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.linkRow, { borderBottomColor: colors.border }]}
            onPress={item.onPress}
            activeOpacity={0.7}
          >
            <Text style={[styles.linkLabel, { color: colors.text }]}>{item.label}</Text>
            <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
          </TouchableOpacity>
        ))}
        <View style={[styles.linkRow, styles.linkRowLast, { borderBottomColor: colors.border }]}>
          <Text style={[styles.linkLabel, { color: colors.text }]}>Appearance</Text>
          <TouchableOpacity
            onPress={toggleTheme}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 10, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <Text style={[styles.linkRight, { color: colors.textSecondary }]}>{isDark ? 'Dark' : 'Light'}</Text>
          </TouchableOpacity>
        </View>
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
});
