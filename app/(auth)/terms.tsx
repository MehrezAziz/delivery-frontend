import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export default function TermsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={[s.wrap, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Application terms</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[s.p, { color: colors.text }]}>
          By creating an account you agree to use the platform responsibly. The same text is available at{' '}
          <Text style={{ fontWeight: '700' }}>GET /api/terms</Text> on the server.
        </Text>
        <Text style={[s.h, { color: colors.text }]}>Prohibited & sensitive content</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>
          Do not request delivery of sensitive administrative documents, cash or money transfers, prohibited substances,
          or high-value precious items without following any special rules the platform may publish.
        </Text>
        <Text style={[s.h, { color: colors.text }]}>Honesty & disputes</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>
          Do not deceive administrators or falsely accuse drivers or customers. Serious abuse may be escalated through
          legal channels after investigation by customer service.
        </Text>
        <Text style={[s.h, { color: colors.text }]}>Support</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>
          Use in-app support for conflicts. Customer service may suspend accounts when terms are violated.
        </Text>
        <Text style={[s.meta, { color: colors.textTertiary }]}>Last updated: April 13, 2026</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 48, paddingBottom: 14, paddingHorizontal: 8 },
  back: { padding: 8 },
  title: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '700' },
  h: { fontSize: 17, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  p: { fontSize: 15, lineHeight: 22 },
  meta: { marginTop: 24, fontSize: 13 },
});
