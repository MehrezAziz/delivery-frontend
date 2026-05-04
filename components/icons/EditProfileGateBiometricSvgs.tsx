import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

/**
 * Fingerprint + face marks for the edit-profile gate primary button.
 * Uses Material Community Icons (bundled with Expo) instead of react-native-svg to avoid Metro resolving issues with `react-native-svg` source entry points.
 */
export function SvgFingerprintBadge({ size = 26, color }: { size?: number; color: string }) {
  return <MaterialCommunityIcons name="fingerprint" size={size} color={color} />;
}

export function SvgFaceIdBadge({ size = 26, color }: { size?: number; color: string }) {
  return <MaterialCommunityIcons name="face-recognition" size={size} color={color} />;
}
