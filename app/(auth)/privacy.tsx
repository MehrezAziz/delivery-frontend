import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[s.wrap, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[s.p, { color: colors.text }]}>{t('privacy.intro')}</Text>

        <Text style={[s.h, { color: colors.text }]}>{t('privacy.collectTitle')}</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>{t('privacy.collectBody')}</Text>

        <Text style={[s.h, { color: colors.text }]}>{t('privacy.useTitle')}</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>{t('privacy.useBody')}</Text>

        <Text style={[s.h, { color: colors.text }]}>{t('privacy.retentionTitle')}</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>{t('privacy.retentionBody')}</Text>

        <Text style={[s.h, { color: colors.text }]}>{t('privacy.rightsTitle')}</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>{t('privacy.rightsBody')}</Text>

        <Text style={[s.meta, { color: colors.textTertiary }]}>{t('privacy.lastUpdated')}</Text>
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
