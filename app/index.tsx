import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.heroSection}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>🚚</Text>
        </View>
        
        <Text style={styles.title}>Fast Delivery</Text>
        <Text style={styles.subtitle}>Get your packages delivered quickly and safely</Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.customerButton]}
            onPress={() => router.push('/(auth)/customer-login')}
          >
            <Text style={styles.buttonText}>Continue as Customer</Text>
          </TouchableOpacity>

          <View style={styles.buttonSpacing} />

          <TouchableOpacity
            style={[styles.button, styles.driverButton]}
            onPress={() => router.push('/(auth)/driver-login')}
          >
            <Text style={styles.buttonText}>Continue as Driver</Text>
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
    backgroundColor: 'white',
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 128,
    height: 128,
    backgroundColor: '#0284c7',
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  iconText: {
    fontSize: 48,
    color: 'white',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 48,
  },
  buttonContainer: {
    width: '100%',
  },
  buttonSpacing: {
    height: 16,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  customerButton: {
    backgroundColor: '#0284c7',
  },
  driverButton: {
    backgroundColor: '#c026d3',
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  footerText: {
    color: '#6b7280',
    textAlign: 'center',
    fontSize: 14,
  },
});
