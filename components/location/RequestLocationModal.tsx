import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { ApiError } from '../../services/api/client';
import {
  locationRequestService,
  type LocationShareRequestDto,
} from '../../services/api/locationRequest.service';
import {
  ensurePhoneCountriesLoaded,
  inferPhoneCountryAndLocal,
  resolvePreferredPhoneCountry,
  toE164Phone,
  validateNationalPhoneForCountry,
  type PhoneCountry,
} from '../../services/phone-countries';
import { appAlert } from '../../utils/appAlert';
import {
  clearLocationSharePending,
  getLocationSharePending,
  saveLocationSharePending,
  mapRequestToResult,
  type LocationSharePendingSnapshot,
} from '../../utils/locationSharePendingStorage';
import {
  ensureLocationSharePollRunning,
  subscribeLocationSharePoll,
} from '../../services/locationSharePendingPoll';

const E164_PHONE = /^\+[1-9]\d{7,14}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RequestLocationResult {
  addressId: string;
  label: string;
  sublabel: string;
  lat: number;
  lng: number;
}

interface Props {
  visible: boolean;
  slot: 'pickup' | 'dropoff';
  onClose: () => void;
  onAccepted: (address: RequestLocationResult) => void;
  onWaitingStateChange?: () => void;
}

type Phase = 'form' | 'waiting';

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

