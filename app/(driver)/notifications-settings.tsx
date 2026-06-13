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
  notifyGameEvents: boolean;
};

export default function DriverNotificationsSettingsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<NotificationPreferences>('/drivers/me/notification-preferences');
      setPrefs(data);
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.error'));
      setPrefs({ notifyGameEvents: false });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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
            <Text style={[styles.rowTitle, { color: colors.text }]}>{t('notificationsSettings.masterTitle')}</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              {t('notificationsSettings.masterBody')}
            </Text>
          </View>
          <Switch
            value={prefs?.notifyGameEvents ?? false}
            onValueChange={async (next) => {
              if (!prefs || saving) return;
              const prev = prefs.notifyGameEvents;
              setPrefs({ notifyGameEvents: next });
              setSaving(true);
              try {
                const data = await api.patch<NotificationPreferences>(
                  '/drivers/me/notification-preferences',
                  { notifyGameEvents: next },
                );
                setPrefs(data);
              } catch (e: unknown) {
                setPrefs({ notifyGameEvents: prev });
                Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.error'));
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
