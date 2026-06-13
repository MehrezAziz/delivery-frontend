/**
 * WelcomeHeroAnimation
 * Pure React Native Animated component — no Lottie, no external files.
 * Characters: Customer (left) hands a box to Driver (right) following a
 * 6-beat storyboard, then loops with a text pause in between.
 *
 * Beat timeline:
 *  0 –1 s  Driver slides in from the right
 *  1 –2 s  Customer extends the box toward the driver
 *  2 –3 s  Driver reaches for the box
 *  3 –4 s  Box transfers  ➜  driver shows 😊 + 👍
 *  4 –5 s  Customer waves  👋  and nods
 *  5 –6 s  Both acknowledge  ✨
 *  6 –6.5s Fade-out before loop
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  primaryColor: string;
  isDark: boolean;
}

export function WelcomeHeroAnimation({ primaryColor, isDark }: Props) {
  const { t } = useTranslation();
  // ── Animated values ──────────────────────────────────────────────────────
  const sceneOpacity  = useRef(new Animated.Value(0)).current;
  const driverX       = useRef(new Animated.Value(60)).current; // approaches from right
  const driverBounce  = useRef(new Animated.Value(0)).current;  // subtle Y hop

  const boxX          = useRef(new Animated.Value(0)).current;  // slides left→right
  const boxScale      = useRef(new Animated.Value(1)).current;  // pulse on grab

  const smileScale    = useRef(new Animated.Value(0)).current;  // 😊 badge
  const thumbScale    = useRef(new Animated.Value(0)).current;  // 👍 badge

  const waveOpacity   = useRef(new Animated.Value(0)).current;  // 👋 appear
  const waveRotate    = useRef(new Animated.Value(0)).current;  // 👋 oscillate
  const customerNodY  = useRef(new Animated.Value(0)).current;  // customer nod

  const sparkOpacity  = useRef(new Animated.Value(0)).current;  // ✨

  // ── Animation loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const run = () => {
      sceneOpacity.setValue(0);
      driverX.setValue(60);
      driverBounce.setValue(0);
      boxX.setValue(0);
      boxScale.setValue(1);
      smileScale.setValue(0);
      thumbScale.setValue(0);
      waveOpacity.setValue(0);
      waveRotate.setValue(0);
      customerNodY.setValue(0);
      sparkOpacity.setValue(0);

      Animated.sequence([
        // Fade the whole scene in (0.35 s)
        Animated.timing(sceneOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),

        // ── Beat 1 (1 s): Driver approaches ─────────────────────────────
        Animated.timing(driverX, {
          toValue: 10,
          duration: 1050,
          easing: Easing.out(Easing.back(1.15)),
          useNativeDriver: true,
        }),

        // ── Beat 2 (1 s): Customer extends box ──────────────────────────
        Animated.timing(boxX, {
          toValue: 36,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),

        // ── Beat 3 (0.8 s): Driver reaches for box ───────────────────────
        Animated.parallel([
          Animated.timing(driverX, {
            toValue: 0,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          // Subtle forward hop
          Animated.sequence([
            Animated.timing(driverBounce, { toValue: -5, duration: 200, useNativeDriver: true }),
            Animated.timing(driverBounce, { toValue: 0,  duration: 200, useNativeDriver: true }),
          ]),
        ]),

        // ── Beat 4 (1 s): Box transfer + 😊 👍 ──────────────────────────
        Animated.parallel([
          // Box leaps to driver with back-easing bounce
          Animated.timing(boxX, {
            toValue: 124,
            duration: 520,
            easing: Easing.out(Easing.back(1.6)),
            useNativeDriver: true,
          }),
          // Box pulse on grab
          Animated.sequence([
            Animated.timing(boxScale, { toValue: 1.22, duration: 220, useNativeDriver: true }),
            Animated.timing(boxScale, { toValue: 1.0,  duration: 200, useNativeDriver: true }),
          ]),
          // Smile springs in
          Animated.sequence([
            Animated.delay(240),
            Animated.spring(smileScale, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }),
          ]),
          // Thumb bounces in after smile
          Animated.sequence([
            Animated.delay(460),
            Animated.spring(thumbScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
          ]),
        ]),

        Animated.delay(260),

        // ── Beat 5 (1 s): Customer waves 👋 + nods ──────────────────────
        Animated.parallel([
          // 👋 slides up and appears
          Animated.parallel([
            Animated.timing(waveOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
          ]),
          // Wave oscillation
          Animated.sequence([
            Animated.timing(waveRotate, { toValue: 1,    duration: 260, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(waveRotate, { toValue: -0.6, duration: 230, useNativeDriver: true }),
            Animated.timing(waveRotate, { toValue: 0.9,  duration: 230, useNativeDriver: true }),
            Animated.timing(waveRotate, { toValue: -0.2, duration: 200, useNativeDriver: true }),
            Animated.timing(waveRotate, { toValue: 0,    duration: 200, useNativeDriver: true }),
          ]),
          // Customer nod (two dips)
          Animated.sequence([
            Animated.timing(customerNodY, { toValue: -5, duration: 200, useNativeDriver: true }),
            Animated.timing(customerNodY, { toValue: 0,  duration: 200, useNativeDriver: true }),
            Animated.timing(customerNodY, { toValue: -4, duration: 170, useNativeDriver: true }),
            Animated.timing(customerNodY, { toValue: 0,  duration: 170, useNativeDriver: true }),
          ]),
        ]),

        // ── Beat 6 (1 s): Mutual acknowledgment ✨ ──────────────────────
        Animated.timing(sparkOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.delay(750),

        // Fade out before next cycle
        Animated.parallel([
          Animated.timing(sceneOpacity,  { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(sparkOpacity,  { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.timing(smileScale,    { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(thumbScale,    { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(waveOpacity,   { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),

        Animated.delay(400),
      ]).start(({ finished }) => {
        if (finished) run();
      });
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Interpolations ────────────────────────────────────────────────────────
  const waveRot = waveRotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-36deg', '0deg', '32deg'],
  });

  // ── Colours ───────────────────────────────────────────────────────────────
  const textColor   = isDark ? '#94A3B8' : '#64748B';
  const groundColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const bgCircle    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  return (
    <Animated.View style={[s.scene, { opacity: sceneOpacity }]}>

      {/* ── Ground line ───────────────────────────────────────────── */}
      <View style={[s.ground, { backgroundColor: groundColor }]} />

      {/* ── CUSTOMER (left, fixed) ────────────────────────────────── */}
      <Animated.View style={[s.charWrap, { transform: [{ translateY: customerNodY }] }]}>
        {/* Avatar circle */}
        <View style={[s.avatarCircle, { backgroundColor: bgCircle }]}>
          {/* Hair */}
          <View style={s.hair} />
          {/* Head */}
          <View style={s.head} />
          {/* Body – casual teal shirt */}
          <View style={[s.body, { backgroundColor: '#0D9488' }]}>
            <View style={s.shirtStripe} />
          </View>
          {/* Static left arm */}
          <View style={[s.arm, s.armL, { transform: [{ rotate: '10deg' }] }]} />
          {/* Right arm (extends with box, then becomes wave base) */}
          <View style={[s.arm, s.armR, { transform: [{ rotate: '-10deg' }] }]} />
        </View>

        {/* 👋 wave emoji – slides in above customer */}
        <Animated.View style={[s.waveWrap, { opacity: waveOpacity }]}>
          <Animated.Text style={[s.waveEmoji, { transform: [{ rotate: waveRot }] }]}>
            👋
          </Animated.Text>
        </Animated.View>

        <Text style={[s.charLabel, { color: textColor }]}>{t('welcomeHero.customer')}</Text>
      </Animated.View>

      {/* ── BOX 📦 (slides from customer → driver) ────────────────── */}
      <Animated.View style={[s.boxWrap, { transform: [{ translateX: boxX }, { scale: boxScale }] }]}>
        {/* Box body */}
        <View style={s.boxBody}>
          <View style={s.tapeH} />
          <View style={s.tapeV} />
        </View>
        {/* Label */}
        <Text style={s.boxLabel}>📦</Text>
      </Animated.View>

      {/* ── DRIVER (right, slides left to approach) ───────────────── */}
      <Animated.View style={[s.charWrap, { transform: [{ translateX: driverX }, { translateY: driverBounce }] }]}>

        {/* 😊 smile bubble */}
        <Animated.View style={[s.smileBubble, { transform: [{ scale: smileScale }] }]}>
          <Text style={s.smileEmoji}>😊</Text>
        </Animated.View>

        {/* 👍 thumb badge */}
        <Animated.View style={[s.thumbBadge, { backgroundColor: primaryColor, transform: [{ scale: thumbScale }] }]}>
          <MaterialCommunityIcons name="thumb-up" size={13} color="#fff" />
        </Animated.View>

        {/* Avatar circle */}
        <View style={[s.avatarCircle, { backgroundColor: bgCircle }]}>
          {/* Delivery cap */}
          <View style={s.cap} />
          <View style={s.capBrim} />
          {/* Head */}
          <View style={s.head} />
          {/* Body – uniform blue */}
          <View style={[s.body, { backgroundColor: '#1D4ED8' }]}>
            <View style={s.uniformBadge} />
          </View>
          {/* Left arm (reaches for box) */}
          <View style={[s.arm, s.armL, { transform: [{ rotate: '-15deg' }] }]} />
          {/* Right arm */}
          <View style={[s.arm, s.armR, { transform: [{ rotate: '10deg' }] }]} />
        </View>

        <Text style={[s.charLabel, { color: textColor }]}>{t('welcomeHero.driver')}</Text>
      </Animated.View>

      {/* ── ✨ sparkle (centre, phase 6) ──────────────────────────── */}
      <Animated.Text style={[s.sparkle, { opacity: sparkOpacity }]}>✨</Animated.Text>

    </Animated.View>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────
