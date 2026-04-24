import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { orderService, Order } from '../../services/api/order.service';
import { useTheme } from '../../contexts/ThemeContext';
import {
  mergeDatePart,
  mergeTimePart,
  enforcePickupAfterPublish,
} from '../../utils/customerScheduleDatetime';

function defaultPickupDate(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(0);
  d.setHours(d.getHours() + 1);
  if (d.getTime() <= Date.now()) d.setHours(d.getHours() + 1);
  return d;
}

function formatHero(d: Date) {
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return { time, date };
}

type SchedulePickerSession = { field: 'publish' | 'pickup'; step: 'date' | 'time'; draft: Date };

interface Props {
  order: Order;
  onSaved: (order: Order) => void;
  /** Draft order page: show date/time as read-only until the customer taps the edit icon. */
  readOnlyScheduleUntilEdit?: boolean;
}

export function DraftOrderScheduleCard({ order, onSaved, readOnlyScheduleUntilEdit }: Props) {
  const { colors, isDark } = useTheme();
  const pickerActiveRef = useRef(false);

  const [publishAtDate, setPublishAtDate] = useState(() => new Date(order.publishAt || order.createdAt));
  const [pickupEnabled, setPickupEnabled] = useState(!!order.pickupAt);
  const [pickupAtDate, setPickupAtDate] = useState(() =>
    order.pickupAt ? new Date(order.pickupAt) : defaultPickupDate(),
  );
  const [iosSession, setIosSession] = useState<null | SchedulePickerSession>(null);
  const [androidSession, setAndroidSession] = useState<null | SchedulePickerSession>(null);
  const [saving, setSaving] = useState(false);

  const publishAtRef = useRef(publishAtDate);
  const pickupAtRef = useRef(pickupAtDate);
  const iosSessionRef = useRef(iosSession);
  const androidSessionRef = useRef(androidSession);
  publishAtRef.current = publishAtDate;
  pickupAtRef.current = pickupAtDate;
  iosSessionRef.current = iosSession;
  androidSessionRef.current = androidSession;

  useEffect(() => {
    if (pickerActiveRef.current) return;
    setPublishAtDate(new Date(order.publishAt || order.createdAt));
    setPickupEnabled(!!order.pickupAt);
    setPickupAtDate(order.pickupAt ? new Date(order.pickupAt) : defaultPickupDate());
  }, [order.id, order.publishAt, order.pickupAt]);

  const setPickerActive = (active: boolean) => {
    pickerActiveRef.current = active;
  };

  const applyPublishPickup = (nextPublish: Date, nextPickup: Date) => {
    const { publish, pickup } = enforcePickupAfterPublish(nextPublish, nextPickup, pickupEnabled);
    setPublishAtDate(publish);
    setPickupAtDate(pickup);
  };

  /** Time only (Android / iOS). */
  const openTimeOnly = (field: 'publish' | 'pickup') => {
    setPickerActive(true);
    if (Platform.OS === 'ios') {
      setIosSession({
        field,
        step: 'time',
        draft: new Date(field === 'publish' ? publishAtDate : pickupAtDate),
      });
    } else {
      setAndroidSession({
        field,
        step: 'time',
        draft: new Date(field === 'publish' ? publishAtDate : pickupAtDate),
      });
    }
  };

  /** Date first, then time (Android / iOS) — used by date row and edit icon. */
  const openDateThenTime = (field: 'publish' | 'pickup') => {
    setPickerActive(true);
    if (Platform.OS === 'ios') {
      setIosSession({
        field,
        step: 'date',
        draft: new Date(field === 'publish' ? publishAtDate : pickupAtDate),
      });
    } else {
      setAndroidSession({
        field,
        step: 'date',
        draft: new Date(field === 'publish' ? publishAtDate : pickupAtDate),
      });
    }
  };

  const closeIosPicker = () => {
    setIosSession(null);
    setPickerActive(false);
  };

  const save = async () => {
    if (publishAtDate.getTime() <= Date.now() + 30_000) {
      Alert.alert('Publish time', 'Choose a publish time at least one minute from now.');
      return;
    }
    if (pickupEnabled) {
      if (pickupAtDate.getTime() <= Date.now()) {
        Alert.alert('Pickup time', 'Pickup time must be in the future.');
        return;
      }
      if (pickupAtDate.getTime() <= publishAtDate.getTime()) {
        Alert.alert('Pickup time', 'Pickup date and time must be strictly after publish date and time.');
        return;
      }
    }
    setSaving(true);
    try {
      const updated = await orderService.updateSchedule(order.id, {
        publishAt: publishAtDate.toISOString(),
        pickupAt: pickupEnabled ? pickupAtDate.toISOString() : null,
      });
      onSaved(updated);
    } catch (e: any) {
      Alert.alert('Could not save', e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const pubHero = formatHero(publishAtDate);
  const pickHero = formatHero(pickupAtDate);

  const renderScheduleHero = (field: 'publish' | 'pickup', time: string, date: string) => {
    if (readOnlyScheduleUntilEdit) {
      return (
        <View style={[styles.hero, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTimePress} accessibilityElementsHidden>
              <Text style={[styles.heroTime, { color: colors.textSecondary, opacity: 0.9 }]}>{time}</Text>
            </View>
            <TouchableOpacity
              style={[styles.editIconBtn, { borderColor: colors.border }]}
              onPress={() => openDateThenTime(field)}
              accessibilityRole="button"
              accessibilityLabel="Edit date and time"
            >
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.heroDatePress}>
            <Text style={[styles.heroDate, { color: colors.textSecondary, opacity: 0.9 }]}>{date}</Text>
            <Text style={[styles.heroMicroHint, { color: colors.textTertiary }]}>Tap edit to change schedule</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.hero, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <View style={styles.heroTopRow}>
          <Pressable
            style={styles.heroTimePress}
            onPress={() => openTimeOnly(field)}
            android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
          >
            <Text style={[styles.heroTime, { color: colors.text }]}>{time}</Text>
            <Text style={[styles.heroMicroHint, { color: colors.textTertiary }]}>Tap time</Text>
          </Pressable>
          <TouchableOpacity
            style={[styles.editIconBtn, { borderColor: colors.border }]}
            onPress={() => openDateThenTime(field)}
            accessibilityRole="button"
            accessibilityLabel="Edit date and time"
          >
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Pressable
          style={styles.heroDatePress}
          onPress={() => openDateThenTime(field)}
          android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
        >
          <Text style={[styles.heroDate, { color: colors.textSecondary }]}>{date}</Text>
          <Text style={[styles.heroMicroHint, { color: colors.textTertiary }]}>Tap date — then time</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        <Ionicons name="calendar" size={22} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>Schedule</Text>
      </View>
      <Text style={[styles.lead, { color: colors.textSecondary }]}>
        Change when this order goes live to drivers and optional pickup time. Only available while the order is draft.
        Pickup must be strictly after publish.
      </Text>

      <Text style={[styles.section, { color: colors.text }]}>Publish to drivers</Text>
      {renderScheduleHero('publish', pubHero.time, pubHero.date)}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.pickupHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.section, { color: colors.text, marginBottom: 4 }]}>Pickup time</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>Optional</Text>
        </View>
        <TouchableOpacity
          style={[styles.switchTrack, { backgroundColor: pickupEnabled ? colors.primary : colors.border }]}
          onPress={() => setPickupEnabled((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: pickupEnabled }}
        >
          <View style={[styles.switchThumb, { marginLeft: pickupEnabled ? 24 : 2 }]} />
        </TouchableOpacity>
      </View>

      {pickupEnabled && renderScheduleHero('pickup', pickHero.time, pickHero.date)}

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        onPress={save}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save schedule</Text>}
      </TouchableOpacity>

      {Platform.OS === 'ios' && (
        <Modal visible={iosSession !== null} transparent animationType="fade" onRequestClose={closeIosPicker}>
          <Pressable style={styles.overlay} onPress={closeIosPicker}>
            <View style={[styles.sheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
              {iosSession !== null && (
                <>
                  <Text style={[styles.sheetTitle, { color: colors.text }]}>
                    {iosSession.field === 'publish' ? 'Publish to drivers' : 'Pickup time'}
                    {iosSession.step === 'date' ? ' — date' : ' — time'}
                  </Text>
                  <DateTimePicker
                    value={iosSession.draft}
                    mode={iosSession.step === 'date' ? 'date' : 'time'}
                    display="spinner"
                    themeVariant={isDark ? 'dark' : 'light'}
                    onChange={(_, date) => {
                      if (!date) return;
                      setIosSession((sess) => {
                        if (!sess) return sess;
                        const merged =
                          sess.step === 'date' ? mergeDatePart(sess.draft, date) : mergeTimePart(sess.draft, date);
                        return { ...sess, draft: merged };
                      });
                    }}
                  />
                  {iosSession.step === 'date' ? (
                    <>
                      <TouchableOpacity
                        style={[styles.doneBtn, { backgroundColor: colors.primary, marginTop: 4 }]}
                        onPress={() => setIosSession((sess) => (sess ? { ...sess, step: 'time' } : sess))}
                      >
                        <Text style={styles.doneBtnText}>Continue to time</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.cancelBtn, { marginTop: 8 }]} onPress={closeIosPicker}>
                        <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={[styles.doneBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                      onPress={() => {
                        const sess = iosSessionRef.current;
                        if (!sess) return;
                        if (sess.field === 'publish') {
                          applyPublishPickup(sess.draft, pickupAtRef.current);
                        } else {
                          applyPublishPickup(publishAtRef.current, sess.draft);
                        }
                        closeIosPicker();
                      }}
                    >
                      <Text style={styles.doneBtnText}>Done</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </Pressable>
        </Modal>
      )}

      {Platform.OS === 'android' && androidSession && (
        <DateTimePicker
          key={`${androidSession.field}-${androidSession.step}`}
          value={androidSession.draft}
          mode={androidSession.step === 'date' ? 'date' : 'time'}
          display="default"
          onChange={(ev, date) => {
            const sess = androidSessionRef.current;
            if (!sess) return;
            if (ev?.type === 'dismissed') {
              setAndroidSession(null);
              setPickerActive(false);
              return;
            }
            if (!date) return;
            const pub = publishAtRef.current;
            const pick = pickupAtRef.current;
            if (sess.step === 'date') {
              if (ev?.type !== 'set') return;
              const mergedDate = mergeDatePart(sess.draft, date);
              setAndroidSession({ ...sess, step: 'time', draft: mergedDate });
              return;
            }
            if (ev?.type !== 'set') return;
            const mergedTime = mergeTimePart(sess.draft, date);
            if (sess.field === 'publish') {
              applyPublishPickup(mergedTime, pick);
            } else {
              applyPublishPickup(pub, mergedTime);
            }
            setAndroidSession(null);
            setPickerActive(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '800' },
  lead: { fontSize: 13, lineHeight: 19, marginBottom: 16, fontWeight: '500' },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 },
  muted: { fontSize: 12, fontWeight: '500' },
  hero: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  heroTimePress: { flex: 1, paddingVertical: 4 },
  heroDatePress: { paddingVertical: 8, marginTop: 4 },
  editIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTime: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  heroDate: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  heroMicroHint: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  pickupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  switchTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  saveBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  sheet: { borderRadius: 18, padding: 16, paddingBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  doneBtn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '700' },
});
