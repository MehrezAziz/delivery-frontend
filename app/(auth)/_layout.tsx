import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="customer-login" />
      <Stack.Screen name="customer-register" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="driver-login" />
      <Stack.Screen name="driver-register" />
    </Stack>
  );
}
