import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, FlatList, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { saveLoginTimestamp } from '../../services/auth-session';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
const API_URL = API_BASE.replace(/\/api$/, '');

const VEHICLE_TYPES = ['Motorcycle', 'Car', 'Van', 'Truck', 'Bicycle'];

interface Country { id: string; name: string; isoCode: string; currencyCode: string; }
interface Governorate { id: string; nameGovernorate: string; }
interface Delegation { id: string; nameDelegation: string; }

function SearchPicker({ visible, title, data, onSelect, onClose, search, setSearch, labelKey }: any) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
        </View>
        <View style={styles.searchBox}>
          <Text>🔍</Text>
          <TextInput style={styles.searchInput} placeholder="Search..." placeholderTextColor="#9ca3af"
            value={search} onChangeText={setSearch} autoFocus />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}><Text style={styles.clearIcon}>✕</Text></TouchableOpacity>
          )}
        </View>
        <FlatList
          data={data}
          keyExtractor={(item: any) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }: any) => (
            <TouchableOpacity style={styles.pickerItem} onPress={() => onSelect(item)}>
              <Text style={styles.pickerItemText}>{item[labelKey]}</Text>
              {item.isoCode && <Text style={styles.pickerItemSub}>{item.isoCode} · {item.currencyCode}</Text>}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No results</Text>}
        />
      </View>
    </Modal>
  );
}

