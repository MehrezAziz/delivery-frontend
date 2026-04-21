import { useEffect } from 'react';
import { Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureDriverPushNotificationSetup } from '../../services/driverPushSetup';

export default function DriverLayout() {
  useEffect(() => {
    void (async () => {
      const [token, role] = await Promise.all([
        AsyncStorage.getItem('accessToken'),
        AsyncStorage.getItem('userRole'),
      ]);
      if (token && role === 'DRIVER') {
        await ensureDriverPushNotificationSetup();
      }
    })();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="my-orders" />
      <Stack.Screen name="available-orders" />
      <Stack.Screen name="order-chat" />
      <Stack.Screen name="order-detail" />
      <Stack.Screen name="address-map" />
      <Stack.Screen name="upload-proofs" />
      <Stack.Screen name="support" />
      <Stack.Screen name="support-chat" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="availability" />
      <Stack.Screen name="documents" />
      <Stack.Screen name="earnings" />
      <Stack.Screen name="transactions" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="restrictions" />
      <Stack.Screen name="verification" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="my-ratings" />
    </Stack>
  );
}
