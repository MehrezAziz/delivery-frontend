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
import { useRouter } from 'expo-router';
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

const DOCUMENT_TYPES = [
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'ID_CARD', label: 'ID Card' },
  { value: 'STUDENT_CARD', label: 'Student Card' },
];

const LIVENESS_STEPS: Array<{
  action: 'TURN_RIGHT' | 'TURN_LEFT' | 'HOLD_HIGH' | 'BLINK';
  label: string;
  progress: number;
}> = [
  // Labels swapped vs ML actions: front-camera preview mirrors left↔right for the driver.
  { action: 'TURN_RIGHT', label: 'Turn your face left', progress: 25 },
  { action: 'TURN_LEFT', label: 'Turn your face right', progress: 50 },
  { action: 'HOLD_HIGH', label: 'Hold your head high', progress: 75 },
  { action: 'BLINK', label: 'Blink your eyes', progress: 100 },
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
const HOLD_MAX_ABS_YAW = 16;
const HOLD_MIN_PITCH_UP = -4;
const HOLD_MAX_ABS_ROLL = 22;

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
    Math.abs(yaw) <= HOLD_MAX_ABS_YAW &&
    p <= HOLD_MIN_PITCH_UP &&
    Math.abs(r) <= HOLD_MAX_ABS_ROLL
  );
}

function formatPoseHint(face: RNMLKitFace | null): string {
  if (!face) return 'No face detected. Keep your full face inside the frame.';
  const { yaw, pitch } = getYawPitchRoll(face);
  const yawS = yaw == null ? '—' : yaw.toFixed(1);
  const pitchS = pitch == null ? '—' : pitch.toFixed(1);
  return `Adjust position. yaw=${yawS}° pitch=${pitchS}°`;
}

function readEyeOpen(face: RNMLKitFace, side: 'left' | 'right'): number {
  const v =
    side === 'left' ? face.leftEyeOpenProbability : face.rightEyeOpenProbability;
  return typeof v === 'number' && Number.isFinite(v) ? v : 1;
}

