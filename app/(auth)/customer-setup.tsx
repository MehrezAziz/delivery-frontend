import {
  View, Text, TouchableOpacity, TextInput,
  FlatList, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { geographyService, walletService } from '../../services/api';
import type { Country, Governorate, Delegation } from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';

type Step = 'country' | 'governorate' | 'delegation' | 'street';

export default function CustomerSetupScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
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
      .catch(() => setError(t('auth.failedLoadCountries')))
      .finally(() => setLoadingList(false));
  }, [t]);

  const loadGovernorates = async (country: Country) => {
    setLoadingList(true);
    setError(null);
    try {
      const govs = await geographyService.getGovernorates(country.id);
      setGovernorates(govs);
    } catch {
      setError(t('auth.failedLoadGovernorates'));
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
      setError(t('auth.failedLoadDelegations'));
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
    else router.canGoBack() ? router.back() : router.replace('/');
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
      router.canGoBack() ? router.back() : router.replace('/');
    } catch (e: any) {
      setError(e.message || t('auth.setupFailed'));
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
      title: t('auth.chooseCountry'),
      subtitle: t('auth.chooseCountrySubtitle'),
      placeholder: t('auth.searchCountry'),
      data: filteredCountries,
      selected: selectedCountry,
      onSelect: handleSelectCountry,
      labelKey: 'name' as const,
      subKey: (c: any) => `${c.currencyCode} · ${c.isoCode}`,
      nextDisabled: !selectedCountry,
    },
    governorate: {
      title: t('auth.chooseGovernorate'),
      subtitle: selectedCountry?.name ?? '',
      placeholder: t('auth.searchGovernorate'),
      data: filteredGovernorates,
      selected: selectedGovernorate,
      onSelect: handleSelectGovernorate,
      labelKey: 'nameGovernorate' as const,
      subKey: null,
      nextDisabled: !selectedGovernorate,
    },
    delegation: {
      title: t('auth.chooseDelegation'),
      subtitle: `${selectedCountry?.name} › ${selectedGovernorate?.nameGovernorate}`,
      placeholder: t('auth.searchDelegation'),
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backRow}>
            <Text style={[styles.backText, { color: colors.primary }]}>{t('auth.back')}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>{t('auth.streetOptional')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {selectedCountry?.name} › {selectedGovernorate?.nameGovernorate} › {selectedDelegation?.nameDelegation}
          </Text>
        </View>

        <View style={styles.streetContainer}>
          <TextInput
            style={[styles.streetInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
            placeholder={t('auth.streetPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={street}
            onChangeText={setStreet}
            autoFocus
          />
          <Text style={[styles.streetHint, { color: colors.textTertiary }]}>{t('auth.streetHint')}</Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>{t('common.finishSetup')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── List steps (country / governorate / delegation) ─────────────────────────
  const cfg = stepConfig[step];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backRow}>
          <Text style={[styles.backText, { color: colors.primary }]}>{t('auth.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{cfg.title}</Text>
        {cfg.subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{cfg.subtitle}</Text> : null}
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={cfg.placeholder}
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={[styles.clearIcon, { color: colors.textTertiary }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loadingList ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={cfg.data as any[]}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t('common.noResults')}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = cfg.selected?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }, isSelected && { borderColor: colors.primary, backgroundColor: isDark ? colors.primaryLight : '#f0f9ff' }]}
                onPress={() => cfg.onSelect(item)}
                activeOpacity={0.7}
              >
                <View style={styles.itemLeft}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>{item[cfg.labelKey]}</Text>
                  {cfg.subKey && <Text style={[styles.itemSub, { color: colors.textSecondary }]}>{cfg.subKey(item)}</Text>}
                </View>
                {isSelected && <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }, cfg.nextDisabled && styles.btnDisabled]}
          onPress={handleNext}
          disabled={cfg.nextDisabled}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>{t('auth.nextStep')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backRow: { marginBottom: 12 },
  backText: { fontSize: 16, fontWeight: '500' },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 14 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  clearIcon: { fontSize: 14, paddingHorizontal: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 15 },
  listContent: { padding: 16, paddingBottom: 20 },
  item: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    marginBottom: 8,
  },
  itemLeft: { gap: 2, flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '600' },
  itemSub: { fontSize: 13 },
  checkmark: { fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  streetContainer: { flex: 1, padding: 24 },
  streetInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  streetHint: { fontSize: 13, marginTop: 8 },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  btn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#9ca3af' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
