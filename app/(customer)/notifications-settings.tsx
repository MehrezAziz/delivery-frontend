import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { api } from '../../services/api/client';

type NotificationPreferences = {
  notifyReferralCommission: boolean;
};

export default function CustomerNotificationsSettingsScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<NotificationPreferences>('/customers/me/notification-preferences');
      setPrefs(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load notification settings';
      Alert.alert('Error', msg);
      setPrefs({ notifyReferralCommission: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const updateReferralNotify = async (next: boolean) => {
    if (!prefs || saving) return;
    const prev = prefs.notifyReferralCommission;
    setPrefs({ ...prefs, notifyReferralCommission: next });
    setSaving(true);
    try {
      const data = await api.patch<NotificationPreferences>('/customers/me/notification-preferences', {
        notifyReferralCommission: next,
      });
      setPrefs(data);
    } catch (e: unknown) {
      setPrefs({ ...prefs, notifyReferralCommission: prev });
      const msg = e instanceof Error ? e.message : 'Failed to update setting';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Choose which notifications you want to receive in the app and on your device.
      </Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              Receive notifications about referral commission
            </Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              When someone you referred completes an order and you earn commission coins.
            </Text>
          </View>
          <Switch
            value={prefs?.notifyReferralCommission ?? true}
            onValueChange={(v) => void updateReferralNotify(v)}
            disabled={saving}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  rowSub: { fontSize: 13, lineHeight: 18 },
});
