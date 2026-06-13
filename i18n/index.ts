import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';

import en from './locales/en';
import fr from './locales/fr';
import ar from './locales/ar';

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
};

export const LANGUAGE_KEY = '@app_language';

export const isRTL = (lang: string): boolean => lang === 'ar';

const detectInitialLanguage = (): SupportedLanguage => {
  try {
    const locales = Localization.getLocales();
    const code = locales?.[0]?.languageCode?.toLowerCase() ?? 'en';
    if (SUPPORTED_LANGUAGES.includes(code as SupportedLanguage)) {
      return code as SupportedLanguage;
    }
  } catch {
    // ignore – fall back to default
  }
  return 'en';
};

let initialized = false;

export async function initI18n(): Promise<SupportedLanguage> {
  if (initialized) return (i18n.language as SupportedLanguage) || 'en';

  let lang: SupportedLanguage = detectInitialLanguage();
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
      lang = stored as SupportedLanguage;
    }
  } catch {
    // ignore
  }

  await i18n
    .use(initReactI18next)
    .init({
      compatibilityJSON: 'v4',
      lng: lang,
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
      resources: {
        en: { translation: en },
        fr: { translation: fr },
        ar: { translation: ar },
      },
      interpolation: { escapeValue: false },
      returnNull: false,
    });

  try {
    const wantRTL = isRTL(lang);
    I18nManager.allowRTL(wantRTL);
    if (I18nManager.isRTL !== wantRTL) {
      I18nManager.forceRTL(wantRTL);
    }
  } catch {
    // ignore
  }

  initialized = true;
  return lang;
}

export async function changeAppLanguage(lang: SupportedLanguage): Promise<{ rtlChanged: boolean }> {
  const prevRTL = I18nManager.isRTL;
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // ignore
  }
  const wantRTL = isRTL(lang);
  try {
    I18nManager.allowRTL(wantRTL);
    if (I18nManager.isRTL !== wantRTL) {
      I18nManager.forceRTL(wantRTL);
    }
  } catch {
    // ignore
  }
  return { rtlChanged: prevRTL !== wantRTL };
}

export default i18n;
