import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import {
  RNMLKitFaceDetector,
  type RNMLKitFace,
} from '@infinitered/react-native-mlkit-face-detection';
import { useTheme } from '../../contexts/ThemeContext';
import { LivenessStepCoach } from '../../components/liveness/LivenessStepCoach';
import { useLivenessVoiceEN } from '../../hooks/useLivenessVoiceEN';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const DOCUMENT_TYPES = ['PASSPORT', 'ID_CARD', 'STUDENT_CARD'] as const;

const LIVENESS_STEPS: Array<{
  action: 'TURN_RIGHT' | 'TURN_LEFT' | 'HOLD_HIGH' | 'BLINK';
  progress: number;
}> = [
  // Labels swapped vs ML actions: front-camera preview mirrors left↔right for the driver.
  { action: 'TURN_RIGHT', progress: 25 },
  { action: 'TURN_LEFT', progress: 50 },
  { action: 'HOLD_HIGH', progress: 75 },
  { action: 'BLINK', progress: 100 },
];

/** Throttle ML Kit analysis (Vision Camera preview stays smooth). ~≤40s total with 4 steps if each step completes quickly. */
const TICK_MS = 420;
/** One stable frame is enough — native modules never sent `hasHeadEulerAngle*` so streak was blocking progress. */
const MATCH_STREAK_REQUIRED = 1;
/** Soft cap per pose/blink step (ms); only used for hint text, not auto-fail. */
const MAX_MS_PER_STEP = 10_000;

/**
 * Align with `delivery-verification-ml` InsightFace thresholds.
 * Slightly relaxed vs ±9° so ML Kit (front camera) registers turns a bit sooner.
 */
const TURN_RIGHT_MAX_YAW = -7;
const TURN_LEFT_MIN_YAW = 7;
/** Frontal pose for “look at camera” (neutral yaw/pitch/roll). */
const LOOK_MAX_ABS_YAW = 14;
const LOOK_MAX_ABS_PITCH = 12;
const LOOK_MAX_ABS_ROLL = 22;

/**
 * If “turn right/left” feel reversed vs the on-screen hint numbers, set to `true`.
 * Default `false` uses ML Kit euler Y as returned on the captured photo.
 */
const NEGATE_EULER_Y_FOR_FRONT_CAMERA = false;

const EYE_OPEN_MIN = 0.45;
const EYE_CLOSED_MAX = 0.28;

function photoPathToUri(path: string): string {
  if (path.startsWith('file://')) return path;
  return `file://${path}`;
}

function pickLargestFace(faces: RNMLKitFace[]): RNMLKitFace | null {
  if (!faces.length) return null;
  return faces.reduce((best, f) => {
    const a = (f.frame?.size?.x ?? 0) * (f.frame?.size?.y ?? 0);
    const b = (best.frame?.size?.x ?? 0) * (best.frame?.size?.y ?? 0);
    return a > b ? f : best;
  });
}

