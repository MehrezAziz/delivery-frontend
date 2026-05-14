import { View, Text, StyleSheet } from 'react-native';
import type { SecurityTier } from '../../services/api/security.service';

type ThemeColors = {
  text: string;
  textSecondary: string;
  success?: string;
  danger?: string;
  border: string;
};

function tierPoleColor(index: 0 | 1 | 2, tier: SecurityTier, colors: ThemeColors): string {
  const green = colors.success ?? '#22c55e';
  const red = colors.danger ?? '#ef4444';
  if (tier === 'HIGH') return green;
  if (tier === 'MEDIUM') return index < 2 ? green : red;
  return index === 0 ? green : red;
}

function tierLabel(tier: SecurityTier): string {
  if (tier === 'HIGH') return 'High';
  if (tier === 'MEDIUM') return 'Medium';
  return 'Low';
}

export function SecurityTierPoles({
  tier,
  colors,
  compact,
}: {
  tier: SecurityTier;
  colors: ThemeColors;
  /** Tighter layout for list rows */
  compact?: boolean;
}) {
  const poles: (0 | 1 | 2)[] = [0, 1, 2];
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.tierText, { color: colors.textSecondary }]}>{tierLabel(tier)}</Text>
      <View style={styles.poles}>
        {poles.map((i) => (
          <View
            key={i}
            style={[
              styles.pole,
              compact && styles.poleCompact,
              { backgroundColor: tierPoleColor(i, tier, colors), borderColor: colors.border },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrapCompact: { gap: 8 },
  tierText: { fontSize: 13, fontWeight: '700', minWidth: 52, textAlign: 'right' },
  poles: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 22 },
  pole: { width: 6, height: 20, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  poleCompact: { width: 5, height: 18 },
});
