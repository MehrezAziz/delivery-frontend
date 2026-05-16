import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  icon?: IconName;
  iconColor?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
};

export function ThemedConfirmDialog({
  visible,
  onClose,
  title,
  message,
  icon = 'help-circle-outline',
  iconColor,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
}: Props) {
  const { colors, isDark } = useTheme();
  const overlayTint = isDark ? 'rgba(0,0,0,0.68)' : 'rgba(15,23,42,0.48)';
  const accent = iconColor ?? (destructive ? colors.danger ?? '#dc2626' : colors.primary);
  const confirmBg = destructive ? colors.danger ?? '#dc2626' : colors.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => !busy && onClose()}
    >
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: overlayTint }]}
          onPress={() => !busy && onClose()}
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
        />
        <View style={styles.align} pointerEvents="box-none">
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: isDark ? '#000' : '#0f172a',
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={[styles.iconWrap, { backgroundColor: accent + '1a', borderColor: accent + '44' }]}>
              <Ionicons name={icon} size={28} color={accent} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btnSecondary, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                onPress={onClose}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Text style={[styles.btnSecondaryText, { color: colors.text }]}>{cancelLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: confirmBg }]}
                onPress={onConfirm}
                disabled={busy}
                activeOpacity={0.9}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  align: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    width: '100%',
  },
  btnSecondary: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnSecondaryText: { fontWeight: '800', fontSize: 15 },
  btnPrimary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
