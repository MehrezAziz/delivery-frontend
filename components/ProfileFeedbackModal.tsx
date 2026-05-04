import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

export type ProfileFeedbackVariant = 'success' | 'error';

type Props = {
  visible: boolean;
  variant: ProfileFeedbackVariant;
  title: string;
  message: string;
  /** When true, OK navigates back to profile; backdrop always dismisses without navigating. */
  okNavigatesOnPress: boolean;
  onBackdropPress: () => void;
  onOkPress: () => void;
};

export function ProfileFeedbackModal({
  visible,
  variant,
  title,
  message,
  okNavigatesOnPress,
  onBackdropPress,
  onOkPress,
}: Props) {
  const { colors } = useTheme();
  const isSuccess = variant === 'success';
  const iconName = isSuccess ? 'checkmark-circle' : 'alert-circle';
  const accent = isSuccess ? colors.success : colors.danger;
  const iconBg = isSuccess ? colors.successBg : colors.dangerBg;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onBackdropPress}
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.dim, { backgroundColor: 'rgba(2, 6, 23, 0.58)' }]}
          onPress={onBackdropPress}
          accessibilityLabel="Dismiss"
        />
        <View style={styles.centerWrap} pointerEvents="box-none">
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: colors.text,
              } as ViewStyle,
            ]}
          >
            <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
              <Ionicons name={iconName} size={36} color={accent} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
            <TouchableOpacity
              style={[styles.okBtn, { backgroundColor: colors.primary }]}
              onPress={onOkPress}
              activeOpacity={0.85}
            >
              <Text style={styles.okBtnText}>OK</Text>
            </TouchableOpacity>
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              {okNavigatesOnPress
                ? 'Tap outside to stay on this screen.'
                : 'Tap outside to close.'}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
  },
  okBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  okBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
  },
});
