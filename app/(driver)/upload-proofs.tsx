import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderService } from '../../services/api/order.service';

export default function UploadProofsScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [image1, setImage1] = useState('');
  const [image2, setImage2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!image1) { Alert.alert('Error', 'Please provide at least one proof image URL'); return; }
    setSubmitting(true);
    try {
      await orderService.uploadProofs(orderId, image1 || undefined, image2 || undefined);
      Alert.alert('Success', 'Proofs uploaded successfully', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-6 pt-14 pb-4 flex-row items-center shadow-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900">Upload Proofs</Text>
      </View>

      <View className="px-6 py-6">
        <Text className="text-gray-500 mb-4">Upload up to 2 image proofs to avoid theft charges.</Text>

        <Text className="text-gray-700 font-medium mb-2">Proof Image 1 (required)</Text>
        <TextInput className="bg-white p-4 rounded-xl mb-4 text-gray-900" value={image1}
          onChangeText={setImage1} placeholder="Image URL or base64" />

        <Text className="text-gray-700 font-medium mb-2">Proof Image 2 (optional)</Text>
        <TextInput className="bg-white p-4 rounded-xl mb-6 text-gray-900" value={image2}
          onChangeText={setImage2} placeholder="Image URL or base64" />

        <TouchableOpacity className="bg-sky-600 py-4 rounded-xl items-center" onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Upload Proofs</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
