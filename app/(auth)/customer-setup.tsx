import {
  View, Text, TouchableOpacity, TextInput,
  FlatList, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { geographyService, walletService } from '../../services/api';
import type { Country, Governorate, Delegation } from '../../services/api';

type Step = 'country' | 'address';

export default function CustomerSetupScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('country');

  // Geography data
  const [countries, setCountries] = useState<Country[]>([]);
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);

  // Selections
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedGovernorate, setSelectedGovernorate] = useState<Governorate | null>(null);
  const [selectedDelegation, setSelectedDelegation] = useState<Delegation | null>(null);
  const [street, setStreet] = useState('');

  // Search
  const [countrySearch, setCountrySearch] = useState('');
  const [govSearch, setGovSearch] = useState('');
  const [delSearch, setDelSearch] = useState('');

  // Loading / error
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingGov, setLoadingGov] = useState(false);
  const [loadingDel, setLoadingDel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    geographyService.getCountries()
      .then(setCountries)
      .catch(() => setError('Failed to load countries'))
      .finally(() => setLoadingCountries(false));
  }, []);

  // Filtered lists
  const filteredCountries = useMemo(() =>
    countries.filter(c =>
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.isoCode.toLowerCase().includes(countrySearch.toLowerCase())
    ), [countries, countrySearch]);

  const filteredGovernorates = useMemo(() =>
    governorates.filter(g =>
      g.nameGovernorate.toLowerCase().includes(govSearch.toLowerCase())
    ), [governorates, govSearch]);

  const filteredDelegations = useMemo(() =>
    delegations.filter(d =>
      d.nameDelegation.toLowerCase().includes(delSearch.toLowerCase())
    ), [delegations, delSearch]);

  const handleSelectCountry = async (country: Country) => {
    setSelectedCountry(country);
    setSelectedGovernorate(null);
    setSelectedDelegation(null);
    setGovernorates([]);
    setDelegations([]);
    setGovSearch('');
    setDelSearch('');
    setLoadingGov(true);
    try {
      const govs = await geographyService.getGovernorates(country.id);
      setGovernorates(govs);
    } catch {
      setError('Failed to load governorates');
    } finally {
      setLoadingGov(false);
    }
  };

  const handleSelectGovernorate = async (gov: Governorate) => {
    setSelectedGovernorate(gov);
    setSelectedDelegation(null);
    setDelegations([]);
    setDelSearch('');
    setLoadingDel(true);
    try {
      const dels = await geographyService.getDelegations(gov.id);
      setDelegations(dels);
    } catch {
      setError('Failed to load delegations');
    } finally {
      setLoadingDel(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCountry) return;
    setSubmitting(true);
    setError(null);
    try {
      const address = selectedDelegation
        ? { delegationId: selectedDelegation.id, street: street.trim() || undefined }
        : undefined;
      await walletService.setupCustomer(selectedCountry.id, address);
      router.back();
    } catch (e: any) {
      setError(e.message || 'Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Country step ──────────────────────────────────────────────────────────
  if (step === 'country') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Choose your country</Text>
          <Text style={styles.subtitle}>Sets your wallet currency and delivery zone.</Text>
        </View>

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search country or code..."
            placeholderTextColor="#9ca3af"
            value={countrySearch}
            onChangeText={setCountrySearch}
            autoCorrect={false}
          />
          {countrySearch.length > 0 && (
            <TouchableOpacity onPress={() => setCountrySearch('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {loadingCountries ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#0284c7" />
          </View>
        ) : (
          <FlatList
            data={filteredCountries}
            keyExtractor={c => c.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>No countries found</Text>
              </View>
            }
            renderItem={({ item: c }) => (
              <TouchableOpacity
                style={[styles.item, selectedCountry?.id === c.id && styles.itemSelected]}
                onPress={() => handleSelectCountry(c)}
                activeOpacity={0.7}
              >
                <View style={styles.itemLeft}>
                  <Text style={styles.itemTitle}>{c.name}</Text>
                  <Text style={styles.itemSub}>{c.currencyCode} · {c.isoCode}</Text>
                </View>
                {selectedCountry?.id === c.id && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            )}
          />
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.btn, !selectedCountry && styles.btnDisabled]}
            onPress={() => setStep('address')}
            disabled={!selectedCountry}
            activeOpacity={0.8}
          >
            <Text style={styles.btnText}>Next →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Address step ──────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('country')} style={styles.backRow}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add your address</Text>
        <Text style={styles.subtitle}>Optional — you can skip this and do it later.</Text>
      </View>

      {/* Governorate search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search governorate..."
          placeholderTextColor="#9ca3af"
          value={govSearch}
          onChangeText={setGovSearch}
          autoCorrect={false}
        />
        {govSearch.length > 0 && (
          <TouchableOpacity onPress={() => setGovSearch('')}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredGovernorates}
        keyExtractor={g => g.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          loadingGov ? <ActivityIndicator color="#0284c7" style={{ marginVertical: 20 }} /> : null
        }
        ListEmptyComponent={
          !loadingGov ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {governorates.length === 0 ? 'No governorates available' : 'No results'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item: g }) => (
          <TouchableOpacity
            style={[styles.item, selectedGovernorate?.id === g.id && styles.itemSelected]}
            onPress={() => handleSelectGovernorate(g)}
            activeOpacity={0.7}
          >
            <Text style={styles.itemTitle}>{g.nameGovernorate}</Text>
            {selectedGovernorate?.id === g.id && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          selectedGovernorate ? (
            <View style={{ marginTop: 20 }}>
              <Text style={styles.sectionLabel}>Delegation</Text>

              {/* Delegation search */}
              <View style={[styles.searchContainer, { marginHorizontal: 0, marginBottom: 10 }]}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search delegation..."
                  placeholderTextColor="#9ca3af"
                  value={delSearch}
                  onChangeText={setDelSearch}
                  autoCorrect={false}
                />
                {delSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setDelSearch('')}>
                    <Text style={styles.clearIcon}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              {loadingDel ? (
                <ActivityIndicator color="#0284c7" style={{ marginVertical: 12 }} />
              ) : (
                filteredDelegations.map(d => (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.item, selectedDelegation?.id === d.id && styles.itemSelected]}
                    onPress={() => setSelectedDelegation(d)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.itemTitle}>{d.nameDelegation}</Text>
                    {selectedDelegation?.id === d.id && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                ))
              )}

              {selectedDelegation && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Street (optional)</Text>
                  <TextInput
                    style={styles.streetInput}
                    placeholder="e.g. 12 Avenue Habib Bourguiba"
                    placeholderTextColor="#9ca3af"
                    value={street}
                    onChangeText={setStreet}
                  />
                </>
              )}
            </View>
          ) : null
        }
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting
            ? <ActivityIndicator color="#0284c7" />
            : <Text style={styles.btnSecondaryText}>Skip & Finish</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, submitting && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Finish Setup</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backRow: { marginBottom: 12 },
  backText: { color: '#0284c7', fontSize: 16, fontWeight: '500' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280' },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    padding: 0,
  },
  clearIcon: { fontSize: 14, color: '#9ca3af', paddingHorizontal: 4 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#9ca3af', fontSize: 15 },

  listContent: { padding: 16, gap: 8, paddingBottom: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  itemSelected: { borderColor: '#0284c7', backgroundColor: '#f0f9ff' },
  itemLeft: { gap: 2 },
  itemTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  itemSub: { fontSize: 13, color: '#6b7280' },
  checkmark: { fontSize: 18, color: '#0284c7', fontWeight: 'bold' },

  streetInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    marginBottom: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  btn: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#9ca3af' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#374151', fontSize: 16, fontWeight: '600' },
});
