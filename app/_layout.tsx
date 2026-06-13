import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { LanguageProvider, useLanguage } from '../contexts/LanguageContext';
import { ThemedAlertProvider } from '../components/ThemedAlert';
import { AppNavigationProvider } from '../contexts/AppNavigationContext';
import GlobalErrorBoundary from '../components/GlobalErrorBoundary';
import FriendlyErrorModal from '../components/FriendlyErrorModal';
import { GameCongratsModal } from '../components/games/GameCongratsModal';
import { ApiError, setGlobalApiErrorHandler } from '../services/api/client';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  setupBackgroundHandler,
  createNotificationChannels,
  registerOrderForegroundService,
  restoreOrderTrackingForCustomer,
  restoreOrderTrackingForDriver,
  getStoredUserRole,
} from '../services/notifications';
// Register background handler at module level (required by React Native Firebase)
setupBackgroundHandler();

// Register the foreground service handler at module level
// This only registers the task runner — does NOT start the service
registerOrderForegroundService();

function RootContent() {
  const { colors, isDark } = useTheme();
  const { ready: i18nReady } = useLanguage();
  const { t } = useTranslation();
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
    if (Platform.OS !== 'android') return;
    const applySystemBottomBarTheme = async () => {
      try {
        // Lazy-require to avoid crashing if current dev build lacks ExpoNavigationBar native module.
        // In that case we silently skip and keep app booting.
        const NavigationBar = require('expo-navigation-bar');
        // `setBackgroundColorAsync` warns when edge-to-edge is enabled on current native build.
        // Keep behavior warning-free until a full native rebuild applies edgeToEdgeEnabled=false.
        await NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark');
      } catch {
        // Best effort: some devices/OS versions can ignore nav bar styling.
      }
    };
    void applySystemBottomBarTheme();
  }, [isDark]);

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
          t('globalErrors.connectionIssue'),
          t('globalErrors.connectionIssueBody'),
        );
      } else if (error.errorCode === 'UNKNOWN_ERROR' || error.statusCode >= 500) {
        showFriendlyError(
          t('globalErrors.serverBusy'),
          t('globalErrors.serverBusyBody'),
        );
      }
    };
    setGlobalApiErrorHandler(onApiError);

    const prevJsHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
    const jsHandler = (error: Error, isFatal?: boolean) => {
      const title = isFatal ? t('globalErrors.fatalAppError') : t('globalErrors.appError');
      showFriendlyError(title, t('globalErrors.appErrorBody'));
      console.error('Global JS Error:', error);
    };
    (global as any).ErrorUtils?.setGlobalHandler?.(jsHandler);

    const previousUnhandledRejection = (globalThis as any).onunhandledrejection;
    (globalThis as any).onunhandledrejection = (event: any) => {
      showFriendlyError(
        t('globalErrors.requestFailed'),
        t('globalErrors.requestFailedBody'),
      );
      console.error('Unhandled promise rejection:', event?.reason || event);
      if (event?.preventDefault) event.preventDefault();
    };

    // Create notification channels
    createNotificationChannels();

    // Register push + restore persistent order tracking on cold start (AppState "change"
    // does not fire for the initial active state, so driver tabs used to miss restore until a tab did it).
    void (async () => {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) return;
      await registerForPushNotifications();
      const role = await getStoredUserRole();
      if (role === 'CUSTOMER') await restoreOrderTrackingForCustomer();
      if (role === 'DRIVER') await restoreOrderTrackingForDriver();
      /** Cold start: session + navigator can settle late — second register avoids empty `fcm_token` on server. */
      setTimeout(() => {
        void (async () => {
          const t2 = await AsyncStorage.getItem('accessToken');
          if (t2) await registerForPushNotifications();
        })();
      }, 2000);
    })();

    // Set up foreground notification listeners
    cleanupRef.current = setupNotificationListeners();

    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active') return;
      // Re-post FCM token whenever the app returns to foreground so the backend
      // can push order updates while the app is closed (see server log: "No FCM token … skipping push").
      AsyncStorage.getItem('accessToken').then(async (accessToken) => {
        if (!accessToken) return;
        await registerForPushNotifications();
        const role = await getStoredUserRole();
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
  }, [t]);

  if (!i18nReady) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

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
        <GameCongratsModal />
      </View>
    </GlobalErrorBoundary>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <ThemedAlertProvider>
          <SafeAreaProvider>
            <AppNavigationProvider>
              <RootContent />
            </AppNavigationProvider>
          </SafeAreaProvider>
        </ThemedAlertProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
