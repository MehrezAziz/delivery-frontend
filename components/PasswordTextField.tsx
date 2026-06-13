import { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../contexts/ThemeContext';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  colors: ThemeColors;
  placeholder?: string;
  autoFocus?: boolean;
  editable?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export function PasswordTextField({
  value,
  onChangeText,
  colors,
  placeholder,
  autoFocus,
  editable = true,
  containerStyle,
}: Props) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('auth.password');

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.inputBg, borderColor: colors.border },
        containerStyle,
      ]}
    >
      <TextInput
        style={[styles.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={resolvedPlaceholder}
        placeholderTextColor={colors.textTertiary}
        secureTextEntry={!visible}
        autoFocus={autoFocus}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={visible ? t('passwordField.hidePassword') : t('passwordField.showPassword')}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={22}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
    paddingRight: 8,
  },
});
