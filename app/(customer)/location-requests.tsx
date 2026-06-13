import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import {
  locationRequestService,
  type LocationShareRequestDto,
} from '../../services/api/locationRequest.service';

export default function LocationRequestsInboxScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const [items, setItems] = useState<LocationShareRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await locationRequestService.listIncoming();
      setItems(res);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openRequest = async (id: string) => {
    const role = ((await AsyncStorage.getItem('userRole')) ?? 'CUSTOMER').toUpperCase();
    const base =
      role === 'DRIVER' ? '/(driver)/share-location-request' : '/(customer)/share-location-request';
    router.push(`${base}?id=${encodeURIComponent(id)}` as any);
  };

  const renderItem = ({ item }: { item: LocationShareRequestDto }) => {
    const accent = item.slot === 'PICKUP' ? '#16a34a' : '#dc2626';
    const slotLabel = item.slot === 'PICKUP' ? t('createOrder.pickup') : t('createOrder.delivery');
    const declined = item.status === 'DECLINED';

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        activeOpacity={0.8}
        onPress={() => void openRequest(item.id)}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}>
          <Ionicons name="location-outline" size={22} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {item.requester.displayName}
          </Text>
          {item.requester.phone ? (
            <Text style={[styles.phone, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.requester.phone}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={[styles.slot, { color: accent }]}>{slotLabel}</Text>
            {declined ? (
              <Text style={[styles.declined, { color: '#ea580c' }]}>{t('locationShare.statusDeclined')}</Text>
            ) : (
              <Text style={[styles.pending, { color: colors.primary }]}>{t('locationShare.statusPending')}</Text>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: isDark ? '#0f172a' : '#eff6ff', borderColor: colors.border }]}>
        <Ionicons name="people-outline" size={24} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('locationShare.inboxTitle')}</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{t('locationShare.inboxSubtitle')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="mail-open-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('locationShare.inboxEmpty')}</Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{t('locationShare.inboxEmptyBody')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 12 },
  emptyList: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '800' },
  phone: { fontSize: 13, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  slot: { fontSize: 12, fontWeight: '700' },
  pending: { fontSize: 12, fontWeight: '600' },
  declined: { fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
