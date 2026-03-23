import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

GoogleSignin.configure({
  webClientId: '295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com',
  iosClientId: '295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com',
  offlineAccess: true,
});

export default function DriverRegisterStep1() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    phone: '', password: '', firstName: '', secondName: '',
    myEmail: '', userGender: '' as 'MALE' | 'FEMALE' | '',
  });
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Denied', 'We need camera roll permissions.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setProfileImage(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Denied', 'We need camera permissions.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setProfileImage(result.assets[0].uri);
  };

  const showImageOptions = () => {
    Alert.alert('Profile Picture', 'Choose an option', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      try { await GoogleSignin.signOut(); } catch {}
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      if (!idToken) throw new Error('No ID token received from Google');

      const res = await axios.post(`${API_BASE}/auth/driver/google`, { idToken });
      await AsyncStorage.setItem('driverPendingToken', res.data.pendingToken);
      router.push('/(auth)/driver-register-step2');
    } catch (error: any) {
      let msg = 'Failed to sign in with Google';
      if (error.code === 'SIGN_IN_CANCELLED') msg = 'Sign-in was cancelled';
      else if (error.response?.data?.message) msg = error.response.data.message;
      else if (error.message) msg = error.message;
      Alert.alert('Google Sign-In Failed', msg);
    } finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!formData.phone || !formData.password) {
      Alert.alert('Error', 'Phone and password are required'); return;
    }
    if (formData.password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters'); return;
    }

    setLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('phone', formData.phone);
      formDataToSend.append('password', formData.password);
      if (formData.firstName) formDataToSend.append('firstName', formData.firstName);
      if (formData.secondName) formDataToSend.append('secondName', formData.secondName);
      if (formData.myEmail) formDataToSend.append('myEmail', formData.myEmail);
      if (formData.userGender) formDataToSend.append('userGender', formData.userGender);

      if (profileImage) {
        const filename = profileImage.split('/').pop();
        const match = /\.(\w+)$/.exec(filename || '');
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        formDataToSend.append('image', { uri: profileImage, name: filename || 'profile.jpg', type } as any);
      }

      const response = await axios.post(`${API_BASE}/auth/driver/register/step1`, formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await AsyncStorage.setItem('driverPendingToken', response.data.pendingToken);
      router.push('/(auth)/driver-register-step2');
    } catch (error: any) {
      Alert.alert('Registration Failed', error.response?.data?.message || 'An error occurred');
    } finally { setLoading(false); }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Driver Registration</Text>
        <Text style={styles.subtitle}>Step 1 of 3: Personal Information</Text>
      </View>

      {/* Profile Picture */}
      <View style={styles.imageContainer}>
        <TouchableOpacity onPress={showImageOptions} style={styles.imagePicker}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.profileImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="camera" size={40} color="#666" />
              <Text style={styles.imageText}>Add Photo</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Google Sign-In */}
      <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} disabled={loading}>
        <Ionicons name="logo-google" size={24} color="#DB4437" />
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phone Number *</Text>
        <TextInput style={styles.input} placeholder="+1234567890" value={formData.phone}
          onChangeText={text => setFormData({ ...formData, phone: text })}
          keyboardType="phone-pad" autoCapitalize="none" />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password *</Text>
        <View style={styles.passwordContainer}>
          <TextInput style={styles.passwordInput} placeholder="Min 8 characters"
            value={formData.password} onChangeText={text => setFormData({ ...formData, password: text })}
            secureTextEntry={!showPassword} autoCapitalize="none" />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>First Name</Text>
        <TextInput style={styles.input} placeholder="John" value={formData.firstName}
          onChangeText={text => setFormData({ ...formData, firstName: text })} />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Last Name</Text>
        <TextInput style={styles.input} placeholder="Doe" value={formData.secondName}
          onChangeText={text => setFormData({ ...formData, secondName: text })} />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} placeholder="john@example.com" value={formData.myEmail}
          onChangeText={text => setFormData({ ...formData, myEmail: text })}
          keyboardType="email-address" autoCapitalize="none" />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Gender</Text>
        <View style={styles.genderContainer}>
          {(['MALE', 'FEMALE'] as const).map(g => (
            <TouchableOpacity key={g}
              style={[styles.genderButton, formData.userGender === g && styles.genderButtonActive]}
              onPress={() => setFormData({ ...formData, userGender: g })}>
              <Text style={[styles.genderText, formData.userGender === g && styles.genderTextActive]}>
                {g === 'MALE' ? 'Male' : 'Female'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Continue to Step 2</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.loginLink} onPress={() => router.push('/(auth)/driver-login')}>
        <Text style={styles.loginLinkText}>
          Already have an account? <Text style={styles.loginLinkBold}>Login</Text>
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20, marginBottom: 60 },
  backBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  header: { marginBottom: 30, marginTop: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666' },
  imageContainer: { alignItems: 'center', marginBottom: 20 },
  imagePicker: { width: 120, height: 120, borderRadius: 60, overflow: 'hidden' },
  profileImage: { width: '100%', height: '100%' },
  imagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#ddd', borderStyle: 'dashed' },
  imageText: { marginTop: 8, color: '#666', fontSize: 14 },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, gap: 12, marginBottom: 20 },
  googleButtonText: { fontSize: 16, color: '#333', fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ddd' },
  dividerText: { marginHorizontal: 16, color: '#999', fontSize: 14 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#f9f9f9' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#f9f9f9' },
  passwordInput: { flex: 1, padding: 12, fontSize: 16 },
  eyeIcon: { padding: 12 },
  genderContainer: { flexDirection: 'row', gap: 12 },
  genderButton: { flex: 1, padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, alignItems: 'center', backgroundColor: '#f9f9f9' },
  genderButtonActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  genderText: { fontSize: 16, color: '#333' },
  genderTextActive: { color: '#fff', fontWeight: '600' },
  submitButton: { backgroundColor: '#007AFF', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  loginLink: { marginTop: 20, marginBottom: 40, alignItems: 'center' },
  loginLinkText: { fontSize: 16, color: '#666' },
  loginLinkBold: { color: '#007AFF', fontWeight: '600' },
});
