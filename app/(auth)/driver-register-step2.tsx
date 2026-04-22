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
import { useTheme } from '../../contexts/ThemeContext';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
const API_URL = API_BASE.replace(/\/api$/, '');

const VEHICLE_TYPES = ['Motorcycle', 'Car', 'Van', 'Truck', 'Bicycle'];

interface Country { id: string; name: string; isoCode: string; currencyCode: string; }
interface Governorate { id: string; nameGovernorate: string; }
interface Delegation { id: string; nameDelegation: string; }

function SearchPicker({ visible, title, data, onSelect, onClose, search, setSearch, labelKey, colors }: any) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
          <TouchableOpacity onPress={onClose}><Text style={[styles.modalClose, { color: colors.textTertiary }]}>✕</Text></TouchableOpacity>
        </View>
        <View style={[styles.searchBox, { borderColor: colors.inputBorder, backgroundColor: colors.card }]}>
          <Text>🔍</Text>
          <TextInput style={[styles.searchInput, { color: colors.text }]} placeholder="Search..." placeholderTextColor={colors.textTertiary}
            value={search} onChangeText={setSearch} autoFocus />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}><Text style={[styles.clearIcon, { color: colors.textTertiary }]}>✕</Text></TouchableOpacity>
          )}
        </View>
        <FlatList
          data={data}
          keyExtractor={(item: any) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }: any) => (
            <TouchableOpacity style={[styles.pickerItem, { borderBottomColor: colors.border }]} onPress={() => onSelect(item)}>
              <Text style={[styles.pickerItemText, { color: colors.text }]}>{item[labelKey]}</Text>
              {item.isoCode && <Text style={[styles.pickerItemSub, { color: colors.textSecondary }]}>{item.isoCode} · {item.currencyCode}</Text>}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textTertiary }]}>No results</Text>}
        />
      </View>
    </Modal>
  );
}

