import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';

export default function TermsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[s.wrap, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[s.p, { color: colors.text }]}>
          {t('terms.introPrefix')}
          <Text style={{ fontWeight: '700' }}>{t('terms.introEndpoint')}</Text>
          {t('terms.introSuffix')}
        </Text>
        <Text style={[s.h, { color: colors.text }]}>{t('terms.prohibitedTitle')}</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>{t('terms.prohibitedBody')}</Text>
        <Text style={[s.h, { color: colors.text }]}>{t('terms.honestyTitle')}</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>{t('terms.honestyBody')}</Text>
        <Text style={[s.h, { color: colors.text }]}>{t('terms.supportTitle')}</Text>
        <Text style={[s.p, { color: colors.textSecondary }]}>{t('terms.supportBody')}</Text>
        <Text style={[s.meta, { color: colors.textTertiary }]}>{t('terms.lastUpdated')}</Text>
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
