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
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FaceDetector from 'expo-face-detector';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';

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
  { action: 'TURN_RIGHT', label: 'Turn your face right', progress: 25 },
  { action: 'TURN_LEFT', label: 'Turn your face left', progress: 50 },
  { action: 'HOLD_HIGH', label: 'Hold your head high', progress: 75 },
  { action: 'BLINK', label: 'Blink your eyes', progress: 100 },
];

const DETECT_OPTIONS: FaceDetector.DetectionOptions = {
  mode: FaceDetector.FaceDetectorMode.fast,
  detectLandmarks: FaceDetector.FaceDetectorLandmarks.none,
  runClassifications: FaceDetector.FaceDetectorClassifications.all,
};

const STABLE_POSE_FRAMES = 4;
const DETECT_INTERVAL_MS = 480;

function poseMatchesStep(
  action: (typeof LIVENESS_STEPS)[number]['action'],
  face: FaceDetector.FaceFeature,
  imageHeight: number,
): boolean {
  const yaw = face.yawAngle ?? 0;
  const roll = face.rollAngle ?? 0;
  const originY = face.bounds?.origin?.y ?? imageHeight * 0.45;
  const ratioY = originY / Math.max(imageHeight, 1);

  switch (action) {
    case 'TURN_RIGHT':
      return Platform.OS === 'ios' ? yaw < -9 : yaw < -7;
    case 'TURN_LEFT':
      return Platform.OS === 'ios' ? yaw > 9 : yaw > 7;
    case 'HOLD_HIGH':
      return Math.abs(yaw) < 14 && Math.abs(roll) < 24 && ratioY < 0.35;
    default:
      return false;
  }
}

type BlinkPhase = { phase: 0 | 1 | 2 };

function tryRegisterBlink(face: FaceDetector.FaceFeature, ref: React.MutableRefObject<BlinkPhase>): boolean {
  const l = face.leftEyeOpenProbability;
  const r = face.rightEyeOpenProbability;
  if (l == null || r == null) return false;
  const open = Math.min(l, r);
  const p = ref.current.phase;
  if (p === 0) {
    if (open > 0.55) ref.current.phase = 1;
  } else if (p === 1) {
    if (open < 0.38) ref.current.phase = 2;
  } else if (p === 2) {
    if (open > 0.55) {
      ref.current.phase = 0;
      return true;
    }
  }
  return false;
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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);

  const stepIndexRef = useRef(0);
  const stableHitsRef = useRef(0);
  const blinkPhaseRef = useRef<BlinkPhase>({ phase: 0 });
  const detectingRef = useRef(false);

  const advanceLivenessStep = useCallback((photoUri: string) => {
    const idx = stepIndexRef.current;
    const step = LIVENESS_STEPS[idx];
    setLivenessSteps((prev) => [...prev, { action: step.action, passed: true, imageUri: photoUri }]);
    setLivenessProgress(step.progress);

    if (idx >= LIVENESS_STEPS.length - 1) {
      setSelfieImage(photoUri);
      setLivenessPassed(true);
      setLivenessActive(false);
      stableHitsRef.current = 0;
      Alert.alert('Liveness Complete', 'Step 1 Completed successfully!');
      return;
    }

    const next = idx + 1;
    stepIndexRef.current = next;
    setCurrentLivenessStep(next);
    stableHitsRef.current = 0;
    blinkPhaseRef.current = { phase: 0 };
  }, []);

  useEffect(() => {
    if (!livenessActive) return;

    const tick = async () => {
      if (detectingRef.current || !cameraRef.current) return;
      detectingRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.22,
          skipProcessing: true,
        });
        const { faces, image } = await FaceDetector.detectFacesAsync(photo.uri, DETECT_OPTIONS);
        const face = faces[0];
        const idx = stepIndexRef.current;
        const step = LIVENESS_STEPS[idx];

        if (!face) {
          stableHitsRef.current = 0;
          return;
        }

        if (step.action === 'BLINK') {
          if (tryRegisterBlink(face, blinkPhaseRef)) {
            advanceLivenessStep(photo.uri);
          }
          return;
        }

        if (poseMatchesStep(step.action, face, image.height)) {
          stableHitsRef.current += 1;
          if (stableHitsRef.current >= STABLE_POSE_FRAMES) {
            advanceLivenessStep(photo.uri);
          }
        } else {
          stableHitsRef.current = 0;
        }
      } catch (e) {
        console.warn('Liveness frame:', e);
      } finally {
        detectingRef.current = false;
      }
    };

    const id = setInterval(tick, DETECT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [livenessActive, advanceLivenessStep]);

  const startLivenessChallenge = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'We need camera permissions to run liveness check.');
        return;
      }
    }

    setLivenessSteps([]);
    stepIndexRef.current = 0;
    setCurrentLivenessStep(0);
    setLivenessProgress(0);
    stableHitsRef.current = 0;
    blinkPhaseRef.current = { phase: 0 };
    setLivenessPassed(false);
    setSelfieImage(null);
    setLivenessActive(true);
  };

  const takeDocumentPhoto = async (side: 'top' | 'bottom') => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'We need camera permissions.');
        return;
      }
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
    stableHitsRef.current = 0;
    blinkPhaseRef.current = { phase: 0 };
    setLivenessPassed(false);
    setSelfieImage(null);
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
      ]
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
          mode: 'expo-face-detector-auto',
        })
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
        ]
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
          Follow the prompts; the app detects your head pose and blink automatically (no tap to capture).
        </Text>
        {livenessActive ? (
          <View style={styles.livenessContainer}>
            <View style={styles.livenessCameraBox}>
              <CameraView ref={cameraRef} style={styles.livenessCamera} facing="front" />
            </View>
            <Text style={[styles.livenessInstruction, { color: colors.text }]}>
              {`${currentLivenessStep + 1}. ${LIVENESS_STEPS[currentLivenessStep]?.label ?? 'Done'}`}
            </Text>
            <Text style={[styles.livenessProgressText, { color: colors.primary }]}>
              Progress: {livenessProgress}%
            </Text>
            <Text style={[styles.livenessSubHint, { color: colors.textTertiary }]}>
              Hold steady in good light. If a step does not advance, cancel and try again.
            </Text>
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
              <View style={[styles.photoPlaceholder, { backgroundColor: isDark ? colors.primaryLight : '#f0f9ff', borderColor: colors.primary }]}>
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
            <View style={[styles.photoPlaceholder, { backgroundColor: isDark ? colors.primaryLight : '#f0f9ff', borderColor: colors.primary }]}>
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
            <View style={[styles.photoPlaceholder, { backgroundColor: isDark ? colors.primaryLight : '#f0f9ff', borderColor: colors.primary }]}>
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
