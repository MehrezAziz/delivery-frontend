import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  count: number;
  /** Bubble / icon tint (e.g. `colors.primary`). */
  iconColor?: string;
  /** Icon chip background (e.g. light blue wash); defaults from `iconColor`. */
  iconBg?: string;
  style?: ViewStyle;
};

/** Chat-style bubble with red unread count on the top-right of the icon cluster (anchored top-right of parent card). */
export function ActiveOrderChatUnreadBadge({
  count,
  iconColor = '#0284c7',
  iconBg,
  style,
}: Props) {
  const { t } = useTranslation();
  if (count <= 0) return null;

  const wash = iconBg ?? `${iconColor}20`;

  return (
    <View style={[styles.anchor, style]} pointerEvents="box-none" accessibilityLabel={`${count}${t('chat.unreadMessagesSuffix')}`}>
      <View style={[styles.iconChip, { backgroundColor: wash }]}>
        <Ionicons name="chatbubbles-outline" size={17} color={iconColor} />
      </View>
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Sits past the card’s inner padding, hugging the rounded top-right corner. */
  anchor: {
    position: 'absolute',
    top: -10,
    right: -10,
    zIndex: 2,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  countText: { color: '#fff', fontSize: 9, fontWeight: '800', marginTop: -0.5 },
});
