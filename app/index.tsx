import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSessionValid, clearSession } from '../services/auth-session';
import { resolveLaunchRouteAfterLogin, stopOrderTrackingSilently } from '../services/notifications';
import { useTheme } from '../contexts/ThemeContext';
import { AppChromeHeader } from '../components/AppChromeHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { warmupPhoneCountriesData } from '../services/phone-countries';

export default function RoleSelectionScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(true);
  const [selectedRole, setSelectedRole] = useState<'CUSTOMER' | 'DRIVER'>('CUSTOMER');

  useEffect(() => {
    checkExistingSession();
    void warmupPhoneCountriesData();
  }, []);

  async function checkExistingSession() {
    try {
      const valid = await isSessionValid();
      if (valid) {
        const launchRoute = await resolveLaunchRouteAfterLogin();
        if (launchRoute) {
          router.replace(launchRoute as any);
          return;
        }

        // Session is still valid — redirect to the right home screen
        const userRole = await AsyncStorage.getItem('userRole');
        const customer = await AsyncStorage.getItem('customer');
        const driver = await AsyncStorage.getItem('driver');

        if (userRole === 'DRIVER' || driver) {
          router.replace('/(driver)/home');
          return;
        }
        if (userRole === 'CUSTOMER' || customer) {
          router.replace('/(customer)/home');
          return;
        }
      } else {
        // Session expired or no token — clear stale data
        await stopOrderTrackingSilently();
        await clearSession();
      }
    } catch (e) {
      console.error('Session check error:', e);
      await stopOrderTrackingSilently();
      await clearSession();
    }
    setChecking(false);
  }

  if (checking) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const goToLoginForRole = (role: 'CUSTOMER' | 'DRIVER') => {
    router.push(role === 'CUSTOMER' ? '/(auth)/customer-login' : '/(auth)/driver-login');
  };

  const handleRoleCardPress = (role: 'CUSTOMER' | 'DRIVER') => {
    if (selectedRole === role) {
      goToLoginForRole(role);
    } else {
      setSelectedRole(role);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppChromeHeader role="guest" title="Local Smart Delivery" hideBack showMenu={false} showThemeToggle={false} showProfile={false} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(40, insets.bottom + 24) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.heroBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.heroBadgeText, { color: colors.primary }]}>Fast delivery</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Deliver anything, faster and smarter</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Reliable pickup and delivery for customers, with earning opportunities for drivers.
          </Text>
        </View>

        <Text style={[styles.roleHeading, { color: colors.text }]}>Choose your role</Text>
        <View style={styles.cardsContainer}>
          <TouchableOpacity
            style={[
              styles.card,
              { borderColor: colors.border },
              selectedRole === 'CUSTOMER'
                ? [styles.cardActiveCustomer, { backgroundColor: isDark ? '#1e3a5f' : '#eff6ff', borderColor: isDark ? '#60a5fa' : '#2563eb' }]
                : { backgroundColor: colors.card },
            ]}
            onPress={() => handleRoleCardPress('CUSTOMER')}
            activeOpacity={0.9}
          >
            <View
              style={[
                styles.cardIcon,
                selectedRole === 'CUSTOMER' && [styles.cardIconActiveCustomer, { backgroundColor: isDark ? '#0c4a6e' : '#dbeafe' }],
              ]}
            >
              <Text style={styles.cardIconText}>📦</Text>
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Customer</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                Create delivery orders, save frequent addresses, and track every step.
              </Text>
            </View>
            <Text style={[styles.cardState, { color: colors.textTertiary }, selectedRole === 'CUSTOMER' && { color: colors.primary }]}>
              {selectedRole === 'CUSTOMER' ? 'Continue' : 'Select'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.card,
              { borderColor: colors.border },
              selectedRole === 'DRIVER'
                ? [styles.cardActiveDriver, { backgroundColor: isDark ? '#3b2758' : '#faf5ff', borderColor: isDark ? '#c084fc' : '#9333ea' }]
                : { backgroundColor: colors.card },
            ]}
            onPress={() => handleRoleCardPress('DRIVER')}
            activeOpacity={0.9}
          >
            <View
              style={[
                styles.cardIcon,
                selectedRole === 'DRIVER' && [styles.cardIconActiveDriver, { backgroundColor: isDark ? '#4c1d95' : '#f3e8ff' }],
              ]}
            >
              <Text style={styles.cardIconText}>🚗</Text>
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Driver</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                Accept nearby orders, optimize routes, and grow your daily earnings.
              </Text>
            </View>
            <Text
              style={[
                styles.cardState,
                { color: colors.textTertiary },
                selectedRole === 'DRIVER' && { color: isDark ? '#d8b4fe' : '#9333ea' },
              ]}
            >
              {selectedRole === 'DRIVER' ? 'Continue' : 'Select'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
          onPress={() => goToLoginForRole(selectedRole)}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>
            Continue as {selectedRole === 'CUSTOMER' ? 'Customer' : 'Driver'}
          </Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            By continuing, you agree to our{' '}
            <Text style={[styles.footerLink, { color: colors.primary }]} onPress={() => router.push('/(auth)/terms')}>
              Terms
            </Text>
            {' & '}
            <Text style={[styles.footerLink, { color: colors.primary }]} onPress={() => router.push('/(auth)/privacy')}>
              Privacy Policy
            </Text>
          </Text>
        </View>
      </ScrollView>
      <>
        <View style={[styles.bgCircleTop, isDark && styles.bgCircleDark]} />
        <View style={[styles.bgCircleBottom, isDark && styles.bgCircleDark]} />
        <View style={[styles.bgCircleSide, isDark && styles.bgCircleDark]} />
      </>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 18,
  },
  heroCard: {
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  roleHeading: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  cardsContainer: {
    width: '100%',
    gap: 12,
  },
  card: {
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardActiveCustomer: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
    borderWidth: 2,
  },
  cardActiveDriver: {
    backgroundColor: '#faf5ff',
    borderColor: '#9333ea',
    borderWidth: 2,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    marginRight: 12,
  },
  cardIconActiveCustomer: {
    backgroundColor: '#dbeafe',
  },
  cardIconActiveDriver: {
    backgroundColor: '#f3e8ff',
  },
  cardIconText: {
    fontSize: 26,
  },
  cardTextBlock: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardState: {
    fontSize: 12,
    fontWeight: '700',
  },
  continueBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
    marginTop: 8,
  },
  continueBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    paddingTop: 6,
  },
  footerText: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
  footerLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  bgCircleDark: {
    opacity: 0.35,
  },
  bgCircleTop: {
    position: 'absolute',
    top: -60,
    right: -30,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(56, 189, 248, 0.16)',
  },
  bgCircleBottom: {
    position: 'absolute',
    bottom: -55,
    left: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  bgCircleSide: {
    position: 'absolute',
    top: '44%',
    right: -38,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(147, 51, 234, 0.12)',
  },
});
