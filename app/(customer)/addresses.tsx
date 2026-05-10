import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { geographyService, Country, Governorate, Delegation } from '../../services/api/geography.service';
import { useTheme } from '../../contexts/ThemeContext';
import { markCustomerProfileNeedsRefresh } from '../../utils/profileRefreshSignals';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

interface Address {
  id: string;
  latitude: number | null;
  longitude: number | null;
  street: string | null;
  nickname?: string | null;
  delegation: {
    id: string;
    nameDelegation: string;
    governorate: {
      id: string;
      nameGovernorate: string;
      country?: { id: string; name: string };
    };
  };
}

const MAIN_NICKNAME = 'MAIN';

export default function CustomerAddressesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const pickerSheetBottomPad = Math.max(insets.bottom, 12) + 56;
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit form state
  const [editStreet, setEditStreet] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [selectedGovernorateId, setSelectedGovernorateId] = useState<string | null>(null);
  const [selectedDelegationId, setSelectedDelegationId] = useState<string | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(false);

  // Picker modal state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerType, setPickerType] = useState<'country' | 'governorate' | 'delegation'>('country');
  const [pickerData, setPickerData] = useState<{ id: string; label: string }[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => { loadAddresses(); }, []);
  useEffect(() => {
    if (!params.add) return;
    void (async () => {
      await startAdd();
      router.replace('/(customer)/addresses');
    })();
  }, [params.add]);

  const getErrMsg = (err: any, fallback: string) => {
    const m = err.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m || fallback;
  };

  const loadAddresses = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) { router.replace('/(auth)/customer-login'); return; }
      const res = await axios.get(`${API_URL}/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAddresses(res.data);
    } catch (err: any) {
      Alert.alert('Error', getErrMsg(err, 'Failed to load addresses'));
    } finally { setLoading(false); }
  };

  const loadCountries = async () => {
    try {
      const data = await geographyService.getCountries();
      setCountries(data);
      return data;
    } catch { setCountries([]); return []; }
  };

  const mainAddress = addresses.find((a) => String(a.nickname || '').toUpperCase() === MAIN_NICKNAME) || null;
  const isEditingMainAddress =
    !!editingId && addresses.some((a) => a.id === editingId && String(a.nickname || '').toUpperCase() === MAIN_NICKNAME);

  const loadGovernorates = async (countryId: string) => {
    try {
      setLoadingGeo(true);
      const data = await geographyService.getGovernorates(countryId);
      setGovernorates(data);
      return data;
    } catch { setGovernorates([]); return []; }
    finally { setLoadingGeo(false); }
  };

  const loadDelegations = async (governorateId: string) => {
    try {
      setLoadingGeo(true);
      const data = await geographyService.getDelegations(governorateId);
      setDelegations(data);
      return data;
    } catch { setDelegations([]); return []; }
    finally { setLoadingGeo(false); }
  };

  const resetForm = () => {
    setEditingId(null);
    setShowAddForm(false);
    setEditStreet('');
    setEditNickname('');
    setSelectedCountryId(null);
    setSelectedGovernorateId(null);
    setSelectedDelegationId(null);
    setCountries([]);
    setGovernorates([]);
    setDelegations([]);
  };

  const startEdit = async (addr: Address) => {
    setShowAddForm(false);
    setEditingId(addr.id);
    setEditStreet(addr.street || '');
    setEditNickname(addr.nickname || '');
    setSelectedDelegationId(addr.delegation.id);
    setSelectedGovernorateId(addr.delegation.governorate.id);
    setSelectedCountryId(addr.delegation.governorate.country?.id || null);

    // Load geography data for current address
    await loadCountries();
    if (addr.delegation.governorate.country?.id) {
      await loadGovernorates(addr.delegation.governorate.country.id);
      await loadDelegations(addr.delegation.governorate.id);
    }
  };

  const startAdd = async () => {
    resetForm();
    setShowAddForm(true);
    const loadedCountries = await loadCountries();
    const mainCountryId = mainAddress?.delegation?.governorate?.country?.id || null;
    if (mainCountryId && loadedCountries.some((c) => c.id === mainCountryId)) {
      setSelectedCountryId(mainCountryId);
      await loadGovernorates(mainCountryId);
    }
  };

  const saveEdit = async (addressId: string) => {
    if (!selectedDelegationId) { Alert.alert('Error', 'Please select a delegation'); return; }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      await axios.patch(`${API_URL}/addresses/${addressId}`,
        {
          street: editStreet.trim() || null,
          delegationId: selectedDelegationId,
          nickname: isEditingMainAddress ? MAIN_NICKNAME : (editNickname.trim() || null),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      resetForm();
      markCustomerProfileNeedsRefresh();
      loadAddresses();
    } catch (err: any) {
      Alert.alert('Error', getErrMsg(err, 'Failed to update address'));
    } finally { setSaving(false); }
  };

  const saveNewAddress = async () => {
    if (!selectedDelegationId) { Alert.alert('Error', 'Please select a delegation'); return; }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const body: any = { delegationId: selectedDelegationId };
      if (editStreet.trim()) body.street = editStreet.trim();
      if (editNickname.trim()) body.nickname = editNickname.trim();
      if (addresses.length === 0) body.nickname = MAIN_NICKNAME;
      await axios.post(`${API_URL}/addresses`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      resetForm();
      markCustomerProfileNeedsRefresh();
      loadAddresses();
    } catch (err: any) {
      Alert.alert('Error', getErrMsg(err, 'Failed to add address'));
    } finally { setSaving(false); }
  };

  const deleteAddress = (addressId: string) => {
    const addr = addresses.find((a) => a.id === addressId);
    if (addr?.nickname === MAIN_NICKNAME) {
      Alert.alert('Protected address', 'MAIN address cannot be deleted. Set another address as MAIN first.');
      return;
    }
    Alert.alert('Delete Address', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('accessToken');
            await axios.delete(`${API_URL}/addresses/${addressId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            loadAddresses();
          } catch (err: any) {
            Alert.alert('Error', getErrMsg(err, 'Failed to delete'));
          }
        },
      },
    ]);
  };

  const setAsMainAddress = async (addressId: string) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      await axios.patch(
        `${API_URL}/addresses/${addressId}`,
        { nickname: MAIN_NICKNAME },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      markCustomerProfileNeedsRefresh();
      loadAddresses();
    } catch (err: any) {
      Alert.alert('Error', getErrMsg(err, 'Failed to set MAIN address'));
    }
  };

  const openPicker = (type: 'country' | 'governorate' | 'delegation') => {
    let data: { id: string; label: string }[] = [];
    if (type === 'country') {
      data = countries.map(c => ({ id: c.id, label: c.name }));
    } else if (type === 'governorate') {
      data = governorates.map(g => ({ id: g.id, label: g.nameGovernorate }));
    } else {
      data = delegations.map(d => ({ id: d.id, label: d.nameDelegation }));
    }
    setPickerType(type);
    setPickerData(data);
    setPickerSearch('');
    setPickerVisible(true);
  };

  const onPickerSelect = async (id: string) => {
    setPickerVisible(false);
    setPickerSearch('');
    if (pickerType === 'country') {
      setSelectedCountryId(id);
      setSelectedGovernorateId(null);
      setSelectedDelegationId(null);
      setDelegations([]);
      await loadGovernorates(id);
    } else if (pickerType === 'governorate') {
      setSelectedGovernorateId(id);
      setSelectedDelegationId(null);
      await loadDelegations(id);
    } else {
      setSelectedDelegationId(id);
    }
  };

  const getSelectedLabel = (type: 'country' | 'governorate' | 'delegation'): string => {
    if (type === 'country') {
      return countries.find(c => c.id === selectedCountryId)?.name || 'Select Country';
    } else if (type === 'governorate') {
      return governorates.find(g => g.id === selectedGovernorateId)?.nameGovernorate || 'Select Governorate';
    } else {
      return delegations.find(d => d.id === selectedDelegationId)?.nameDelegation || 'Select Delegation';
    }
  };

  const filteredPickerData =
    pickerType !== 'country'
      ? pickerData
      : pickerData.filter((item) => item.label.toLowerCase().includes(pickerSearch.trim().toLowerCase()));

  const renderGeoPickers = () => (
    <>
      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Country</Text>
      <TouchableOpacity style={[s.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]} onPress={() => openPicker('country')}>
        <Text style={selectedCountryId ? [s.pickerBtnText, { color: colors.text }] : [s.pickerBtnPlaceholder, { color: colors.textTertiary }]}>
          {getSelectedLabel('country')}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Governorate</Text>
      <TouchableOpacity
        style={[s.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }, !selectedCountryId && s.pickerBtnDisabled]}
        onPress={() => selectedCountryId && openPicker('governorate')}
        disabled={!selectedCountryId}
      >
        <Text style={selectedGovernorateId ? [s.pickerBtnText, { color: colors.text }] : [s.pickerBtnPlaceholder, { color: colors.textTertiary }]}>
          {getSelectedLabel('governorate')}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Delegation</Text>
      <TouchableOpacity
        style={[s.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }, !selectedGovernorateId && s.pickerBtnDisabled]}
        onPress={() => selectedGovernorateId && openPicker('delegation')}
        disabled={!selectedGovernorateId}
      >
        <Text style={selectedDelegationId ? [s.pickerBtnText, { color: colors.text }] : [s.pickerBtnPlaceholder, { color: colors.textTertiary }]}>
          {getSelectedLabel('delegation')}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </>
  );

  if (loading) return <View style={[s.centered, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Add Address Form */}
        {showAddForm && (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.primary, borderWidth: 1.5 }]}>
            <View style={s.cardTop}>
              <Ionicons name="add-circle" size={20} color={colors.primary} />
              <Text style={[s.locationText, { color: colors.text }]}>New Address</Text>
            </View>
            <View style={s.editContainer}>
              {renderGeoPickers()}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Your name for this address (optional)</Text>
              <TextInput
                style={[s.editInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                value={editNickname}
                onChangeText={setEditNickname}
                placeholder={addresses.length === 0 ? 'First address will be MAIN automatically' : "e.g. Father's house"}
                placeholderTextColor={colors.textTertiary}
                editable={addresses.length > 0}
              />
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Street (optional)</Text>
              <TextInput
                style={[s.editInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                value={editStreet}
                onChangeText={setEditStreet}
                placeholder="Street address"
                placeholderTextColor={colors.textTertiary}
              />
              <View style={s.editActions}>
                <TouchableOpacity style={[s.cancelBtn, { backgroundColor: colors.surfaceVariant }]} onPress={resetForm}>
                  <Text style={[s.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={saveNewAddress} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveBtnText}>Add</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {addresses.length === 0 && !showAddForm && (
          <View style={s.emptyBox}>
            <Ionicons name="location-outline" size={48} color={colors.textTertiary} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>No Addresses</Text>
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>Tap the add button in the header to create your first address.</Text>
          </View>
        )}
        {addresses.map((addr) => (
          <View key={addr.id} style={[s.card, { backgroundColor: colors.card }]}>
            <View style={s.cardTop}>
              <Ionicons name="location" size={20} color={colors.primary} />
              <Text style={[s.locationText, { color: colors.text }]}>
                {addr.delegation.nameDelegation}, {addr.delegation.governorate.nameGovernorate}
              </Text>
            </View>
            {editingId === addr.id ? (
              <View style={s.editContainer}>
                {renderGeoPickers()}
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Your name for this address</Text>
                <TextInput
                  style={[s.editInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  value={isEditingMainAddress ? MAIN_NICKNAME : editNickname}
                  onChangeText={setEditNickname}
                  placeholder={isEditingMainAddress ? MAIN_NICKNAME : "e.g. Father's house"}
                  placeholderTextColor={colors.textTertiary}
                  editable={!isEditingMainAddress}
                />
                {/* Street Input */}
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Street (optional)</Text>
                <TextInput
                  style={[s.editInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  value={editStreet}
                  onChangeText={setEditStreet}
                  placeholder="Street address"
                  placeholderTextColor={colors.textTertiary}
                />
                <View style={s.editActions}>
                  <TouchableOpacity style={[s.cancelBtn, { backgroundColor: colors.surfaceVariant }]} onPress={resetForm}>
                    <Text style={[s.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={() => saveEdit(addr.id)} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveBtnText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {addr.nickname ? (
                  <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                    {addr.nickname === MAIN_NICKNAME ? 'MAIN' : addr.nickname}
                  </Text>
                ) : null}
                <Text style={[s.streetText, { color: colors.textSecondary }]}>{addr.street || 'No street specified'}</Text>
                {addr.latitude && addr.longitude && (
                  <Text style={[s.coordText, { color: colors.textTertiary }]}>📍 {addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}</Text>
                )}
                <View style={[s.cardActions, { borderTopColor: colors.border }]}>
                  {addr.nickname !== MAIN_NICKNAME && (
                    <TouchableOpacity style={s.editBtn} onPress={() => setAsMainAddress(addr.id)}>
                      <Ionicons name="star" size={16} color="#0f766e" />
                      <Text style={[s.editBtnText, { color: '#0f766e' }]}>Set as MAIN</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.editBtn} onPress={() => startEdit(addr)}>
                    <Ionicons name="pencil" size={16} color="#0284c7" />
                    <Text style={s.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  {addr.nickname !== MAIN_NICKNAME && (
                    <TouchableOpacity style={s.deleteBtn} onPress={() => deleteAddress(addr.id)}>
                      <Ionicons name="trash" size={16} color="#dc2626" />
                      <Text style={s.deleteBtnText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Picker Modal */}
      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={s.modalRoot}>
          <Pressable style={s.modalBackdrop} onPress={() => setPickerVisible(false)} accessibilityRole="button" accessibilityLabel="Close picker" />
          <View style={[s.modalContent, { backgroundColor: colors.card, paddingBottom: pickerSheetBottomPad }]}>
            <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.modalTitle, { color: colors.text }]}>
                {pickerType === 'country' ? 'Select Country' : pickerType === 'governorate' ? 'Select Governorate' : 'Select Delegation'}
              </Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {pickerType === 'country' ? (
              <View style={[s.pickerSearchWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                <Ionicons name="search" size={16} color={colors.textTertiary} />
                <TextInput
                  style={[s.pickerSearchInput, { color: colors.text }]}
                  placeholder="Search country..."
                  placeholderTextColor={colors.textTertiary}
                  value={pickerSearch}
                  onChangeText={setPickerSearch}
                />
              </View>
            ) : null}
            {pickerData.length === 0 ? (
              <View style={s.modalEmpty}><ActivityIndicator size="small" color={colors.primary} /></View>
            ) : (
              <FlatList
                data={filteredPickerData}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={s.modalListContent}
                renderItem={({ item }) => (
                  <TouchableOpacity style={[s.modalItem, { borderBottomColor: colors.border }]} onPress={() => onPickerSelect(item.id)}>
                    <Text style={[s.modalItemText, { color: colors.text }]}>{item.label}</Text>
                    {((pickerType === 'country' && item.id === selectedCountryId) ||
                      (pickerType === 'governorate' && item.id === selectedGovernorateId) ||
                      (pickerType === 'delegation' && item.id === selectedDelegationId)) && (
                      <Ionicons name="checkmark" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  pickerType === 'country'
                    ? <Text style={[s.modalEmptyText, { color: colors.textTertiary }]}>No matching countries</Text>
                    : null
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  locationText: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  streetText: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
  coordText: { fontSize: 12, color: '#9ca3af', marginBottom: 8 },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { color: '#0284c7', fontWeight: '600', fontSize: 14 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  editContainer: { marginTop: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 8 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 4 },
  pickerBtnDisabled: { opacity: 0.5 },
  pickerBtnText: { fontSize: 15, color: '#111827' },
  pickerBtnPlaceholder: { fontSize: 15, color: '#9ca3af' },
  editInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 12 },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  cancelBtnText: { color: '#6b7280', fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: '#0284c7', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  // Modal styles
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '72%' },
  modalListContent: { paddingBottom: 12, flexGrow: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  modalEmpty: { padding: 32, alignItems: 'center' },
  modalEmptyText: { paddingHorizontal: 16, paddingVertical: 20, textAlign: 'center', fontSize: 14 },
  pickerSearchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerSearchInput: { flex: 1, fontSize: 14, padding: 0 },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  modalItemText: { fontSize: 15, color: '#111827' },
});
