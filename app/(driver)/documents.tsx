import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

interface Document {
  id: string;
  documentImage: string | null;
  selfieImage: string | null;
  docImageTop: string | null;
  docImageBottom: string | null;
  verificationStatus: 'INCOMPLETE' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
}

interface VerificationData {
  driverId: string;
  status: string;
  documentType: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  documents: Document[];
}

export default function DriverDocumentsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDocuments(); }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) { router.replace('/(auth)/driver-login'); return; }
      const res = await axios.get(`${API_URL}/drivers/verification`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to load documents');
    } finally { setLoading(false); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VERIFIED': return '#22c55e';
      case 'SUBMITTED': return '#f59e0b';
      case 'REJECTED': return '#ef4444';
      case 'INCOMPLETE': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'VERIFIED': return 'checkmark-circle';
      case 'SUBMITTED': return 'time';
      case 'REJECTED': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';

  const canUploadNew = data?.documents.some(d => d.verificationStatus === 'REJECTED') || data?.status === 'REJECTED';

  if (loading) return <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(driver)/home')} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.text }]}>My Documents</Text>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Overall Status */}
        {data && (
          <View style={[s.statusCard, { backgroundColor: colors.card }]}>
            <Text style={[s.statusLabel, { color: colors.textSecondary }]}>Verification Status</Text>
            <View style={s.statusRow}>
              <Ionicons name={getStatusIcon(data.status) as any} size={24} color={getStatusColor(data.status)} />
              <Text style={[s.statusValue, { color: getStatusColor(data.status) }]}>{data.status}</Text>
            </View>
            {data.documentType && (
              <Text style={s.infoText}>Document Type: {data.documentType.replace('_', ' ')}</Text>
            )}
            <Text style={[s.infoText, { color: colors.textSecondary }]}>Submitted: {formatDate(data.submittedAt)}</Text>
            {data.verifiedAt && <Text style={[s.infoText, { color: colors.textSecondary }]}>Verified: {formatDate(data.verifiedAt)}</Text>}
          </View>
        )}

        {/* Documents */}
        {data?.documents.map((doc, index) => (
          <View key={doc.id} style={[s.docCard, { backgroundColor: colors.card }]}>
            <View style={s.docHeader}>
              <Text style={[s.docTitle, { color: colors.text }]}>Document #{index + 1}</Text>
              <View style={[s.docBadge, { backgroundColor: getStatusColor(doc.verificationStatus) + '20' }]}>
                <Text style={[s.docBadgeText, { color: getStatusColor(doc.verificationStatus) }]}>
                  {doc.verificationStatus}
                </Text>
              </View>
            </View>

            {doc.selfieImage && (
              <View style={s.imageSection}>
                <Text style={s.imageLabel}>Selfie</Text>
                <View style={s.imagePlaceholder}>
                  <Ionicons name="person" size={32} color="#007AFF" />
                  <Text style={s.imagePlaceholderText}>Selfie uploaded</Text>
                </View>
              </View>
            )}

            {doc.docImageTop && (
              <View style={s.imageSection}>
                <Text style={s.imageLabel}>Document Front</Text>
                <View style={s.imagePlaceholder}>
                  <Ionicons name="document" size={32} color="#007AFF" />
                  <Text style={s.imagePlaceholderText}>Front side uploaded</Text>
                </View>
              </View>
            )}

            {doc.docImageBottom && (
              <View style={s.imageSection}>
                <Text style={s.imageLabel}>Document Back</Text>
                <View style={s.imagePlaceholder}>
                  <Ionicons name="document" size={32} color="#007AFF" />
                  <Text style={s.imagePlaceholderText}>Back side uploaded</Text>
                </View>
              </View>
            )}
          </View>
        ))}

        {(!data || data.documents.length === 0) && (
          <View style={s.emptyBox}>
            <Ionicons name="document-text-outline" size={48} color="#999" />
            <Text style={s.emptyTitle}>No Documents</Text>
            <Text style={s.emptyText}>Submit your documents for verification.</Text>
          </View>
        )}

        {/* Upload new documents button if rejected */}
        {canUploadNew && (
          <TouchableOpacity
            style={s.uploadBtn}
            onPress={() => router.push('/(driver)/verification')}
          >
            <Ionicons name="cloud-upload" size={20} color="#fff" />
            <Text style={s.uploadBtnText}>Upload New Documents</Text>
          </TouchableOpacity>
        )}

        {!canUploadNew && data && data.documents.length > 0 && (
          <View style={s.noteBox}>
            <Ionicons name="information-circle" size={18} color="#666" />
            <Text style={s.noteText}>
              Documents cannot be modified after submission. If rejected, you can upload new documents.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 56, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  statusCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  statusLabel: { fontSize: 13, color: '#666', marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusValue: { fontSize: 18, fontWeight: '700' },
  infoText: { fontSize: 13, color: '#666', marginBottom: 4 },
  docCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  docTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  docBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  docBadgeText: { fontSize: 11, fontWeight: '700' },
  imageSection: { marginBottom: 12 },
  imageLabel: { fontSize: 13, color: '#666', marginBottom: 6 },
  imagePlaceholder: { backgroundColor: '#f0f9ff', borderRadius: 8, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#e0f2fe' },
  imagePlaceholderText: { fontSize: 14, color: '#007AFF' },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#666', marginTop: 4 },
  uploadBtn: { backgroundColor: '#007AFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 12, marginTop: 8 },
  uploadBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  noteBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginTop: 12, gap: 8 },
  noteText: { flex: 1, fontSize: 13, color: '#666', lineHeight: 18 },
});
