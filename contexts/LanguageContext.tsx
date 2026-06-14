import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  changeAppLanguage,
  initI18n,
  isRTL,
} from '../i18n';
import i18n from '../i18n';

type LanguageContextValue = {
  language: SupportedLanguage;
  isRTL: boolean;
  ready: boolean;
  setLanguage: (lang: SupportedLanguage) => Promise<{ rtlChanged: boolean }>;
  supported: readonly SupportedLanguage[];
};

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  isRTL: false,
  ready: false,
  setLanguage: async () => ({ rtlChanged: false }),
  supported: SUPPORTED_LANGUAGES,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const lang = await initI18n();
      if (!mounted) return;
      setLanguageState(lang);
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onChange = (lng: string) => {
      if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lng)) {
        setLanguageState(lng as SupportedLanguage);
      }
    };
    i18n.on('languageChanged', onChange);
    return () => {
      i18n.off('languageChanged', onChange);
    };
  }, []);

  const setLanguage = useCallback(async (lang: SupportedLanguage) => {
    const result = await changeAppLanguage(lang);
    setLanguageState(lang);
    return result;
  }, []);

  return (
    <LanguageContext.Provider
      value={{
        language,
        isRTL: isRTL(language),
        ready,
        setLanguage,
        supported: SUPPORTED_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
