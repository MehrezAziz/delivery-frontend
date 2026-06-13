import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

/**
 * Completing verification later uses the same native liveness + documents flow as registration step 3.
 */
export default function DriverVerification() {
  const router = useRouter();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        if (!token) {
          router.replace('/(auth)/driver-login');
          setBusy(false);
          return;
        }

        const response = await axios.get(`${API_URL}/drivers/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.data.status === 'VERIFIED') {
          Alert.alert(t('driverVerification.alreadyVerifiedTitle'), t('driverVerification.alreadyVerifiedBody'), [
            { text: t('common.ok'), onPress: () => router.replace('/(driver)/home') },
          ]);
          setBusy(false);
          return;
        }
        if (response.data.status === 'PENDING_REVIEW') {
          Alert.alert(t('driverVerification.underReviewTitle'), t('driverVerification.underReviewBody'), [
            { text: t('common.ok'), onPress: () => router.replace('/(driver)/home') },
          ]);
          setBusy(false);
          return;
        }
      } catch {
        // If status check fails, still offer the unified verification screen.
      }

      setBusy(false);
      router.replace('/(auth)/driver-register-step3?source=verification');
    })();
  }, [router, t]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      {busy ? <ActivityIndicator size="large" /> : null}
    </View>
  );
}
