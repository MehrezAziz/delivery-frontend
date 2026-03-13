import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function DriverHome() {
  const router = useRouter();
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDriverProfile();
  }, []);

  const loadDriverProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        router.replace('/(auth)/driver-login');
        return;
      }

      const response = await axios.get(`${API_URL}/drivers/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setDriver(response.data);
    } catch (error: any) {
      console.error('Profile error:', error);
      if (error.response?.status === 401) {
        await AsyncStorage.clear();
        router.replace('/(auth)/driver-login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            router.replace('/(auth)/driver-login');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return '#34C759';
      case 'PENDING_REVIEW':
        return '#FF9500';
      case 'INCOMPLETE':
        return '#FF3B30';
      case 'REJECTED':
        return '#FF3B30';
      default:
        return '#999';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return 'Verified ✓';
      case 'PENDING_REVIEW':
        return 'Pending Review';
      case 'INCOMPLETE':
        return 'Incomplete';
      case 'REJECTED':
        return 'Rejected';
      default:
        return status;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Driver Dashboard</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={28} color="#FF3B30" />
        </TouchableOpacity>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View>
            <Text style={styles.profileName}>
              {driver?.user?.firstName} {driver?.user?.secondName}
            </Text>
            <Text style={styles.profilePhone}>{driver?.user?.phone}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(driver?.status) },
            ]}
          >
            <Text style={styles.statusText}>{getStatusText(driver?.status)}</Text>
          </View>
        </View>

        {driver?.vehicleType && (
          <View style={styles.infoRow}>
            <Ionicons name="car" size={20} color="#666" />
            <Text style={styles.infoText}>{driver.vehicleType}</Text>
          </View>
        )}

        {driver?.description && (
          <View style={styles.infoRow}>
            <Ionicons name="information-circle" size={20} color="#666" />
            <Text style={styles.infoText}>{driver.description}</Text>
          </View>
        )}
      </View>

      {driver?.status === 'PENDING_REVIEW' && (
        <View style={styles.alertBox}>
          <Ionicons name="time" size={24} color="#FF9500" />
          <Text style={styles.alertText}>
            Your documents are being reviewed. You'll be notified once verified.
          </Text>
        </View>
      )}

      {driver?.status === 'INCOMPLETE' && (
        <View style={styles.alertBox}>
          <Ionicons name="warning" size={24} color="#FF3B30" />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertText}>
              Please complete your document verification to start accepting orders.
            </Text>
            <TouchableOpacity
              style={styles.completeVerificationButton}
              onPress={() => router.push('/(driver)/verification')}
            >
              <Text style={styles.completeVerificationText}>Complete Verification</Text>
              <Ionicons name="arrow-forward" size={16} color="#007AFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {driver?.status === 'VERIFIED' && (
        <View style={[styles.alertBox, { backgroundColor: '#e8f5e9' }]}>
          <Ionicons name="checkmark-circle" size={24} color="#34C759" />
          <Text style={[styles.alertText, { color: '#2e7d32' }]}>
            You're verified! You can now start accepting delivery orders.
          </Text>
        </View>
      )}

      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="person" size={24} color="#007AFF" />
          <Text style={styles.actionButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="document-text" size={24} color="#007AFF" />
          <Text style={styles.actionButtonText}>My Documents</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="location" size={24} color="#007AFF" />
          <Text style={styles.actionButtonText}>Update Location</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="help-circle" size={24} color="#007AFF" />
          <Text style={styles.actionButtonText}>Help & Support</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  profileCard: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  profilePhone: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  infoText: {
    fontSize: 16,
    color: '#666',
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    padding: 16,
    marginHorizontal: 20,
    borderRadius: 8,
    gap: 12,
  },
  alertText: {
    flex: 1,
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  completeVerificationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  completeVerificationText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  actionsContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  actionButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
});
