import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SvgFingerprintBadge, SvgFaceIdBadge } from './icons/EditProfileGateBiometricSvgs';
import type { ThemeColors } from '../contexts/ThemeContext';

type Props = {
  onPress: () => void;
  disabled?: boolean;
  verifying: boolean;
  colors: ThemeColors;
  /** Device-specific label (e.g. edit-profile gate). Defaults to neutral copy for flows like create-order. */
  label?: string;
};

const DEFAULT_LABEL = 'Face ID - Fingerprint';

/** Primary gate action: fingerprint + Face ID copy + face mesh icons */
export function EditProfileBiometricVerifyButton({
  onPress,
  disabled,
  verifying,
  colors,
  label = DEFAULT_LABEL,
}: Props) {
  const iconColor = '#ffffff';

  return (
    <TouchableOpacity
      style={[styles.wrap, { backgroundColor: colors.primary }, (disabled || verifying) && styles.dim]}
      onPress={onPress}
      disabled={disabled || verifying}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel="Face ID and fingerprint verification"
    >
      {verifying ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <View style={styles.row}>
          <SvgFaceIdBadge size={26} color={iconColor} />
          
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
          <SvgFingerprintBadge size={26} color={iconColor} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  dim: { opacity: 0.85 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
});
