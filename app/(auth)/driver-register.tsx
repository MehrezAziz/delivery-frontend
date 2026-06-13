import { View, Text, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';

export default function DriverRegisterScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    firstName: '',
    secondName: '',
    phone: '',
    password: '',
    confirmPassword: '',
    vehicleType: '',
  });

  const handleRegister = () => {
    // TODO: Implement registration logic
    console.log('Driver Register:', formData);
    router.replace('/(driver)/home');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={[styles.heroCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
            <View style={[styles.iconContainer, { backgroundColor: '#7c3aed' }]}>
              <Text style={styles.iconText}>🚗</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{t('auth.driverRegistrationTitle')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('auth.driverRegisterStep1Subtitle')}</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.firstName')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('auth.enterFirstName')}
                placeholderTextColor={colors.textTertiary}
                value={formData.firstName}
                onChangeText={(text) => setFormData({...formData, firstName: text})}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.secondName')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('auth.enterLastName')}
                placeholderTextColor={colors.textTertiary}
                value={formData.secondName}
                onChangeText={(text) => setFormData({...formData, secondName: text})}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.phoneNumber')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder="+216 XX XXX XXX"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
                value={formData.phone}
                onChangeText={(text) => setFormData({...formData, phone: text})}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.vehicleType')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('auth.selectVehicleType')}
                placeholderTextColor={colors.textTertiary}
                value={formData.vehicleType}
                onChangeText={(text) => setFormData({...formData, vehicleType: text})}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.password')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('auth.createPassword')}
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={formData.password}
                onChangeText={(text) => setFormData({...formData, password: text})}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.confirmPassword')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('auth.confirmYourPassword')}
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={formData.confirmPassword}
                onChangeText={(text) => setFormData({...formData, confirmPassword: text})}
              />
            </View>

            <TouchableOpacity
              style={styles.registerButton}
              onPress={handleRegister}
              activeOpacity={0.8}
            >
              <Text style={styles.registerButtonText}>{t('auth.createAccount')}</Text>
            </TouchableOpacity>

            {/* Login Link */}
            <View style={styles.loginContainer}>
              <Text style={[styles.loginText, { color: colors.textSecondary }]}>{t('auth.alreadyHaveAccount')} </Text>
              <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
                <Text style={styles.loginLink}>{t('auth.login')}</Text>
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
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 36,
  },
  heroCard: {
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 24,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
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
  registerButton: {
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: '#7c3aed',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginTop: 8,
  },
  registerButtonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  loginText: {
    fontSize: 15,
  },
  loginLink: {
    color: '#7c3aed',
    fontWeight: '600',
    fontSize: 15,
  },
});
