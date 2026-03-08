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
const GOOGLE_ANDROID_CLIENT_ID = '295733709390-ksq2ukvkeo9vb6a656gie0e9qvj5e8f8.apps.googleusercontent.com';

export const useGoogleAuth = (role: 'CUSTOMER' | 'DRIVER', referralCode?: string) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processedResponse = useRef(false);

  // Use Expo's auth proxy for proper OAuth flow
  const [request, response, promptAsync] = Google.useAuthRequest(
    {
      clientId: GOOGLE_WEB_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      redirectUri: 'https://auth.expo.io/@aziz_mehrez/delivery-frontend',
    }
  );

  // Log request details including redirect URI
  useEffect(() => {
    if (request) {
      console.log('OAuth Request created');
      console.log('Web Client ID:', GOOGLE_WEB_CLIENT_ID);
      console.log('Redirect URI:', request.redirectUri);
      console.log('Code Challenge Method:', request.codeChallengeMethod);
      console.log('Response Type:', request.responseType);
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
      const { code } = result.params;
      
      if (!code) {
        throw new Error('No authorization code received from Google');
      }

      console.log('Exchanging code for tokens...');
      
      // Exchange the authorization code for tokens using Google's token endpoint
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_WEB_CLIENT_ID,
          redirect_uri: 'https://auth.expo.io/@aziz_mehrez/delivery-frontend',
          grant_type: 'authorization_code',
          code_verifier: request?.codeVerifier || '',
        }).toString(),
      });

      const tokenData = await tokenResponse.json();
      
      if (!tokenResponse.ok) {
        throw new Error(tokenData.error_description || 'Failed to exchange code for tokens');
      }

      const { id_token } = tokenData;
      
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
