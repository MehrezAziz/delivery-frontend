import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';

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
  const { push } = useAppNavigation();
  const { colors, isDark } = useTheme();
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        router.replace('/(auth)/driver-login');
        return;
      }
      const res = await axios.get(`${API_URL}/drivers/verification`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return '#22c55e';
      case 'SUBMITTED':
        return '#f59e0b';
      case 'REJECTED':
        return '#ef4444';
      case 'INCOMPLETE':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return 'checkmark-circle';
      case 'SUBMITTED':
        return 'time';
      case 'REJECTED':
        return 'close-circle';
      default:
        return 'help-circle';
    }
  };

  const formatDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'N/A';

  const canUploadNew =
    data?.documents.some((d) => d.verificationStatus === 'REJECTED') || data?.status === 'REJECTED';

  const placeholderTint = isDark ? 'rgba(56,189,248,0.18)' : '#e0f2fe';
  const placeholderBorder = isDark ? colors.border : '#bae6fd';

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {data && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: '#000',
              },
            ]}
          >
            <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Verification status</Text>
            <View style={styles.statusRow}>
              <Ionicons name={getStatusIcon(data.status) as any} size={24} color={getStatusColor(data.status)} />
              <Text style={[styles.statusValue, { color: getStatusColor(data.status) }]}>{data.status}</Text>
            </View>
            {data.documentType && (
              <Text style={[styles.infoText, { color: colors.text }]}>
                Document type: {data.documentType.replace('_', ' ')}
              </Text>
            )}
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Submitted: {formatDate(data.submittedAt)}
            </Text>
            {data.verifiedAt ? (
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Verified: {formatDate(data.verifiedAt)}
              </Text>
            ) : null}
          </View>
        )}

        {data?.documents.map((doc, index) => (
          <View
            key={doc.id}
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: '#000',
              },
            ]}
          >
            <View style={styles.docHeader}>
              <Text style={[styles.docTitle, { color: colors.text }]}>Document #{index + 1}</Text>
              <View style={[styles.docBadge, { backgroundColor: getStatusColor(doc.verificationStatus) + '28' }]}>
                <Text style={[styles.docBadgeText, { color: getStatusColor(doc.verificationStatus) }]}>
                  {doc.verificationStatus}
                </Text>
              </View>
            </View>

            {doc.selfieImage && (
              <View style={styles.imageSection}>
                <Text style={[styles.imageLabel, { color: colors.textSecondary }]}>Selfie</Text>
                <View
                  style={[
                    styles.imagePlaceholder,
                    { backgroundColor: placeholderTint, borderColor: placeholderBorder },
                  ]}
                >
                  <Ionicons name="person" size={28} color={colors.primary} />
                  <Text style={[styles.imagePlaceholderText, { color: colors.primary }]}>Selfie uploaded</Text>
                </View>
              </View>
            )}

            {doc.docImageTop && (
              <View style={styles.imageSection}>
                <Text style={[styles.imageLabel, { color: colors.textSecondary }]}>Document front</Text>
                <View
                  style={[
                    styles.imagePlaceholder,
                    { backgroundColor: placeholderTint, borderColor: placeholderBorder },
                  ]}
                >
                  <Ionicons name="document-text" size={28} color={colors.primary} />
                  <Text style={[styles.imagePlaceholderText, { color: colors.primary }]}>Front side uploaded</Text>
                </View>
              </View>
            )}

            {doc.docImageBottom && (
              <View style={styles.imageSection}>
                <Text style={[styles.imageLabel, { color: colors.textSecondary }]}>Document back</Text>
                <View
                  style={[
                    styles.imagePlaceholder,
                    { backgroundColor: placeholderTint, borderColor: placeholderBorder },
                  ]}
                >
                  <Ionicons name="document-text" size={28} color={colors.primary} />
                  <Text style={[styles.imagePlaceholderText, { color: colors.primary }]}>Back side uploaded</Text>
                </View>
              </View>
            )}
          </View>
        ))}

        {(!data || data.documents.length === 0) && (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No documents</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Submit your documents for verification.
            </Text>
          </View>
        )}

        {canUploadNew && (
          <TouchableOpacity
            style={[styles.uploadBtn, { backgroundColor: colors.primary }]}
            onPress={() => push('/(driver)/verification')}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
            <Text style={styles.uploadBtnText}>Upload new documents</Text>
          </TouchableOpacity>
        )}

        {!canUploadNew && data && data.documents.length > 0 && (
          <View
            style={[
              styles.noteBox,
              { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
            ]}
          >
            <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>
              Documents cannot be modified after submission. If rejected, you can upload new documents.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statusLabel: { fontSize: 13, marginBottom: 8, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusValue: { fontSize: 18, fontWeight: '700' },
  infoText: { fontSize: 13, marginBottom: 4 },
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  docTitle: { fontSize: 16, fontWeight: '600' },
  docBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  docBadgeText: { fontSize: 11, fontWeight: '700' },
  imageSection: { marginBottom: 12 },
  imageLabel: { fontSize: 13, marginBottom: 6, fontWeight: '600' },
  imagePlaceholder: {
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
  },
  imagePlaceholderText: { fontSize: 14, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  emptyText: { fontSize: 14, marginTop: 4, textAlign: 'center', paddingHorizontal: 24 },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  uploadBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