export default function DriverRegisterStep2() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollInner}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.heroCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
        <Text style={[styles.stepBadge, { color: colors.primary, backgroundColor: colors.primaryLight }]}>Step 2 of 3</Text>
        <Text style={[styles.title, { color: colors.text }]}>Vehicle & address</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Tell us how you deliver and where you are based.</Text>
      </View>

      <View style={styles.progressContainer}>
        <View style={[styles.progressDot, styles.progressDotComplete]} />
        <View style={[styles.progressLine, { backgroundColor: colors.border }]} />
        <View style={[styles.progressDot, styles.progressDotActive, { backgroundColor: colors.primary }]} />
        <View style={[styles.progressLine, { backgroundColor: colors.border }]} />
        <View style={[styles.progressDot, { backgroundColor: colors.border }]} />
      </View>

      {/* Vehicle Type */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Vehicle Type *</Text>
        <View style={styles.vehicleGrid}>
          {VEHICLE_TYPES.map(type => (
            <TouchableOpacity key={type}
              style={[styles.vehicleButton, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }, vehicleType === type && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setVehicleType(type)}>
              <Text style={[styles.vehicleText, { color: colors.text }, vehicleType === type && styles.vehicleTextActive]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Description */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Vehicle Description (Optional)</Text>
        <TextInput style={[styles.input, styles.textArea, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]} placeholder="e.g., Red Honda Civic 2020"
          placeholderTextColor={colors.textTertiary}
          value={description} onChangeText={setDescription} multiline numberOfLines={3} maxLength={500} />
        <Text style={[styles.charCount, { color: colors.textTertiary }]}>{description.length}/500</Text>
      </View>

      {/* Address — required */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Your Address *</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>Select your country, governorate and delegation.</Text>

        {/* Country */}
        <TouchableOpacity style={[styles.pickerButton, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]} onPress={() => setShowCountryPicker(true)}>
          <Text style={selectedCountry ? [styles.pickerText, { color: colors.text }] : [styles.pickerPlaceholder, { color: colors.textTertiary }]}>
            {selectedCountry ? `${selectedCountry.name} (${selectedCountry.isoCode})` : 'Select Country *'}
          </Text>
          <Text style={[styles.pickerArrow, { color: colors.textTertiary }]}>▾</Text>
        </TouchableOpacity>

        {/* Governorate */}
        {selectedCountry && (
          <TouchableOpacity style={[styles.pickerButton, { marginTop: 10, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
            onPress={() => setShowGovPicker(true)} disabled={geoLoading}>
            {geoLoading && !selectedGovernorate
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={selectedGovernorate ? [styles.pickerText, { color: colors.text }] : [styles.pickerPlaceholder, { color: colors.textTertiary }]}>
                  {selectedGovernorate ? selectedGovernorate.nameGovernorate : 'Select Governorate *'}
                </Text>}
            <Text style={[styles.pickerArrow, { color: colors.textTertiary }]}>▾</Text>
          </TouchableOpacity>
        )}

        {/* Delegation */}
        {selectedGovernorate && (
          <TouchableOpacity style={[styles.pickerButton, { marginTop: 10, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
            onPress={() => setShowDelPicker(true)} disabled={geoLoading}>
            {geoLoading && !selectedDelegation
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={selectedDelegation ? [styles.pickerText, { color: colors.text }] : [styles.pickerPlaceholder, { color: colors.textTertiary }]}>
                  {selectedDelegation ? selectedDelegation.nameDelegation : 'Select Delegation *'}
                </Text>}
            <Text style={[styles.pickerArrow, { color: colors.textTertiary }]}>▾</Text>
          </TouchableOpacity>
        )}

        {/* Street (optional) */}
        {selectedDelegation && (
          <TextInput style={[styles.input, { marginTop: 10, borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
            placeholder="Street (optional)" placeholderTextColor={colors.textTertiary}
            value={street} onChangeText={setStreet} />
        )}
      </View>

      <TouchableOpacity style={[styles.submitButton, { backgroundColor: colors.primary }, loading && styles.submitButtonDisabled]}
        onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Continue to Step 3</Text>}
      </TouchableOpacity>

      {/* Pickers */}
      <SearchPicker visible={showCountryPicker} title="Select Country" data={filteredCountries}
        onSelect={handleSelectCountry} onClose={() => setShowCountryPicker(false)}
        search={countrySearch} setSearch={setCountrySearch} labelKey="name" colors={colors} />
      <SearchPicker visible={showGovPicker} title="Select Governorate" data={filteredGov}
        onSelect={handleSelectGovernorate} onClose={() => setShowGovPicker(false)}
        search={govSearch} setSearch={setGovSearch} labelKey="nameGovernorate" colors={colors} />
      <SearchPicker visible={showDelPicker} title="Select Delegation" data={filteredDel}
        onSelect={(d: Delegation) => { setSelectedDelegation(d); setShowDelPicker(false); }}
        onClose={() => setShowDelPicker(false)}
        search={delSearch} setSearch={setDelSearch} labelKey="nameDelegation" colors={colors} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollInner: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  heroCard: {
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  stepBadge: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  progressContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
  progressDot: { width: 12, height: 12, borderRadius: 6 },
  progressDotActive: { width: 16, height: 16, borderRadius: 8 },
  progressDotComplete: { backgroundColor: '#34C759' },
  progressLine: { width: 40, height: 2, marginHorizontal: 8 },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  hint: { fontSize: 13, marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  textArea: { height: 90, textAlignVertical: 'top' },
  charCount: { textAlign: 'right', fontSize: 12, marginTop: 4 },
  vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  vehicleButton: { paddingVertical: 12, paddingHorizontal: 20, borderWidth: 1, borderRadius: 8 },
  vehicleText: { fontSize: 16 },
  vehicleTextActive: { color: '#fff', fontWeight: '600' },
  pickerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 8, padding: 14 },
  pickerText: { fontSize: 16, flex: 1 },
  pickerPlaceholder: { fontSize: 16, flex: 1 },
  pickerArrow: { fontSize: 16 },
  submitButton: { padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 20, marginBottom: 40 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalClose: { fontSize: 20, padding: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', margin: 16, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  clearIcon: { fontSize: 14, paddingHorizontal: 4 },
  pickerItem: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  pickerItemText: { fontSize: 16, fontWeight: '500' },
  pickerItemSub: { fontSize: 13, marginTop: 2 },
  emptyText: { textAlign: 'center', padding: 40, fontSize: 15 },
});
