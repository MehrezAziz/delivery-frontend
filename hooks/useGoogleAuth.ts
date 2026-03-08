import { useState, useEffect, useRef } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

WebBrowser.maybeCompleteAuthSession();

// Use environment variable for API URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

// Google OAuth Client IDs
const GOOGLE_WEB_CLIENT_ID = '295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com';
// Add your Android Client ID here after creating it in Google Console
const GOOGLE_ANDROID_CLIENT_ID = '295733709390-ksq2ukvkeo9vb6a656gie0e9qvj5e8f8.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';

export const useGoogleAuth = (role: 'CUSTOMER' | 'DRIVER', referralCode?: string) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processedResponse = useRef(false);

  // Use the standard useIdTokenAuthRequest with platform-specific client IDs
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    {
      clientId: GOOGLE_WEB_CLIENT_ID,
      androidClientId: GOOGLE_ANDROID_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
    }
  );

  // Log request details
  useEffect(() => {
    if (request) {
      console.log('OAuth Request created');
      console.log('Client ID:', GOOGLE_WEB_CLIENT_ID);
      console.log('Android Client ID:', GOOGLE_ANDROID_CLIENT_ID);
    }
  }, [request]);

  // Handle response automatically when it comes back
  useEffect(() => {
    if (response && !processedResponse.current) {
      console.log('Google Auth Response type:', response.type);
      
      if (response.type === 'success') {
        processedResponse.current = true;
        handleAuthResponse(response);
      } else if (response.type === 'error') {
        console.error('Auth error:', response.error);
        console.error('Error params:', response.params);
        setError(response.error?.message || 'Authentication failed');
        setIsLoading(false);
      } else if (response.type === 'dismiss' || response.type === 'cancel') {
        console.log('Auth cancelled');
        setIsLoading(false);
      } else {
        console.log('Unknown response type:', response.type);
        console.log('Response:', JSON.stringify(response, null, 2));
      }
    }
  }, [response]);

  const handleAuthResponse = async (result: any) => {
    try {
      const { id_token } = result.params;
      
      if (!id_token) {
        throw new Error('No ID token received from Google');
      }

      console.log('Sending ID token to backend...');
      const backendResponse = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: id_token,
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
    } catch (err: any) {
      console.error('Error handling auth response:', err);
      setError(err.message || 'Failed to authenticate with Google');
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    processedResponse.current = false;

    try {
      console.log('Starting Google Sign-In...');
      console.log('Using Web Client ID:', GOOGLE_WEB_CLIENT_ID);
      console.log('Using Android Client ID:', GOOGLE_ANDROID_CLIENT_ID);
      
      const result = await promptAsync();
      console.log('Prompt completed with type:', result?.type);
      
      // Return a result for backward compatibility
      if (result?.type === 'success') {
        return { success: true };
      } else {
        setIsLoading(false);
        return { success: false, error: 'Sign-in was cancelled' };
      }
    } catch (err: any) {
      console.error('Error starting Google Sign-In:', err);
      setError(err.message || 'Failed to start Google Sign-In');
      setIsLoading(false);
      return { success: false, error: err.message };
    }
  };

  return {
    handleGoogleSignIn,
    isLoading,
    error,
    request,
  };
};
