import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Props = {
  visible: boolean;
  message?: string;
  onDone?: () => void;
};

const CONFETTI_COLORS = ['#22C55E', '#EAB308', '#3B82F6', '#EC4899', '#F97316', '#A855F7'];

/**
 * Bursting confetti + scaling check-mark badge shown when the user answers correctly.
 * The parent controls visibility; we auto-hide via `onDone` ~1.4s after appearing.
 */
export function CorrectCelebration({ visible, message = 'Correct!', onDone }: Props) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const confetti = useRef(
    Array.from({ length: 18 }, () => ({
      tx: new Animated.Value(0),
      ty: new Animated.Value(0),
      rot: new Animated.Value(0),
      op: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0);
    fade.setValue(0);

    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      ...confetti.flatMap((c, i) => {
        c.tx.setValue(0);
        c.ty.setValue(0);
        c.rot.setValue(0);
        c.op.setValue(1);
        const angle = (i / confetti.length) * Math.PI * 2;
        const dist = 140 + Math.random() * 110;
        return [
          Animated.timing(c.tx, {
            toValue: Math.cos(angle) * dist,
            duration: 900 + Math.random() * 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(c.ty, {
            toValue: Math.sin(angle) * dist + 60,
            duration: 900 + Math.random() * 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(c.rot, {
            toValue: (Math.random() - 0.5) * 4,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(c.op, {
            toValue: 0,
            duration: 1200,
            delay: 200,
            useNativeDriver: true,
          }),
        ];
      }),
    ]).start();

    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        onDone?.();
      });
    }, 1300);

    return () => clearTimeout(t);
  }, [visible, scale, fade, confetti, onDone]);

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.root, { opacity: fade }]}>
      <View style={styles.center}>
        {confetti.map((c, i) => {
          const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
          const rot = c.rot.interpolate({
            inputRange: [-4, 4],
            outputRange: ['-720deg', '720deg'],
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.confetti,
                {
                  backgroundColor: color,
                  opacity: c.op,
                  transform: [{ translateX: c.tx }, { translateY: c.ty }, { rotate: rot }],
                },
              ]}
            />
          );
        })}
        <Animated.View
          style={[
            styles.badge,
            {
              backgroundColor: colors.primary,
              transform: [{ scale }],
              shadowColor: colors.primary,
            },
          ]}
        >
          <Ionicons name="checkmark" size={56} color="#fff" />
        </Animated.View>
        <Animated.Text
          style={[
            styles.msg,
            { color: colors.text, opacity: fade, transform: [{ scale }] },
          ]}
        >
          {message}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  center: {
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  msg: {
    position: 'absolute',
    top: 80,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  confetti: {
    position: 'absolute',
    width: 10,
    height: 14,
    borderRadius: 2,
  },
});
