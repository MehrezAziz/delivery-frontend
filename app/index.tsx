import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function RoleSelectionScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>🚚</Text>
        </View>
        
        <Text style={styles.title}>Welcome to Fast Delivery</Text>
        <Text style={styles.subtitle}>Choose how you want to continue</Text>

        <View style={styles.cardsContainer}>
          {/* Customer Card */}
          <TouchableOpacity
            style={[styles.card, styles.customerCard]}
            onPress={() => router.push('/(auth)/customer-login')}
            activeOpacity={0.8}
          >
            <View style={styles.cardIcon}>
              <Text style={styles.cardIconText}>📦</Text>
            </View>
            <Text style={styles.cardTitle}>I'm a Customer</Text>
            <Text style={styles.cardDescription}>
              Send packages and track deliveries
            </Text>
            <View style={styles.cardButton}>
              <Text style={styles.cardButtonText}>Continue →</Text>
            </View>
          </TouchableOpacity>

          {/* Driver Card */}
          <TouchableOpacity
            style={[styles.card, styles.driverCard]}
            onPress={() => router.push('/(auth)/driver-login')}
            activeOpacity={0.8}
          >
            <View style={styles.cardIcon}>
              <Text style={styles.cardIconText}>🚗</Text>
            </View>
            <Text style={styles.cardTitle}>I'm a Driver</Text>
            <Text style={styles.cardDescription}>
              Deliver packages and earn money
            </Text>
            <View style={styles.cardButton}>
              <Text style={styles.cardButtonText}>Continue →</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By continuing, you agree to our Terms & Privacy Policy
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 100,
    height: 100,
    backgroundColor: '#0284c7',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 48,
  },
  cardsContainer: {
    width: '100%',
    gap: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 2,
  },
  customerCard: {
    borderColor: '#0284c7',
  },
  driverCard: {
    borderColor: '#c026d3',
  },
  cardIcon: {
    width: 80,
    height: 80,
    backgroundColor: '#f3f4f6',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardIconText: {
    fontSize: 40,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  cardButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  cardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  footer: {
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  footerText: {
    color: '#9ca3af',
    textAlign: 'center',
    fontSize: 12,
  },
});
