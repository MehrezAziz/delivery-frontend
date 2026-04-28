import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSessionValid, clearSession } from '../services/auth-session';
import { resolveLaunchRouteAfterLogin, stopOrderTrackingSilently } from '../services/notifications';
import { useTheme } from '../contexts/ThemeContext';
import { AppChromeHeader } from '../components/AppChromeHeader';

export default function RoleSelectionScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [checking, setChecking] = useState(true);
  const [selectedRole, setSelectedRole] = useState<'CUSTOMER' | 'DRIVER'>('CUSTOMER');

  useEffect(() => {
    checkExistingSession();
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppChromeHeader role="guest" title="Welcome" hideBack showMenu={false} showThemeToggle={false} showProfile={false} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.heroBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.heroBadgeText, { color: colors.primary }]}>Fast delivery</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Deliver anything, faster and smarter</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Reliable pickup and delivery for customers, with earning opportunities for drivers.
          </Text>
        </View>

        <View style={[styles.introSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.introTitle, { color: colors.text }]}>Why use the app?</Text>
          <Text style={[styles.introItem, { color: colors.textSecondary }]}>• Live order tracking and transparent pricing</Text>
          <Text style={[styles.introItem, { color: colors.textSecondary }]}>• Secure payments and easy address management</Text>
          <Text style={[styles.introItem, { color: colors.textSecondary }]}>• Fast onboarding for both customers and drivers</Text>
        </View>

        <Text style={[styles.roleHeading, { color: colors.text }]}>Choose your role</Text>
        <View style={styles.cardsContainer}>
          <TouchableOpacity
            style={[
              styles.card,
              { borderColor: colors.border },
              selectedRole === 'CUSTOMER' ? styles.cardActiveCustomer : { backgroundColor: colors.card },
            ]}
            onPress={() => setSelectedRole('CUSTOMER')}
            activeOpacity={0.9}
          >
            <View style={[styles.cardIcon, selectedRole === 'CUSTOMER' && styles.cardIconActiveCustomer]}>
              <Text style={styles.cardIconText}>📦</Text>
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Customer</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                Create delivery orders, save frequent addresses, and track every step.
              </Text>
            </View>
            <Text style={[styles.cardState, { color: colors.textTertiary }, selectedRole === 'CUSTOMER' && { color: colors.primary }]}>
              {selectedRole === 'CUSTOMER' ? 'Selected' : 'Tap to select'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.card,
              { borderColor: colors.border },
              selectedRole === 'DRIVER' ? styles.cardActiveDriver : { backgroundColor: colors.card },
            ]}
            onPress={() => setSelectedRole('DRIVER')}
            activeOpacity={0.9}
          >
            <View style={[styles.cardIcon, selectedRole === 'DRIVER' && styles.cardIconActiveDriver]}>
              <Text style={styles.cardIconText}>🚗</Text>
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Driver</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                Accept nearby orders, optimize routes, and grow your daily earnings.
              </Text>
            </View>
            <Text style={[styles.cardState, { color: colors.textTertiary }, selectedRole === 'DRIVER' && { color: '#9333ea' }]}>
              {selectedRole === 'DRIVER' ? 'Selected' : 'Tap to select'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
          onPress={() => router.push(selectedRole === 'CUSTOMER' ? '/(auth)/customer-login' : '/(auth)/driver-login')}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>
            Continue as {selectedRole === 'CUSTOMER' ? 'Customer' : 'Driver'}
          </Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            By continuing, you agree to our Terms & Privacy Policy
          </Text>
        </View>
      </ScrollView>
      {!isDark && (
        <>
          <View style={styles.bgCircleTop} />
          <View style={styles.bgCircleBottom} />
          <View style={styles.bgCircleSide} />
        </>
      )}
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
    paddingBottom: 28,
    gap: 18,
  },
  heroCard: {
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
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
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  introSection: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  introItem: {
    fontSize: 13,
    marginBottom: 5,
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
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
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
