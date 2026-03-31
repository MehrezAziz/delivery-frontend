import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Platform, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { saveLoginTimestamp } from '../../services/auth-session';
import { registerForPushNotifications, restoreOrderTrackingForCustomer } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';

// For Android emulator, use 10.0.2.2 instead of localhost
// For physical device with USB + ADB reverse, use localhost
// For physical device on WiFi, use your computer's IP address (e.g., 192.168.1.x)
// For iOS simulator, localhost works fine
const API_BASE_URL = Platform.OS === 'android' 
  ? 'http://localhost:3000/api'  // USB with ADB reverse
  : 'http://localhost:3000/api'; // iOS simulator or web

export default function CustomerLoginScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google Auth - pass isLogin: true to prevent auto-registration
  const { handleGoogleSignIn, isLoading: isGoogleLoading, error: googleError } = useGoogleAuth('CUSTOMER', undefined, true);

  const handleLogin = async () => {
    // Reset error
    setError(null);

    // Basic validation
    if (!phone || !password) {
      setError('Phone and password are required');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    // Start submission
    setIsSubmitting(true);

    try {
      console.log('API_BASE_URL:', API_BASE_URL);
      console.log('Attempting login to:', `${API_BASE_URL}/auth/user/login`);
      
      // Call login API using fetch
      const response = await fetch(`${API_BASE_URL}/auth/user/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone,
          password,
          role: 'CUSTOMER',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 404 || data.message?.includes('not found') || data.message?.includes('does not exist')) {
          throw new Error('Account not found. Please register first.');
        }
        if (response.status === 401 || data.message?.includes('Invalid credentials')) {
          throw new Error('Invalid phone number or password.');
        }
        // Handle error response
        throw new Error(data.message || 'Login failed. Please check your credentials.');
      }

      // Store JWT token in AsyncStorage
      await AsyncStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        await AsyncStorage.setItem('refreshToken', data.refreshToken);
      }
      await AsyncStorage.setItem('userRole', 'CUSTOMER');
      await saveLoginTimestamp();

      // Fetch user profile to store user and customer data
      const profileResponse = await fetch(`${API_BASE_URL}/customers/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.accessToken}`,
        },
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        
        // profileData structure from CustomerResponseDto:
        // { id, userId, completedOrders, customerStatus, referredByCodeId, user: {...}, myReferralCode: {...} }
        
        // Store user data
        await AsyncStorage.setItem('user', JSON.stringify({
          id: profileData.user.id,
          phone: profileData.user.phone,
          firstName: profileData.user.firstName,
          secondName: profileData.user.secondName,
          image: profileData.user.image,
          myEmail: profileData.user.myEmail,
          role: 'CUSTOMER',
          createdAt: new Date().toISOString(), // We don't have this from the response
        }));
        
        // Store customer data
        await AsyncStorage.setItem('customer', JSON.stringify({
          id: profileData.id,
          userId: profileData.userId,
          completedOrders: profileData.completedOrders,
          customerStatus: profileData.customerStatus || 'ACTIVE',
          referredByCodeId: profileData.referredByCodeId,
        }));
      } else {
        console.error('Failed to fetch profile:', await profileResponse.text());
      }

      // Register for push notifications after successful login
      await registerForPushNotifications();
      await restoreOrderTrackingForCustomer();

      // Navigate to customer home screen
      router.replace('/(customer)/home');
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    const result = await handleGoogleSignIn();
    if (result.success) {
      router.replace('/(customer)/home');
    } else if (result.error) {
      setError(result.error);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.card }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <TouchableOpacity 
            onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
            style={[styles.backBtn, { backgroundColor: colors.surfaceVariant }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primary }]}>
              <Text style={styles.iconText}>📦</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Welcome Back</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Login to your customer account</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Phone Number</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder="+216 XX XXX XXX"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder="Enter your password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!isSubmitting}
              />
            </View>

            <TouchableOpacity style={styles.forgotButton}>
              <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Error Display */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity 
              style={[
                styles.loginButton,
                { backgroundColor: colors.primary, shadowColor: colors.primary },
                isSubmitting && styles.loginButtonDisabled
              ]}
              onPress={handleLogin}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <View style={styles.loginButtonContent}>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.loginButtonText}>Logging in...</Text>
                </View>
              ) : (
                <Text style={styles.loginButtonText}>Login</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>OR</Text>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </View>

            {/* Google Sign-In Button */}
            <TouchableOpacity 
              style={[
                styles.googleButton,
                { backgroundColor: colors.card, borderColor: colors.border },
                isGoogleLoading && styles.googleButtonDisabled
              ]}
              onPress={handleGoogleLogin}
              disabled={isGoogleLoading || isSubmitting}
              activeOpacity={0.8}
            >
              {isGoogleLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={[styles.googleButtonText, { color: colors.text }]}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.registerLink}>
              <Text style={[styles.registerText, { color: colors.textSecondary }]}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/customer-register')}>
                <Text style={[styles.registerLinkText, { color: colors.primary }]}>Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginBottom:40,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 32,
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  header: {
    marginBottom: 48,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontWeight: '600',
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
  },
  forgotButton: {
    alignSelf: 'flex-end',
  },
  forgotText: {
    fontWeight: '500',
    fontSize: 15,
  },
  errorContainer: {
    flexDirection: 'row',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 20,
    color: '#ef4444',
  },
  errorText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    paddingVertical: 16,
    borderRadius: 12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginTop: 8,
  },
  loginButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loginButtonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  googleButton: {
    borderWidth: 1,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  registerLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  registerText: {
    fontSize: 15,
  },
  registerLinkText: {
    fontWeight: '600',
    fontSize: 15,
  },
});
