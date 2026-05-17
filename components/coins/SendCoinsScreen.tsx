import { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
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
import { ApiError, api } from '../../services/api/client';
import { walletService } from '../../services/api/wallet.service';
import { useTheme } from '../../contexts/ThemeContext';
import { EightDigitPinInput } from '../security/EightDigitPinInput';
import { pickScheduleDateTimeAndroid } from '../../utils/scheduleDateTimePicker';
import { appAlert } from '../../utils/appAlert';
import { ThemedConfirmDialog } from '../ThemedConfirmDialog';
import { coinTransferStatusMeta } from '../../utils/coinTransferStatus';

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

const E164_PHONE = /^\+[1-9]\d{7,14}$/;
const MIN_SCHEDULE_MS = 60_000;

type TransferFilter = 'all' | 'sent' | 'received';

function minScheduleDate(): Date {
  return new Date(Date.now() + MIN_SCHEDULE_MS);
}

function isValidSchedule(d: Date): boolean {
  return d.getTime() > Date.now() + MIN_SCHEDULE_MS;
}

function clampSchedule(d: Date): Date {
  const min = minScheduleDate();
  return d.getTime() < min.getTime() ? min : d;
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
  const [recipientMode, setRecipientMode] = useState<'id' | 'phone'>('id');
  const [recipientId, setRecipientId] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [grossStr, setGrossStr] = useState('');
  const [gift, setGift] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(() => new Date(Date.now() + 3600_000));
  const [showPicker, setShowPicker] = useState(false);
  const [preview, setPreview] = useState<CoinTransferPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [needsPinForSend, setNeedsPinForSend] = useState(false);
  const [pin, setPin] = useState('');
  const [stepUpModalVisible, setStepUpModalVisible] = useState(false);
  const [stepUpAuthMethod, setStepUpAuthMethod] = useState<'pin' | 'password'>('pin');
  const [stepUpSummary, setStepUpSummary] = useState<{ hasPin: boolean; hasPassword: boolean } | null>(null);
  const [accountPassword, setAccountPassword] = useState('');
  const [transfers, setTransfers] = useState<CoinTransferDto[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [transferFilter, setTransferFilter] = useState<TransferFilter>('all');
  const [cancelTarget, setCancelTarget] = useState<CoinTransferDto | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [celebrateVisible, setCelebrateVisible] = useState(false);
  const [celebrateGift, setCelebrateGift] = useState('');
  const [celebrateAmount, setCelebrateAmount] = useState('');
  const celebrateHandledKeyRef = useRef<string | null>(null);
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState(() => new Date(Date.now() + 3600_000));
  const [rescheduleIosOpen, setRescheduleIosOpen] = useState(false);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [availableCoins, setAvailableCoins] = useState<number | null>(null);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [availableTouched, setAvailableTouched] = useState(false);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const routerRef = useRef(router);
  routerRef.current = router;

  const loadTransfers = useCallback(async () => {
    try {
      setTxLoading(true);
      const res = await coinsService.listTransfers(1, 50);
      setTransfers(res.transfers ?? []);
    } catch {
      setTransfers([]);
    } finally {
      setTxLoading(false);
    }
  }, []);

  const loadAvailableBalance = useCallback(async () => {
    setAvailableTouched(true);
    setAvailableLoading(true);
    try {
      const role = ((await AsyncStorage.getItem('userRole')) ?? '').toUpperCase();
      if (role === 'DRIVER') {
        const me = await api.get<{ account?: { balance?: number } | null }>('/drivers/me');
        const b = me?.account?.balance;
        setAvailableCoins(typeof b === 'number' && Number.isFinite(b) ? b : null);
      } else {
        const w = await walletService.getWallet();
        const spend = w.spendable ?? w.balance;
        setAvailableCoins(typeof spend === 'number' && Number.isFinite(spend) ? spend : null);
      }
    } catch {
      setAvailableCoins(null);
    } finally {
      setAvailableLoading(false);
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
      void loadAvailableBalance();
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
        setTransferFilter('sent');
        routerRef.current.setParams({ sendsOnly: undefined } as never);
      }
    }, [loadTransfers, loadAvailableBalance]),
  );

  const displayTransfers = transfers.filter((t) => {
    if (!myUserId || transferFilter === 'all') return true;
    if (transferFilter === 'sent') return t.senderUserId === myUserId;
    return t.recipientUserId === myUserId && t.senderUserId !== myUserId;
  });

  const scheduleTimeInvalid = scheduleOn && !isValidSchedule(scheduleAt);

  const runPreview = async () => {
    const gross = parseFloat(grossStr.replace(',', '.'));
    if (recipientMode === 'id') {
      if (!recipientId.trim()) {
        appAlert('Recipient', 'Enter the other user’s ID (from Settings).');
        return;
      }
    } else {
      const ph = recipientPhone.trim();
      if (!ph) {
        appAlert('Recipient', 'Enter the recipient’s phone number with country code (e.g. +21655664488).');
        return;
      }
      if (!E164_PHONE.test(ph)) {
        appAlert(
          'Phone format',
          'Use international E.164 format: + then country code and number (8–15 digits after +), e.g. +21655664488.',
        );
        return;
      }
    }
    if (!Number.isFinite(gross) || gross <= 0) {
      appAlert('Amount', 'Enter a valid gross amount.');
      return;
    }
    if (scheduleOn && !isValidSchedule(scheduleAt)) {
      appAlert('Invalid time', 'Scheduled send time must be at least one minute from now.');
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const previewBody =
        recipientMode === 'id'
          ? { recipientUserId: recipientId.trim(), grossCoins: gross }
          : { recipientPhone: recipientPhone.trim(), grossCoins: gross };
      const p = await coinsService.preview(previewBody);
      setPreview(p);
    } catch (e) {
      appAlert('Preview failed', errMsg(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const executeTransferAfterChallenge = async (opts?: { transferPin?: string; accountPassword?: string }) => {
    if (!preview) return;
    if (scheduleOn && !isValidSchedule(scheduleAt)) {
      appAlert('Invalid time', 'Scheduled send time must be at least one minute from now.');
      return;
    }
    const gross = preview.grossCoins;
    setSending(true);
    try {
      const challengeBody: { transferPin?: string; accountPassword?: string } = {};
      if (opts?.transferPin) challengeBody.transferPin = opts.transferPin;
      if (opts?.accountPassword) challengeBody.accountPassword = opts.accountPassword;
      const { challengeToken } = await coinsService.createChallenge(
        Object.keys(challengeBody).length ? challengeBody : undefined,
      );
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      const scheduledIso = scheduleOn && isValidSchedule(scheduleAt) ? scheduleAt.toISOString() : undefined;
      const transferBody = {
        grossCoins: gross,
        challengeToken,
        giftMessage: gift.trim() || undefined,
        scheduledAt: scheduledIso,
        ...(recipientMode === 'id'
          ? { recipientUserId: recipientId.trim() }
          : { recipientPhone: recipientPhone.trim() }),
      };
      await coinsService.createTransfer(transferBody, { idempotencyKey });
      setPinModal(false);
      setPin('');
      setNeedsPinForSend(false);
      setStepUpModalVisible(false);
      setStepUpSummary(null);
      setAccountPassword('');
      appAlert(
        scheduledIso ? 'Send scheduled' : 'Transfer started',
        scheduledIso
          ? `Coins will be sent on ${scheduleAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`
          : 'Coins are pending until the security delay completes.',
      );
      setPreview(null);
      setGrossStr('');
      setGift('');
      setRecipientPhone('');
      setRecipientId('');
      setScheduleOn(false);
      setScheduleAt(new Date(Date.now() + 3600_000));
      await loadTransfers();
      void loadAvailableBalance();
    } catch (e) {
      appAlert('Send failed', errMsg(e));
    } finally {
      setSending(false);
    }
  };

  const startSendFlow = async () => {
    if (!preview) return;
    const has = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (has && enrolled) {
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
          await executeTransferAfterChallenge();
        }
      } catch (e) {
        appAlert('Error', errMsg(e));
      }
      return;
    }

    try {
      const summary = await securityService.getSummary();
      if (!summary.hasTransferPin && !summary.hasPassword) {
        appAlert(
          'Cannot confirm send',
          'This device has no Face ID or fingerprint enrolled. Set an account password or an 8-digit transfer PIN in Settings → Security, then try again.',
        );
        return;
      }
      setStepUpSummary({ hasPin: summary.hasTransferPin, hasPassword: summary.hasPassword });
      if (summary.hasTransferPin && summary.hasPassword) {
        setStepUpAuthMethod('pin');
      } else if (summary.hasTransferPin) {
        setStepUpAuthMethod('pin');
      } else {
        setStepUpAuthMethod('password');
      }
      setPin('');
      setAccountPassword('');
      setStepUpModalVisible(true);
    } catch (e) {
      appAlert('Error', errMsg(e));
    }
  };

  const cancelStepUpModal = () => {
    setStepUpModalVisible(false);
    setStepUpSummary(null);
    setAccountPassword('');
    setPin('');
  };

  const submitStepUpModal = async () => {
    if (!preview) return;
    if (stepUpAuthMethod === 'pin') {
      const pinTrim = pin.trim();
      if (pinTrim.length !== 8 || !/^\d{8}$/.test(pinTrim)) {
        appAlert('PIN', 'Enter your 8-digit transfer PIN (Settings → Security).');
        return;
      }
      await executeTransferAfterChallenge({ transferPin: pinTrim });
      return;
    }
    const pw = accountPassword.trim();
    if (pw.length < 8) {
      appAlert('Password', 'Enter your account password (at least 8 characters).');
      return;
    }
    await executeTransferAfterChallenge({ accountPassword: pw });
  };
  const submitWithPin = async () => {
    if (!preview) return;
    if (needsPinForSend) {
      const pinTrim = pin.trim();
      if (pinTrim.length !== 8 || !/^\d{8}$/.test(pinTrim)) {
        appAlert('PIN', 'Enter your 8-digit transfer PIN (set in Settings → Security).');
        return;
      }
      await executeTransferAfterChallenge({ transferPin: pinTrim });
    }
  };

  const confirmCancelTransfer = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      await coinsService.cancelTransfer(cancelTarget.id);
      setCancelTarget(null);
      await loadTransfers();
    } catch (e) {
      appAlert('Error', errMsg(e));
    } finally {
      setCancelBusy(false);
    }
  };

  const formatDateTimeLocal = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const openRescheduleModal = (t: CoinTransferDto) => {
    if (!t.scheduledAt) return;
    const d = new Date(t.scheduledAt);
    setRescheduleAt(Number.isNaN(d.getTime()) ? new Date(Date.now() + 3600_000) : d);
    setRescheduleTargetId(t.id);
    setRescheduleIosOpen(Platform.OS === 'ios');
  };

  const openReschedulePickers = async () => {
    if (Platform.OS === 'android') {
      const picked = await pickScheduleDateTimeAndroid(rescheduleAt);
      if (picked) setRescheduleAt(picked);
      return;
    }
    setRescheduleIosOpen(true);
  };

  const onRescheduleIosChange = (_: DateTimePickerEvent, d?: Date) => {
    if (d) setRescheduleAt(clampSchedule(d));
  };

  const submitReschedule = async () => {
    if (!rescheduleTargetId) return;
    if (!isValidSchedule(rescheduleAt)) {
      appAlert('Invalid time', 'Choose a date and time at least one minute from now.');
      return;
    }
    setRescheduleSaving(true);
    try {
      await coinsService.rescheduleTransfer(rescheduleTargetId, rescheduleAt.toISOString());
      setRescheduleTargetId(null);
      setRescheduleIosOpen(false);
      await loadTransfers();
    } catch (e: unknown) {
      appAlert('Error', e instanceof Error ? e.message : 'Could not update schedule');
    } finally {
      setRescheduleSaving(false);
    }
  };

  const openSchedulePicker = async () => {
    if (Platform.OS === 'android') {
      const picked = await pickScheduleDateTimeAndroid(scheduleAt);
      if (picked) setScheduleAt(picked);
      return;
    }
    setShowPicker(true);
  };

  const onIosPickerChange = (_: DateTimePickerEvent, d?: Date) => {
    if (d) setScheduleAt(clampSchedule(d));
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Send by the recipient’s user ID (Settings) or by the phone number on their account. Phone must be in
          international format with + and country code (e.g. +21655664488). You pay the gross amount; they receive the net
          after the platform fee. Sends to users in other countries are allowed when both sides support wallet coins.
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Find recipient by</Text>
        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              { borderColor: colors.border, backgroundColor: colors.card },
              recipientMode === 'id' && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => {
              setRecipientMode('id');
              setPreview(null);
            }}
          >
            <Text
              style={[
                styles.segmentBtnText,
                { color: colors.text },
                recipientMode === 'id' && { color: '#fff', fontWeight: '800' },
              ]}
            >
              User ID
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              { borderColor: colors.border, backgroundColor: colors.card },
              recipientMode === 'phone' && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => {
              setRecipientMode('phone');
              setPreview(null);
            }}
          >
            <Text
              style={[
                styles.segmentBtnText,
                { color: colors.text },
                recipientMode === 'phone' && { color: '#fff', fontWeight: '800' },
              ]}
            >
              Phone (E.164)
            </Text>
          </TouchableOpacity>
        </View>

        {recipientMode === 'id' ? (
          <>
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
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Recipient phone</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="+21655664488"
              placeholderTextColor={colors.textTertiary}
              value={recipientPhone}
              onChangeText={setRecipientPhone}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="phone-pad"
            />
          </>
        )}

        <Text style={[styles.label, { color: colors.textSecondary }]}>Gross coins (you pay)</Text>
        <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>Minimum 25 coins</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          placeholder="e.g. 100 (min 25)"
          placeholderTextColor={colors.textTertiary}
          value={grossStr}
          onChangeText={setGrossStr}
          keyboardType="decimal-pad"
        />
        {availableLoading ? (
          <Text style={[styles.availableLine, { color: colors.textTertiary }]}>Loading available balance…</Text>
        ) : availableCoins != null ? (
          <Text style={[styles.availableLine, { color: colors.textSecondary }]}>
            Available: <Text style={{ fontWeight: '700', color: colors.text }}>{availableCoins.toFixed(2)}</Text> coins
          </Text>
        ) : availableTouched ? (
          <Text style={[styles.availableLine, { color: colors.textTertiary }]}>Available balance could not be loaded.</Text>
        ) : null}

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
              onPress={() => void openSchedulePicker()}
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
                minimumDate={minScheduleDate()}
                onValueChange={onIosPickerChange}
                onDismiss={() => setShowPicker(false)}
              />
            )}
            {scheduleTimeInvalid ? (
              <Text style={[styles.scheduleWarn, { color: colors.danger ?? '#dc2626' }]}>
                Pick a time at least one minute from now.
              </Text>
            ) : null}
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

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0, marginBottom: 0 }]}>
            Recent transfers
          </Text>
          <View style={styles.filterChips}>
            {(['all', 'sent', 'received'] as TransferFilter[]).map((key) => {
              const active = transferFilter === key;
              const label = key === 'all' ? 'All' : key === 'sent' ? 'Sent' : 'Received';
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: colors.border,
                      backgroundColor: active ? colors.primary : colors.card,
                    },
                  ]}
                  onPress={() => setTransferFilter(key)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: active ? '#fff' : colors.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        {txLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
        ) : displayTransfers.length === 0 ? (
          <Text style={{ color: colors.textTertiary }}>
            {transferFilter === 'sent'
              ? 'No outgoing sends yet.'
              : transferFilter === 'received'
                ? 'No received transfers yet.'
                : 'No transfers yet.'}
          </Text>
        ) : (
          displayTransfers.map((t) => {
            const isRecipientRow = !!(
              myUserId &&
              t.recipientUserId === myUserId &&
              t.senderUserId !== myUserId
            );
            const isSentRow = !!myUserId && t.senderUserId === myUserId;
            const showFeeBreakdownRow = !isRecipientRow || t.showFeeBreakdown === true;
            const canCancel = t.status === 'SCHEDULED' && isSentRow;
            const status = coinTransferStatusMeta(t.status);
            return (
              <View key={t.id} style={[styles.txRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={styles.txTitleRow}>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Ionicons name={status.icon} size={14} color={status.fg} />
                      <Text style={[styles.statusBadgeText, { color: status.fg }]}>{status.label}</Text>
                    </View>
                    <Text style={[styles.txDirection, { color: colors.textTertiary }]}>
                      {isSentRow ? 'Sent' : isRecipientRow ? 'Received' : 'Transfer'}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 6 }}>
                    {new Date(t.createdAt).toLocaleString()}
                    {showFeeBreakdownRow
                      ? ` · Gross ${t.grossCoins.toFixed(2)}`
                      : ` · +${t.netCoins.toFixed(2)} coins`}
                  </Text>
                  {t.status === 'SCHEDULED' && t.scheduledAt && isSentRow ? (
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12, marginTop: 4 }}>
                      Sends at {formatDateTimeLocal(t.scheduledAt)}
                    </Text>
                  ) : null}
                  {t.status === 'PENDING' && t.pendingUntil ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                      Activates after {formatDateTimeLocal(t.pendingUntil)}
                    </Text>
                  ) : null}
                  {t.status === 'FAILED' && t.failedReason ? (
                    <Text style={{ color: colors.danger ?? '#dc2626', fontSize: 12, marginTop: 4 }}>
                      {t.failedReason}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 10 }}>
                  {t.status === 'SCHEDULED' && isSentRow ? (
                    <TouchableOpacity onPress={() => openRescheduleModal(t)} disabled={rescheduleSaving} hitSlop={12}>
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>Edit time</Text>
                    </TouchableOpacity>
                  ) : null}
                  {canCancel ? (
                    <TouchableOpacity onPress={() => setCancelTarget(t)} hitSlop={12}>
                      <Text style={{ color: colors.danger, fontWeight: '700' }}>Cancel</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
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

      <Modal visible={stepUpModalVisible} transparent animationType="fade" onRequestClose={cancelStepUpModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm send</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
              No Face ID or fingerprint on this device. Use your 8-digit transfer PIN or your account password.
            </Text>
            {stepUpSummary?.hasPin && stepUpSummary?.hasPassword ? (
              <View style={[styles.segmentRow, { marginBottom: 14 }]}>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    { borderColor: colors.border, backgroundColor: colors.card },
                    stepUpAuthMethod === 'pin' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => {
                    setStepUpAuthMethod('pin');
                    setAccountPassword('');
                  }}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      { color: colors.text },
                      stepUpAuthMethod === 'pin' && { color: '#fff', fontWeight: '800' },
                    ]}
                  >
                    Transfer PIN
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    { borderColor: colors.border, backgroundColor: colors.card },
                    stepUpAuthMethod === 'password' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => {
                    setStepUpAuthMethod('password');
                    setPin('');
                  }}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      { color: colors.text },
                      stepUpAuthMethod === 'password' && { color: '#fff', fontWeight: '800' },
                    ]}
                  >
                    Password
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {stepUpAuthMethod === 'pin' && stepUpSummary?.hasPin ? (
              <EightDigitPinInput value={pin} onChange={setPin} colors={colors} disabled={sending} />
            ) : null}
            {stepUpAuthMethod === 'password' && stepUpSummary?.hasPassword ? (
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg ?? colors.card },
                ]}
                placeholder="Account password"
                placeholderTextColor={colors.textTertiary}
                value={accountPassword}
                onChangeText={setAccountPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!sending}
              />
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={cancelStepUpModal} style={styles.modalBtn} disabled={sending}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitStepUpModal()}
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

      <Modal
        visible={!!rescheduleTargetId}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setRescheduleTargetId(null);
          setRescheduleIosOpen(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.rescheduleModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Reschedule send</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 14, fontSize: 14 }}>
              Choose a new date and time. It must be at least one minute from now.
            </Text>
            <TouchableOpacity
              style={[styles.reschedulePickRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
              onPress={() => void openReschedulePickers()}
            >
              <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              <Text style={{ color: colors.text, marginLeft: 12, flex: 1, fontWeight: '600' }}>
                {rescheduleAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </Text>
            </TouchableOpacity>
            {Platform.OS === 'ios' && rescheduleIosOpen && rescheduleTargetId ? (
              <DateTimePicker
                value={rescheduleAt}
                mode="datetime"
                display="spinner"
                minimumDate={minScheduleDate()}
                onValueChange={onRescheduleIosChange}
                onDismiss={() => setRescheduleIosOpen(false)}
              />
            ) : null}
            <View style={[styles.modalActions, { marginTop: 20, justifyContent: 'space-between', width: '100%' }]}>
              <TouchableOpacity
                onPress={() => {
                  setRescheduleTargetId(null);
                  setRescheduleIosOpen(false);
                }}
                style={styles.modalBtn}
                disabled={rescheduleSaving}
              >
                <Text style={{ color: colors.textSecondary }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitReschedule()}
                disabled={rescheduleSaving}
                style={[styles.modalBtn, { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16 }]}
              >
                {rescheduleSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ThemedConfirmDialog
        visible={cancelTarget != null}
        onClose={() => {
          if (!cancelBusy) setCancelTarget(null);
        }}
        title="Cancel scheduled send?"
        message="This send will not happen. Coins are not locked until the scheduled time."
        icon="calendar-outline"
        destructive
        confirmLabel="Cancel send"
        cancelLabel="Keep"
        busy={cancelBusy}
        onConfirm={() => void confirmCancelTransfer()}
      />

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
  fieldHint: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: -2 },
  availableLine: { fontSize: 13, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentBtnText: { fontSize: 14, fontWeight: '600' },
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
  sectionHeader: { marginTop: 28, marginBottom: 12, gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: 28, marginBottom: 10 },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: '800' },
  scheduleWarn: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  txTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '800' },
  txDirection: { fontSize: 12, fontWeight: '600' },
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

  rescheduleModalCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  reschedulePickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
});
