import { useState } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';

// Use environment variable for API URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api');

// Google OAuth Client IDs
const GOOGLE_WEB_CLIENT_ID = '295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com';

// Configure Google Sign-In
GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID, // Used for Android and backend verification
  iosClientId: GOOGLE_IOS_CLIENT_ID, // Used for iOS
  offlineAccess: true, // If you need to access Google API on behalf of the user FROM YOUR SERVER
});

export const useGoogleAuth = (role: 'CUSTOMER' | 'DRIVER', referralCode?: string) => {
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
      
      // Sign in with Google
      const userInfo = await GoogleSignin.signIn();
      console.log('Google Sign-In successful:', userInfo);
      
      // Get the ID token from the user object
      const tokens = await GoogleSignin.getTokens();
      const idToken = tokens.idToken;
      
      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      console.log('Sending ID token to backend...');
      
      // Send ID token to backend
      const backendResponse = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: idToken,
          role,
          referralCode,
        }),
      });

      const data = await backendResponse.json();
      console.log('Backend response status:', backendResponse.status);
      
      if (!backendResponse.ok) {
        throw new Error(data.message || 'Google authentication failed');
      }

      // Store tokens
      await AsyncStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        await AsyncStorage.setItem('refreshToken', data.refreshToken);
      }

      // Store user and customer data
      if (data.user && data.customer) {
        await AsyncStorage.setItem('user', JSON.stringify(data.user));
        await AsyncStorage.setItem('customer', JSON.stringify(data.customer));
      }

      console.log('Authentication successful! Navigating...');
      setIsLoading(false);
      
      // Navigate to customer home
      router.replace('/(customer)/home');
      
      return { success: true };
    } catch (err: any) {
      console.error('Error during Google Sign-In:', err);
      
      // Handle specific error codes
      let errorMessage = 'Failed to sign in with Google';
      
      if (err.code === 'SIGN_IN_CANCELLED') {
        errorMessage = 'Sign-in was cancelled';
      } else if (err.code === 'IN_PROGRESS') {
        errorMessage = 'Sign-in is already in progress';
      } else if (err.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        errorMessage = 'Google Play Services not available';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setIsLoading(false);
      
      return { success: false, error: errorMessage };
    }
  };

  return {
    handleGoogleSignIn,
    isLoading,
    error,
  };
};
