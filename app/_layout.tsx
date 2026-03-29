import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  setupBackgroundHandler,
  createNotificationChannels,
  registerOrderForegroundService,
} from '../services/notifications';

// Register background handler at module level (required by React Native Firebase)
setupBackgroundHandler();

// Register the foreground service handler at module level
// This only registers the task runner — does NOT start the service
registerOrderForegroundService();

export default function RootLayout() {
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

    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