const SKIN     = '#F5C5A3';
const HAIR_COL = '#3B2000';
const CAP_COL  = '#1E3A8A';
const HEAD_D   = 30;
const BODY_W   = 30;
const BODY_H   = 40;
const ARM_W    = 9;
const ARM_H    = 24;

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scene: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  ground: {
    position: 'absolute',
    bottom: 20,
    left: 14,
    right: 14,
    height: 2,
    borderRadius: 1,
  },

  // ── Character wrapper ───────────────────────────────────────────────────
  charWrap: {
    alignItems: 'center',
  },
  charLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // ── Avatar shapes ───────────────────────────────────────────────────────
  avatarCircle: {
    width: 58,
    height: 88,
    borderRadius: 16,
    alignItems: 'center',
    paddingTop: 14,
    overflow: 'visible',
    position: 'relative',
  },
  head: {
    width: HEAD_D,
    height: HEAD_D,
    borderRadius: HEAD_D / 2,
    backgroundColor: SKIN,
    zIndex: 2,
  },
  hair: {
    position: 'absolute',
    top: 8,
    width: HEAD_D - 2,
    height: 13,
    borderRadius: 9,
    backgroundColor: HAIR_COL,
    zIndex: 3,
  },
  cap: {
    position: 'absolute',
    top: 2,
    width: HEAD_D,
    height: 14,
    borderRadius: 8,
    backgroundColor: CAP_COL,
    zIndex: 4,
  },
  capBrim: {
    position: 'absolute',
    top: 14,
    width: HEAD_D + 8,
    height: 7,
    borderRadius: 2,
    backgroundColor: '#1E40AF',
    zIndex: 5,
  },
  body: {
    width: BODY_W,
    height: BODY_H,
    borderRadius: 6,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    zIndex: 2,
  },
  shirtStripe: {
    width: '55%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.40)',
    marginTop: 10,
    borderRadius: 2,
  },
  uniformBadge: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginTop: 8,
  },
  arm: {
    position: 'absolute',
    width: ARM_W,
    height: ARM_H,
    backgroundColor: SKIN,
    borderRadius: 5,
    zIndex: 1,
  },
  armL: {
    top: HEAD_D + 18,
    left: 2,
  },
  armR: {
    top: HEAD_D + 18,
    right: 2,
  },

  // ── Box ─────────────────────────────────────────────────────────────────
  boxWrap: {
    position: 'absolute',
    bottom: 28,
    left: 64,
    alignItems: 'center',
  },
  boxBody: {
    width: 28,
    height: 28,
    backgroundColor: '#D97706',
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#92400E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  boxLabel: {
    fontSize: 24,
    marginTop: 1,
  },
  tapeH: {
    position: 'absolute',
    top: '44%',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#92400E',
    opacity: 0.45,
  },
  tapeV: {
    position: 'absolute',
    left: '44%',
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#92400E',
    opacity: 0.45,
  },

  // ── Wave ────────────────────────────────────────────────────────────────
  waveWrap: {
    position: 'absolute',
    top: -8,
    right: -20,
    zIndex: 10,
  },
  waveEmoji: {
    fontSize: 24,
  },

  // ── Driver reaction badges ───────────────────────────────────────────────
  smileBubble: {
    position: 'absolute',
    top: -28,
    right: -4,
    zIndex: 10,
    backgroundColor: '#FEF9C3',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  smileEmoji: {
    fontSize: 18,
  },
  thumbBadge: {
    position: 'absolute',
    top: -24,
    left: -4,
    zIndex: 10,
    borderRadius: 20,
    padding: 7,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  // ── Sparkle ─────────────────────────────────────────────────────────────
  sparkle: {
    position: 'absolute',
    bottom: 52,
    left: '45%',
    fontSize: 24,
  },
});
