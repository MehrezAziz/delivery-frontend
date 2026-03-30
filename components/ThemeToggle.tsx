import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  size?: number;
  color?: string;
  style?: any;
}

export function ThemeToggle({ size = 22, color, style }: ThemeToggleProps) {
  const { isDark, toggleTheme, colors } = useTheme();
  const iconColor = color || (isDark ? '#fbbf24' : '#6b7280');

  return (
    <TouchableOpacity
      onPress={toggleTheme}
      style={[s.btn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }, style]}
      activeOpacity={0.7}
      accessibilityLabel="Toggle dark mode"
      accessibilityRole="button"
    >
      <Ionicons name={isDark ? 'sunny' : 'moon'} size={size} color={iconColor} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
