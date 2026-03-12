import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Configure Google Sign-In
GoogleSignin.configure({
  webClientId: '295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com',
  iosClientId: '295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com',
  offlineAccess: true,
});

export default function DriverLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    // Validation
    if (!phone || !password) {
      Alert.alert('Error', 'Please enter phone and password');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/driver/login`, {
        phone,
        password,
      });

      // Store tokens
      await AsyncStorage.setItem('accessToken', response.data.accessToken);
      await AsyncStorage.setItem('refreshToken', response.data.refreshToken);
      await AsyncStorage.setItem('userRole', 'DRIVER');

      // Get driver profile to extract IDs
      const profileResponse = await axios.get(`${API_URL}/drivers/me`, {
        headers: {
          Authorization: `Bearer ${response.data.accessToken}`,
        },
      });

      await AsyncStorage.setItem('userId', profileResponse.data.user.id);
      await AsyncStorage.setItem('driverId', profileResponse.data.id);

      // Navigate to driver home
      router.replace('/(driver)/home');
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert(
        'Login Failed',
        error.response?.data?.message || 'Invalid credentials'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      
      // Force sign out to show account picker
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        // Ignore
      }
      
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      
      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      // Send to backend for login
      const backendResponse = await axios.post(`${API_URL}/auth/driver/google/login`, {
        idToken,
      });

      // Store tokens
      await AsyncStorage.setItem('accessToken', backendResponse.data.accessToken);
      await AsyncStorage.setItem('refreshToken', backendResponse.data.refreshToken);
      await AsyncStorage.setItem('userRole', 'DRIVER');

      // Get driver profile to extract IDs
      const profileResponse = await axios.get(`${API_URL}/drivers/me`, {
        headers: {
          Authorization: `Bearer ${backendResponse.data.accessToken}`,
        },
      });

      await AsyncStorage.setItem('userId', profileResponse.data.user.id);
      await AsyncStorage.setItem('driverId', profileResponse.data.id);

      // Navigate to driver home
      router.replace('/(driver)/home');
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      
      let errorMessage = 'Failed to sign in with Google';
      if (error.code === 'SIGN_IN_CANCELLED') {
        errorMessage = 'Sign-in was cancelled';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Google Sign-In Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Driver Login</Text>
        <Text style={styles.subtitle}>Welcome back!</Text>
      </View>

      {/* Phone Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          placeholder="+1234567890"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
      </View>

      {/* Password Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeIcon}
          >
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={24}
              color="#666"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Login Button */}
      <TouchableOpacity
        style={[styles.loginButton, loading && styles.loginButtonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginButtonText}>Login</Text>
        )}
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Google Login Button */}
      <TouchableOpacity
        style={styles.googleButton}
        onPress={handleGoogleLogin}
      >
        <Ionicons name="logo-google" size={24} color="#DB4437" />
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      </TouchableOpacity>

      {/* Register Link */}
      <TouchableOpacity
        style={styles.registerLink}
        onPress={() => router.push('/(auth)/driver-register-step1')}
      >
        <Text style={styles.registerLinkText}>
          Don't have an account? <Text style={styles.registerLinkBold}>Register</Text>
        </Text>
      </TouchableOpacity>

      {/* Forgot Password */}
      <TouchableOpacity style={styles.forgotPassword}>
        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    marginBottom: 40,
    marginTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 12,
  },
  loginButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 30,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#999',
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    gap: 12,
  },
  googleButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  registerLink: {
    marginTop: 30,
    alignItems: 'center',
  },
  registerLinkText: {
    fontSize: 16,
    color: '#666',
  },
  registerLinkBold: {
    color: '#007AFF',
    fontWeight: '600',
  },
  forgotPassword: {
    marginTop: 16,
    marginBottom: 40,
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: 16,
    color: '#007AFF',
  },
});
