import { Stack } from 'expo-router';

export default function DriverLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="my-orders" />
      <Stack.Screen name="available-orders" />
      <Stack.Screen name="order-chat" />
      <Stack.Screen name="upload-proofs" />
      <Stack.Screen name="support" />
      <Stack.Screen name="support-chat" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="availability" />
      <Stack.Screen name="documents" />
      <Stack.Screen name="earnings" />
      <Stack.Screen name="transactions" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="restrictions" />
      <Stack.Screen name="verification" />
    </Stack>
  );
}
