import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { ThemedAlertProvider } from '../components/ThemedAlert';
import { AppNavigationProvider } from '../contexts/AppNavigationContext';
import GlobalErrorBoundary from '../components/GlobalErrorBoundary';
import FriendlyErrorModal from '../components/FriendlyErrorModal';
import { ApiError, setGlobalApiErrorHandler } from '../services/api/client';
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
  const { colors, isDark } = useTheme();
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastErrorShownAtRef = useRef(0);
  const [friendlyError, setFriendlyError] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  useEffect(() => {
    const showFriendlyError = (title: string, message: string) => {
      const now = Date.now();
      if (now - lastErrorShownAtRef.current < 2500) return;
      lastErrorShownAtRef.current = now;
      setFriendlyError({ visible: true, title, message });
    };

    const onApiError = (error: ApiError) => {
      if (error.errorCode === 'NETWORK_ERROR' || error.statusCode === 0) {
        showFriendlyError(
          'Connection issue 🌐',
          'We could not reach the server right now. Please check your internet and try again in a moment.',
        );
      } else if (error.errorCode === 'UNKNOWN_ERROR' || error.statusCode >= 500) {
        showFriendlyError(
          'Server busy 🛠️',
          'Our service is temporarily unavailable. Please try again shortly.',
        );
      }
    };
    setGlobalApiErrorHandler(onApiError);

    const prevJsHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
    const jsHandler = (error: Error, isFatal?: boolean) => {
      const title = isFatal ? 'Unexpected app error 😵‍💫' : 'Something went wrong ⚠️';
      showFriendlyError(
        title,
        'An unexpected error happened. Please retry. If the issue continues, restart the app.',
      );
      console.error('Global JS Error:', error);
    };
    (global as any).ErrorUtils?.setGlobalHandler?.(jsHandler);

    const previousUnhandledRejection = (globalThis as any).onunhandledrejection;
    (globalThis as any).onunhandledrejection = (event: any) => {
      showFriendlyError(
        'Request failed ⚠️',
        'A background request failed unexpectedly. Please try your action again.',
      );
      console.error('Unhandled promise rejection:', event?.reason || event);
      if (event?.preventDefault) event.preventDefault();
    };

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
      setGlobalApiErrorHandler(null);
      if ((global as any).ErrorUtils?.setGlobalHandler && prevJsHandler) {
        (global as any).ErrorUtils.setGlobalHandler(prevJsHandler);
      }
      (globalThis as any).onunhandledrejection = previousUnhandledRejection;
    };
  }, []);

  return (
    <GlobalErrorBoundary>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }} />
        <FriendlyErrorModal
          visible={friendlyError.visible}
          title={friendlyError.title}
          message={friendlyError.message}
          onClose={() => setFriendlyError((prev) => ({ ...prev, visible: false }))}
        />
      </View>
    </GlobalErrorBoundary>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedAlertProvider>
        <SafeAreaProvider>
          <AppNavigationProvider>
            <RootContent />
          </AppNavigationProvider>
        </SafeAreaProvider>
      </ThemedAlertProvider>
    </ThemeProvider>
  );
}
