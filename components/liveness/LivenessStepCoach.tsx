import React, { useEffect } from 'react';
import { Text, StyleSheet, View, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

type LivenessAction = 'TURN_RIGHT' | 'TURN_LEFT' | 'HOLD_HIGH' | 'BLINK';

const EMOJI: Record<LivenessAction, string> = {
  TURN_RIGHT: '👈',
  TURN_LEFT: '👉',
  HOLD_HIGH: '🙂',
  BLINK: '😉',
};

type Props = {
  action: LivenessAction;
  accentColor: string;
  isDark: boolean;
};

export function LivenessStepCoach({ action, accentColor, isDark }: Props) {
  const t = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(t);
    t.value = 0;

    if (Platform.OS === 'web') return;

    if (action === 'TURN_RIGHT') {
      t.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 650, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 650, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else if (action === 'TURN_LEFT') {
      t.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 650, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 650, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else if (action === 'HOLD_HIGH') {
      t.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    } else if (action === 'BLINK') {
      t.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 350, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 550, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    }

    return () => {
      cancelAnimation(t);
    };
  }, [action, t]);

  const animatedStyle = useAnimatedStyle(() => {
    if (action === 'TURN_RIGHT') {
      return { transform: [{ translateX: -10 + t.value * 20 }, { rotateZ: `${-14 + t.value * 28}deg` }] };
    }
    if (action === 'TURN_LEFT') {
      return { transform: [{ translateX: 10 - t.value * 20 }, { rotateZ: `${14 - t.value * 28}deg` }] };
    }
    if (action === 'HOLD_HIGH') {
      return { transform: [{ scale: 0.94 + t.value * 0.08 }] };
    }
    if (action === 'BLINK') {
      return {
        transform: [{ rotateZ: `${-5 + t.value * 10}deg` }, { scale: 0.92 + t.value * 0.1 }],
      };
    }
    return {};
  }, [action]);

  return (
    <View
      style={[
        styles.wrap,
        { borderColor: accentColor, backgroundColor: isDark ? 'rgba(15,23,42,0.5)' : 'rgba(255,255,255,0.92)' },
      ]}
    >
      <Animated.Text style={[styles.emoji, animatedStyle]} accessibilityLabel="Liveness demo animation">
        {EMOJI[action]}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 46,
    textAlign: 'center',
  },
});
