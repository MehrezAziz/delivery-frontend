import { useState } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { saveLoginTimestamp } from '../services/auth-session';
import {
  registerForPushNotifications,
  restoreOrderTrackingForCustomer,
  restoreOrderTrackingForDriver,
} from '../services/notifications';
import { persistDriverIdentityFromMe } from '../utils/persistDriverIdentity';
import {
  describeGoogleSignInSetupError,
} from '../config/googleSignIn';

// Use environment variable for API URL
// For physical device with USB + ADB reverse, use localhost
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 
  (Platform.OS === 'android' ? 'http://localhost:3000/api' : 'http://localhost:3000/api');

export const useGoogleAuth = (
  role: 'CUSTOMER' | 'DRIVER',
  referralCode?: string,
  isLogin: boolean = false,
  acceptTerms?: boolean,
) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('Starting Google Sign-In...');
      
      // Check if Google Play Services are available (Android only)
      await GoogleSignin.hasPlayServices();
      
      // Force sign out to clear cached account and show account picker
      try {
        await GoogleSignin.signOut();
        console.log('Cleared cached Google account');
      } catch (signOutError) {
        // Ignore sign out errors (user might not be signed in)
        console.log('Sign out skipped (no cached account)');
      }
      
      // Sign in with Google - now shows account picker
      const response = await GoogleSignin.signIn();
      console.log('Google Sign-In successful:', response);
      
      // Extract ID token from response
      // The response structure is: { type: 'success', data: { idToken, user, ... } }
      const idToken = response.data?.idToken;
      
      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      console.log('Sending ID token to backend...');
      
      // Backend uses /auth/google for both login and registration
      const endpoint = '/auth/google';
      console.log('Backend URL:', `${API_BASE_URL}${endpoint}`);
      
      // Send ID token to backend
      const backendResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: idToken,
          role,
          referralCode: isLogin ? undefined : referralCode, // Only send referral code for registration
          isLoginOnly: isLogin, // Tell backend whether this is login-only
          ...(role === 'CUSTOMER' && !isLogin ? { acceptTerms: acceptTerms === true } : {}),
        }),
      });

      const data = await backendResponse.json();
      console.log('Backend response status:', backendResponse.status);
      console.log('Backend response data:', data);
      
      if (!backendResponse.ok) {
        const errorMessage = data.message || 'Google authentication failed';
        // Attach errorCode for callers to handle specific cases
        const err = new Error(errorMessage) as any;
        err.errorCode = data.message === 'ACCOUNT_EXISTS' ? 'ACCOUNT_EXISTS' : undefined;
        throw err;
      }

      // Store tokens
      await AsyncStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        await AsyncStorage.setItem('refreshToken', data.refreshToken);
      }
      await AsyncStorage.setItem('userRole', role);
      await saveLoginTimestamp();

      // Store user and customer/driver data if provided (new registration)
      if (data.user && data.customer) {
        await AsyncStorage.setItem('user', JSON.stringify(data.user));
        await AsyncStorage.setItem('customer', JSON.stringify(data.customer));
      } else if (data.user && data.driver) {
        await AsyncStorage.setItem('user', JSON.stringify(data.user));
        await AsyncStorage.setItem('driver', JSON.stringify(data.driver));
      } else {
        // For existing users (login), fetch profile data
        console.log('Fetching user profile...');
        const profileEndpoint = role === 'CUSTOMER' ? '/customers/me' : '/drivers/me';
        
        const profileResponse = await fetch(`${API_BASE_URL}${profileEndpoint}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.accessToken}`,
          },
        });

        if (profileResponse.ok) {
          const profileData = await profileResponse.json();

          if (role === 'CUSTOMER') {
            await AsyncStorage.setItem('user', JSON.stringify(profileData.user));
            await AsyncStorage.setItem('customer', JSON.stringify({
              id: profileData.id,
              userId: profileData.userId,
              completedOrders: profileData.completedOrders,
              customerStatus: profileData.customerStatus,
              referredByCodeId: profileData.referredByCodeId,
            }));
          } else {
            await persistDriverIdentityFromMe(profileData);
          }
        } else {
          console.error('Failed to fetch profile:', await profileResponse.text());
        }
      }

      console.log('Authentication successful! Navigating...');
      setIsLoading(false);
      
      // Navigate based on role
      await registerForPushNotifications();
      if (role === 'CUSTOMER') {
        await restoreOrderTrackingForCustomer();
        router.replace('/(customer)/home');
      } else {
        await restoreOrderTrackingForDriver();
        router.replace('/(driver)/home');
      }
      
      return { success: true };
    } catch (err: any) {
      console.error('Error during Google Sign-In:', err);
      console.error('Error details:', JSON.stringify(err, null, 2));
      
      // Handle specific error codes
      let errorMessage = 'Failed to sign in with Google';

      const setupHint = describeGoogleSignInSetupError(err);
      if (setupHint) {
        errorMessage = setupHint;
      } else if (err.code === 'SIGN_IN_CANCELLED') {
        errorMessage = 'Sign-in was cancelled';
      } else if (err.code === 'IN_PROGRESS') {
        errorMessage = 'Sign-in is already in progress';
      } else if (err.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        errorMessage = 'Google Play Services not available';
      } else if (err.message && err.message.includes('Network request failed')) {
        errorMessage = 'Cannot connect to server. Make sure the backend is running and accessible.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setIsLoading(false);
      
      return { success: false, error: errorMessage, errorCode: (err as any).errorCode };
    }
  };

  return {
    handleGoogleSignIn,
    isLoading,
    error,
  };
};