/** Native Kotlin/Swift records expose numeric angles only — not `hasHeadEulerAngle*` (TS types are misleading). */
function readAngle(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function getYawPitchRoll(face: RNMLKitFace): { yaw: number | null; pitch: number | null; roll: number | null } {
  let yaw = readAngle(face.headEulerAngleY ?? undefined);
  const pitch = readAngle(face.headEulerAngleX ?? undefined);
  const roll = readAngle(face.headEulerAngleZ ?? undefined);
  if (yaw != null && NEGATE_EULER_Y_FOR_FRONT_CAMERA) {
    yaw = -yaw;
  }
  return { yaw, pitch, roll };
}

function poseMatched(
  action: 'TURN_RIGHT' | 'TURN_LEFT' | 'HOLD_HIGH',
  face: RNMLKitFace,
): boolean {
  const { yaw, pitch, roll } = getYawPitchRoll(face);
  if (yaw == null) {
    return false;
  }
  if (action === 'TURN_RIGHT') {
    return yaw <= TURN_RIGHT_MAX_YAW;
  }
  if (action === 'TURN_LEFT') {
    return yaw >= TURN_LEFT_MIN_YAW;
  }
  const p = pitch ?? 0;
  const r = roll ?? 0;
  return (
    Math.abs(yaw) <= LOOK_MAX_ABS_YAW &&
    Math.abs(p) <= LOOK_MAX_ABS_PITCH &&
    Math.abs(r) <= LOOK_MAX_ABS_ROLL
  );
}

function isOneEyeWink(leftOpen: number, rightOpen: number): boolean {
  return (
    (leftOpen <= EYE_CLOSED_MAX && rightOpen >= EYE_OPEN_MIN) ||
    (rightOpen <= EYE_CLOSED_MAX && leftOpen >= EYE_OPEN_MIN)
  );
}

function formatPoseAngles(face: RNMLKitFace): string {
  const { yaw, pitch } = getYawPitchRoll(face);
  const yawS = yaw == null ? '—' : yaw.toFixed(1);
  const pitchS = pitch == null ? '—' : pitch.toFixed(1);
  return `yaw=${yawS}° pitch=${pitchS}°`;
}

function readEyeOpen(face: RNMLKitFace, side: 'left' | 'right'): number {
  const v =
    side === 'left' ? face.leftEyeOpenProbability : face.rightEyeOpenProbability;
  return typeof v === 'number' && Number.isFinite(v) ? v : 1;
}

export default function DriverRegisterStep3() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string }>();
  const fromVerification = params.source === 'verification';
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const documentTypeLabel = (value: string) => {
    switch (value) {
      case 'ID_CARD':
        return t('auth.nationalId');
      case 'STUDENT_CARD':
        return t('auth.drivingLicense');
      case 'PASSPORT':
      default:
        return t('auth.documentNumber');
    }
  };
  const livenessStepLabel = (idx: number) => {
    const step = LIVENESS_STEPS[idx];
    if (!step) return t('common.done');
    switch (step.action) {
      case 'TURN_RIGHT':
        return t('auth.turnLeft');
      case 'TURN_LEFT':
        return t('auth.turnRight');
      case 'HOLD_HIGH':
        return t('auth.lookStraight');
      case 'BLINK':
        return t('auth.blink');
      default:
        return t('common.done');
    }
  };
  const [documentType, setDocumentType] = useState('');
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [docImageTop, setDocImageTop] = useState<string | null>(null);
  const [docImageBottom, setDocImageBottom] = useState<string | null>(null);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [livenessSteps, setLivenessSteps] = useState<
    Array<{ action: 'TURN_LEFT' | 'TURN_RIGHT' | 'HOLD_HIGH' | 'BLINK'; passed: boolean; imageUri?: string }>
  >([]);
  const [livenessActive, setLivenessActive] = useState(false);
  const [currentLivenessStep, setCurrentLivenessStep] = useState(0);
  const [livenessProgress, setLivenessProgress] = useState(0);
  const [livenessHint, setLivenessHint] = useState(t('auth.livenessHint'));
  const device = useCameraDevice('front');
  const { hasPermission: visionCamGranted, requestPermission: requestVisionPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);
  const detectorRef = useRef<RNMLKitFaceDetector | null>(null);
  const [mlReady, setMlReady] = useState(Platform.OS === 'web');

  const [loading, setLoading] = useState(false);

  const stepIndexRef = useRef(0);
  const detectingRef = useRef(false);
  const matchStreakRef = useRef(0);
  const blinkPhaseRef = useRef<0 | 1 | 2>(0);
  const frameErrorCountRef = useRef(0);
  const stepStartMsRef = useRef(0);
  const thankYouPlayedRef = useRef(false);
  const checkpointSentRef = useRef(false);

  const [livenessSessionPayload, setLivenessSessionPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingFromServer, setPendingFromServer] = useState(false);
  const [pendingExpiresAt, setPendingExpiresAt] = useState<string | null>(null);

  const { playStepCue, playThankYou, voiceReady } = useLivenessVoiceEN(livenessActive);

  useEffect(() => {
    if (!livenessActive || Platform.OS === 'web' || !voiceReady) return;
    void playStepCue(currentLivenessStep);
  }, [livenessActive, currentLivenessStep, voiceReady, playStepCue]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (livenessPassed && !thankYouPlayedRef.current) {
      thankYouPlayedRef.current = true;
      void playThankYou();
    }
    if (!livenessPassed) {
      thankYouPlayedRef.current = false;
    }
  }, [livenessPassed, playThankYou]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (async () => {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        if (!token) return;
        const res = await axios.get(`${API_URL}/auth/driver/register/verification-draft`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data?.pendingLivenessValid) {
          setPendingFromServer(true);
          setLivenessPassed(true);
          setPendingExpiresAt(res.data.pendingLivenessExpiresAt ?? null);
          checkpointSentRef.current = true;
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (
      !livenessPassed ||
      !selfieImage ||
      !livenessSessionPayload ||
      Platform.OS === 'web' ||
      pendingFromServer
    ) {
      return;
    }
    if (checkpointSentRef.current) return;
    checkpointSentRef.current = true;

    void (async () => {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        if (!token) return;
        const formData = new FormData();
        formData.append('livenessSession', JSON.stringify(livenessSessionPayload));
        formData.append('selfieImage', {
          uri: selfieImage,
          name: 'liveness-selfie.jpg',
          type: 'image/jpeg',
        } as any);
        await axios.post(`${API_URL}/auth/driver/register/liveness-checkpoint`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
      } catch (e) {
        console.warn('Liveness checkpoint save failed:', e);
        checkpointSentRef.current = false;
      }
    })();
  }, [livenessPassed, selfieImage, livenessSessionPayload, pendingFromServer]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const d = new RNMLKitFaceDetector(
      {
        performanceMode: 'accurate',
        classificationMode: true,
        landmarkMode: false,
        contourMode: false,
      },
      true,
    );
    detectorRef.current = d;
    d.initialize({
      performanceMode: 'accurate',
      classificationMode: true,
      landmarkMode: false,
      contourMode: false,
    })
      .then(() => setMlReady(true))
      .catch(() => setMlReady(false));
  }, []);

  const advanceLivenessStep = useCallback((photoUri: string) => {
    const idx = stepIndexRef.current;
    const step = LIVENESS_STEPS[idx];

    setLivenessSteps((prev) => {
      const nextSteps = [...prev, { action: step.action, passed: true, imageUri: photoUri }];

      if (idx >= LIVENESS_STEPS.length - 1) {
        setLivenessSessionPayload({
          nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          timestamp: Date.now(),
          passed: true,
          steps: nextSteps,
          mode: 'vision-camera-mlkit-ondevice',
        });
        setSelfieImage(photoUri);
        setLivenessPassed(true);
        setLivenessActive(false);
        setTimeout(() => Alert.alert(t('auth.livenessSuccess'), t('common.success')), 0);
      }

      return nextSteps;
    });

    setLivenessProgress(step.progress);

    if (idx >= LIVENESS_STEPS.length - 1) {
      return;
    }

    const next = idx + 1;
    stepIndexRef.current = next;
    stepStartMsRef.current = Date.now();
    setCurrentLivenessStep(next);
    matchStreakRef.current = 0;
    blinkPhaseRef.current = 0;
  }, []);

  useEffect(() => {
    if (!livenessActive || Platform.OS === 'web' || !mlReady) return;

    const tick = async () => {
      if (detectingRef.current || !cameraRef.current || !detectorRef.current) return;

      detectingRef.current = true;
      try {
        const photo = await cameraRef.current.takePhoto({
          flash: 'off',
          enableShutterSound: false,
        });
        const uri = photoPathToUri(photo.path);
        const result = await detectorRef.current.detectFaces(uri);
        const face = pickLargestFace(result?.faces ?? []);

        const step = LIVENESS_STEPS[stepIndexRef.current];

        if (!face) {
          setLivenessHint(t('auth.livenessHint'));
          matchStreakRef.current = 0;
          frameErrorCountRef.current = 0;
          return;
        }

        if (step.action === 'BLINK') {
          const left = readEyeOpen(face, 'left');
          const right = readEyeOpen(face, 'right');
          const bothOpen = left >= EYE_OPEN_MIN && right >= EYE_OPEN_MIN;

          if (blinkPhaseRef.current === 0) {
            if (bothOpen) {
              blinkPhaseRef.current = 1;
              setLivenessHint(t('auth.blink'));
            } else {
              setLivenessHint(t('auth.lookStraight'));
            }
            return;
          }
          if (blinkPhaseRef.current === 1) {
            if (isOneEyeWink(left, right)) {
              blinkPhaseRef.current = 2;
              setLivenessHint(t('auth.blink'));
            }
            return;
          }
          if (blinkPhaseRef.current === 2) {
            if (bothOpen) {
              advanceLivenessStep(uri);
            }
            return;
          }
          return;
        }

        if (poseMatched(step.action, face)) {
          matchStreakRef.current += 1;
          setLivenessHint(t('auth.holdStill'));
          if (matchStreakRef.current >= MATCH_STREAK_REQUIRED) {
            advanceLivenessStep(uri);
          }
          return;
        }

        matchStreakRef.current = 0;
        {
          const { yaw } = getYawPitchRoll(face);
          let hint =
            yaw == null
              ? t('auth.livenessHint')
              : `${t('auth.livenessHint')} (${formatPoseAngles(face)})`;
          if (Date.now() - stepStartMsRef.current > MAX_MS_PER_STEP) {
            hint += ` — ${t('common.pleaseWait')}`;
          }
          setLivenessHint(hint);
        }
        frameErrorCountRef.current = 0;
      } catch (e) {
        console.warn('Liveness frame:', e);
        frameErrorCountRef.current += 1;
        setLivenessHint(t('auth.livenessFailedBody'));
        if (frameErrorCountRef.current >= 6) {
          setLivenessActive(false);
          setLivenessHint(t('auth.livenessFailedBody'));
          Alert.alert(
            t('auth.livenessFailed'),
            t('auth.livenessFailedBody'),
          );
        }
      } finally {
        detectingRef.current = false;
      }
    };

    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [livenessActive, mlReady, advanceLivenessStep]);

  const startLivenessChallenge = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(t('common.error'), t('auth.livenessHint'));
      return;
    }

    if (!device) {
      Alert.alert(t('auth.cameraPermission'), t('auth.cameraPermissionBody'));
      return;
    }

    if (!visionCamGranted) {
      const granted = await requestVisionPermission();
      if (!granted) {
        Alert.alert(t('common.permissionDenied'), t('auth.cameraPermissionBody'));
        return;
      }
    }

    if (!mlReady) {
      Alert.alert(t('common.pleaseWait'), t('common.loading'));
      return;
    }

    setLivenessSteps([]);
    stepIndexRef.current = 0;
    setCurrentLivenessStep(0);
    setLivenessProgress(0);
    matchStreakRef.current = 0;
    blinkPhaseRef.current = 0;
    setLivenessPassed(false);
    setSelfieImage(null);
    setLivenessSessionPayload(null);
    setPendingFromServer(false);
    setPendingExpiresAt(null);
    checkpointSentRef.current = false;
    setLivenessHint(t('auth.livenessHint'));
    frameErrorCountRef.current = 0;
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) {
      Alert.alert(t('common.error'), t('forgotPassword.sessionExpired'));
      router.push('/(auth)/driver-register-step1');
      return;
    }
    stepStartMsRef.current = Date.now();
    setLivenessActive(true);
  };

  const takeDocumentPhoto = async (side: 'top' | 'bottom') => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.permissionDenied'), t('auth.cameraPermissionBody'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      if (side === 'top') {
        setDocImageTop(result.assets[0].uri);
      } else {
        setDocImageBottom(result.assets[0].uri);
      }
    }
  };

  const cancelLiveness = () => {
    setLivenessActive(false);
    stepIndexRef.current = 0;
    setCurrentLivenessStep(0);
    setLivenessProgress(0);
    setLivenessSteps([]);
    setLivenessPassed(false);
    setSelfieImage(null);
    setLivenessSessionPayload(null);
    setLivenessHint(t('auth.livenessHint'));
    matchStreakRef.current = 0;
    blinkPhaseRef.current = 0;
    frameErrorCountRef.current = 0;
  };

  const handleSkip = () => {
    Alert.alert(
      t('common.skip'),
      t('auth.documentsRequired'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.skip'),
          onPress: () => router.replace('/(driver)/home'),
        },
      ],
    );
  };

  const handleSubmit = async () => {
    if (!documentType) {
      Alert.alert(t('common.error'), t('auth.documentsRequired'));
      return;
    }

    if (!livenessPassed) {
      Alert.alert(t('common.error'), t('auth.livenessFailedBody'));
      return;
    }

    if (!pendingFromServer && (!selfieImage || !livenessSessionPayload)) {
      Alert.alert(t('common.error'), t('auth.livenessFailedBody'));
      return;
    }

    if (!docImageTop) {
      Alert.alert(t('common.error'), t('auth.pleaseUploadAll'));
      return;
    }

    setLoading(true);

    try {
      const token = await AsyncStorage.getItem('accessToken');

      if (!token) {
        Alert.alert(t('common.error'), t('forgotPassword.sessionExpired'));
        router.push('/(auth)/driver-register-step1');
        return;
      }

      const formData = new FormData();
      formData.append('documentType', documentType);

      if (pendingFromServer) {
        formData.append('usePendingLiveness', 'true');
      } else {
        formData.append('livenessSession', JSON.stringify(livenessSessionPayload));
        const selfieFilename = selfieImage!.split('/').pop();
        const selfieMatch = /\.(\w+)$/.exec(selfieFilename || '');
        const selfieType = selfieMatch ? `image/${selfieMatch[1]}` : 'image/jpeg';
        formData.append('selfieImage', {
          uri: selfieImage!,
          name: selfieFilename || 'selfie.jpg',
          type: selfieType,
        } as any);
      }

      const docTopFilename = docImageTop.split('/').pop();
      const docTopMatch = /\.(\w+)$/.exec(docTopFilename || '');
      const docTopType = docTopMatch ? `image/${docTopMatch[1]}` : 'image/jpeg';
      formData.append('docImageTop', {
        uri: docImageTop,
        name: docTopFilename || 'doc-top.jpg',
        type: docTopType,
      } as any);

      if (docImageBottom) {
        const docBottomFilename = docImageBottom.split('/').pop();
        const docBottomMatch = /\.(\w+)$/.exec(docBottomFilename || '');
        const docBottomType = docBottomMatch ? `image/${docBottomMatch[1]}` : 'image/jpeg';
        formData.append('docImageBottom', {
          uri: docImageBottom,
          name: docBottomFilename || 'doc-bottom.jpg',
          type: docBottomType,
        } as any);
      }

      const response = await axios.post(`${API_URL}/auth/driver/register/step3`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      Alert.alert(
        t('auth.registrationSubmitted'),
        response.data.message || t('auth.registrationSubmittedBody'),
        [
          {
            text: t('common.ok'),
            onPress: () => router.replace('/(driver)/home'),
          },
        ],
      );
    } catch (error: any) {
      console.error('Step 3 error:', error);
      Alert.alert(t('common.error'), error.response?.data?.message || t('auth.somethingWentWrongRetry'));
    } finally {
      setLoading(false);
    }
  };

  const livenessUiUnavailable = Platform.OS === 'web' || !device;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollInner}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.heroCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
        {!fromVerification ? (
          <Text style={[styles.stepBadge, { color: colors.primary, backgroundColor: colors.primaryLight }]}>{t('auth.stepOf', { current: 3, total: 3 })}</Text>
        ) : null}
        <Text style={[styles.title, { color: colors.text }]}>
          {fromVerification ? t('auth.submitForReview') : t('auth.driverRegistrationTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {fromVerification ? t('auth.submitForReview') : t('auth.driverRegisterStep3Subtitle')}
        </Text>
      </View>

      {!fromVerification ? (
        <View style={styles.progressContainer}>
          <View style={[styles.progressDot, styles.progressDotComplete]} />
          <View style={[styles.progressLine, { backgroundColor: colors.border }]} />
          <View style={[styles.progressDot, styles.progressDotComplete]} />
          <View style={[styles.progressLine, { backgroundColor: colors.border }]} />
          <View style={[styles.progressDot, styles.progressActive, { backgroundColor: colors.primary }]} />
        </View>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>{t('auth.nationalId')} *</Text>
        <View style={styles.documentTypeContainer}>
          {DOCUMENT_TYPES.map((value) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.documentTypeButton,
                { borderColor: colors.inputBorder, backgroundColor: colors.inputBg },
                documentType === value && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setDocumentType(value)}
            >
              <Text
                style={[
                  styles.documentTypeText,
                  { color: colors.text },
                  documentType === value && styles.documentTypeTextActive,
                ]}
              >
                {documentTypeLabel(value)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>{t('auth.livenessTitle')} *</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          {t('auth.livenessHint')}
        </Text>
        {livenessUiUnavailable ? (
          <View style={[styles.webUnavailable, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
              {Platform.OS === 'web'
                ? t('auth.cameraPermissionBody')
                : t('auth.cameraPermissionBody')}
            </Text>
          </View>
        ) : livenessActive ? (
          <View style={styles.livenessContainer}>
            <View style={styles.livenessCameraBox}>
              <Camera
                ref={cameraRef}
                style={styles.livenessCamera}
                device={device}
                isActive={livenessActive}
                photo
                enableZoomGesture={false}
              />
            </View>
            <Text style={[styles.livenessInstruction, { color: colors.text }]}>
              {`${currentLivenessStep + 1}. ${livenessStepLabel(currentLivenessStep)}`}
            </Text>
            {Platform.OS !== 'web' ? (
              <LivenessStepCoach
                action={LIVENESS_STEPS[currentLivenessStep]?.action ?? 'BLINK'}
                accentColor={colors.primary}
                isDark={isDark}
              />
            ) : null}
            <Text style={[styles.livenessProgressText, { color: colors.primary }]}>
              {`${t('common.loading')}: ${livenessProgress}%`}
            </Text>
            <Text style={[styles.livenessSubHint, { color: colors.textTertiary }]}>{livenessHint}</Text>
            {!mlReady ? (
              <Text style={[styles.livenessSubHint, { color: colors.textTertiary }]}>{t('common.loading')}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.secondaryActionBtn, { borderColor: colors.border, marginTop: 12, alignSelf: 'center' }]}
              onPress={cancelLiveness}
            >
              <Text style={[styles.secondaryActionText, { color: colors.text }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        ) : livenessPassed && pendingFromServer && !selfieImage ? (
          <View
            style={[
              styles.photoButton,
              styles.serverLivenessBox,
              {
                backgroundColor: isDark ? 'rgba(52,199,89,0.12)' : '#ecfdf5',
                borderColor: '#34C759',
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={44} color="#34C759" />
            <Text style={[styles.serverLivenessTitle, { color: colors.text }]}>{t('auth.livenessSuccess')}</Text>
            {pendingExpiresAt ? (
              <Text style={[styles.hint, { color: colors.textTertiary, textAlign: 'center', marginTop: 6 }]}>
                {`${t('auth.submitDocuments')} · ${new Date(pendingExpiresAt).toLocaleString()}`}
              </Text>
            ) : null}
            <TouchableOpacity style={{ marginTop: 14 }} onPress={startLivenessChallenge} hitSlop={8}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.photoButton} onPress={startLivenessChallenge}>
            {selfieImage ? (
              <Image source={{ uri: selfieImage }} style={styles.photoPreview} />
            ) : (
              <View
                style={[
                  styles.photoPlaceholder,
                  { backgroundColor: isDark ? colors.primaryLight : '#f0f9ff', borderColor: colors.primary },
                ]}
              >
                <Ionicons name="camera" size={40} color={colors.primary} />
                <Text style={[styles.photoPlaceholderText, { color: colors.primary }]}>{t('auth.livenessTitle')}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        {livenessPassed ? (
          <Text style={[styles.hint, { color: '#34C759', marginTop: 8 }]}>
            {t('auth.livenessSuccess')}
          </Text>
        ) : null}
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>{t('auth.documentFront')} *</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>{t('auth.captureDocument')}</Text>
        <TouchableOpacity style={styles.photoButton} onPress={() => takeDocumentPhoto('top')}>
          {docImageTop ? (
            <Image source={{ uri: docImageTop }} style={styles.photoPreview} />
          ) : (
            <View
              style={[
                styles.photoPlaceholder,
                { backgroundColor: isDark ? colors.primaryLight : '#f0f9ff', borderColor: colors.primary },
              ]}
            >
              <Ionicons name="document" size={40} color={colors.primary} />
              <Text style={[styles.photoPlaceholderText, { color: colors.primary }]}>{t('auth.uploadFront')}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>{`${t('auth.documentBack')} (${t('common.optional')})`}</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>{t('auth.captureDocument')}</Text>
        <TouchableOpacity style={styles.photoButton} onPress={() => takeDocumentPhoto('bottom')}>
          {docImageBottom ? (
            <Image source={{ uri: docImageBottom }} style={styles.photoPreview} />
          ) : (
            <View
              style={[
                styles.photoPlaceholder,
                { backgroundColor: isDark ? colors.primaryLight : '#f0f9ff', borderColor: colors.primary },
              ]}
            >
              <Ionicons name="document-outline" size={40} color={colors.primary} />
              <Text style={[styles.photoPlaceholderText, { color: colors.primary }]}>{t('auth.uploadBack')}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, { backgroundColor: colors.primary }, loading && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>{t('auth.submitForReview')}</Text>
        )}
      </TouchableOpacity>

      {!fromVerification ? (
        <TouchableOpacity
          style={[styles.skipButton, { borderColor: colors.primary }]}
          onPress={handleSkip}
          disabled={loading}
        >
          <Text style={[styles.skipButtonText, { color: colors.primary }]}>{t('common.skip')}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={[styles.infoBox, { backgroundColor: isDark ? colors.primaryLight : '#f0f9ff' }]}>
        <Ionicons name="information-circle" size={24} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          {t('auth.registrationSubmittedBody')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollInner: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  heroCard: {
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  stepBadge: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  progressActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  progressDotComplete: {
    backgroundColor: '#34C759',
  },
  progressLine: {
    width: 40,
    height: 2,
    marginHorizontal: 8,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  hint: {
    fontSize: 14,
    marginBottom: 12,
  },
  documentTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  documentTypeButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 8,
  },
  documentTypeText: {
    fontSize: 16,
  },
  documentTypeTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  photoButton: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  photoPlaceholderText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  serverLivenessBox: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'solid',
    paddingHorizontal: 16,
  },
  serverLivenessTitle: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  livenessContainer: {
    width: '100%',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
  },
  livenessCameraBox: {
    width: 260,
    height: 330,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  livenessCamera: {
    flex: 1,
  },
  livenessInstruction: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  livenessProgressText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
  },
  livenessSubHint: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  secondaryActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  secondaryActionText: {
    fontWeight: '600',
  },
  webUnavailable: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  submitButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    backgroundColor: 'transparent',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginTop: 20,
    marginBottom: 40,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
