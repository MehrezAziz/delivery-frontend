import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

export default function PrivacyScreen() {
  const { colors } = useTheme();

  return (
    <View style={[s.wrap, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[s.p, { color: colors.text }]}>
          We respect your privacy. This page explains what data we collect and how we use it to provide delivery,
          tracking, support, and account security features.
        </Text>

        <Text style={[s.h, { color: colors.text }]}>Data we collect</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>
          We may collect account information (name, phone, email), delivery details (addresses, order notes), and
          technical data needed for authentication, notifications, and app reliability.
        </Text>

        <Text style={[s.h, { color: colors.text }]}>How we use data</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>
          Your data is used to process orders, connect customers and drivers, send real-time updates, prevent fraud,
          and improve service quality. We only use data required for these operations.
        </Text>

        <Text style={[s.h, { color: colors.text }]}>Retention and security</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>
          We apply reasonable safeguards to protect your information. Data is retained only as long as needed for legal,
          operational, and support purposes.
        </Text>

        <Text style={[s.h, { color: colors.text }]}>Your rights</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>
          You can request correction or deletion of your personal information through in-app support, subject to
          applicable legal obligations.
        </Text>

        <Text style={[s.meta, { color: colors.textTertiary }]}>Last updated: April 30, 2026</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  h: { fontSize: 17, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  p: { fontSize: 15, lineHeight: 22 },
  meta: { marginTop: 24, fontSize: 13 },
});
