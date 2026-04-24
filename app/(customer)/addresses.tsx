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
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { geographyService, Country, Governorate, Delegation } from '../../services/api/geography.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useCustomerTabBarInset } from '../../contexts/CustomerTabBarInsetContext';

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

export default function CustomerAddressesScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const tabBarPad = useCustomerTabBarInset();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { loadAddresses(); }, []);

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
      const msg = Array.isArray(err.response?.data?.message) ? err.response.data.message.join(', ') : err.response?.data?.message || 'Failed to load addresses';
      Alert.alert('Error', msg);
    } finally { setLoading(false); }
  };

  const loadCountries = async () => {
    try {
      const data = await geographyService.getCountries();
      setCountries(data);
      return data;
    } catch { setCountries([]); return []; }
  };

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

  const startEdit = async (addr: Address) => {
    setEditingId(addr.id);
    setEditStreet(addr.street || '');
    setEditNickname(addr.nickname || '');
    setSelectedDelegationId(addr.delegation.id);
    setSelectedGovernorateId(addr.delegation.governorate.id);
    setSelectedCountryId(addr.delegation.governorate.country?.id || null);

    // Load geography data for current address
    const ctrs = await loadCountries();
    if (addr.delegation.governorate.country?.id) {
      const govs = await loadGovernorates(addr.delegation.governorate.country.id);
      const dels = await loadDelegations(addr.delegation.governorate.id);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditStreet('');
    setEditNickname('');
    setSelectedCountryId(null);
    setSelectedGovernorateId(null);
    setSelectedDelegationId(null);
    setCountries([]);
    setGovernorates([]);
    setDelegations([]);
  };

  const saveEdit = async (addressId: string) => {
    if (!editStreet.trim()) { Alert.alert('Error', 'Street cannot be empty'); return; }
    if (!selectedDelegationId) { Alert.alert('Error', 'Please select a delegation'); return; }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      await axios.patch(`${API_URL}/addresses/${addressId}`,
        {
          street: editStreet.trim(),
          delegationId: selectedDelegationId,
          nickname: editNickname.trim() || null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      cancelEdit();
      loadAddresses();
    } catch (err: any) {
      const msg = Array.isArray(err.response?.data?.message) ? err.response.data.message.join(', ') : err.response?.data?.message || 'Failed to update address';
      Alert.alert('Error', msg);
    } finally { setSaving(false); }
  };

  const deleteAddress = (addressId: string) => {
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
            const msg = Array.isArray(err.response?.data?.message) ? err.response.data.message.join(', ') : err.response?.data?.message || 'Failed to delete';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
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
    setPickerVisible(true);
  };

  const onPickerSelect = async (id: string) => {
    setPickerVisible(false);
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

  if (loading) return <View style={[s.centered, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/home')} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.text }]}>My Addresses</Text>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { paddingBottom: 32 + tabBarPad }]}>
        {addresses.length === 0 && (
          <View style={s.emptyBox}>
            <Ionicons name="location-outline" size={48} color={colors.textTertiary} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>No Addresses</Text>
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>Add an address from your profile.</Text>
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
                {/* Country Picker */}
                <Text style={s.fieldLabel}>Country</Text>
                <TouchableOpacity style={s.pickerBtn} onPress={() => openPicker('country')}>
                  <Text style={selectedCountryId ? s.pickerBtnText : s.pickerBtnPlaceholder}>
                    {getSelectedLabel('country')}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6b7280" />
                </TouchableOpacity>

                {/* Governorate Picker */}
                <Text style={s.fieldLabel}>Governorate</Text>
                <TouchableOpacity
                  style={[s.pickerBtn, !selectedCountryId && s.pickerBtnDisabled]}
                  onPress={() => selectedCountryId && openPicker('governorate')}
                  disabled={!selectedCountryId}
                >
                  <Text style={selectedGovernorateId ? s.pickerBtnText : s.pickerBtnPlaceholder}>
                    {getSelectedLabel('governorate')}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6b7280" />
                </TouchableOpacity>

                {/* Delegation Picker */}
                <Text style={s.fieldLabel}>Delegation</Text>
                <TouchableOpacity
                  style={[s.pickerBtn, !selectedGovernorateId && s.pickerBtnDisabled]}
                  onPress={() => selectedGovernorateId && openPicker('delegation')}
                  disabled={!selectedGovernorateId}
                >
                  <Text style={selectedDelegationId ? s.pickerBtnText : s.pickerBtnPlaceholder}>
                    {getSelectedLabel('delegation')}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6b7280" />
                </TouchableOpacity>

                <Text style={s.fieldLabel}>Your name for this address</Text>
                <TextInput
                  style={s.editInput}
                  value={editNickname}
                  onChangeText={setEditNickname}
                  placeholder="e.g. Father's house"
                />
                {/* Street Input */}
                <Text style={s.fieldLabel}>Street</Text>
                <TextInput
                  style={s.editInput}
                  value={editStreet}
                  onChangeText={setEditStreet}
                  placeholder="Street address"
                />
                <View style={s.editActions}>
                  <TouchableOpacity style={s.cancelBtn} onPress={cancelEdit}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={() => saveEdit(addr.id)} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveBtnText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {addr.nickname ? (
                  <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 4 }}>{addr.nickname}</Text>
                ) : null}
                <Text style={[s.streetText, { color: colors.textSecondary }]}>{addr.street || 'No street specified'}</Text>
                {addr.latitude && addr.longitude && (
                  <Text style={[s.coordText, { color: colors.textTertiary }]}>📍 {addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}</Text>
                )}
                <View style={[s.cardActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity style={s.editBtn} onPress={() => startEdit(addr)}>
                    <Ionicons name="pencil" size={16} color="#0284c7" />
                    <Text style={s.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.deleteBtn} onPress={() => deleteAddress(addr.id)}>
                    <Ionicons name="trash" size={16} color="#dc2626" />
                    <Text style={s.deleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Picker Modal */}
      <Modal visible={pickerVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.card }]}>
            <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.modalTitle, { color: colors.text }]}>
                {pickerType === 'country' ? 'Select Country' : pickerType === 'governorate' ? 'Select Governorate' : 'Select Delegation'}
              </Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            {pickerData.length === 0 ? (
              <View style={s.modalEmpty}><ActivityIndicator size="small" color="#0284c7" /></View>
            ) : (
              <FlatList
                data={pickerData}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.modalItem} onPress={() => onPickerSelect(item.id)}>
                    <Text style={s.modalItemText}>{item.label}</Text>
                    {((pickerType === 'country' && item.id === selectedCountryId) ||
                      (pickerType === 'governorate' && item.id === selectedGovernorateId) ||
                      (pickerType === 'delegation' && item.id === selectedDelegationId)) && (
                      <Ionicons name="checkmark" size={20} color="#0284c7" />
                    )}
                  </TouchableOpacity>
                )}
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, backgroundColor: '#fff', gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  modalEmpty: { padding: 32, alignItems: 'center' },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  modalItemText: { fontSize: 15, color: '#111827' },
});
