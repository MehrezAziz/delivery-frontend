import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { clearPushToken } from '../../services/api/notification.service';
import { stopOrderTrackingSilently } from '../../services/notifications';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function DriverProfileScreen() {
  const router = useRouter();
  const { push } = useAppNavigation();
  const { colors, isDark, toggleTheme } = useTheme();
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  useFocusEffect(useCallback(() => { loadProfile(); }, []));

  const loadProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) { router.replace('/(auth)/driver-login'); return; }
      const res = await axios.get(`${API_URL}/drivers/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDriver(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].base64
      ? `data:image/jpeg;base64,${result.assets[0].base64}`
      : result.assets[0].uri;
    try {
      const token = await AsyncStorage.getItem('accessToken');
      await axios.patch(`${API_URL}/auth/user/complete-profile`, { image: uri }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      loadProfile();
    } catch (e: any) {
      Alert.alert('Error', 'Failed to update photo');
    }
  };

  const handleRemovePhoto = () => {
    Alert.alert('Remove Photo', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          const token = await AsyncStorage.getItem('accessToken');
          await axios.patch(`${API_URL}/auth/user/complete-profile`, { image: null }, {
            headers: { Authorization: `Bearer ${token}` },
          });
          loadProfile();
        } catch (e) { Alert.alert('Error', 'Failed to remove photo'); }
      }},
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          await stopOrderTrackingSilently();
          await clearPushToken();
          await AsyncStorage.clear();
          router.replace('/(auth)/driver-login');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const firstName = driver?.user?.firstName || '';
  const secondName = driver?.user?.secondName || '';
  const initials = (firstName.charAt(0) + secondName.charAt(0)).toUpperCase() || 'D';
  const statusColor = driver?.status === 'VERIFIED' ? '#16a34a'
    : driver?.status === 'PENDING_REVIEW' ? '#ca8a04'
    : driver?.status === 'SUSPENDED' ? '#dc2626'
    : driver?.status === 'PAUSED' ? '#ea580c' : '#6b7280';
  const statusLabel = driver?.status === 'VERIFIED' ? 'Verified'
    : driver?.status === 'PENDING_REVIEW' ? 'Pending Review'
    : driver?.status === 'INCOMPLETE' ? 'Incomplete'
    : driver?.status === 'SUSPENDED' ? 'Suspended'
    : driver?.status === 'PAUSED' ? 'Paused'
    : driver?.status || 'Unknown';

  const menuItems = [
    { icon: 'create-outline', label: 'Edit Profile', route: '/(driver)/edit-profile', color: '#0284c7' },
    { icon: 'star-outline', label: 'My Ratings', route: '/(driver)/my-ratings', color: '#f59e0b' },
    { icon: 'receipt-outline', label: 'Transaction History', route: '/(driver)/transactions', color: '#0284c7' },
    { icon: 'document-text-outline', label: 'My Documents', route: '/(driver)/documents', color: '#2563eb' },
    { icon: 'location-outline', label: 'My Addresses', route: '/(driver)/addresses', color: '#16a34a' },
    { icon: 'calendar-outline', label: 'Availability', route: '/(driver)/availability', color: '#7c3aed' },
    { icon: 'warning-outline', label: 'Restrictions', route: '/(driver)/restrictions', color: '#ea580c' },
    { icon: 'headset-outline', label: 'Help & Support', route: '/(driver)/support', color: '#0284c7' },
  ];

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        {/* Profile Card */}
        <View style={[s.profileCard, { backgroundColor: colors.card }]}>
          <View style={s.avatarWrap}>
            {driver?.user?.image ? (
              <Image source={{ uri: driver.user.image }} style={s.avatar} />
            ) : (
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={[s.statusDot, { backgroundColor: statusColor, borderColor: colors.card }]} />
            <TouchableOpacity style={[s.cameraBtn, { borderColor: colors.card }]} onPress={() => {
              if (driver?.user?.image) {
                Alert.alert('Profile Photo', 'What would you like to do?', [
                  { text: 'Change Photo', onPress: handleChangePhoto },
                  { text: 'Remove Photo', onPress: handleRemovePhoto, style: 'destructive' },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              } else {
                handleChangePhoto();
              }
            }}>
              <Ionicons name="camera" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={[s.name, { color: colors.text }]}>{firstName} {secondName}</Text>
          <Text style={[s.phone, { color: colors.textSecondary }]}>{driver?.user?.phone || ''}</Text>
          <View style={[s.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <View style={[s.statusDotSmall, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          {/* Info rows */}
          <View style={s.infoSection}>
            {driver?.account && (
              <View style={[s.infoRow, { backgroundColor: colors.surfaceVariant }]}>
                <View style={[s.infoIconWrap, { backgroundColor: driver.account.balance < 0 ? '#fee2e2' : '#dcfce7' }]}>
                  <Ionicons name="wallet-outline" size={18} color={driver.account.balance < 0 ? '#dc2626' : '#16a34a'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.infoLabel, { color: colors.textTertiary }]}>Account Balance</Text>
                  <Text style={[s.infoValue, { color: driver.account.balance < 0 ? '#dc2626' : '#16a34a' }]}>
                    {driver.account.balance.toFixed(2)} {driver.account.currency}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.infoLabel, { color: colors.textTertiary }]}>Deliveries</Text>
                  <Text style={[s.infoValue, { color: colors.text }]}>{driver.account.completedDeliveries}</Text>
                </View>
              </View>
            )}
            <View
              style={{
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceVariant,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>Buy coins</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
                Top up your driver balance. <Text style={{ fontWeight: '700', color: colors.text }}>Coming soon.</Text>
              </Text>
            </View>

            {/* Negative balance warning */}
            {driver?.account?.balance < 0 && driver?.account?.daysRemainingToPay !== undefined && (
              <View style={{
                backgroundColor: driver.account.daysRemainingToPay <= 0 ? '#fee2e2' : '#fff7ed',
                borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
                borderWidth: 1, borderColor: driver.account.daysRemainingToPay <= 0 ? '#fecaca' : '#fed7aa',
              }}>
                <Ionicons
                  name={driver.account.daysRemainingToPay <= 0 ? 'alert-circle' : 'warning'}
                  size={24}
                  color={driver.account.daysRemainingToPay <= 0 ? '#dc2626' : '#ea580c'}
                />
                <View style={{ flex: 1 }}>
                  {driver.account.daysRemainingToPay <= 0 ? (
                    <>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#dc2626' }}>Account Paused</Text>
                      <Text style={{ fontSize: 12, color: '#991b1b', marginTop: 2 }}>
                        Your account has been paused due to unpaid fees. Please pay your balance to resume.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#ea580c' }}>
                        {driver.account.daysRemainingToPay} day{driver.account.daysRemainingToPay !== 1 ? 's' : ''} remaining
                      </Text>
                      <Text style={{ fontSize: 12, color: '#9a3412', marginTop: 2 }}>
                        Pay your fees ({Math.abs(driver.account.balance).toFixed(2)} {driver.account.currency}) or your account will be paused.
                      </Text>
                    </>
                  )}
                </View>
              </View>
            )}
            {driver?.vehicleType && (
              <View style={[s.infoRow, { backgroundColor: colors.surfaceVariant }]}>
                <View style={[s.infoIconWrap, { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name="car-outline" size={18} color="#2563eb" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.infoLabel, { color: colors.textTertiary }]}>Vehicle</Text>
                  <Text style={[s.infoValue, { color: colors.text }]}>{driver.vehicleType}</Text>
                </View>
              </View>
            )}
            {driver?.description && (
              <View style={[s.infoRow, { backgroundColor: colors.surfaceVariant }]}>
                <View style={[s.infoIconWrap, { backgroundColor: '#ede9fe' }]}>
                  <Ionicons name="information-circle-outline" size={18} color="#7c3aed" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.infoLabel, { color: colors.textTertiary }]}>Description</Text>
                  <Text style={[s.infoValue, { color: colors.text }]}>{driver.description}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Menu */}
        <View style={[s.menuCard, { backgroundColor: colors.card }]}>
          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[s.menuItem, i < menuItems.length - 1 && [s.menuItemBorder, { borderBottomColor: colors.border }]]}
              onPress={() => push(item.route)}
              activeOpacity={0.7}
            >
              <View style={[s.menuIconWrap, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
              <Text style={[s.menuLabel, { color: colors.text }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
          {/* Theme toggle menu item */}
          <TouchableOpacity
            style={[s.menuItem, s.menuItemBorder, { borderBottomColor: colors.border }]}
            onPress={toggleTheme}
            activeOpacity={0.7}
          >
            <View style={[s.menuIconWrap, { backgroundColor: isDark ? '#422006' : '#fef3c7' }]}>
              <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color={isDark ? '#fbbf24' : '#92400e'} />
            </View>
            <Text style={[s.menuLabel, { color: colors.text }]}>{isDark ? 'Light Mode' : 'Dark Mode'}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={[s.logoutBtn, { backgroundColor: colors.dangerBg }]} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={[s.logoutText, { color: colors.danger }]}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  content: { padding: 20, paddingBottom: 40 },

  profileCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#0284c7',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  statusDot: {
    position: 'absolute', bottom: 2, right: 2, width: 18, height: 18, borderRadius: 9,
    borderWidth: 3, borderColor: '#fff',
  },
  cameraBtn: {
    position: 'absolute', bottom: -2, left: -2, width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  name: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 4 },
  phone: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  statusDotSmall: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },

  infoSection: { width: '100%', marginTop: 18, gap: 12 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 12,
  },
  infoIconWrap: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, color: '#374151', fontWeight: '600', marginTop: 1 },

  menuCard: {
    backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  menuIconWrap: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#374151' },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fef2f2', borderRadius: 16, paddingVertical: 16,
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#dc2626' },
});
