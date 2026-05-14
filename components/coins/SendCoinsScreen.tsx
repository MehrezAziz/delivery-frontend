import { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { coinsService, type CoinTransferDto, type CoinTransferPreview } from '../../services/api/coins.service';
import { securityService } from '../../services/api/security.service';
import { ApiError } from '../../services/api/client';
import { useTheme } from '../../contexts/ThemeContext';
import { EightDigitPinInput } from '../security/EightDigitPinInput';

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

function sendCoinsParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

function decodeURIComponentSafe(s: string): string {
  if (!s) return '';
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export default function SendCoinsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    celebrate?: string;
    gift?: string;
    amount?: string;
    sendsOnly?: string;
  }>();
  const { colors } = useTheme();
  const [recipientId, setRecipientId] = useState('');
  const [grossStr, setGrossStr] = useState('');
  const [gift, setGift] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(() => new Date(Date.now() + 3600_000));
  const [showPicker, setShowPicker] = useState(false);
  /** Android: never use mode="datetime" + default (native dismiss bug). */
  const [androidPickPhase, setAndroidPickPhase] = useState<'idle' | 'date' | 'time'>('idle');
  const [preview, setPreview] = useState<CoinTransferPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [needsPinForSend, setNeedsPinForSend] = useState(false);
  const [pin, setPin] = useState('');
  const [transfers, setTransfers] = useState<CoinTransferDto[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [sendsOnlyFilter, setSendsOnlyFilter] = useState(false);
  const [celebrateVisible, setCelebrateVisible] = useState(false);
  const [celebrateGift, setCelebrateGift] = useState('');
  const [celebrateAmount, setCelebrateAmount] = useState('');
  const celebrateHandledKeyRef = useRef<string | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const routerRef = useRef(router);
  routerRef.current = router;

  const loadTransfers = useCallback(async () => {
    try {
      setTxLoading(true);
      const res = await coinsService.listTransfers(1, 30);
      setTransfers(res.transfers ?? []);
    } catch {
      setTransfers([]);
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem('user');
        if (!raw) return;
        const u = JSON.parse(raw) as { id?: string };
        setMyUserId(u?.id ?? null);
      } catch {
        setMyUserId(null);
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTransfers();
      const p = paramsRef.current;
      if (sendCoinsParam(p.celebrate) === '1') {
        const gift = decodeURIComponentSafe(sendCoinsParam(p.gift));
        const amount = decodeURIComponentSafe(sendCoinsParam(p.amount));
        const key = `${amount}|${gift}`;
        if (celebrateHandledKeyRef.current !== key) {
          celebrateHandledKeyRef.current = key;
          setCelebrateGift(gift);
          setCelebrateAmount(amount);
          setCelebrateVisible(true);
        }
        routerRef.current.setParams({ celebrate: undefined, gift: undefined, amount: undefined } as never);
      }
      if (sendCoinsParam(p.sendsOnly) === '1') {
        setSendsOnlyFilter(true);
        routerRef.current.setParams({ sendsOnly: undefined } as never);
      }
    }, [loadTransfers]),
  );

  const transferListFiltered =
    sendsOnlyFilter && myUserId
      ? transfers.filter((t) => t.senderUserId === myUserId)
      : transfers;

  const runPreview = async () => {
    const gross = parseFloat(grossStr.replace(',', '.'));
    if (!recipientId.trim()) {
      Alert.alert('Recipient', 'Enter the other user’s ID (from Settings).');
      return;
    }
    if (!Number.isFinite(gross) || gross <= 0) {
      Alert.alert('Amount', 'Enter a valid gross amount.');
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const p = await coinsService.preview(recipientId.trim(), gross);
      setPreview(p);
    } catch (e) {
      Alert.alert('Preview failed', errMsg(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const executeTransferAfterChallenge = async (pinArg?: string) => {
    if (!preview) return;
    const gross = preview.grossCoins;
    setSending(true);
    try {
      const { challengeToken } = pinArg
        ? await coinsService.createChallenge(pinArg)
        : await coinsService.createChallenge();
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      const scheduledIso =
        scheduleOn && scheduleAt > new Date(Date.now() + 5000) ? scheduleAt.toISOString() : undefined;
      await coinsService.createTransfer(
        {
          recipientUserId: recipientId.trim(),
          grossCoins: gross,
          challengeToken,
          giftMessage: gift.trim() || undefined,
          scheduledAt: scheduledIso,
        },
        { idempotencyKey },
      );
      setPinModal(false);
      setPin('');
      setNeedsPinForSend(false);
      Alert.alert(
        'Transfer started',
        scheduledIso ? 'Coins will move after the scheduled time.' : 'Coins are pending until the security delay completes.',
      );
      setPreview(null);
      setGrossStr('');
      setGift('');
      setScheduleOn(false);
      setAndroidPickPhase('idle');
      await loadTransfers();
    } catch (e) {
      Alert.alert('Send failed', errMsg(e));
    } finally {
      setSending(false);
    }
  };

  const startSendFlow = async () => {
    if (!preview) return;
    const has = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!has || !enrolled) {
      Alert.alert(
        'Biometrics required',
        'Set up Face ID, fingerprint, or device passcode on this phone to confirm sends.',
      );
      return;
    }
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm coin transfer',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (!auth.success) return;
    try {
      const summary = await securityService.getSummary();
      if (summary.hasTransferPin) {
        setNeedsPinForSend(true);
        setPin('');
        setPinModal(true);
      } else {
        setNeedsPinForSend(false);
        await executeTransferAfterChallenge(undefined);
      }
    } catch (e) {
      Alert.alert('Error', errMsg(e));
    }
  };

  const submitWithPin = async () => {
    if (!preview) return;
    if (needsPinForSend) {
      const pinTrim = pin.trim();
      if (pinTrim.length !== 8 || !/^\d{8}$/.test(pinTrim)) {
        Alert.alert('PIN', 'Enter your 8-digit transfer PIN (set in Settings → Security).');
        return;
      }
      await executeTransferAfterChallenge(pinTrim);
    }
  };

  const cancelTx = (id: string) => {
    Alert.alert('Cancel transfer?', 'Reserved coins will be released if the transfer is still pending.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel transfer',
        style: 'destructive',
        onPress: async () => {
          try {
            await coinsService.cancelTransfer(id);
            await loadTransfers();
          } catch (e) {
            Alert.alert('Error', errMsg(e));
          }
        },
      },
    ]);
  };

  const openSchedulePicker = () => {
    if (Platform.OS === 'android') {
      setAndroidPickPhase('date');
    } else {
      setShowPicker(true);
    }
  };

  const onIosPickerChange = (_: DateTimePickerEvent, d?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (d) setScheduleAt(d);
  };

  const onAndroidPickerChange = (event: DateTimePickerEvent, d?: Date) => {
    if (event?.type === 'dismissed') {
      setAndroidPickPhase('idle');
      return;
    }
    if (!d) {
      setAndroidPickPhase('idle');
      return;
    }
    if (androidPickPhase === 'date') {
      const next = new Date(scheduleAt);
      next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      setScheduleAt(next);
      setAndroidPickPhase('time');
      return;
    }
    if (androidPickPhase === 'time') {
      const next = new Date(scheduleAt);
      next.setHours(d.getHours(), d.getMinutes(), 0, 0);
      setScheduleAt(next);
      setAndroidPickPhase('idle');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Recipient must use your user ID from Settings. You pay the gross amount; they receive the net after the
          platform fee.
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Recipient user ID</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          placeholder="UUID"
          placeholderTextColor={colors.textTertiary}
          value={recipientId}
          onChangeText={setRecipientId}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Gross coins (you pay)</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          placeholder="e.g. 100"
          placeholderTextColor={colors.textTertiary}
          value={grossStr}
          onChangeText={setGrossStr}
          keyboardType="decimal-pad"
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Gift message (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          placeholder="Short note to recipient"
          placeholderTextColor={colors.textTertiary}
          value={gift}
          onChangeText={setGift}
          multiline
          maxLength={500}
        />

        <View style={[styles.row, { marginTop: 8 }]}>
          <Text style={{ color: colors.text, flex: 1 }}>Schedule send</Text>
          <Switch value={scheduleOn} onValueChange={setScheduleOn} />
        </View>
        {scheduleOn && (
          <>
            <TouchableOpacity
              style={[styles.scheduleBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={openSchedulePicker}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, marginLeft: 10 }}>
                {scheduleAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </Text>
            </TouchableOpacity>
            {Platform.OS === 'ios' && showPicker && (
              <DateTimePicker
                value={scheduleAt}
                mode="datetime"
                display="spinner"
                minimumDate={new Date(Date.now() + 60_000)}
                onChange={onIosPickerChange}
              />
            )}
            {Platform.OS === 'android' && androidPickPhase !== 'idle' && (
              <DateTimePicker
                value={scheduleAt}
                mode={androidPickPhase === 'date' ? 'date' : 'time'}
                display="default"
                minimumDate={androidPickPhase === 'date' ? new Date(Date.now() + 60_000) : undefined}
                onChange={onAndroidPickerChange}
              />
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => void runPreview()}
          disabled={previewLoading}
        >
          {previewLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Preview fees</Text>
          )}
        </TouchableOpacity>

        {preview && (
          <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.previewTitle, { color: colors.text }]}>Summary</Text>
            <Text style={{ color: colors.textSecondary }}>To: {preview.recipientPreview.displayName}</Text>
            <Text style={{ color: colors.text, marginTop: 8 }}>
              Gross <Text style={{ fontWeight: '800' }}>{preview.grossCoins.toFixed(2)}</Text> · Fee{' '}
              {preview.feeCoins.toFixed(2)} ({preview.feeBps / 100}%) · Recipient gets{' '}
              <Text style={{ fontWeight: '800', color: '#16a34a' }}>{preview.netCoins.toFixed(2)}</Text>
            </Text>
            <Text style={{ color: colors.textTertiary, marginTop: 6 }}>
              Pending delay after activation: ~{preview.pendingDelayMinutes} min
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#16a34a', marginTop: 14 }]}
              onPress={() => void startSendFlow()}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Authenticate & send</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {sendsOnlyFilter && (
          <View
            style={[
              styles.sendsOnlyBanner,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sendsOnlyBannerText, { color: colors.text }]}>Showing your sends</Text>
            <TouchableOpacity onPress={() => setSendsOnlyFilter(false)} hitSlop={12}>
              <Text style={{ color: colors.primary, fontWeight: '800' }}>Show all</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent transfers</Text>
        {txLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
        ) : transferListFiltered.length === 0 ? (
          <Text style={{ color: colors.textTertiary }}>
            {sendsOnlyFilter ? 'No outgoing sends in recent history.' : 'No transfers yet.'}
          </Text>
        ) : (
          transferListFiltered.map((t) => {
            const isRecipientRow = !!(
              myUserId &&
              t.recipientUserId === myUserId &&
              t.senderUserId !== myUserId
            );
            const showFeeBreakdownRow = !isRecipientRow || t.showFeeBreakdown === true;
            const canCancel =
              (t.status === 'PENDING' || t.status === 'SCHEDULED') &&
              !!myUserId &&
              t.senderUserId === myUserId;
            return (
              <View key={t.id} style={[styles.txRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{t.status}</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                    {new Date(t.createdAt).toLocaleString()}
                    {showFeeBreakdownRow ? ` · Gross ${t.grossCoins.toFixed(2)}` : ` · Received ${t.netCoins.toFixed(2)} coins`}
                  </Text>
                </View>
                {canCancel ? (
                  <TouchableOpacity onPress={() => cancelTx(t.id)} hitSlop={12}>
                    <Text style={{ color: colors.danger, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}

        <TouchableOpacity style={{ marginTop: 24, marginBottom: 40 }} onPress={() => router.back()}>
          <Text style={{ color: colors.primary, textAlign: 'center', fontWeight: '600' }}>Close</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={pinModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Transfer PIN</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
              Enter your 8-digit PIN from Settings → Security.
            </Text>
            <EightDigitPinInput value={pin} onChange={setPin} colors={colors} disabled={sending} />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setPinModal(false);
                  setPin('');
                  setNeedsPinForSend(false);
                }}
                style={styles.modalBtn}
              >
                <Text style={{ color: colors.textSecondary }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitWithPin()}
                disabled={sending}
                style={[styles.modalBtn, { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16 }]}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={celebrateVisible} transparent animationType="fade">
        <View style={styles.celebrateOverlay}>
          <View style={[styles.celebrateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.celebrateEmoji}>🎉</Text>
            <Text style={[styles.celebrateTitle, { color: colors.text }]}>
              {celebrateGift.trim() ? 'You received a gift!' : 'Coins received'}
            </Text>
            {celebrateAmount.trim() ? (
              <Text style={[styles.celebrateAmount, { color: '#16a34a' }]}>+{celebrateAmount.trim()} coins</Text>
            ) : null}
            {celebrateGift.trim() ? (
              <Text style={[styles.celebrateGift, { color: colors.textSecondary }]}>“{celebrateGift.trim()}”</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.celebrateBtn, { backgroundColor: colors.primary }]}
              onPress={() => setCelebrateVisible(false)}
            >
              <Text style={styles.celebrateBtnText}>Awesome</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { padding: 20, paddingBottom: 48 },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  label: { fontSize: 12, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  primaryBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  previewCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  previewTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: 28, marginBottom: 10 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: { borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 8 },

  sendsOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  sendsOnlyBannerText: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },

  celebrateOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  celebrateCard: {
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    alignItems: 'center',
  },
  celebrateEmoji: { fontSize: 56, marginBottom: 8 },
  celebrateTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  celebrateAmount: { fontSize: 30, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  celebrateGift: { fontSize: 16, marginTop: 16, textAlign: 'center', fontStyle: 'italic', lineHeight: 22 },
  celebrateBtn: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },
  celebrateBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
