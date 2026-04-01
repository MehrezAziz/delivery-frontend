import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  setupBackgroundHandler,
  createNotificationChannels,
  registerOrderForegroundService,
  restoreOrderTrackingForCustomer,
  restoreOrderTrackingForDriver,
} from '../services/notifications';
// Register background handler at module level (required by React Native Firebase)
setupBackgroundHandler();

// Register the foreground service handler at module level
// This only registers the task runner — does NOT start the service
registerOrderForegroundService();

function RootContent() {
  const { isDark } = useTheme();
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Create notification channels
    createNotificationChannels();

    // Register push notifications if user is logged in
    AsyncStorage.getItem('accessToken').then((token) => {
      if (token) {
        registerForPushNotifications();
      }
    });

    // Set up foreground notification listeners
    cleanupRef.current = setupNotificationListeners();

    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active') return;
      // Re-post FCM token whenever the app returns to foreground so the backend
      // can push order updates while the app is closed (see server log: "No FCM token … skipping push").
      AsyncStorage.getItem('accessToken').then(async (accessToken) => {
        if (!accessToken) return;
        await registerForPushNotifications();
        const role = await AsyncStorage.getItem('userRole');
        if (role === 'CUSTOMER') await restoreOrderTrackingForCustomer();
        if (role === 'DRIVER') await restoreOrderTrackingForDriver();
      });
    };
    const appStateSub = AppState.addEventListener('change', onAppState);

    return () => {
      appStateSub.remove();
      cleanupRef.current?.();
    };
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <RootContent />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
