import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { LANGUAGE_LABELS, SupportedLanguage } from '../../i18n';

/**
 * Settings row + bottom-sheet picker for the app language.
 * Renders the current language inline; tapping opens a modal sheet to switch.
 *
 * When switching between RTL/LTR (Arabic ↔ EN/FR) we show a notice that
 * the user should restart the app for the layout direction to fully apply,
 * because React Native does not hot-swap `I18nManager.isRTL`.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { language, setLanguage, supported } = useLanguage();
  const [open, setOpen] = useState(false);
  const [restartNotice, setRestartNotice] = useState(false);

  const onSelect = async (lang: SupportedLanguage) => {
    if (lang === language) {
      setOpen(false);
      return;
    }
    const { rtlChanged } = await setLanguage(lang);
    setOpen(false);
    if (rtlChanged) setRestartNotice(true);
  };

  return (
    <>
      <View style={[styles.row, compact && styles.rowCompact, { borderBottomColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.text }]}>{t('language.title')}</Text>
        <TouchableOpacity
          onPress={() => setOpen(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 10, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('language.chooseLanguage')}
          style={styles.valueBtn}
        >
          <Text style={[styles.value, { color: colors.textSecondary }]}>
            {LANGUAGE_LABELS[language]}
          </Text>
          <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t('language.chooseLanguage')}</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={10}
                style={[styles.closeBtn, { backgroundColor: colors.surfaceVariant }]}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            {supported.map((code) => {
              const active = code === language;
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => void onSelect(code)}
                  activeOpacity={0.7}
                  style={[
                    styles.option,
                    {
                      backgroundColor: active
                        ? isDark
                          ? 'rgba(14,165,233,0.18)'
                          : colors.primaryLight
                        : 'transparent',
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.optionLabel, { color: colors.text, fontWeight: active ? '800' : '600' }]}>
                    {LANGUAGE_LABELS[code]}
                  </Text>
                  {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={restartNotice} transparent animationType="fade" onRequestClose={() => setRestartNotice(false)}>
        <View style={styles.alertOverlay}>
          <View style={[styles.alertCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.alertTitle, { color: colors.text }]}>{t('language.rtlRestartTitle')}</Text>
            <Text style={[styles.alertBody, { color: colors.textSecondary }]}>
              {t('language.rtlRestartMessage')}
            </Text>
            <TouchableOpacity
              style={[styles.alertBtn, { backgroundColor: colors.primary }]}
              onPress={() => setRestartNotice(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.alertBtnText}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowCompact: { paddingVertical: 12 },
  label: { fontSize: 16, fontWeight: '600' },
  valueBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { fontSize: 15, fontWeight: '600' },
  chevron: { fontSize: 22, fontWeight: '300' },

  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionLabel: { fontSize: 16, fontWeight: '600' },

  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  alertCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
  },
  alertTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  alertBody: { fontSize: 14, lineHeight: 20, marginBottom: 18 },
  alertBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  alertBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
