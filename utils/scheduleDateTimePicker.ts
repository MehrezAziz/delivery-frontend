import { Platform } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { clampMinSchedule } from './schedPublishHelpers';

const MIN_LEAD_MS = 60_000;

function mergeDatePart(base: Date, picked: Date): Date {
  const next = new Date(base);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return next;
}

function mergeTimePart(base: Date, picked: Date): Date {
  const next = new Date(base);
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}

/**
 * Android: native date dialog, then time dialog (recommended imperative API).
 * Returns the combined local date/time, or null if the user cancels.
 */
export function pickScheduleDateTimeAndroid(initial: Date): Promise<Date | null> {
  if (Platform.OS !== 'android') {
    return Promise.resolve(clampMinSchedule(initial));
  }

  let working = clampMinSchedule(new Date(initial));
  const minimumDate = new Date(Date.now() + MIN_LEAD_MS);

  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: working,
      mode: 'date',
      minimumDate,
      onDismiss: () => resolve(null),
      onValueChange: (_event, date) => {
        if (!date) {
          resolve(null);
          return;
        }
        working = mergeDatePart(working, date);
        DateTimePickerAndroid.open({
          value: working,
          mode: 'time',
          is24Hour: true,
          onDismiss: () => resolve(null),
          onValueChange: (_timeEvent, timeDate) => {
            if (!timeDate) {
              resolve(null);
              return;
            }
            resolve(clampMinSchedule(mergeTimePart(working, timeDate)));
          },
        });
      },
    });
  });
}

/** Open platform-appropriate date+time picker; returns null if cancelled (Android only). */
export async function pickScheduleDateTime(initial: Date): Promise<Date | null> {
  if (Platform.OS === 'android') {
    return pickScheduleDateTimeAndroid(initial);
  }
  return clampMinSchedule(initial);
}
