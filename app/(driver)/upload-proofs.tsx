import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert, TextInput,
  ActivityIndicator, StyleSheet, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderService } from '../../services/api/order.service';

export default function UploadProofsScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [image1, setImage1] = useState('');
  const [image2, setImage2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!image1) {
      Alert.alert('Error', 'Please provide at least one proof image URL');
      return;
    }
    setSubmitting(true);
    try {
      await orderService.uploadProofs(orderId, image1 || undefined, image2 || undefined);
      Alert.alert('Success', 'Proofs uploaded successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Upload Proofs</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        {/* Info card */}
        <View style={s.infoCard}>
          <View style={s.infoIconWrap}>
            <Ionicons name="shield-checkmark" size={24} color="#0284c7" />
          </View>
          <Text style={s.infoText}>
            Upload delivery proof images to protect yourself from false claims. At least one image is required.
          </Text>
        </View>

        {/* Image 1 */}
        <View style={s.fieldCard}>
          <View style={s.fieldHeader}>
            <Ionicons name="camera-outline" size={20} color="#16a34a" />
            <Text style={s.fieldLabel}>Proof Image 1</Text>
            <View style={s.requiredBadge}>
              <Text style={s.requiredText}>Required</Text>
            </View>
          </View>
          <TextInput
            style={s.input}
            value={image1}
            onChangeText={setImage1}
            placeholder="Paste image URL or base64..."
            placeholderTextColor="#9ca3af"
            multiline
          />
        </View>

        {/* Image 2 */}
        <View style={s.fieldCard}>
          <View style={s.fieldHeader}>
            <Ionicons name="camera-outline" size={20} color="#6b7280" />
            <Text style={s.fieldLabel}>Proof Image 2</Text>
            <View style={s.optionalBadge}>
              <Text style={s.optionalText}>Optional</Text>
            </View>
          </View>
          <TextInput
            style={s.input}
            value={image2}
            onChangeText={setImage2}
            placeholder="Paste image URL or base64..."
            placeholderTextColor="#9ca3af"
            multiline
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, !image1 && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !image1}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={s.submitText}>Upload Proofs</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#16a34a', paddingTop: 50, paddingBottom: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

  content: { padding: 20, paddingBottom: 40 },

  infoCard: {
    backgroundColor: '#eff6ff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  infoIconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center',
  },
  infoText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 19 },

  fieldCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  fieldLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  requiredBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  requiredText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
  optionalBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  optionalText: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  input: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, fontSize: 14,
    color: '#111827', borderWidth: 1, borderColor: '#e5e7eb', minHeight: 60, textAlignVertical: 'top',
  },

  submitBtn: {
    backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10,
    shadowColor: '#16a34a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnDisabled: { backgroundColor: '#9ca3af', shadowOpacity: 0 },
  submitText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
