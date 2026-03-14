import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface TimePeriod {
  startHour: number;
  endHour: number;
}

interface DayAvailability {
  dayOfWeek: string;
  timePeriods: TimePeriod[];
}

export default function DriverAvailability() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCells, setSelectedCells] = useState<{ [key: string]: boolean }>({});
  const [availabilityStatus, setAvailabilityStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

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
    } catch (error: any) {
      console.error('Load availability error:', error);
      Alert.alert('Error', 'Failed to load availability');
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

  const clearAll = () => {
    Alert.alert(
      'Clear All',
      'Are you sure you want to clear all availability?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => setSelectedCells({}) },
      ]
    );
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
      Alert.alert('Error', 'Please select at least one time slot');
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

      Alert.alert('Success', 'Availability updated successfully');
    } catch (error: any) {
      console.error('Save availability error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to save availability');
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
        'Status Updated',
        `Availability is now ${response.data.status === 'ACTIVE' ? 'active' : 'inactive'}`
      );
    } catch (error: any) {
      console.error('Toggle status error:', error);
      Alert.alert('Error', 'Failed to toggle status');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.title}>My Availability</Text>
        <TouchableOpacity onPress={toggleStatus} style={styles.statusButton}>
          <Ionicons
            name={availabilityStatus === 'ACTIVE' ? 'checkmark-circle' : 'close-circle'}
            size={28}
            color={availabilityStatus === 'ACTIVE' ? '#34C759' : '#FF3B30'}
          />
        </TouchableOpacity>
      </View>

      {/* Status Badge */}
      <View style={[
        styles.statusBadge,
        { backgroundColor: availabilityStatus === 'ACTIVE' ? '#e8f5e9' : '#ffebee' }
      ]}>
        <Text style={[
          styles.statusText,
          { color: availabilityStatus === 'ACTIVE' ? '#2e7d32' : '#c62828' }
        ]}>
          Status: {availabilityStatus}
        </Text>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Ionicons name="information-circle" size={20} color="#666" />
        <Text style={styles.instructionsText}>
          Tap cells to select hours. Tap day name to select/deselect full day.
        </Text>
      </View>

      {/* Schedule Grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.gridScroll}>
        <View>
          {/* Hour Headers */}
          <View style={styles.hourHeaderRow}>
            <View style={styles.dayLabelCell} />
            {HOURS.map(hour => (
              <View key={hour} style={styles.hourCell}>
                <Text style={styles.hourStartText}>{String(hour).padStart(2, '0')}:00</Text>
                <Text style={styles.hourEndText}>{String(hour + 1).padStart(2, '0')}:00</Text>
              </View>
            ))}
          </View>

          {/* Day Rows */}
          <ScrollView showsVerticalScrollIndicator={false}>
            {DAYS.map((day, dayIndex) => (
              <View key={day} style={styles.dayRow}>
                <TouchableOpacity
                  style={styles.dayLabelCell}
                  onPress={() => selectFullDay(day)}
                >
                  <Text style={styles.dayLabel}>{DAY_LABELS[dayIndex]}</Text>
                </TouchableOpacity>
                {HOURS.map(hour => (
                  <TouchableOpacity
                    key={`${day}-${hour}`}
                    style={[
                      styles.timeCell,
                      selectedCells[`${day}-${hour}`] && styles.timeCellSelected,
                    ]}
                    onPress={() => toggleCell(day, hour)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.clearButton} onPress={clearAll}>
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  statusButton: {
    padding: 4,
  },
  statusBadge: {
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    alignItems: 'center',
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
  gridScroll: {
    flex: 1,
    marginTop: 16,
  },
  hourHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#ddd',
  },
  dayRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dayLabelCell: {
    width: 50,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRightWidth: 2,
    borderRightColor: '#ddd',
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  hourCell: {
    width: 52,
    height: 44,
    justifyContent: 'space-between',
    alignItems: 'stretch',
    borderRightWidth: 1,
    borderRightColor: '#eee',
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
  timeCell: {
    width: 52,
    height: 40,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#eee',
  },
  timeCellSelected: {
    backgroundColor: '#007AFF',
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
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
});
