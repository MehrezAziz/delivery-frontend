import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeColors {
  background: string;
  surface: string;
  surfaceVariant: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  primary: string;
  primaryLight: string;
  card: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  tabBar: string;
  tabBarBorder: string;
  headerBg: string;
  statusBarBg: string;
  skeleton: string;
  danger: string;
  dangerBg: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
}

const lightColors: ThemeColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceVariant: '#f1f5f9',
  text: '#111827',
  textSecondary: '#6b7280',
  textTertiary: '#9ca3af',
  border: '#e5e7eb',
  primary: '#0284c7',
  primaryLight: '#e0f2fe',
  card: '#ffffff',
  cardBorder: '#f3f4f6',
  inputBg: '#ffffff',
  inputBorder: '#d1d5db',
  tabBar: '#ffffff',
  tabBarBorder: '#e5e7eb',
  headerBg: '#0284c7',
  statusBarBg: '#0284c7',
  skeleton: '#e5e7eb',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  success: '#16a34a',
  successBg: '#dcfce7',
  warning: '#ca8a04',
  warningBg: '#fef9c3',
};

const darkColors: ThemeColors = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceVariant: '#334155',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  border: '#334155',
  primary: '#0ea5e9',
  primaryLight: '#0c4a6e',
  card: '#1e293b',
  cardBorder: '#334155',
  inputBg: '#1e293b',
  inputBorder: '#475569',
  tabBar: '#1e293b',
  tabBarBorder: '#334155',
  headerBg: '#0c4a6e',
  statusBarBg: '#0c4a6e',
  skeleton: '#334155',
  danger: '#ef4444',
  dangerBg: '#450a0a',
  success: '#22c55e',
  successBg: '#052e16',
  warning: '#eab308',
  warningBg: '#422006',
};

interface ThemeContextType {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: lightColors,
  isDark: false,
  mode: 'system',
  setMode: () => {},
  toggleTheme: () => {},
});

const THEME_KEY = '@app_theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setModeState(saved);
      }
      setLoaded(true);
    });
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(THEME_KEY, newMode);
  }, []);

  const toggleTheme = useCallback(() => {
    const resolvedDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
    const newMode = resolvedDark ? 'light' : 'dark';
    setMode(newMode);
  }, [mode, systemScheme, setMode]);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ colors, isDark, mode, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { lightColors, darkColors };
export type { ThemeColors, ThemeMode };
