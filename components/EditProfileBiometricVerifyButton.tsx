import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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

/** Primary gate action: fingerprint + Face ID copy + face mesh icons */
export function EditProfileBiometricVerifyButton({
  onPress,
  disabled,
  verifying,
  colors,
  label,
}: Props) {
  const { t } = useTranslation();
  const iconColor = '#ffffff';
  const resolvedLabel = label ?? t('biometric.faceAndFingerprint');

  return (
    <TouchableOpacity
      style={[styles.wrap, { backgroundColor: colors.primary }, (disabled || verifying) && styles.dim]}
      onPress={onPress}
      disabled={disabled || verifying}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={t('biometric.faceAndFingerprint')}
    >
      {verifying ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <View style={styles.row}>
          <SvgFaceIdBadge size={26} color={iconColor} />
          
          <Text style={styles.label} numberOfLines={2}>
            {resolvedLabel}
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
