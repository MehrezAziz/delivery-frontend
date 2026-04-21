import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSessionValid, clearSession } from '../services/auth-session';
import { resolveLaunchRouteAfterLogin } from '../services/notifications';

export default function RoleSelectionScreen() {
  const router = useRouter();
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
        await clearSession();
      }
    } catch (e) {
      console.error('Session check error:', e);
      await clearSession();
    }
    setChecking(false);
  }

  if (checking) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Fast Delivery</Text>
          </View>
          <Text style={styles.title}>Deliver anything, faster and smarter</Text>
          <Text style={styles.subtitle}>
            Reliable pickup and delivery for customers, with earning opportunities for drivers.
          </Text>
        </View>

        <View style={styles.introSection}>
          <Text style={styles.introTitle}>Why use the app?</Text>
          <Text style={styles.introItem}>- Live order tracking and transparent pricing</Text>
          <Text style={styles.introItem}>- Secure payments and easy address management</Text>
          <Text style={styles.introItem}>- Fast onboarding for both customers and drivers</Text>
        </View>

        <Text style={styles.roleHeading}>Choose your role</Text>
        <View style={styles.cardsContainer}>
          <TouchableOpacity
            style={[
              styles.card,
              selectedRole === 'CUSTOMER' ? styles.cardActiveCustomer : styles.cardIdle,
            ]}
            onPress={() => setSelectedRole('CUSTOMER')}
            activeOpacity={0.9}
          >
            <View style={[styles.cardIcon, selectedRole === 'CUSTOMER' && styles.cardIconActiveCustomer]}>
              <Text style={styles.cardIconText}>📦</Text>
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={styles.cardTitle}>Customer</Text>
              <Text style={styles.cardDescription}>
                Create delivery orders, save frequent addresses, and track every step.
              </Text>
            </View>
            <Text style={[styles.cardState, selectedRole === 'CUSTOMER' && styles.cardStateActive]}>
              {selectedRole === 'CUSTOMER' ? 'Selected' : 'Tap to select'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.card,
              selectedRole === 'DRIVER' ? styles.cardActiveDriver : styles.cardIdle,
            ]}
            onPress={() => setSelectedRole('DRIVER')}
            activeOpacity={0.9}
          >
            <View style={[styles.cardIcon, selectedRole === 'DRIVER' && styles.cardIconActiveDriver]}>
              <Text style={styles.cardIconText}>🚗</Text>
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={styles.cardTitle}>Driver</Text>
              <Text style={styles.cardDescription}>
                Accept nearby orders, optimize routes, and grow your daily earnings.
              </Text>
            </View>
            <Text style={[styles.cardState, selectedRole === 'DRIVER' && styles.cardStateActive]}>
              {selectedRole === 'DRIVER' ? 'Selected' : 'Tap to select'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => router.push(selectedRole === 'CUSTOMER' ? '/(auth)/customer-login' : '/(auth)/driver-login')}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>
            Continue as {selectedRole === 'CUSTOMER' ? 'Customer' : 'Driver'}
          </Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By continuing, you agree to our Terms & Privacy Policy
          </Text>
        </View>
      </ScrollView>
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />
      <View style={styles.bgCircleSide} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f7ff',
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 18,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#dbeafe',
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
    backgroundColor: '#e0f2fe',
    marginBottom: 10,
  },
  heroBadgeText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  introSection: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  introItem: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 5,
  },
  roleHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
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
    borderWidth: 1.6,
  },
  cardIdle: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
  },
  cardActiveCustomer: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  cardActiveDriver: {
    backgroundColor: '#faf5ff',
    borderColor: '#9333ea',
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
    color: '#0f172a',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  cardState: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  cardStateActive: {
    color: '#0f172a',
  },
  continueBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    shadowColor: '#0284c7',
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
