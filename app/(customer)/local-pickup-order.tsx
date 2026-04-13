/**
 * Local pickup: driver brings goods to customer (medicine, food, etc.).
 * Single address only; priced as ≤2 km within delegation (backend).
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, KeyboardAvoidingView, Platform, StyleSheet, Modal, FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { api } from '../../services/api/client';
import { orderService } from '../../services/api/order.service';
import { startOrderTracking } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';

interface SavedAddress {
  addressId: string;
  label: string;
  sublabel: string;
  lat: number;
  lng: number;
}
const RECENT_LOCAL_ADDR_KEY = 'recent_local_pickup_addresses';

export default function LocalPickupOrderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = params.returnTo || '/(customer)/create-order';
  const { colors } = useTheme();
  const [source, setSource] = useState<SavedAddress | null>(null);
  const [paymentType, setPaymentType] = useState<'COD' | 'WALLET'>('COD');
  const [weight, setWeight] = useState('1');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [savedList, setSavedList] = useState<SavedAddress[]>([]);
  const [savedPickerVisible, setSavedPickerVisible] = useState(false);
  const [savedSearch, setSavedSearch] = useState('');
  const [recentAddressIds, setRecentAddressIds] = useState<string[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [cancelAfterMinutes, setCancelAfterMinutes] = useState(15);

  const fetchWallet = useCallback(async () => {
    try {
      const w = await api.get<{ balance: number }>('/wallet/me');
      setWalletBalance(w.balance ?? 0);
    } catch { setWalletBalance(0); }
  }, []);
  useEffect(() => { fetchWallet(); }, [fetchWallet]);
  useFocusEffect(useCallback(() => { fetchWallet(); }, [fetchWallet]));

  const loadSaved = useCallback(async () => {
    try {
      const rows = await api.get<
        { id: string; latitude: number | null; longitude: number | null; street: string | null; nickname: string | null; delegation: { nameDelegation: string; governorate: { nameGovernorate: string } } }[]
      >('/addresses');
      const list: SavedAddress[] = [];
      for (const a of rows) {
        if (a.latitude == null || a.longitude == null) continue;
        list.push({
          addressId: a.id,
          label: a.nickname || a.street || `${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}`,
          sublabel: `${a.delegation.nameDelegation}, ${a.delegation.governorate.nameGovernorate}`,
          lat: a.latitude,
          lng: a.longitude,
        });
      }
      setSavedList(list);
    } catch { setSavedList([]); }
  }, []);
  useEffect(() => { loadSaved(); }, [loadSaved]);
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENT_LOCAL_ADDR_KEY);
        if (raw) setRecentAddressIds(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  const resolveFromCoords = async (lat: number, lng: number, label: string) => {
    setResolving(true);
    try {
      const delegation = await api.get<{ id: string; nameDelegation: string; governorate: { nameGovernorate: string } }>(
        `/geography/delegations/by-coordinates?lat=${lat}&lng=${lng}`,
      );
      const address = await api.post<{ id: string }>('/addresses/order', {
        latitude: lat, longitude: lng, street: label, delegationId: delegation.id,
      });
      setSource({
        addressId: address.id,
        label: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        sublabel: `${delegation.nameDelegation}, ${delegation.governorate.nameGovernorate}`,
        lat, lng,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save address');
    } finally { setResolving(false); }
  };

  const useCurrent = async () => {
    setResolving(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location', 'Permission is required to use your current position.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      await resolveFromCoords(pos.coords.latitude, pos.coords.longitude, 'Current location');
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const raw = await AsyncStorage.getItem('picked_pickup');
        if (raw) {
          const p = JSON.parse(raw);
          await AsyncStorage.removeItem('picked_pickup');
          await resolveFromCoords(p.lat, p.lng, p.address || '');
        }
      } catch {}
    }, 500);
    return () => clearInterval(t);
  }, []);

  const submit = async () => {
    if (!source) {
      Alert.alert('Address', 'Select where the driver should meet you.');
      return;
    }
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) {
      Alert.alert('Weight', 'Enter a valid weight.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Required', 'Please describe what you need.');
      return;
    }
    setLoading(true);
    try {
      const preview = await orderService.previewOrder({
        pickupAddressId: source.addressId,
        localPickupOnly: true,
        paymentType,
        weight: w,
      });
      setLoading(false);
      Alert.alert(
        'Confirm',
        `Total ${preview.totalPrice.toFixed(2)} ${preview.currencySymbol}. Create this local pickup order?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Create',
            onPress: async () => {
              setSubmitting(true);
              try {
                const order = await orderService.createOrder({
                  pickupAddressId: source.addressId,
                  localPickupOnly: true,
                  paymentType,
                  weight: w,
                  description: description.trim(),
                  cancelAfterMinutes,
                });
                startOrderTracking(
                  order.id,
                  '📦 Local pickup — searching for a driver...',
                  '⛟———⌖———⌖———⌖———⌖———⌖———⌖',
                  {
                    orderId: order.id,
                    orderStatus: 'SEARCHING_DRIVER',
                    groupKey: `order:${order.id}`,
                    relatedEntityType: 'Order',
                    relatedEntityId: order.id,
                    ongoing: 'true',
                  },
                );
                router.replace(`/(customer)/order-detail?orderId=${order.id}`);
              } catch (e: any) {
                Alert.alert('Error', e.message || 'Failed');
              } finally { setSubmitting(false); }
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Preview failed');
    } finally { setLoading(false); }
  };

  const filteredSaved = savedList.filter((a) => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return true;
    const hay = `${a.label} ${a.sublabel}`.toLowerCase();
    return hay.includes(q);
  });
  const recentAddresses = recentAddressIds
    .map((id) => savedList.find((a) => a.addressId === id))
    .filter((a): a is SavedAddress => !!a);
  const markRecentAddress = async (addressId: string) => {
    const next = [addressId, ...recentAddressIds.filter((id) => id !== addressId)].slice(0, 6);
    setRecentAddressIds(next);
    try { await AsyncStorage.setItem(RECENT_LOCAL_ADDR_KEY, JSON.stringify(next)); } catch {}
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { backgroundColor: colors.headerBg }]}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace(returnTo as any))} style={s.back}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.title}>Local pickup</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text style={[s.hint, { color: colors.textSecondary }]}>
            Driver brings items to you (within your delegation). No separate delivery address.
          </Text>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Your location</Text>
            <TouchableOpacity style={s.row} onPress={useCurrent} disabled={resolving}>
              <Ionicons name="navigate" size={20} color="#2563eb" />
              <Text style={{ color: colors.text, marginLeft: 8, flex: 1 }}>Use my current position</Text>
              {resolving ? <ActivityIndicator /> : null}
            </TouchableOpacity>
            <TouchableOpacity style={s.row} onPress={() => router.push('/(customer)/pick-location?type=pickup&returnTo=/(customer)/local-pickup-order')}>
              <Ionicons name="map" size={20} color="#16a34a" />
              <Text style={{ color: colors.text, marginLeft: 8 }}>Choose on map</Text>
            </TouchableOpacity>
            {savedList.length > 0 && (
              <>
                <Text style={[s.sub, { color: colors.textSecondary, marginTop: 12 }]}>Saved addresses</Text>
                <TouchableOpacity style={s.savedPickerBtn} onPress={() => { setSavedSearch(''); setSavedPickerVisible(true); }}>
                  <Ionicons name="search-outline" size={16} color="#166534" />
                  <Text style={s.savedPickerBtnText}>Search in saved addresses</Text>
                </TouchableOpacity>
              </>
            )}
            {source && (
              <View style={{ marginTop: 12, padding: 12, backgroundColor: '#ecfdf5', borderRadius: 8 }}>
                <Text style={{ color: '#166534', fontWeight: '700' }}>Selected</Text>
                <Text style={{ color: '#166534' }}>{source.label}</Text>
                <Text style={{ color: '#15803d', fontSize: 12 }}>{source.sublabel}</Text>
              </View>
            )}
          </View>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Payment</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={[s.pay, paymentType === 'COD' && s.payOn]}
                onPress={() => setPaymentType('COD')}
              >
                <Text style={{ color: paymentType === 'COD' ? '#fff' : colors.text }}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.pay, paymentType === 'WALLET' && s.payOn]}
                onPress={() => setPaymentType('WALLET')}
              >
                <Text style={{ color: paymentType === 'WALLET' ? '#fff' : colors.text }}>Wallet ({walletBalance})</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Details</Text>
            <Text style={s.lab}>Weight (kg)</Text>
            <TextInput style={[s.inp, { color: colors.text }]} value={weight} onChangeText={setWeight} keyboardType="numeric" />
            <Text style={[s.lab, { marginTop: 12 }]}>What you need *</Text>
            <TextInput
              style={[s.inp, { minHeight: 72, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="e.g. fever medicine from pharmacy"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <TouchableOpacity style={[s.cta, loading && { opacity: 0.6 }]} onPress={submit} disabled={loading || submitting}>
            {loading || submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Preview & create</Text>}
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={savedPickerVisible} transparent animationType="slide" onRequestClose={() => setSavedPickerVisible(false)}>
          <View style={s.modalOverlay}>
            <View style={[s.modalCard, { backgroundColor: colors.card }]}>
              <View style={s.modalHead}>
                <Text style={[s.modalTitle, { color: colors.text }]}>Select saved address</Text>
                <TouchableOpacity onPress={() => setSavedPickerVisible(false)}>
                  <Ionicons name="close-circle" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={[s.modalSearch, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                <Ionicons name="search" size={16} color={colors.textTertiary} />
                <TextInput
                  style={[s.modalSearchInput, { color: colors.text }]}
                  placeholder="Search nickname, street, area..."
                  placeholderTextColor={colors.textTertiary}
                  value={savedSearch}
                  onChangeText={setSavedSearch}
                />
              </View>
              <FlatList
                data={filteredSaved}
                keyExtractor={(item) => item.addressId}
                style={{ maxHeight: 340 }}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  recentAddresses.length > 0 ? (
                    <View style={{ marginBottom: 8 }}>
                      <Text style={[s.recentTitle, { color: colors.textSecondary }]}>Recently used</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                        {recentAddresses.map((r) => (
                          <TouchableOpacity
                            key={r.addressId}
                            style={[s.recentChip, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                            onPress={() => {
                              setSource(r);
                              markRecentAddress(r.addressId);
                              setSavedPickerVisible(false);
                            }}
                          >
                            <Text style={[s.recentChipText, { color: colors.text }]} numberOfLines={1}>{r.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[s.modalItem, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      setSource(item);
                      markRecentAddress(item.addressId);
                      setSavedPickerVisible(false);
                    }}
                  >
                    <Text style={[s.modalItemTitle, { color: colors.text }]}>{item.label}</Text>
                    <Text style={[s.modalItemSub, { color: colors.textSecondary }]} numberOfLines={1}>{item.sublabel}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={[s.modalEmpty, { color: colors.textTertiary }]}>No matching addresses</Text>}
              />
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 48, paddingBottom: 14, paddingHorizontal: 8 },
  back: { padding: 8 },
  title: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '700' },
  hint: { marginBottom: 16, fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  sub: { fontSize: 13, marginBottom: 6 },
  saved: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6' },
  savedPickerBtn: {
    marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#dcfce7', borderRadius: 10, paddingVertical: 10,
  },
  savedPickerBtnText: { color: '#166534', fontSize: 12, fontWeight: '700' },
  pay: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  payOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  lab: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  inp: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 16 },
  cta: { backgroundColor: '#16a34a', padding: 16, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 20 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  modalSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 },
  modalSearchInput: { flex: 1, height: 42, fontSize: 14 },
  modalItem: { paddingVertical: 10, borderBottomWidth: 1 },
  modalItemTitle: { fontSize: 14, fontWeight: '700' },
  modalItemSub: { fontSize: 12, marginTop: 2 },
  modalEmpty: { textAlign: 'center', paddingVertical: 22, fontSize: 13 },
  recentTitle: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  recentChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 180 },
  recentChipText: { fontSize: 12, fontWeight: '600' },
});
