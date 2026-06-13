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
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { api } from '../../services/api/client';

type NotificationPreferences = {
  notifyReferralCommission: boolean;
  notifyGameEvents: boolean;
};

export default function CustomerNotificationsSettingsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<NotificationPreferences>('/customers/me/notification-preferences');
      setPrefs(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('common.something_went_wrong');
      Alert.alert(t('common.error'), msg);
      setPrefs({ notifyReferralCommission: true, notifyGameEvents: false });
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      const msg = e instanceof Error ? e.message : t('notificationsSettings.saveFailed');
      Alert.alert(t('common.error'), msg);
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
        {t('notificationsSettings.masterBody')}
      </Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              {t('notificationsSettings.promotions')}
            </Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              {t('notificationsSettings.promotionsBody')}
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

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              {t('notificationsSettings.systemAlerts')}
            </Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              {t('notificationsSettings.systemAlertsBody')}
            </Text>
          </View>
          <Switch
            value={prefs?.notifyGameEvents ?? false}
            onValueChange={async (next) => {
              if (!prefs || saving) return;
              const prev = prefs.notifyGameEvents;
              setPrefs({ ...prefs, notifyGameEvents: next });
              setSaving(true);
              try {
                const data = await api.patch<NotificationPreferences>(
                  '/customers/me/notification-preferences',
                  { notifyGameEvents: next },
                );
                setPrefs(data);
              } catch (e: unknown) {
                setPrefs({ ...prefs, notifyGameEvents: prev });
                Alert.alert(t('common.error'), e instanceof Error ? e.message : t('notificationsSettings.saveFailed'));
              } finally {
                setSaving(false);
              }
            }}
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
