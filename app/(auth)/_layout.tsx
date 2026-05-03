import { Stack } from 'expo-router';
import { AuthChromeHeader } from '../../components/AppChromeHeader';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: true,
        header: () => <AuthChromeHeader routeName={route.name} />,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'transparent' },
      })}
    >
      <Stack.Screen name="customer-login" />
      <Stack.Screen name="customer-forgot-password" />
      <Stack.Screen name="customer-register" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="driver-login" />
      <Stack.Screen name="driver-forgot-password" />
      <Stack.Screen name="driver-register" />
      <Stack.Screen name="driver-register-step1" />
      <Stack.Screen name="driver-register-step2" />
      <Stack.Screen name="driver-register-step3" />
      <Stack.Screen name="customer-setup" />
    </Stack>
  );
}
