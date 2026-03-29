import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerForPushNotifications,
  setupNotificationResponseListener,
  setupNotificationReceivedListener,
  handleDataMessage,
} from '../services/notifications';

export default function RootLayout() {
  const responseListener = useRef<Notifications.Subscription>();
  const receivedListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Register push notifications if user is logged in
    AsyncStorage.getItem('accessToken').then((token) => {
      if (token) {
        registerForPushNotifications();
      }
    });

    // Set up notification listeners
    receivedListener.current = setupNotificationReceivedListener();
    responseListener.current = setupNotificationResponseListener();

    return () => {
      if (receivedListener.current) {
        Notifications.removeNotificationSubscription(receivedListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