export default function DriverRegisterStep2() {
  const router = useRouter();
  const [vehicleType, setVehicleType] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  // Geography
  const [countries, setCountries] = useState<Country[]>([]);
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedGovernorate, setSelectedGovernorate] = useState<Governorate | null>(null);
  const [selectedDelegation, setSelectedDelegation] = useState<Delegation | null>(null);
  const [street, setStreet] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);

  // Picker modals
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showGovPicker, setShowGovPicker] = useState(false);
  const [showDelPicker, setShowDelPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [govSearch, setGovSearch] = useState('');
  const [delSearch, setDelSearch] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/geography/countries`)
      .then(r => r.json())
      .then(data => setCountries(Array.isArray(data) ? data : []))
      .catch(() => setCountries([]));
  }, []);

  const filteredCountries = useMemo(() =>
    countries.filter(c =>
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.isoCode.toLowerCase().includes(countrySearch.toLowerCase())
    ), [countries, countrySearch]);

  const filteredGov = useMemo(() =>
    governorates.filter(g => g.nameGovernorate.toLowerCase().includes(govSearch.toLowerCase())),
    [governorates, govSearch]);

  const filteredDel = useMemo(() =>
    delegations.filter(d => d.nameDelegation.toLowerCase().includes(delSearch.toLowerCase())),
    [delegations, delSearch]);

  const handleSelectCountry = async (c: Country) => {
    setSelectedCountry(c);
    setSelectedGovernorate(null);
    setSelectedDelegation(null);
    setGovernorates([]); setDelegations([]);
    setShowCountryPicker(false);
    setGeoLoading(true);
    try {
      const r = await fetch(`${API_BASE}/geography/countries/${c.id}/governorates`);
      const data = await r.json();
      setGovernorates(Array.isArray(data) ? data : []);
    } catch {} finally { setGeoLoading(false); }
  };

  const handleSelectGovernorate = async (g: Governorate) => {
    setSelectedGovernorate(g);
    setSelectedDelegation(null);
    setDelegations([]);
    setShowGovPicker(false);
    setGeoLoading(true);
    try {
      const r = await fetch(`${API_BASE}/geography/governorates/${g.id}/delegations`);
      const data = await r.json();
      setDelegations(Array.isArray(data) ? data : []);
    } catch {} finally { setGeoLoading(false); }
  };

  const handleSubmit = async () => {
    if (!vehicleType) { Alert.alert('Error', 'Please select a vehicle type'); return; }
    if (!selectedDelegation) { Alert.alert('Error', 'Please select your country, governorate and delegation'); return; }

    const pendingToken = await AsyncStorage.getItem('driverPendingToken');
    if (!pendingToken) {
      Alert.alert('Session Expired', 'Your registration session has expired. Please start over.');
      router.replace('/(auth)/driver-register-step1');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/auth/driver/register/step2`, {
        pendingToken,
        vehicleType,
        description: description.trim() || undefined,
        delegationId: selectedDelegation.id,
        street: street.trim() || undefined,
      });

      // Step 2 committed — store the real access token
      await AsyncStorage.setItem('accessToken', response.data.accessToken);
      await AsyncStorage.setItem('userRole', 'DRIVER');
      await AsyncStorage.setItem('driverId', response.data.driver.id);
      await saveLoginTimestamp();
      await AsyncStorage.removeItem('driverPendingToken');

      router.push('/(auth)/driver-register-step3');
    } catch (error: any) {
      const msg = error.response?.data?.message || 'An error occurred';
      if (error.response?.status === 401) {
        Alert.alert('Session Expired', 'Your registration session has expired. Please start over.');
        router.replace('/(auth)/driver-register-step1');
      } else {
        Alert.alert('Error', msg);
      }
    } finally { setLoading(false); }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Driver Registration</Text>
        <Text style={styles.subtitle}>Step 2 of 3: Vehicle & Address</Text>
      </View>

      <View style={styles.progressContainer}>
        <View style={[styles.progressDot, styles.progressDotComplete]} />
        <View style={styles.progressLine} />
        <View style={[styles.progressDot, styles.progressDotActive]} />
        <View style={styles.progressLine} />
        <View style={styles.progressDot} />
      </View>

      {/* Vehicle Type */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Vehicle Type *</Text>
        <View style={styles.vehicleGrid}>
          {VEHICLE_TYPES.map(type => (
            <TouchableOpacity key={type}
              style={[styles.vehicleButton, vehicleType === type && styles.vehicleButtonActive]}
              onPress={() => setVehicleType(type)}>
              <Text style={[styles.vehicleText, vehicleType === type && styles.vehicleTextActive]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Description */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Vehicle Description (Optional)</Text>
        <TextInput style={[styles.input, styles.textArea]} placeholder="e.g., Red Honda Civic 2020"
          value={description} onChangeText={setDescription} multiline numberOfLines={3} maxLength={500} />
        <Text style={styles.charCount}>{description.length}/500</Text>
      </View>

      {/* Address — required */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Your Address *</Text>
        <Text style={styles.hint}>Select your country, governorate and delegation.</Text>

        {/* Country */}
        <TouchableOpacity style={styles.pickerButton} onPress={() => setShowCountryPicker(true)}>
          <Text style={selectedCountry ? styles.pickerText : styles.pickerPlaceholder}>
            {selectedCountry ? `${selectedCountry.name} (${selectedCountry.isoCode})` : 'Select Country *'}
          </Text>
          <Text style={styles.pickerArrow}>▾</Text>
        </TouchableOpacity>

        {/* Governorate */}
        {selectedCountry && (
          <TouchableOpacity style={[styles.pickerButton, { marginTop: 10 }]}
            onPress={() => setShowGovPicker(true)} disabled={geoLoading}>
            {geoLoading && !selectedGovernorate
              ? <ActivityIndicator size="small" color="#007AFF" />
              : <Text style={selectedGovernorate ? styles.pickerText : styles.pickerPlaceholder}>
                  {selectedGovernorate ? selectedGovernorate.nameGovernorate : 'Select Governorate *'}
                </Text>}
            <Text style={styles.pickerArrow}>▾</Text>
          </TouchableOpacity>
        )}

        {/* Delegation */}
        {selectedGovernorate && (
          <TouchableOpacity style={[styles.pickerButton, { marginTop: 10 }]}
            onPress={() => setShowDelPicker(true)} disabled={geoLoading}>
            {geoLoading && !selectedDelegation
              ? <ActivityIndicator size="small" color="#007AFF" />
              : <Text style={selectedDelegation ? styles.pickerText : styles.pickerPlaceholder}>
                  {selectedDelegation ? selectedDelegation.nameDelegation : 'Select Delegation *'}
                </Text>}
            <Text style={styles.pickerArrow}>▾</Text>
          </TouchableOpacity>
        )}

        {/* Street (optional) */}
        {selectedDelegation && (
          <TextInput style={[styles.input, { marginTop: 10 }]}
            placeholder="Street (optional)" placeholderTextColor="#9ca3af"
            value={street} onChangeText={setStreet} />
        )}
      </View>

      <TouchableOpacity style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Continue to Step 3</Text>}
      </TouchableOpacity>

      {/* Pickers */}
      <SearchPicker visible={showCountryPicker} title="Select Country" data={filteredCountries}
        onSelect={handleSelectCountry} onClose={() => setShowCountryPicker(false)}
        search={countrySearch} setSearch={setCountrySearch} labelKey="name" />
      <SearchPicker visible={showGovPicker} title="Select Governorate" data={filteredGov}
        onSelect={handleSelectGovernorate} onClose={() => setShowGovPicker(false)}
        search={govSearch} setSearch={setGovSearch} labelKey="nameGovernorate" />
      <SearchPicker visible={showDelPicker} title="Select Delegation" data={filteredDel}
        onSelect={(d: Delegation) => { setSelectedDelegation(d); setShowDelPicker(false); }}
        onClose={() => setShowDelPicker(false)}
        search={delSearch} setSearch={setDelSearch} labelKey="nameDelegation" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  header: { marginBottom: 20, marginTop: 20 },
  backBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666' },
  progressContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
  progressDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#ddd' },
  progressDotActive: { backgroundColor: '#007AFF', width: 16, height: 16, borderRadius: 8 },
  progressDotComplete: { backgroundColor: '#34C759' },
  progressLine: { width: 40, height: 2, backgroundColor: '#ddd', marginHorizontal: 8 },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  hint: { fontSize: 13, color: '#999', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#f9f9f9', color: '#111' },
  textArea: { height: 90, textAlignVertical: 'top' },
  charCount: { textAlign: 'right', color: '#999', fontSize: 12, marginTop: 4 },
  vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  vehicleButton: { paddingVertical: 12, paddingHorizontal: 20, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#f9f9f9' },
  vehicleButtonActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  vehicleText: { fontSize: 16, color: '#333' },
  vehicleTextActive: { color: '#fff', fontWeight: '600' },
  pickerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, backgroundColor: '#f9f9f9' },
  pickerText: { fontSize: 16, color: '#111', flex: 1 },
  pickerPlaceholder: { fontSize: 16, color: '#9ca3af', flex: 1 },
  pickerArrow: { fontSize: 16, color: '#9ca3af' },
  submitButton: { backgroundColor: '#007AFF', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 20, marginBottom: 40 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  modalClose: { fontSize: 20, color: '#9ca3af', padding: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', margin: 16, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111', padding: 0 },
  clearIcon: { fontSize: 14, color: '#9ca3af', paddingHorizontal: 4 },
  pickerItem: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pickerItemText: { fontSize: 16, color: '#111', fontWeight: '500' },
  pickerItemSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 15 },
});
