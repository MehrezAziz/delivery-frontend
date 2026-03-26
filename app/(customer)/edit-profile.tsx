import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function CustomerEditProfileScreen() {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [secondName, setSecondName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<string | null>(null);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/customers/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setFirstName(d.user?.firstName || '');
      setSecondName(d.user?.secondName || '');
      setPhone(d.user?.phone || '');
      setEmail(d.user?.myEmail || '');
      setGender(d.user?.userGender || null);
      if (!d.user?.hasPassword) {
        setIsGoogleUser(true);
        setVerified(true);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    if (!password.trim()) return;
    setVerifying(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const res = await fetch(`${API_URL.replace('/api', '')}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Invalid password'); }
      setVerified(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Invalid password');
    } finally { setVerifying(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      await fetch(`${API_URL}/customers/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: firstName.trim() || undefined,
          secondName: secondName.trim() || undefined,
          myEmail: email.trim() || undefined,
          userGender: gender || undefined,
        }),
      });
      Alert.alert('Success', 'Profile updated', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', 'Failed to update');
    } finally { setSaving(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#0284c7" /></View>;

  if (!verified) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={s.headerTitleDark}>Edit Profile</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.gateContainer}>
          <View style={s.gateIconWrap}>
            <Ionicons name="lock-closed" size={40} color="#0284c7" />
          </View>
          <Text style={s.gateTitle}>Verify Your Identity</Text>
          <Text style={s.gateSub}>Enter your password to edit your profile</Text>
          <TextInput style={s.gateInput} value={password} onChangeText={setPassword}
            placeholder="Enter your password" placeholderTextColor="#9ca3af" secureTextEntry autoFocus />
          <TouchableOpacity style={[s.gateBtn, !password.trim() && { opacity: 0.5 }]}
            onPress={handleVerify} disabled={verifying || !password.trim()}>
            {verifying ? <ActivityIndicator color="#fff" /> : <Text style={s.gateBtnText}>Verify</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitleDark}>Edit Profile</Text>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        <Field label="First Name" value={firstName} onChange={setFirstName} />
        <Field label="Last Name" value={secondName} onChange={setSecondName} />
        <Field label="Phone" value={phone} onChange={setPhone} keyboardType="phone-pad" editable={false} />
        <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" />

        <Text style={s.fieldLabel}>Gender</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {['MALE', 'FEMALE'].map(g => (
            <TouchableOpacity key={g} style={[s.genderBtn, gender === g && s.genderBtnActive]}
              onPress={() => setGender(g)}>
              <Text style={[s.genderBtnText, gender === g && { color: '#fff' }]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChange, keyboardType, editable = true, multiline }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={[s.input, multiline && { height: 80, textAlignVertical: 'top' }, !editable && { backgroundColor: '#f3f4f6', color: '#9ca3af' }]}
        value={value} onChangeText={onChange} keyboardType={keyboardType}
        multiline={multiline} editable={editable} placeholderTextColor="#9ca3af" />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#fff', paddingTop: 50, paddingBottom: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb',
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitleDark: { fontSize: 18, fontWeight: '700', color: '#111827' },
  content: { padding: 20, paddingBottom: 40 },
  gateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  gateIconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  gateTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8 },
  gateSub: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  gateInput: {
    width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 16,
    fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16,
  },
  gateBtn: { width: '100%', backgroundColor: '#0284c7', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  gateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, color: '#111827',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  genderBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f3f4f6',
    alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb',
  },
  genderBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  genderBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  saveBtn: { backgroundColor: '#0284c7', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
