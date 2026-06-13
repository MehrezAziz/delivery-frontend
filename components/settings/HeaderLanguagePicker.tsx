import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { LANGUAGE_LABELS, SupportedLanguage } from '../../i18n';

/** Short code shown on the icon button (e.g. EN / FR / ع). */
const LANGUAGE_SHORT: Record<SupportedLanguage, string> = {
  en: 'EN',
  fr: 'FR',
  ar: 'ع',
};

/**
 * Compact header icon + dropdown for switching the app language.
 *
 * Used in the welcome screen header so that anonymous users can pick a language
 * before signing in. Tap the icon → small dropdown anchored under the header
 * with the three supported languages. When switching between LTR/RTL (Arabic
 * ↔ EN/FR) a restart-notice modal is shown because React Native does not
 * hot-swap `I18nManager.isRTL`.
 */
export function HeaderLanguagePicker({
  iconColor = '#fff',
  buttonStyle,
  anchorRight = 12,
  anchorTop = 56,
}: {
  iconColor?: string;
  buttonStyle?: StyleProp<ViewStyle>;
  /** Distance from the right edge of the screen (matches header padding). */
  anchorRight?: number;
  /** Distance from the top of the screen (just below the safe-area header). */
  anchorTop?: number;
}) {
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
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.iconBtn, buttonStyle]}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('language.chooseLanguage')}
      >
        <Ionicons name="language" size={18} color={iconColor} />
        <Text style={[styles.iconBtnLabel, { color: iconColor }]}>{LANGUAGE_SHORT[language]}</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.dropdown,
              {
                top: anchorTop,
                right: anchorRight,
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: isDark ? '#000' : '#0f172a',
              },
            ]}
          >
            <Text style={[styles.dropdownTitle, { color: colors.textSecondary }]}>
              {t('language.chooseLanguage')}
            </Text>
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
                    },
                  ]}
                >
                  <View style={styles.optionLeft}>
                    <Text
                      style={[
                        styles.optionTag,
                        {
                          color: active ? colors.primary : colors.textTertiary,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      {LANGUAGE_SHORT[code]}
                    </Text>
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: colors.text, fontWeight: active ? '800' : '600' },
                      ]}
                    >
                      {LANGUAGE_LABELS[code]}
                    </Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={restartNotice}
        transparent
        animationType="fade"
        onRequestClose={() => setRestartNotice(false)}
      >
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
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 40,
    borderRadius: 12,
  },
  iconBtnLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  dropdown: {
    position: 'absolute',
    width: 220,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  dropdownTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  optionTag: {
    minWidth: 30,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  optionLabel: { fontSize: 15 },

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
  alertBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  alertBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
