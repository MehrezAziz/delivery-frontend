import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Camera } from 'expo-camera';
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

export default function DriverRegisterStep3() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [documentType, setDocumentType] = useState('');
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [docImageTop, setDocImageTop] = useState<string | null>(null);
  const [docImageBottom, setDocImageBottom] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const takeSelfie = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera permissions to take a selfie.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelfieImage(result.assets[0].uri);
    }
  };

  const takeDocumentPhoto = async (side: 'top' | 'bottom') => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
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
    // Validation
    if (!documentType) {
      Alert.alert('Error', 'Please select a document type');
      return;
    }

    if (!selfieImage) {
      Alert.alert('Error', 'Please take a selfie');
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

      // Add selfie image
      const selfieFilename = selfieImage.split('/').pop();
      const selfieMatch = /\.(\w+)$/.exec(selfieFilename || '');
      const selfieType = selfieMatch ? `image/${selfieMatch[1]}` : 'image/jpeg';
      formData.append('selfieImage', {
        uri: selfieImage,
        name: selfieFilename || 'selfie.jpg',
        type: selfieType,
      } as any);

      // Add document top image
      const docTopFilename = docImageTop.split('/').pop();
      const docTopMatch = /\.(\w+)$/.exec(docTopFilename || '');
      const docTopType = docTopMatch ? `image/${docTopMatch[1]}` : 'image/jpeg';
      formData.append('docImageTop', {
        uri: docImageTop,
        name: docTopFilename || 'doc-top.jpg',
        type: docTopType,
      } as any);

      // Add document bottom image if provided
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

      const response = await axios.post(
        `${API_URL}/auth/driver/register/step3`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      // Show success message
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
      Alert.alert(
        'Error',
        error.response?.data?.message || 'An error occurred'
      );
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

      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressDot, styles.progressDotComplete]} />
        <View style={[styles.progressLine, { backgroundColor: colors.border }]} />
        <View style={[styles.progressDot, styles.progressDotComplete]} />
        <View style={[styles.progressLine, { backgroundColor: colors.border }]} />
        <View style={[styles.progressDot, styles.progressDotActive, { backgroundColor: colors.primary }]} />
      </View>

      {/* Document Type Selection */}
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

      {/* Selfie */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Selfie Photo *</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>Take a clear photo of your face</Text>
        <TouchableOpacity style={styles.photoButton} onPress={takeSelfie}>
          {selfieImage ? (
            <Image source={{ uri: selfieImage }} style={styles.photoPreview} />
          ) : (
            <View style={[styles.photoPlaceholder, { backgroundColor: isDark ? colors.primaryLight : '#f0f9ff', borderColor: colors.primary }]}>
              <Ionicons name="camera" size={40} color={colors.primary} />
              <Text style={[styles.photoPlaceholderText, { color: colors.primary }]}>Take Selfie</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Document Front */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Document Front *</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>Capture the front side of your document</Text>
        <TouchableOpacity
          style={styles.photoButton}
          onPress={() => takeDocumentPhoto('top')}
        >
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

      {/* Document Back */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Document Back (Optional)</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>Capture the back side if applicable</Text>
        <TouchableOpacity
          style={styles.photoButton}
          onPress={() => takeDocumentPhoto('bottom')}
        >
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

      {/* Submit Button */}
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

      {/* Skip Button */}
      <TouchableOpacity
        style={[styles.skipButton, { borderColor: colors.primary }]}
        onPress={handleSkip}
        disabled={loading}
      >
        <Text style={[styles.skipButtonText, { color: colors.primary }]}>Skip for Now</Text>
      </TouchableOpacity>

      <View style={[styles.infoBox, { backgroundColor: isDark ? colors.primaryLight : '#f0f9ff' }]}>
        <Ionicons name="information-circle" size={24} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Your documents will be reviewed by our team. You'll be notified once verified.
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
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
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
  progressDotActive: {
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
