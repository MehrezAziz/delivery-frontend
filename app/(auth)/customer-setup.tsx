import {
  View, Text, TouchableOpacity, TextInput,
  FlatList, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { geographyService, walletService } from '../../services/api';
import type { Country, Governorate, Delegation } from '../../services/api';

type Step = 'country' | 'governorate' | 'delegation' | 'street';

export default function CustomerSetupScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('country');

  const [countries, setCountries] = useState<Country[]>([]);
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);

  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedGovernorate, setSelectedGovernorate] = useState<Governorate | null>(null);
  const [selectedDelegation, setSelectedDelegation] = useState<Delegation | null>(null);
  const [street, setStreet] = useState('');

  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load countries on mount
  useEffect(() => {
    setLoadingList(true);
    geographyService.getCountries()
      .then(setCountries)
      .catch(() => setError('Failed to load countries'))
      .finally(() => setLoadingList(false));
  }, []);

  const loadGovernorates = async (country: Country) => {
    setLoadingList(true);
    setError(null);
    try {
      const govs = await geographyService.getGovernorates(country.id);
      setGovernorates(govs);
    } catch {
      setError('Failed to load governorates');
    } finally {
      setLoadingList(false);
    }
  };

  const loadDelegations = async (gov: Governorate) => {
    setLoadingList(true);
    setError(null);
    try {
      const dels = await geographyService.getDelegations(gov.id);
      setDelegations(dels);
    } catch {
      setError('Failed to load delegations');
    } finally {
      setLoadingList(false);
    }
  };

  const handleSelectCountry = (c: Country) => {
    setSelectedCountry(c);
    setSelectedGovernorate(null);
    setSelectedDelegation(null);
    setGovernorates([]);
    setDelegations([]);
  };

  const handleSelectGovernorate = (g: Governorate) => {
    setSelectedGovernorate(g);
    setSelectedDelegation(null);
    setDelegations([]);
  };

  const handleNext = async () => {
    setSearch('');
    if (step === 'country' && selectedCountry) {
      await loadGovernorates(selectedCountry);
      setStep('governorate');
    } else if (step === 'governorate' && selectedGovernorate) {
      await loadDelegations(selectedGovernorate);
      setStep('delegation');
    } else if (step === 'delegation' && selectedDelegation) {
      setStep('street');
    }
  };

  const handleBack = () => {
    setSearch('');
    setError(null);
    if (step === 'governorate') setStep('country');
    else if (step === 'delegation') setStep('governorate');
    else if (step === 'street') setStep('delegation');
    else router.back();
  };

  const handleSubmit = async () => {
    if (!selectedCountry || !selectedDelegation) return;
    setSubmitting(true);
    setError(null);
    try {
      await walletService.setupCustomer(selectedCountry.id, {
        delegationId: selectedDelegation.id,
        street: street.trim() || undefined,
      });
      router.back();
    } catch (e: any) {
      setError(e.message || 'Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filtered lists ──────────────────────────────────────────────────────────
  const filteredCountries = useMemo(() =>
    countries.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.isoCode.toLowerCase().includes(search.toLowerCase())
    ), [countries, search]);

  const filteredGovernorates = useMemo(() =>
    governorates.filter(g =>
      g.nameGovernorate.toLowerCase().includes(search.toLowerCase())
    ), [governorates, search]);

  const filteredDelegations = useMemo(() =>
    delegations.filter(d =>
      d.nameDelegation.toLowerCase().includes(search.toLowerCase())
    ), [delegations, search]);

  // ── Step config ─────────────────────────────────────────────────────────────
  const stepConfig = {
    country: {
      title: 'Choose your country',
      subtitle: 'Sets your wallet currency and delivery zone.',
      placeholder: 'Search country or code...',
      data: filteredCountries,
      selected: selectedCountry,
      onSelect: handleSelectCountry,
      labelKey: 'name' as const,
      subKey: (c: any) => `${c.currencyCode} · ${c.isoCode}`,
      nextDisabled: !selectedCountry,
    },
    governorate: {
      title: 'Choose your governorate',
      subtitle: selectedCountry?.name ?? '',
      placeholder: 'Search governorate...',
      data: filteredGovernorates,
      selected: selectedGovernorate,
      onSelect: handleSelectGovernorate,
      labelKey: 'nameGovernorate' as const,
      subKey: null,
      nextDisabled: !selectedGovernorate,
    },
    delegation: {
      title: 'Choose your delegation',
      subtitle: `${selectedCountry?.name} › ${selectedGovernorate?.nameGovernorate}`,
      placeholder: 'Search delegation...',
      data: filteredDelegations,
      selected: selectedDelegation,
      onSelect: setSelectedDelegation,
      labelKey: 'nameDelegation' as const,
      subKey: null,
      nextDisabled: !selectedDelegation,
    },
  };

  // ── Street step ─────────────────────────────────────────────────────────────
  if (step === 'street') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backRow}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Street (optional)</Text>
          <Text style={styles.subtitle}>
            {selectedCountry?.name} › {selectedGovernorate?.nameGovernorate} › {selectedDelegation?.nameDelegation}
          </Text>
        </View>

        <View style={styles.streetContainer}>
          <TextInput
            style={styles.streetInput}
            placeholder="e.g. 12 Avenue Habib Bourguiba"
            placeholderTextColor="#9ca3af"
            value={street}
            onChangeText={setStreet}
            autoFocus
          />
          <Text style={styles.streetHint}>You can leave this empty and add it later.</Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.footer}>
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

  // ── List steps (country / governorate / delegation) ─────────────────────────
  const cfg = stepConfig[step];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backRow}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{cfg.title}</Text>
        {cfg.subtitle ? <Text style={styles.subtitle}>{cfg.subtitle}</Text> : null}
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={cfg.placeholder}
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loadingList ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0284c7" />
        </View>
      ) : (
        <FlatList
          data={cfg.data as any[]}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No results</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = cfg.selected?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.item, isSelected && styles.itemSelected]}
                onPress={() => cfg.onSelect(item)}
                activeOpacity={0.7}
              >
                <View style={styles.itemLeft}>
                  <Text style={styles.itemTitle}>{item[cfg.labelKey]}</Text>
                  {cfg.subKey && <Text style={styles.itemSub}>{cfg.subKey(item)}</Text>}
                </View>
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, cfg.nextDisabled && styles.btnDisabled]}
          onPress={handleNext}
          disabled={cfg.nextDisabled}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Next →</Text>
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
  searchInput: { flex: 1, fontSize: 15, color: '#111827', padding: 0 },
  clearIcon: { fontSize: 14, color: '#9ca3af', paddingHorizontal: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  listContent: { padding: 16, paddingBottom: 20 },
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
  itemLeft: { gap: 2, flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  itemSub: { fontSize: 13, color: '#6b7280' },
  checkmark: { fontSize: 18, color: '#0284c7', fontWeight: 'bold', marginLeft: 8 },
  streetContainer: { flex: 1, padding: 24 },
  streetInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  streetHint: { fontSize: 13, color: '#9ca3af', marginTop: 8 },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  btn: {
    backgroundColor: '#0284c7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#9ca3af' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
