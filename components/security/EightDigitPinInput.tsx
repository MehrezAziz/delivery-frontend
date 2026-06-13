import { useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../contexts/ThemeContext';

type Props = {
  value: string;
  onChange: (next: string) => void;
  colors: ThemeColors;
  disabled?: boolean;
  /** Focus hidden field so the numeric keyboard opens (e.g. Security gate). */
  autoFocus?: boolean;
  /** Bump to request focus again after clearing the PIN (e.g. wrong PIN). */
  focusNonce?: number;
  /** Fired when the 8th digit is entered (parent runs verify / unlock). */
  onFilled?: (code: string) => void;
};

/** Hidden numeric field + 8 filled boxes for PIN entry. */
export function EightDigitPinInput({
  value,
  onChange,
  colors,
  disabled,
  autoFocus,
  focusNonce = 0,
  onFilled,
}: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const safe = value.replace(/\D/g, '').slice(0, 8);
  const slots = Array.from({ length: 8 }, (_, i) => safe[i]);
  /** Index of the next empty cell (0–7), or -1 when complete. */
  const activeIdx = safe.length < 8 ? safe.length : -1;

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [autoFocus, disabled, focusNonce]);

  return (
    <Pressable onPress={() => !disabled && inputRef.current?.focus()} style={styles.wrap}>
      <TextInput
        ref={inputRef}
        value={safe}
        onChangeText={(t) => {
          const next = t.replace(/\D/g, '').slice(0, 8);
          onChange(next);
          if (next.length === 8 && onFilled) {
            queueMicrotask(() => onFilled(next));
          }
        }}
        keyboardType="number-pad"
        maxLength={8}
        secureTextEntry
        editable={!disabled}
        showSoftInputOnFocus
        style={styles.hidden}
        accessibilityLabel={t('security.eightDigitPin')}
      />
      <View style={styles.row}>
        {slots.map((ch, i) => {
          const filled = !!ch;
          const selectedEmpty = !disabled && !filled && activeIdx === i;
          const borderColor = filled ? colors.primary : selectedEmpty ? colors.primary : colors.border;
          const borderWidth = selectedEmpty ? 2.5 : 1.5;
          const backgroundColor = filled
            ? colors.card
            : selectedEmpty
              ? colors.primaryLight
              : colors.card;
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  borderColor,
                  borderWidth,
                  backgroundColor,
                  opacity: disabled ? 0.55 : 1,
                },
              ]}
            >
              <Text style={[styles.dot, { color: colors.text }]}>{ch ? '●' : ''}</Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  box: {
    flex: 1,
    minWidth: 28,
    maxWidth: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { fontSize: 14, fontWeight: '800' },
});
