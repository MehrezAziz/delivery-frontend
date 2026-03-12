import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const VEHICLE_TYPES = ['Motorcycle', 'Car', 'Van', 'Truck', 'Bicycle'];

export default function DriverRegisterStep2() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    vehicleType: '',
    description: '',
    latitude: 0,
    longitude: 0,
  });
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const getCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need location permissions to continue.');
        setLocationLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setFormData({
        ...formData,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      Alert.alert('Success', 'Location captured successfully!');
    } catch (error) {
      console.error('Location error:', error);
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.vehicleType) {
      Alert.alert('Error', 'Please select a vehicle type');
      return;
    }

    if (formData.latitude === 0 || formData.longitude === 0) {
      Alert.alert('Error', 'Please capture your location');
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

      const response = await axios.post(
        `${API_URL}/auth/driver/register/step2`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Navigate to step 3
      router.push('/(auth)/driver-register-step3');
    } catch (error: any) {
      console.error('Step 2 error:', error);
      Alert.alert(
        'Error',
        error.response?.data?.message || 'An error occurred'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Driver Registration</Text>
        <Text style={styles.subtitle}>Step 2 of 3: Vehicle & Location</Text>
      </View>

      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressDot, styles.progressDotComplete]} />
        <View style={styles.progressLine} />
        <View style={[styles.progressDot, styles.progressDotActive]} />
        <View style={styles.progressLine} />
        <View style={styles.progressDot} />
      </View>

      {/* Vehicle Type */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Vehicle Type *</Text>
        <View style={styles.vehicleGrid}>
          {VEHICLE_TYPES.map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.vehicleButton,
                formData.vehicleType === type && styles.vehicleButtonActive,
              ]}
              onPress={() => setFormData({ ...formData, vehicleType: type })}
            >
              <Text
                style={[
                  styles.vehicleText,
                  formData.vehicleType === type && styles.vehicleTextActive,
                ]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Description */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Vehicle Description (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="e.g., Red Honda Civic 2020"
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
          multiline
          numberOfLines={4}
          maxLength={500}
        />
        <Text style={styles.charCount}>{formData.description.length}/500</Text>
      </View>

      {/* Location */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Your Location *</Text>
        <TouchableOpacity
          style={styles.locationButton}
          onPress={getCurrentLocation}
          disabled={locationLoading}
        >
          {locationLoading ? (
            <ActivityIndicator color="#007AFF" />
          ) : (
            <>
              <Ionicons name="location" size={24} color="#007AFF" />
              <Text style={styles.locationButtonText}>
                {formData.latitude !== 0 && formData.longitude !== 0
                  ? 'Location Captured ✓'
                  : 'Get Current Location'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        {formData.latitude !== 0 && formData.longitude !== 0 && (
          <View style={styles.coordinatesContainer}>
            <Text style={styles.coordinatesText}>
              Lat: {formData.latitude.toFixed(6)}
            </Text>
            <Text style={styles.coordinatesText}>
              Lng: {formData.longitude.toFixed(6)}
            </Text>
          </View>
        )}
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Continue to Step 3</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    marginBottom: 20,
    marginTop: 20,
  },
  backButton: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
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
    backgroundColor: '#ddd',
  },
  progressDotActive: {
    backgroundColor: '#007AFF',
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
    backgroundColor: '#ddd',
    marginHorizontal: 8,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    textAlign: 'right',
    color: '#999',
    fontSize: 12,
    marginTop: 4,
  },
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  vehicleButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  vehicleButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  vehicleText: {
    fontSize: 16,
    color: '#333',
  },
  vehicleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 8,
    borderStyle: 'dashed',
    gap: 12,
  },
  locationButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  coordinatesContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
  },
  coordinatesText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
