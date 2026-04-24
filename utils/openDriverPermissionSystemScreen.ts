import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

/** Which permission row the driver tapped — maps to the closest system screen. */
export type DriverPermissionScreenTarget = 'notifications' | 'foregroundLocation' | 'backgroundLocation';

function resolveAndroidPackageName(): string | null {
  return (
    Application.applicationId ||
    (Constants.expoConfig?.android?.package as string | undefined) ||
    null
  );
}

async function openAndroidApplicationDetails(packageName: string): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
      data: `package:${packageName}`,
    });
  } catch {
    await Linking.openSettings();
  }
}

/**
 * Opens the system UI / settings that match each permission row.
 * - Android notifications → this app’s notification settings (when supported).
 * - Android foreground location → in-app permission prompt first, then App info if still denied.
 * - Android background location → ensures foreground is granted, then Android’s **Allow all the time**
 *   system flow (`requestBackgroundPermissionsAsync`), then App info if still denied (not the same as row 2 only).
 * - iOS → in-app prompts where Expo supports them, then this app’s Settings page.
 */
export async function openDriverPermissionSystemScreen(target: DriverPermissionScreenTarget): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  if (Platform.OS === 'ios') {
    if (target === 'notifications') {
      await Notifications.requestPermissionsAsync();
      await Linking.openSettings();
      return;
    }
    const fg = await Location.requestForegroundPermissionsAsync();
    if (target === 'foregroundLocation') {
      if (fg.status !== 'granted') {
        await Linking.openSettings();
      }
      return;
    }
    // backgroundLocation
    if (fg.status !== 'granted') {
      await Location.requestForegroundPermissionsAsync();
    }
    await Location.requestBackgroundPermissionsAsync();
    await Linking.openSettings();
    return;
  }

  const pkg = resolveAndroidPackageName();
  if (!pkg) {
    await Linking.openSettings();
    return;
  }

  try {
    if (target === 'notifications') {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS, {
        extra: {
          'android.provider.extra.APP_PACKAGE': pkg,
        },
      });
      return;
    }

    if (target === 'foregroundLocation') {
      const r = await Location.requestForegroundPermissionsAsync();
      if (r.status !== 'granted') {
        await openAndroidApplicationDetails(pkg);
      }
      return;
    }

    // backgroundLocation — distinct from foreground: use the OS “all the time” / background flow first.
    const fgNow = await Location.getForegroundPermissionsAsync();
    if (fgNow.status !== 'granted') {
      const r = await Location.requestForegroundPermissionsAsync();
      if (r.status !== 'granted') {
        await openAndroidApplicationDetails(pkg);
        return;
      }
    }

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      await openAndroidApplicationDetails(pkg);
    }
  } catch {
    await Linking.openSettings();
  }
}

/**
 * Opens battery / “unrestricted” controls for this app (Android). Optional after background location is granted.
 */
export async function openAndroidBatteryOptimizationForApp(): Promise<void> {
  if (Platform.OS !== 'android') {
    await Linking.openSettings();
    return;
  }
  const pkg = resolveAndroidPackageName();
  if (!pkg) {
    await Linking.openSettings();
    return;
  }
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
      data: `package:${pkg}`,
    });
  } catch {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
    } catch {
      await openAndroidApplicationDetails(pkg);
    }
  }
}
