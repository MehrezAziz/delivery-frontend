import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_LABEL_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const DAY_COL_WIDTH = 52;
const HOUR_COL_WIDTH = 52;
const HEADER_ROW_HEIGHT = 44;
/** Corner + hour header row include a 2px bottom rule; body scroll height subtracts this full block. */
const HEADER_RULE = 2;
const HEADER_BLOCK_HEIGHT = HEADER_ROW_HEIGHT + HEADER_RULE;
const DATA_ROW_HEIGHT = 40;
/** Total height of day rows (no extra empty strip below Sun). */
const GRID_BODY_CONTENT_HEIGHT = DAYS.length * DATA_ROW_HEIGHT;
const GRID_LINE_WIDTH = 1;

interface TimePeriod {
  startHour: number;
  endHour: number;
}

interface DayAvailability {
  dayOfWeek: string;
  timePeriods: TimePeriod[];
}

function serializeAvailabilityCells(cells: { [key: string]: boolean }): string {
  return JSON.stringify(
    Object.keys(cells)
      .filter((k) => cells[k])
      .sort(),
  );
}

export default function DriverAvailability() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCells, setSelectedCells] = useState<{ [key: string]: boolean }>({});
  const [lastSavedSerialized, setLastSavedSerialized] = useState('');
  const [availabilityStatus, setAvailabilityStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [savedModalVisible, setSavedModalVisible] = useState(false);
  const [clearModalVisible, setClearModalVisible] = useState(false);

  const leftColScrollRef = useRef<ScrollView>(null);
  const gridBodyScrollRef = useRef<ScrollView>(null);
  const syncScrollLock = useRef(false);

  const syncVerticalScroll = useCallback((y: number, source: 'left' | 'grid') => {
    if (syncScrollLock.current) return;
    syncScrollLock.current = true;
    if (source === 'left') {
      gridBodyScrollRef.current?.scrollTo({ y, animated: false });
    } else {
      leftColScrollRef.current?.scrollTo({ y, animated: false });
    }
    requestAnimationFrame(() => {
      syncScrollLock.current = false;
    });
  }, []);

  const onLeftColumnScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncVerticalScroll(e.nativeEvent.contentOffset.y, 'left');
    },
    [syncVerticalScroll],
  );

  const onGridBodyScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncVerticalScroll(e.nativeEvent.contentOffset.y, 'grid');
    },
    [syncVerticalScroll],
  );

  const [gridBodyScrollHeight, setGridBodyScrollHeight] = useState(GRID_BODY_CONTENT_HEIGHT);
  const onGridTableLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    const maxBody = Math.max(80, h - HEADER_BLOCK_HEIGHT);
    setGridBodyScrollHeight(Math.min(maxBody, GRID_BODY_CONTENT_HEIGHT));
  }, []);

  /** Stronger than `border` so vertical rules stay visible on dark surfaces (card vs surfaceVariant). */
  const gridLine = colors.inputBorder;

  const currentSerialized = serializeAvailabilityCells(selectedCells);
  const isDirty = currentSerialized !== lastSavedSerialized;
  const hasAnySlot = Object.values(selectedCells).some(Boolean);

  useEffect(() => {
    loadAvailability();
  }, []);

  const loadAvailability = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        router.replace('/(auth)/driver-login');
        return;
      }

      const response = await axios.get(`${API_URL}/drivers/availability`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setAvailabilityStatus(response.data.status);

      // Convert backend data to selected cells
      const cells: { [key: string]: boolean } = {};
      response.data.days.forEach((day: DayAvailability) => {
        day.timePeriods.forEach((period: TimePeriod) => {
          for (let hour = period.startHour; hour < period.endHour; hour++) {
            const key = `${day.dayOfWeek}-${hour}`;
            cells[key] = true;
          }
        });
      });

      setSelectedCells(cells);
      setLastSavedSerialized(serializeAvailabilityCells(cells));
    } catch (error: any) {
      console.error('Load availability error:', error);
      if (error.response?.status === 404) {
        // Availability not initialized yet - show empty grid
        setSelectedCells({});
        setLastSavedSerialized(serializeAvailabilityCells({}));
        setAvailabilityStatus('ACTIVE');
      } else {
        Alert.alert(t('common.error'), t('driverAvailability.failedLoad'));
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleCell = (day: string, hour: number) => {
    const key = `${day}-${hour}`;
    setSelectedCells(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const selectFullDay = (day: string) => {
    const newCells = { ...selectedCells };
    const allSelected = HOURS.every(hour => selectedCells[`${day}-${hour}`]);

    HOURS.forEach(hour => {
      const key = `${day}-${hour}`;
      newCells[key] = !allSelected;
    });

    setSelectedCells(newCells);
  };

  const confirmClearAll = () => {
    setSelectedCells({});
    setClearModalVisible(false);
  };

  const handleSave = async () => {
    // Convert selected cells to API format
    const days: DayAvailability[] = [];

    DAYS.forEach(day => {
      const dayHours: number[] = [];
      HOURS.forEach(hour => {
        if (selectedCells[`${day}-${hour}`]) {
          dayHours.push(hour);
        }
      });

      if (dayHours.length === 0) {
        return; // Skip days with no availability
      }

      // Group consecutive hours into periods
      const periods: TimePeriod[] = [];
      let startHour = dayHours[0];
      let prevHour = dayHours[0];

      for (let i = 1; i <= dayHours.length; i++) {
        const currentHour = dayHours[i];
        
        if (currentHour !== prevHour + 1 || i === dayHours.length) {
          // End of period
          periods.push({
            startHour,
            endHour: prevHour + 1, // End hour is exclusive
          });
          startHour = currentHour;
        }
        prevHour = currentHour;
      }

      days.push({
        dayOfWeek: day,
        timePeriods: periods,
      });
    });

    if (days.length === 0) {
      Alert.alert(t('common.error'), t('driverAvailability.pleaseSelectSlot'));
      return;
    }

    setSaving(true);

    try {
      const token = await AsyncStorage.getItem('accessToken');
      await axios.put(
        `${API_URL}/drivers/availability`,
        { days },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setLastSavedSerialized(serializeAvailabilityCells(selectedCells));
      setSavedModalVisible(true);
    } catch (error: any) {
      console.error('Save availability error:', error);
      Alert.alert(t('common.error'), error.response?.data?.message || t('driverAvailability.failedSave'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const response = await axios.post(
        `${API_URL}/drivers/availability/toggle`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAvailabilityStatus(response.data.status);
      Alert.alert(
        t('driverAvailability.statusUpdated'),
        response.data.status === 'ACTIVE' ? t('driverAvailability.nowActive') : t('driverAvailability.nowInactive')
      );
    } catch (error: any) {
      console.error('Toggle status error:', error);
      Alert.alert(t('common.error'), t('driverAvailability.failedToggle'));
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.statusBadge,
          { backgroundColor: availabilityStatus === 'ACTIVE' ? '#e8f5e9' : '#ffebee' },
        ]}
      >
        <TouchableOpacity onPress={toggleStatus} style={styles.statusToggleBtn} accessibilityLabel={t('driverAvailability.toggleStatus')}>
          <Ionicons
            name={availabilityStatus === 'ACTIVE' ? 'checkmark-circle' : 'close-circle'}
            size={28}
            color={availabilityStatus === 'ACTIVE' ? '#34C759' : '#FF3B30'}
          />
        </TouchableOpacity>
        <Text
          style={[
            styles.statusText,
            { color: availabilityStatus === 'ACTIVE' ? '#2e7d32' : '#c62828' },
          ]}
        >
          {t('driverAvailability.statusPrefix')}{availabilityStatus === 'ACTIVE' ? t('driverAvailability.statusActive') : t('driverAvailability.statusInactive')}
        </Text>
      </View>

      {/* Instructions */}
      <View style={[styles.instructions, { backgroundColor: colors.surfaceVariant }]}>
        <Ionicons name="information-circle" size={20} color={colors.textSecondary} />
        <Text style={[styles.instructionsText, { color: colors.textSecondary }]}>
          {t('driverAvailability.selectHoursHint')}
        </Text>
      </View>

      {/* Schedule grid: fixed day column + horizontally scrollable hours (vertical scroll synced) */}
      <View style={styles.gridTableWrap} onLayout={onGridTableLayout}>
        <View
          style={[
            styles.dayStrip,
            {
              width: DAY_COL_WIDTH,
              backgroundColor: colors.surfaceVariant,
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 2, height: 0 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                },
                android: { elevation: 3 },
              }),
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[styles.dayStripDivider, { backgroundColor: gridLine, width: GRID_LINE_WIDTH }]}
          />
          <View style={{ width: DAY_COL_WIDTH }}>
            <View
              style={{
                height: HEADER_ROW_HEIGHT,
                width: DAY_COL_WIDTH,
                backgroundColor: colors.surfaceVariant,
              }}
            />
            <View style={{ height: HEADER_RULE, width: DAY_COL_WIDTH, backgroundColor: gridLine }} />
          </View>
          <ScrollView
            ref={leftColScrollRef}
            style={[styles.dayStripScroll, { height: gridBodyScrollHeight }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEventThrottle={16}
            onScroll={onLeftColumnScroll}
          >
            {DAYS.map((day, dayIndex) => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayLabelCellFixed,
                  {
                    width: DAY_COL_WIDTH,
                    height: DATA_ROW_HEIGHT,
                    borderBottomColor: gridLine,
                    borderBottomWidth: GRID_LINE_WIDTH,
                    backgroundColor: colors.surfaceVariant,
                  },
                ]}
                onPress={() => selectFullDay(day)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayLabel, { color: colors.text }]}>{t(`driverAvailability.days.${DAY_LABEL_KEYS[dayIndex]}`)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView
          horizontal
          style={styles.hoursScroll}
          contentContainerStyle={styles.hoursScrollContent}
          showsHorizontalScrollIndicator
          nestedScrollEnabled
        >
          <View style={styles.hoursInner}>
            <View style={styles.hourHeaderStack}>
              <View style={styles.hourHeaderRowOnly}>
                {HOURS.map(hour => (
                  <View
                    key={hour}
                    style={[
                      styles.hourCell,
                      {
                        width: HOUR_COL_WIDTH,
                        height: HEADER_ROW_HEIGHT,
                        borderRightWidth: GRID_LINE_WIDTH,
                        borderRightColor: gridLine,
                        backgroundColor: colors.card,
                      },
                    ]}
                  >
                    <Text style={[styles.hourStartText, { color: colors.text }]}>{String(hour).padStart(2, '0')}:00</Text>
                    <Text style={[styles.hourEndText, { color: colors.textTertiary }]}>{String(hour + 1).padStart(2, '0')}:00</Text>
                  </View>
                ))}
              </View>
              <View
                style={{
                  height: HEADER_RULE,
                  width: HOURS.length * HOUR_COL_WIDTH,
                  backgroundColor: gridLine,
                }}
              />
            </View>
            <ScrollView
              ref={gridBodyScrollRef}
              style={[styles.gridBodyScroll, { height: gridBodyScrollHeight }]}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              scrollEventThrottle={16}
              onScroll={onGridBodyScroll}
            >
              {DAYS.map(day => (
                <View key={day} style={styles.dayRowHours}>
                  {HOURS.map(hour => (
                    <TouchableOpacity
                      key={`${day}-${hour}`}
                      style={{
                        width: HOUR_COL_WIDTH,
                        height: DATA_ROW_HEIGHT,
                        borderRightWidth: GRID_LINE_WIDTH,
                        borderRightColor: gridLine,
                        borderBottomWidth: GRID_LINE_WIDTH,
                        borderBottomColor: gridLine,
                        backgroundColor: selectedCells[`${day}-${hour}`] ? colors.primary : colors.card,
                      }}
                      onPress={() => toggleCell(day, hour)}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      </View>

      {/* Action Buttons */}
      <View style={[styles.actions, { borderTopColor: gridLine }]}>
        <TouchableOpacity style={styles.clearButton} onPress={() => setClearModalVisible(true)}>
          <Text style={styles.clearButtonText}>{t('driverAvailability.clearAll')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.saveButton,
            (saving || !isDirty || !hasAnySlot) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving || !isDirty || !hasAnySlot}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>{t('driverAvailability.save')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={savedModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSavedModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setSavedModalVisible(false)}>
          <View style={styles.savedOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View
                style={[
                  styles.savedCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    shadowColor: '#000',
                  },
                ]}
              >
                <View style={[styles.savedIconRing, { backgroundColor: colors.successBg }]}>
                  <View style={[styles.savedIconCircle, { backgroundColor: colors.success }]}>
                    <Ionicons name="checkmark" size={28} color="#fff" />
                  </View>
                </View>
                <Text style={[styles.savedTitle, { color: colors.text }]}>{t('driverAvailability.saved')}</Text>
                <Text style={[styles.savedMessage, { color: colors.textSecondary }]}>
                  {t('driverAvailability.savedBody')}
                </Text>
                <TouchableOpacity
                  style={[styles.savedOkButton, { backgroundColor: colors.primary }]}
                  onPress={() => setSavedModalVisible(false)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.ok')}
                >
                  <Text style={styles.savedOkButtonText}>{t('common.ok')}</Text>
                </TouchableOpacity>
                <Text style={[styles.savedHint, { color: colors.textTertiary }]}>{t('driverAvailability.tapOutsideClose')}</Text>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={clearModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setClearModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setClearModalVisible(false)}>
          <View style={styles.dialogOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View
                style={[
                  styles.dialogCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    shadowColor: '#000',
                  },
                ]}
              >
                <View style={[styles.clearDialogIconWrap, { backgroundColor: colors.dangerBg }]}>
                  <Ionicons name="trash-outline" size={26} color={colors.danger} />
                </View>
                <Text style={[styles.dialogTitle, { color: colors.text }]}>{t('driverAvailability.clearAllTitle')}</Text>
                <Text style={[styles.dialogBody, { color: colors.textSecondary }]}>
                  {t('driverAvailability.clearAllBody')}
                </Text>
                <View style={styles.dialogActions}>
                  <TouchableOpacity
                    style={[styles.dialogBtnSecondary, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}
                    onPress={() => setClearModalVisible(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.dialogBtnSecondaryText, { color: colors.text }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.dialogBtnDanger, { backgroundColor: colors.danger }]}
                    onPress={confirmClearAll}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.dialogBtnDangerText}>{t('driverAvailability.clearAllConfirm')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
  },
  statusToggleBtn: {
    padding: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9f9f9',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    gap: 8,
  },
  instructionsText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  gridTableWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    marginTop: 16,
    minHeight: 0,
    flexShrink: 1,
  },
  dayStrip: {
    flexDirection: 'column',
    alignSelf: 'flex-start',
    zIndex: 2,
    overflow: 'hidden',
  },
  dayStripDivider: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
  },
  dayStripScroll: {
    flexGrow: 0,
  },
  dayLabelCellFixed: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  hoursScroll: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'flex-start',
  },
  hoursScrollContent: {
    alignItems: 'flex-start',
  },
  hoursInner: {
    alignSelf: 'flex-start',
  },
  hourHeaderStack: {
    flexDirection: 'column',
  },
  hourHeaderRowOnly: {
    flexDirection: 'row',
    height: HEADER_ROW_HEIGHT,
  },
  gridBodyScroll: {
    flexGrow: 0,
  },
  dayRowHours: {
    flexDirection: 'row',
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  hourCell: {
    justifyContent: 'space-between',
    alignItems: 'stretch',
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  hourStartText: {
    fontSize: 9,
    color: '#444',
    fontWeight: '600',
    textAlign: 'left',
  },
  hourEndText: {
    fontSize: 9,
    color: '#999',
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexShrink: 0,
  },
  clearButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF3B30',
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  savedOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  savedCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  savedIconRing: {
    padding: 10,
    borderRadius: 999,
    marginBottom: 18,
  },
  savedIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  savedMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  savedHint: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 10,
  },
  savedOkButton: {
    alignSelf: 'stretch',
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedOkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  clearDialogIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 10,
  },
  dialogBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 12,
  },
  dialogBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '700',
  },
  dialogBtnDanger: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnDangerText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