export function RequestLocationModal({ visible, slot, onClose, onAccepted, onWaitingStateChange }: Props) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [phase, setPhase] = useState<Phase>('form');
  const [recipientMode, setRecipientMode] = useState<'phone' | 'id'>('phone');
  const [recipientId, setRecipientId] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [phoneCountries, setPhoneCountries] = useState<PhoneCountry[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<PhoneCountry | null>(null);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<{ userId: string; displayName: string; phoneMasked: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [activeRequest, setActiveRequest] = useState<LocationShareRequestDto | null>(null);
  const [declinedName, setDeclinedName] = useState<string | null>(null);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const slotLabel = slot === 'pickup' ? t('createOrder.pickup') : t('createOrder.delivery');
  const accent = slot === 'pickup' ? '#16a34a' : '#dc2626';

  const reset = useCallback(() => {
    setPhase('form');
    setRecipientId('');
    setLocalPhone('');
    setLookupError(null);
    setLookupResult(null);
    setActiveRequest(null);
    setDeclinedName(null);
    setSending(false);
  }, []);

  const applySnapshot = useCallback((snapshot: LocationSharePendingSnapshot) => {
    setRecipientMode(snapshot.recipientMode);
    setRecipientId(snapshot.recipientId);
    setLocalPhone(snapshot.localPhone);
    setLookupResult({
      userId: snapshot.lookupUserId,
      displayName: snapshot.lookupDisplayName,
      phoneMasked: snapshot.lookupPhoneMasked,
    });
    if (snapshot.countryIso && phoneCountries.length) {
      const country = phoneCountries.find((c) => c.isoCode === snapshot.countryIso);
      if (country) setSelectedCountry(country);
    }
  }, [phoneCountries]);

  const showDeclinedForm = useCallback((name: string, snapshot?: LocationSharePendingSnapshot) => {
    if (snapshot) applySnapshot(snapshot);
    setPhase('form');
    setActiveRequest(null);
    setDeclinedName(name);
    onWaitingStateChange?.();
  }, [applySnapshot, onWaitingStateChange]);

  useEffect(() => {
    if (visible) return;
    setDeclinedName(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }
    void (async () => {
      const pending = await getLocationSharePending(slot);
      if (!pending || pending.slot !== slot) {
        reset();
        return;
      }
      applySnapshot(pending);
      try {
        const req = await locationRequestService.getById(pending.requestId);
        setActiveRequest(req);
        if (req.status === 'ACCEPTED') {
          const result = mapRequestToResult(req, t('locationShare.sharedLocation'));
          if (result) {
            await clearLocationSharePending(slot);
            onAccepted(result);
            onClose();
            reset();
          }
          return;
        }
        if (req.status === 'DECLINED') {
          showDeclinedForm(req.target.displayName || pending.targetDisplayName, pending);
          return;
        }
        if (req.status === 'CANCELLED' || req.status === 'EXPIRED') {
          await clearLocationSharePending(slot);
          reset();
          return;
        }
        if (pending.phase === 'waiting') {
          setPhase('waiting');
        } else {
          showDeclinedForm(pending.targetDisplayName, pending);
        }
      } catch {
        if (pending.phase === 'waiting') setPhase('waiting');
        else showDeclinedForm(pending.targetDisplayName, pending);
      }
    })();
  }, [visible, slot, applySnapshot, showDeclinedForm, onAccepted, onClose, reset, t]);

  useEffect(() => {
    if (!visible) return;
    return subscribeLocationSharePoll((event) => {
      if (event.slot !== slot) return;
      if (event.type === 'declined') {
        showDeclinedForm(event.snapshot.targetDisplayName, event.snapshot);
      }
    });
  }, [visible, slot, showDeclinedForm]);

  useEffect(() => {
    if (!visible) return;
    void (async () => {
      const countries = await ensurePhoneCountriesLoaded();
      setPhoneCountries(countries);
      let fallbackIso = 'TN';
      try {
        const raw = await AsyncStorage.getItem('user');
        if (raw) {
          const u = JSON.parse(raw) as { phone?: string };
          if (u.phone) {
            const inferred = inferPhoneCountryAndLocal(countries, u.phone, fallbackIso);
            if (inferred.country) {
              setSelectedCountry(inferred.country);
              return;
            }
          }
        }
      } catch {}
      setSelectedCountry(resolvePreferredPhoneCountry(countries, fallbackIso));
    })();
  }, [visible]);

  const e164Phone = useMemo(() => {
    if (!selectedCountry || !localPhone.trim()) return '';
    return toE164Phone(selectedCountry.dialCode, localPhone);
  }, [selectedCountry, localPhone]);

  const canLookup = recipientMode === 'id'
    ? UUID_RE.test(recipientId.trim())
    : E164_PHONE.test(e164Phone);

  const runLookup = useCallback(async () => {
    if (!canLookup) {
      setLookupResult(null);
      setLookupError(null);
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await locationRequestService.lookup(
        recipientMode === 'id'
          ? { recipientUserId: recipientId.trim() }
          : { recipientPhone: e164Phone },
      );
      setLookupResult(res);
    } catch (e) {
      setLookupResult(null);
      setLookupError(errMsg(e));
    } finally {
      setLookupLoading(false);
    }
  }, [canLookup, recipientMode, recipientId, e164Phone]);

  useEffect(() => {
    if (!visible || phase !== 'form') return;
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = setTimeout(() => {
      void runLookup();
    }, 450);
    return () => {
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    };
  }, [visible, phase, runLookup, recipientId, localPhone, recipientMode, e164Phone]);

  useEffect(() => {
    if (!visible || !lookupResult) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, [visible, lookupResult]);

  const persistPending = useCallback(async (
    requestId: string,
    targetDisplayName: string,
    phase: LocationSharePendingSnapshot['phase'],
  ) => {
    if (!lookupResult) return;
    await saveLocationSharePending({
      requestId,
      slot,
      targetDisplayName,
      recipientMode,
      recipientId,
      localPhone,
      countryIso: selectedCountry?.isoCode ?? null,
      lookupUserId: lookupResult.userId,
      lookupDisplayName: lookupResult.displayName,
      lookupPhoneMasked: lookupResult.phoneMasked,
      phase,
    });
    ensureLocationSharePollRunning();
  }, [slot, recipientMode, recipientId, localPhone, selectedCountry, lookupResult]);

  const handleSend = async () => {
    if (!lookupResult) return;
    if (recipientMode === 'phone' && selectedCountry) {
      const v = validateNationalPhoneForCountry(selectedCountry.isoCode, selectedCountry.dialCode, localPhone);
      if (!v.ok) {
        appAlert(t('auth.invalidPhone'), v.message);
        return;
      }
    }
    setSending(true);
    try {
      const res = await locationRequestService.create({
        slot: slot === 'pickup' ? 'PICKUP' : 'DROPOFF',
        clientRequestId: `lr_${Date.now()}`,
        ...(recipientMode === 'id'
          ? { recipientUserId: recipientId.trim() }
          : { recipientPhone: e164Phone }),
      });
      setActiveRequest(res);
      setPhase('waiting');
      setDeclinedName(null);
      await persistPending(res.id, lookupResult.displayName, 'waiting');
      onWaitingStateChange?.();
      if (res.pushWarning) {
        appAlert(t('locationShare.pushWarningTitle'), res.pushWarning);
      }
    } catch (e) {
      appAlert(t('common.error'), errMsg(e));
    } finally {
      setSending(false);
    }
  };

  const handleCancelWaiting = async () => {
    if (activeRequest?.id) {
      try {
        await locationRequestService.cancel(activeRequest.id);
      } catch {}
    }
    await clearLocationSharePending(slot);
    onWaitingStateChange?.();
    onClose();
    reset();
  };

  const handleDismiss = () => {
    onClose();
  };

  const clearDeclinedIfContactChanged = () => {
    if (declinedName) setDeclinedName(null);
  };

  const filteredCountries = phoneCountries.filter((c) => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.isoCode.toLowerCase().includes(q) || c.dialCode.includes(q);
  });

  const confirmCard = (
    <View style={[styles.confirmCard, { backgroundColor: isDark ? '#0f172a' : '#f8fafc', borderColor: colors.border }]}>
      {lookupLoading ? (
        <View style={styles.confirmRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.confirmHint, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
        </View>
      ) : lookupResult ? (
        <>
          <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>{t('locationShare.confirmName')}</Text>
          <View style={styles.personRow}>
            <View style={[styles.avatar, { backgroundColor: `${accent}25` }]}>
              <Text style={[styles.avatarTxt, { color: accent }]}>
                {lookupResult.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.personName, { color: colors.text }]}>{lookupResult.displayName}</Text>
              {lookupResult.phoneMasked ? (
                <Text style={[styles.personPhone, { color: colors.textSecondary }]}>{lookupResult.phoneMasked}</Text>
              ) : null}
            </View>
            <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
          </View>
        </>
      ) : lookupError ? (
        <View style={styles.confirmRow}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <Text style={[styles.confirmError, { color: colors.danger }]}>{lookupError}</Text>
        </View>
      ) : (
        <Text style={[styles.confirmHint, { color: colors.textTertiary }]}>
          {t('locationShare.enterContactHint')}
        </Text>
      )}
    </View>
  );

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
        >
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleDismiss} />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 16),
                maxHeight: keyboardHeight > 0 ? '100%' : '92%',
              },
            ]}
          >
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={[
                styles.sheetScroll,
                keyboardHeight > 0 ? { paddingBottom: keyboardHeight + 12 } : null,
              ]}
            >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.headerRow}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? `${accent}22` : `${accent}18` }]}>
                <Ionicons name="person-outline" size={22} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]}>{t('locationShare.modalTitle')}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {t('locationShare.modalSubtitle', { slot: slotLabel })}
                </Text>
              </View>
              <TouchableOpacity onPress={handleDismiss} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {phase === 'form' ? (
              <>
                {declinedName ? (
                  <View style={[styles.declinedBanner, { backgroundColor: isDark ? 'rgba(234,88,12,0.15)' : '#fff7ed', borderColor: '#fdba74' }]}>
                    <Ionicons name="information-circle-outline" size={20} color="#ea580c" />
                    <Text style={[styles.declinedBannerTxt, { color: '#c2410c' }]}>
                      {t('locationShare.declinedByName', { name: declinedName })}
                    </Text>
                  </View>
                ) : null}

                <View style={[styles.modeRow, { backgroundColor: isDark ? '#111827' : '#f3f4f6' }]}>
                  <TouchableOpacity
                    style={[styles.modeBtn, recipientMode === 'phone' && { backgroundColor: colors.primary }]}
                    onPress={() => { setRecipientMode('phone'); setLookupResult(null); setLookupError(null); clearDeclinedIfContactChanged(); }}
                  >
                    <Text style={[styles.modeTxt, { color: recipientMode === 'phone' ? '#fff' : colors.textSecondary }]}>
                      {t('sendCoins.phoneE164')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeBtn, recipientMode === 'id' && { backgroundColor: colors.primary }]}
                    onPress={() => { setRecipientMode('id'); setLookupResult(null); setLookupError(null); clearDeclinedIfContactChanged(); }}
                  >
                    <Text style={[styles.modeTxt, { color: recipientMode === 'id' ? '#fff' : colors.textSecondary }]}>
                      {t('sendCoins.userId')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {confirmCard}

                {recipientMode === 'phone' ? (
                  <View style={styles.phoneRow}>
                    <TouchableOpacity
                      style={[styles.countryBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                      onPress={() => setShowCountryModal(true)}
                    >
                      <Text style={styles.flag}>{selectedCountry?.flag || '🏳️'}</Text>
                      <Text style={[styles.dialCode, { color: colors.text }]}>+{selectedCountry?.dialCode || '216'}</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.phoneInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                      placeholder={t('locationShare.phonePlaceholder')}
                      placeholderTextColor={colors.textTertiary}
                      value={localPhone}
                      onChangeText={(v) => { setLocalPhone(v); clearDeclinedIfContactChanged(); }}
                      keyboardType="phone-pad"
                    />
                  </View>
                ) : (
                  <TextInput
                    style={[styles.idInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                    placeholder={t('sendCoins.recipientUserId')}
                    placeholderTextColor={colors.textTertiary}
                    value={recipientId}
                    onChangeText={(v) => { setRecipientId(v); clearDeclinedIfContactChanged(); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: colors.primary },
                    (!lookupResult || sending) && styles.primaryBtnDisabled,
                  ]}
                  disabled={!lookupResult || sending}
                  onPress={() => void handleSend()}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>{t('locationShare.sendRequest')}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.waitingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.waitingTitle, { color: colors.text }]}>
                  {t('locationShare.waiting', { name: lookupResult?.displayName || activeRequest?.target.displayName || '…' })}
                </Text>
                <Text style={[styles.waitingBody, { color: colors.textSecondary }]}>
                  {t('locationShare.waitingBody')}
                </Text>
                <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => void handleCancelWaiting()}>
                  <Text style={[styles.cancelBtnTxt, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showCountryModal} transparent animationType="slide" onRequestClose={() => setShowCountryModal(false)}>
        <View style={styles.countryOverlay}>
          <View style={[styles.countrySheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.countryTitle, { color: colors.text }]}>{t('auth.selectCountry')}</Text>
            <TextInput
              style={[styles.countrySearch, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              placeholder={t('common.search')}
              placeholderTextColor={colors.textTertiary}
              value={countrySearch}
              onChangeText={setCountrySearch}
            />
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.countryItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setSelectedCountry(item);
                    setShowCountryModal(false);
                    setCountrySearch('');
                  }}
                >
                  <Text style={styles.flag}>{item.flag}</Text>
                  <Text style={[styles.countryName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.countryDial, { color: colors.textSecondary }]}>+{item.dialCode}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setShowCountryModal(false)} style={styles.countryClose}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '92%',
  },
  sheetScroll: { flexGrow: 1, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  modeRow: { flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modeTxt: { fontSize: 13, fontWeight: '700' },
  phoneRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  flag: { fontSize: 18 },
  dialCode: { fontSize: 14, fontWeight: '700' },
  phoneInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  idInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 14 },
  confirmCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14, minHeight: 88, justifyContent: 'center' },
  confirmLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmHint: { fontSize: 14 },
  confirmError: { flex: 1, fontSize: 14 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 18, fontWeight: '800' },
  personName: { fontSize: 17, fontWeight: '800' },
  personPhone: { fontSize: 13, marginTop: 2 },
  primaryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  declinedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  declinedBannerTxt: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  waitingBox: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  waitingTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  waitingBody: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  declinedNote: { fontSize: 13, textAlign: 'center', fontWeight: '600' },
  cancelBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1 },
  cancelBtnTxt: { fontSize: 15, fontWeight: '600' },
  countryOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  countrySheet: { maxHeight: '70%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  countryTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  countrySearch: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  countryItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  countryName: { flex: 1, fontSize: 15 },
  countryDial: { fontSize: 14 },
  countryClose: { alignItems: 'center', paddingVertical: 14 },
});
