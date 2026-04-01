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

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

interface Address {
  id: string;
  latitude: number | null;
  longitude: number | null;
  street: string | null;
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

export default function DriverAddressesScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit/Add form state
  const [editStreet, setEditStreet] = useState('');
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

  const getErrMsg = (err: any, fallback: string) => {
    const m = err.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m || fallback;
  };

  const loadAddresses = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) { router.replace('/(auth)/driver-login'); return; }
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
    setSelectedDelegationId(addr.delegation.id);
    setSelectedGovernorateId(addr.delegation.governorate.id);
    setSelectedCountryId(addr.delegation.governorate.country?.id || null);
    const ctrs = await loadCountries();
    if (addr.delegation.governorate.country?.id) {
      await loadGovernorates(addr.delegation.governorate.country.id);
      await loadDelegations(addr.delegation.governorate.id);
    }
  };

  const startAdd = async () => {
    resetForm();
    setShowAddForm(true);
    await loadCountries();
  };

  const saveEdit = async (addressId: string) => {
    if (!editStreet.trim()) { Alert.alert('Error', 'Street cannot be empty'); return; }
    if (!selectedDelegationId) { Alert.alert('Error', 'Please select a delegation'); return; }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      await axios.patch(`${API_URL}/addresses/${addressId}`,
        { street: editStreet.trim(), delegationId: selectedDelegationId },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      resetForm();
      loadAddresses();
    } catch (err: any) {
      Alert.alert('Error', getErrMsg(err, 'Failed to update'));
    } finally { setSaving(false); }
  };

  const saveNewAddress = async () => {
    if (!selectedDelegationId) { Alert.alert('Error', 'Please select a delegation'); return; }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const body: any = { delegationId: selectedDelegationId };
      if (editStreet.trim()) body.street = editStreet.trim();
      await axios.post(`${API_URL}/addresses`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      resetForm();
      loadAddresses();
    } catch (err: any) {
      Alert.alert('Error', getErrMsg(err, 'Failed to add address'));
    } finally { setSaving(false); }
  };

  const deleteAddress = (addressId: string) => {
    if (addresses.length <= 1) {
      Alert.alert('Cannot Delete', 'You must have at least one address.');
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

  const openPicker = (type: 'country' | 'governorate' | 'delegation') => {
    let data: { id: string; label: string }[] = [];
    if (type === 'country') data = countries.map(c => ({ id: c.id, label: c.name }));
    else if (type === 'governorate') data = governorates.map(g => ({ id: g.id, label: g.nameGovernorate }));
    else data = delegations.map(d => ({ id: d.id, label: d.nameDelegation }));
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
    if (type === 'country') return countries.find(c => c.id === selectedCountryId)?.name || 'Select Country';
    if (type === 'governorate') return governorates.find(g => g.id === selectedGovernorateId)?.nameGovernorate || 'Select Governorate';
    return delegations.find(d => d.id === selectedDelegationId)?.nameDelegation || 'Select Delegation';
  };

  const renderGeoPickers = () => (
    <>
      <Text style={s.fieldLabel}>Country</Text>
      <TouchableOpacity style={s.pickerBtn} onPress={() => openPicker('country')}>
        <Text style={selectedCountryId ? s.pickerBtnText : s.pickerBtnPlaceholder}>{getSelectedLabel('country')}</Text>
        <Ionicons name="chevron-down" size={18} color="#666" />
      </TouchableOpacity>

      <Text style={s.fieldLabel}>Governorate</Text>
      <TouchableOpacity
        style={[s.pickerBtn, !selectedCountryId && s.pickerBtnDisabled]}
        onPress={() => selectedCountryId && openPicker('governorate')}
        disabled={!selectedCountryId}
      >
        <Text style={selectedGovernorateId ? s.pickerBtnText : s.pickerBtnPlaceholder}>{getSelectedLabel('governorate')}</Text>
        <Ionicons name="chevron-down" size={18} color="#666" />
      </TouchableOpacity>

      <Text style={s.fieldLabel}>Delegation</Text>
      <TouchableOpacity
        style={[s.pickerBtn, !selectedGovernorateId && s.pickerBtnDisabled]}
        onPress={() => selectedGovernorateId && openPicker('delegation')}
        disabled={!selectedGovernorateId}
      >
        <Text style={selectedDelegationId ? s.pickerBtnText : s.pickerBtnPlaceholder}>{getSelectedLabel('delegation')}</Text>
        <Ionicons name="chevron-down" size={18} color="#666" />
      </TouchableOpacity>
    </>
  );

  if (loading) return <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(driver)/home')} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.text }]}>My Addresses</Text>
        {!showAddForm && !editingId && (
          <TouchableOpacity style={s.addHeaderBtn} onPress={startAdd}>
            <Ionicons name="add-circle" size={28} color="#007AFF" />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Add Address Form */}
        {showAddForm && (
          <View style={[s.card, { borderColor: '#007AFF', borderWidth: 1.5 }]}>
            <View style={s.cardTop}>
              <Ionicons name="add-circle" size={20} color="#007AFF" />
              <Text style={s.locationText}>New Address</Text>
            </View>
            <View style={s.editContainer}>
              {renderGeoPickers()}
              <Text style={s.fieldLabel}>Street (optional)</Text>
              <TextInput
                style={s.editInput}
                value={editStreet}
                onChangeText={setEditStreet}
                placeholder="Street address"
              />
              <View style={s.editActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={resetForm}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={saveNewAddress} disabled={saving}>
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
                <Text style={s.fieldLabel}>Street</Text>
                <TextInput style={s.editInput} value={editStreet} onChangeText={setEditStreet} placeholder="Street address" />
                <View style={s.editActions}>
                  <TouchableOpacity style={s.cancelBtn} onPress={resetForm}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={() => saveEdit(addr.id)} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveBtnText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <Text style={[s.streetText, { color: colors.textSecondary }]}>{addr.street || 'No street specified'}</Text>
                {addr.latitude && addr.longitude && (
                  <Text style={[s.coordText, { color: colors.textTertiary }]}>📍 {addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}</Text>
                )}
                <View style={[s.cardActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity style={s.editBtn} onPress={() => startEdit(addr)}>
                    <Ionicons name="pencil" size={16} color="#007AFF" />
                    <Text style={s.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  {addresses.length > 1 && (
                    <TouchableOpacity style={s.deleteBtn} onPress={() => deleteAddress(addr.id)}>
                      <Ionicons name="trash" size={16} color="#FF3B30" />
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
      <Modal visible={pickerVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.card }]}>
            <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.modalTitle, { color: colors.text }]}>
                {pickerType === 'country' ? 'Select Country' : pickerType === 'governorate' ? 'Select Governorate' : 'Select Delegation'}
              </Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            {pickerData.length === 0 ? (
              <View style={s.modalEmpty}><ActivityIndicator size="small" color="#007AFF" /></View>
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
                      <Ionicons name="checkmark" size={20} color="#007AFF" />
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 56, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1 },
  addHeaderBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginTop: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  locationText: { fontSize: 15, fontWeight: '600', color: '#333', flex: 1 },
  streetText: { fontSize: 14, color: '#666', marginBottom: 4 },
  coordText: { fontSize: 12, color: '#999', marginBottom: 8 },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteBtnText: { color: '#FF3B30', fontWeight: '600', fontSize: 14 },
  editContainer: { marginTop: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 8 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 4 },
  pickerBtnDisabled: { opacity: 0.5 },
  pickerBtnText: { fontSize: 15, color: '#333' },
  pickerBtnPlaceholder: { fontSize: 15, color: '#999' },
  editInput: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#333', marginBottom: 12 },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  cancelBtnText: { color: '#666', fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: '#007AFF', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#333' },
  modalEmpty: { padding: 32, alignItems: 'center' },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  modalItemText: { fontSize: 15, color: '#333' },
});
