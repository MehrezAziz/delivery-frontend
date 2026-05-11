import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Alert, Image,
  ActivityIndicator, StyleSheet, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { orderService } from '../../services/api/order.service';
import { useTheme } from '../../contexts/ThemeContext';
import { restoreOrderTrackingForDriver } from '../../services/notifications';

export default function UploadProofsScreen() {
  const router = useRouter();
  const { orderId, afterProof: afterProofParam } = useLocalSearchParams<{ orderId: string; afterProof?: string | string[] }>();
  const afterProofRaw = typeof afterProofParam === 'string' ? afterProofParam : Array.isArray(afterProofParam) ? afterProofParam[0] : undefined;
  const markMode = afterProofRaw === 'delivered' || afterProofRaw === 'returned' ? afterProofRaw : undefined;
  const { colors, isDark } = useTheme();
  const [image1, setImage1] = useState<string | null>(null);
  const [image2, setImage2] = useState<string | null>(null);
  const [existingImage1, setExistingImage1] = useState(false);
  const [existingImage2, setExistingImage2] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<1 | 2>(1);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const loadOrderProofs = useCallback(async () => {
    if (!orderId) {
      setLoadingOrder(false);
      return;
    }
    setLoadingOrder(true);
    try {
      const order = await orderService.getOrder(orderId);
      if (order.status === 'DELIVERED') {
        router.replace(`/(driver)/order-detail?orderId=${orderId}` as any);
        return;
      }
      if (order.driverAssignment?.image1Proof) {
        setImage1(order.driverAssignment.image1Proof);
        setExistingImage1(true);
      }
      if (order.driverAssignment?.image2Proof) {
        setImage2(order.driverAssignment.image2Proof);
        setExistingImage2(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOrder(false);
    }
  }, [orderId, router]);

  useFocusEffect(
    useCallback(() => {
      void loadOrderProofs();
    }, [loadOrderProofs]),
  );

  const pickFromGallery = async (target: 1 | 2) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].base64
        ? `data:image/jpeg;base64,${result.assets[0].base64}`
        : result.assets[0].uri;
      if (target === 1) setImage1(uri);
      else setImage2(uri);
    }
  };

  const openCamera = async (target: 1 | 2) => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Permission Required', 'Camera access is needed to take photos.');
        return;
      }
    }
    setCameraTarget(target);
    setCameraOpen(true);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
      // Close camera after capture completes
      setCameraOpen(false);
      const uri = photo.base64
        ? `data:image/jpeg;base64,${photo.base64}`
        : photo.uri;
      if (cameraTarget === 1) setImage1(uri);
      else setImage2(uri);
    } catch (e) {
      console.error(e);
      setCameraOpen(false);
      Alert.alert('Error', 'Failed to take picture. Please try again.');
    }
  };

  const goOrderDetail = () => {
    router.replace(`/(driver)/order-detail?orderId=${orderId}` as any);
  };

  const handleSubmit = async () => {
    if (!image1) {
      Alert.alert('Required', 'Please provide the first proof image');
      return;
    }
    const sendImage1 = existingImage1 ? undefined : image1;
    const sendImage2 = existingImage2 ? undefined : (image2 || undefined);
    if (!sendImage1 && !sendImage2) {
      Alert.alert('No Changes', 'All images are already uploaded');
      return;
    }
    setSubmitting(true);
    try {
      await orderService.uploadProofs(orderId, sendImage1 || image1, sendImage2);
      Alert.alert('Success', 'Proofs uploaded successfully', [
        { text: 'OK', onPress: () => (router.canGoBack() ? router.back() : router.replace('/(driver)/home')) },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const uploadOnlyNavigate = async () => {
    if (!image1) {
      Alert.alert('Required', 'Please provide the first proof image');
      return;
    }
    const sendImage1 = existingImage1 ? undefined : image1;
    const sendImage2 = existingImage2 ? undefined : (image2 || undefined);
    if (!sendImage1 && !sendImage2) {
      goOrderDetail();
      return;
    }
    setSubmitting(true);
    try {
      await orderService.uploadProofs(orderId, sendImage1 || image1, sendImage2);
      goOrderDetail();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const uploadAndMarkStatus = async () => {
    if (!image1) {
      Alert.alert('Required', 'Please provide the first proof image');
      return;
    }
    const sendImage1 = existingImage1 ? undefined : image1;
    const sendImage2 = existingImage2 ? undefined : (image2 || undefined);
    setSubmitting(true);
    try {
      if (sendImage1 || sendImage2) {
        await orderService.uploadProofs(orderId, sendImage1 || image1, sendImage2);
      }
      if (markMode === 'delivered') {
        await orderService.updateOrderStatus(orderId, 'DELIVERED');
      } else if (markMode === 'returned') {
        await orderService.updateOrderStatus(orderId, 'RETURNED');
      }
      await restoreOrderTrackingForDriver();
      goOrderDetail();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update order');
    } finally {
      setSubmitting(false);
    }
  };

  // Camera fullscreen view
  if (cameraOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
        />
        <View style={s.cameraOverlay}>
          <TouchableOpacity style={s.cameraCancelBtn} onPress={() => setCameraOpen(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.cameraShutterBtn} onPress={takePicture} activeOpacity={0.7}>
            <View style={s.cameraShutterInner} />
          </TouchableOpacity>
          <View style={{ width: 50 }} />
        </View>
      </View>
    );
  }

  const renderImageSlot = (
    imageNum: 1 | 2,
    imageUri: string | null,
    setImageUri: (v: string | null) => void,
    required: boolean,
  ) => {
    const isExisting = imageNum === 1 ? existingImage1 : existingImage2;
    return (
      <View style={[s.fieldCard, { backgroundColor: colors.card }]}>
        <View style={s.fieldHeader}>
          <Ionicons name="camera-outline" size={20} color={required ? '#16a34a' : colors.textSecondary} />
          <Text style={[s.fieldLabel, { color: colors.text }]}>Proof Image {imageNum}</Text>
          <View style={isExisting ? s.uploadedBadge : required ? s.requiredBadge : s.optionalBadge}>
            <Text style={isExisting ? s.uploadedText : required ? s.requiredText : s.optionalText}>
              {isExisting ? 'Uploaded' : required ? 'Required' : 'Optional'}
            </Text>
          </View>
        </View>

        {imageUri ? (
          <View style={s.previewContainer}>
            <Image source={{ uri: imageUri }} style={s.previewImage} resizeMode="cover" />
            {!isExisting && (
              <TouchableOpacity style={s.removeBtn} onPress={() => setImageUri(null)}>
                <Ionicons name="close-circle" size={28} color="#dc2626" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={s.actionRow}>
            <TouchableOpacity style={[s.pickBtn, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => pickFromGallery(imageNum)} activeOpacity={0.7}>
              <Ionicons name="images-outline" size={24} color={colors.primary} />
              <Text style={[s.pickBtnText, { color: colors.primary }]}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.pickBtn, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => openCamera(imageNum)} activeOpacity={0.7}>
              <Ionicons name="camera-outline" size={24} color="#16a34a" />
              <Text style={[s.pickBtnText, { color: '#16a34a' }]}>Camera</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loadingOrder) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        <View style={s.infoCard}>
          <View style={s.infoIconWrap}>
            <Ionicons name="shield-checkmark" size={24} color="#0284c7" />
          </View>
          <Text style={s.infoText}>
            {markMode === 'delivered'
              ? 'Add at least the first proof image. You can upload only, or upload and mark the order as delivered in one step.'
              : markMode === 'returned'
                ? 'Add at least the first proof image before marking the order as returned.'
                : 'Upload delivery proof images. The first image is required before you can mark the order as delivered.'}
          </Text>
        </View>

        {renderImageSlot(1, image1, setImage1, true)}
        {renderImageSlot(2, image2, setImage2, false)}

        {markMode ? (
          <View style={{ gap: 12, marginTop: 8 }}>
            <TouchableOpacity
              style={[s.secondaryOutlineBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={uploadOnlyNavigate}
              disabled={submitting || !image1}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={[s.secondaryOutlineBtnText, { color: colors.primary }]}>Upload image</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submitBtn, !image1 && s.submitBtnDisabled]}
              onPress={uploadAndMarkStatus}
              disabled={submitting || !image1}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Text style={s.submitText}>Upload image and Mark as </Text>
                  <Text style={markMode === 'delivered' ? s.markWordDelivered : s.markWordReturned}>
                    {markMode === 'delivered' ? 'Delivered' : 'Returned'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.submitBtn, (!image1 || (existingImage1 && existingImage2)) && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !image1 || (existingImage1 && existingImage2)}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                <Text style={s.submitText}>
                  {existingImage1 && existingImage2 ? 'All Uploaded' : existingImage1 ? 'Upload Image 2' : 'Upload Proofs'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 12, paddingBottom: 40 },
  infoCard: {
    backgroundColor: '#eff6ff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  infoIconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center',
  },
  infoText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 19 },
  fieldCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  fieldLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  requiredBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  requiredText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
  optionalBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  optionalText: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  uploadedBadge: { backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  uploadedText: { fontSize: 11, fontWeight: '600', color: '#2563eb' },
  actionRow: {
    flexDirection: 'row', gap: 12,
  },
  pickBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 24, borderRadius: 14, backgroundColor: '#f8fafc',
    borderWidth: 2, borderColor: '#e5e7eb', borderStyle: 'dashed',
  },
  pickBtnText: { fontSize: 13, fontWeight: '600', color: '#0284c7' },
  previewContainer: { position: 'relative', borderRadius: 14, overflow: 'hidden' },
  previewImage: { width: '100%', height: 200, borderRadius: 14 },
  removeBtn: { position: 'absolute', top: 8, right: 8 },
  submitBtn: {
    backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10,
    shadowColor: '#16a34a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnDisabled: { backgroundColor: '#9ca3af', shadowOpacity: 0 },
  submitText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryOutlineBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  secondaryOutlineBtnText: { fontSize: 15, fontWeight: '700' },
  markWordDelivered: { color: '#bbf7d0', fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },
  markWordReturned: { color: '#fde68a', fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },
  // Camera
  cameraOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 30, paddingBottom: 50, paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  cameraCancelBtn: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraShutterBtn: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraShutterInner: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff',
  },
});