export default function DriverRegisterStep3() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
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
  const [livenessHint, setLivenessHint] = useState('Center your face in the frame.');
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
    setLivenessSteps((prev) => [...prev, { action: step.action, passed: true, imageUri: photoUri }]);
    setLivenessProgress(step.progress);

    if (idx >= LIVENESS_STEPS.length - 1) {
      setSelfieImage(photoUri);
      setLivenessPassed(true);
      setLivenessActive(false);
      Alert.alert('Liveness Complete', 'Step 1 Completed successfully!');
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
          setLivenessHint('No face detected. Keep your full face inside the box.');
          matchStreakRef.current = 0;
          frameErrorCountRef.current = 0;
          return;
        }

        if (step.action === 'BLINK') {
          const left = readEyeOpen(face, 'left');
          const right = readEyeOpen(face, 'right');
          const minOpen = Math.min(left, right);

          if (blinkPhaseRef.current === 0) {
            if (minOpen >= EYE_OPEN_MIN) {
              blinkPhaseRef.current = 1;
              setLivenessHint('Now blink once.');
            } else {
              setLivenessHint('Open your eyes and look at the camera.');
            }
            return;
          }
          if (blinkPhaseRef.current === 1) {
            if (minOpen <= EYE_CLOSED_MAX) {
              blinkPhaseRef.current = 2;
              setLivenessHint('Great. Open your eyes again.');
            }
            return;
          }
          if (blinkPhaseRef.current === 2) {
            if (minOpen >= EYE_OPEN_MIN) {
              advanceLivenessStep(uri);
            }
            return;
          }
          return;
        }

        if (poseMatched(step.action, face)) {
          matchStreakRef.current += 1;
          setLivenessHint('Good. Hold that position.');
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
              ? 'Face found, but head angles are missing. Use good light and keep your face centered.'
              : formatPoseHint(face);
          if (Date.now() - stepStartMsRef.current > MAX_MS_PER_STEP) {
            hint += ' — aim for under 10s per step.';
          }
          setLivenessHint(hint);
        }
        frameErrorCountRef.current = 0;
      } catch (e) {
        console.warn('Liveness frame:', e);
        frameErrorCountRef.current += 1;
        setLivenessHint('Face analysis failed. Retrying...');
        if (frameErrorCountRef.current >= 6) {
          setLivenessActive(false);
          setLivenessHint('On-device analysis failed. Please try again.');
          Alert.alert(
            'Liveness error',
            'Could not analyze camera frames. Ensure you are on a supported device and try again.',
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
      Alert.alert('Not available on web', 'Complete verification in the Android or iOS app.');
      return;
    }

    if (!device) {
      Alert.alert('Camera unavailable', 'No front camera was found on this device.');
      return;
    }

    if (!visionCamGranted) {
      const granted = await requestVisionPermission();
      if (!granted) {
        Alert.alert('Permission Denied', 'We need camera permissions to run liveness check.');
        return;
      }
    }

    if (!mlReady) {
      Alert.alert('Please wait', 'Face detection is still loading. Try again in a moment.');
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
    setLivenessHint('Center your face in the frame.');
    frameErrorCountRef.current = 0;
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) {
      Alert.alert('Error', 'Session expired. Please start registration again.');
      router.push('/(auth)/driver-register-step1');
      return;
    }
    stepStartMsRef.current = Date.now();
    setLivenessActive(true);
  };

  const takeDocumentPhoto = async (side: 'top' | 'bottom') => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'We need camera permissions.');
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
    setLivenessHint('Center your face in the frame.');
    matchStreakRef.current = 0;
    blinkPhaseRef.current = 0;
    frameErrorCountRef.current = 0;
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Verification?',
      'You can complete document verification later from your profile. Your account will remain INCOMPLETE until verified.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Skip for Now',
          onPress: () => router.replace('/(driver)/home'),
        },
      ],
    );
  };

  const handleSubmit = async () => {
    if (!documentType) {
      Alert.alert('Error', 'Please select a document type');
      return;
    }

    if (!livenessPassed || !selfieImage) {
      Alert.alert('Error', 'Please complete the liveness check first');
      return;
    }

    if (!docImageTop) {
      Alert.alert('Error', 'Please capture the front of your document');
      return;
    }

    setLoading(true);

    try {
      const token = await AsyncStorage.getItem('accessToken');

      if (!token) {
        Alert.alert('Error', 'Session expired. Please start registration again.');
        router.push('/(auth)/driver-register-step1');
        return;
      }

      const formData = new FormData();
      formData.append('documentType', documentType);
      formData.append(
        'livenessSession',
        JSON.stringify({
          nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          timestamp: Date.now(),
          passed: livenessPassed,
          steps: livenessSteps,
          mode: 'vision-camera-mlkit-ondevice',
        }),
      );

      const selfieFilename = selfieImage.split('/').pop();
      const selfieMatch = /\.(\w+)$/.exec(selfieFilename || '');
      const selfieType = selfieMatch ? `image/${selfieMatch[1]}` : 'image/jpeg';
      formData.append('selfieImage', {
        uri: selfieImage,
        name: selfieFilename || 'selfie.jpg',
        type: selfieType,
      } as any);

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
        'Registration Complete!',
        response.data.message || 'Your documents have been submitted for review.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(driver)/home'),
          },
        ],
      );
    } catch (error: any) {
      console.error('Step 3 error:', error);
      Alert.alert('Error', error.response?.data?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.canGoBack() ? router.back() : router.replace('/');
  };

  const livenessUiUnavailable = Platform.OS === 'web' || !device;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={[styles.backBtn, { backgroundColor: colors.surfaceVariant }]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Driver Registration</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Step 3 of 3: Document Verification</Text>
      </View>

      <View style={styles.progressContainer}>
        <View style={[styles.progressDot, styles.progressDotComplete]} />
        <View style={[styles.progressLine, { backgroundColor: colors.border }]} />
        <View style={[styles.progressDot, styles.progressDotComplete]} />
        <View style={[styles.progressLine, { backgroundColor: colors.border }]} />
        <View style={[styles.progressDot, styles.progressActive, { backgroundColor: colors.primary }]} />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Document Type *</Text>
        <View style={styles.documentTypeContainer}>
          {DOCUMENT_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.documentTypeButton,
                { borderColor: colors.inputBorder, backgroundColor: colors.inputBg },
                documentType === type.value && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setDocumentType(type.value)}
            >
              <Text
                style={[
                  styles.documentTypeText,
                  { color: colors.text },
                  documentType === type.value && styles.documentTypeTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Realtime Liveness Check *</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          Follow each pose. Pose and blink are verified on-device (Google ML Kit) with a smooth camera preview — no
          server round-trip during the challenge. One final selfie is sent with your documents for InsightFace review.
        </Text>
        {livenessUiUnavailable ? (
          <View style={[styles.webUnavailable, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
              {Platform.OS === 'web'
                ? 'Liveness runs in the native app (Android/iOS) only.'
                : 'No front camera found. Use a physical device.'}
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
              {`${currentLivenessStep + 1}. ${LIVENESS_STEPS[currentLivenessStep]?.label ?? 'Done'}`}
            </Text>
            {Platform.OS !== 'web' ? (
              <LivenessStepCoach
                action={LIVENESS_STEPS[currentLivenessStep]?.action ?? 'BLINK'}
                accentColor={colors.primary}
                isDark={isDark}
              />
            ) : null}
            <Text style={[styles.livenessProgressText, { color: colors.primary }]}>
              Progress: {livenessProgress}%
            </Text>
            <Text style={[styles.livenessSubHint, { color: colors.textTertiary }]}>{livenessHint}</Text>
            {!mlReady ? (
              <Text style={[styles.livenessSubHint, { color: colors.textTertiary }]}>Loading face detection…</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.secondaryActionBtn, { borderColor: colors.border, marginTop: 12, alignSelf: 'center' }]}
              onPress={cancelLiveness}
            >
              <Text style={[styles.secondaryActionText, { color: colors.text }]}>Cancel</Text>
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
                <Text style={[styles.photoPlaceholderText, { color: colors.primary }]}>Start Liveness Check</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        {livenessPassed ? (
          <Text style={[styles.hint, { color: '#34C759', marginTop: 8 }]}>
            Liveness completed at 100%. Step 1 Completed successfully!
          </Text>
        ) : null}
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Document Front *</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>Capture the front side of your document</Text>
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
              <Text style={[styles.photoPlaceholderText, { color: colors.primary }]}>Capture Front</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Document Back (Optional)</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>Capture the back side if applicable</Text>
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
              <Text style={[styles.photoPlaceholderText, { color: colors.primary }]}>Capture Back</Text>
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
          <Text style={styles.submitButtonText}>Submit for Verification</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={[styles.skipButton, { borderColor: colors.primary }]} onPress={handleSkip} disabled={loading}>
        <Text style={[styles.skipButtonText, { color: colors.primary }]}>Skip for Now</Text>
      </TouchableOpacity>

      <View style={[styles.infoBox, { backgroundColor: isDark ? colors.primaryLight : '#f0f9ff' }]}>
        <Ionicons name="information-circle" size={24} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Your documents will be reviewed by our team. You will be notified once verified.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 20,
    marginTop: 20,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
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
