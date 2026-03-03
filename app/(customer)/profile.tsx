import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Share, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// For Android emulator, use 10.0.2.2 instead of localhost
// For physical device, use your computer's IP address (e.g., 192.168.1.x)
// For iOS simulator, localhost works fine
const API_BASE_URL = Platform.OS === 'android' 
  ? 'http://10.0.2.2:3000/api'  // Android emulator
  : 'http://localhost:3000/api'; // iOS simulator or web

export default function CustomerProfileScreen() {
  const router = useRouter();
  
  // State for user data
  const [user, setUser] = useState<any | null>(null);
  const [customer, setCustomer] = useState<any | null>(null);
  const [referralCode, setReferralCode] = useState<any | null>(null);
  const [referralStats, setReferralStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch user data from AsyncStorage and API
  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load user and customer data from AsyncStorage
      const userJson = await AsyncStorage.getItem('user');
      const customerJson = await AsyncStorage.getItem('customer');

      if (!userJson || !customerJson) {
        setError('User data not found. Please login again.');
        return;
      }

      const userData = JSON.parse(userJson);
      const customerData = JSON.parse(customerJson);

      setUser(userData);
      setCustomer(customerData);

      // Fetch referral code and statistics from API
      await loadReferralData();
    } catch (err) {
      console.error('Error loading user data:', err);
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const loadReferralData = async () => {
    try {
      // Get auth token
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        console.error('No auth token found');
        return;
      }

      // Fetch referral code and statistics in parallel
      const [codeResponse, statsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/referral/my-code`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }),
        fetch(`${API_BASE_URL}/referral/statistics`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }),
      ]);

      if (codeResponse.ok) {
        const codeData = await codeResponse.json();
        setReferralCode(codeData);
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setReferralStats(statsData);
      }
    } catch (err) {
      console.error('Error loading referral data:', err);
      // Don't set error state here - profile can still show without referral data
    }
  };

  const handleLogout = async () => {
    try {
      // Clear all stored data
      await AsyncStorage.removeItem('accessToken');
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('customer');
      // Navigate to login screen
      router.replace('/');
    } catch (err) {
      console.error('Error during logout:', err);
    }
  };

  const handleShareReferralCode = async () => {
    if (!referralCode) return;

    try {
      const discountText = referralCode.type === 'PERCENTAGE' 
        ? `${referralCode.value}% discount`
        : `${referralCode.value} TND discount`;

      await Share.share({
        message: `Join Fast Delivery using my referral code: ${referralCode.code} and get ${discountText} on your first order!`,
      });
    } catch (error) {
      console.error('Error sharing referral code:', error);
    }
  };

  const getInitials = () => {
    // Extract first and second name from user data stored in AsyncStorage
    // For now, use placeholder until we add name fields to User model
    return 'U';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Show loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  // Show error state
  if (error || !user || !customer) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'Failed to load profile'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadUserData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Profile Info */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials()}</Text>
            </View>
            <Text style={styles.name}>Customer Profile</Text>
            <Text style={styles.phone}>{user.phone}</Text>
          </View>

          <View style={styles.profileDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>User ID</Text>
              <Text style={styles.detailValue}>{user.id.substring(0, 8)}...</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Role</Text>
              <Text style={styles.detailValue}>{user.role}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={styles.detailValue}>{customer.customerStatus}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Completed Orders</Text>
              <Text style={styles.detailValue}>{customer.completedOrders}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Member Since</Text>
              <Text style={styles.detailValue}>{formatDate(user.createdAt)}</Text>
            </View>
          </View>
        </View>

        {/* Referral Code Card */}
        {referralCode && referralStats && (
          <View style={styles.referralCard}>
            <View style={styles.referralHeader}>
              <Text style={styles.referralIcon}>🎁</Text>
              <Text style={styles.referralTitle}>My Referral Code</Text>
            </View>
            
            <View style={styles.referralCodeContainer}>
              <Text style={styles.referralCode}>{referralCode.code}</Text>
              <Text style={styles.referralBenefit}>
                {referralCode.type === 'PERCENTAGE' 
                  ? `${referralCode.value}% discount`
                  : `${referralCode.value} TND discount`}
              </Text>
            </View>

            <TouchableOpacity 
              style={styles.shareButton}
              onPress={handleShareReferralCode}
              activeOpacity={0.7}
            >
              <Text style={styles.shareButtonText}>Share Code</Text>
            </TouchableOpacity>

            <View style={styles.referralStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{referralStats.totalReferrals}</Text>
                <Text style={styles.statLabel}>Referrals</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{referralStats.totalCommission.toFixed(2)} TND</Text>
                <Text style={styles.statLabel}>Total Earned</Text>
              </View>
            </View>

            <View style={styles.commissionDetails}>
              <View style={styles.commissionRow}>
                <Text style={styles.commissionLabel}>Pending</Text>
                <Text style={styles.commissionPending}>{referralStats.pendingCommission.toFixed(2)} TND</Text>
              </View>
              <View style={styles.commissionRow}>
                <Text style={styles.commissionLabel}>Paid</Text>
                <Text style={styles.commissionPaid}>{referralStats.paidCommission.toFixed(2)} TND</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.refreshButton}
              onPress={loadReferralData}
              activeOpacity={0.7}
            >
              <Text style={styles.refreshButtonText}>🔄 Refresh Statistics</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>📍</Text>
            <Text style={styles.menuText}>My Addresses</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>💳</Text>
            <Text style={styles.menuText}>Wallet</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>⚙️</Text>
            <Text style={styles.menuText}>Settings</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>❓</Text>
            <Text style={styles.menuText}>Help & Support</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  profileCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 24,
    marginTop: 24,
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 96,
    height: 96,
    backgroundColor: '#0284c7',
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  phone: {
    fontSize: 16,
    color: '#6b7280',
  },
  profileDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  detailLabel: {
    fontSize: 16,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  referralCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 24,
    marginTop: 16,
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  referralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  referralIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  referralTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  referralCodeContainer: {
    backgroundColor: '#f0f9ff',
    borderWidth: 2,
    borderColor: '#0284c7',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  referralCode: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0284c7',
    letterSpacing: 2,
  },
  referralBenefit: {
    fontSize: 14,
    color: '#0284c7',
    marginTop: 4,
    fontWeight: '600',
  },
  shareButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  referralStats: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 16,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  commissionDetails: {
    gap: 8,
    marginBottom: 16,
  },
  commissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commissionLabel: {
    fontSize: 15,
    color: '#6b7280',
  },
  commissionPending: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f59e0b',
  },
  commissionPaid: {
    fontSize: 15,
    fontWeight: '600',
    color: '#10b981',
  },
  refreshButton: {
    backgroundColor: '#f0f9ff',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  refreshButtonText: {
    color: '#0284c7',
    fontSize: 14,
    fontWeight: '600',
  },
  menuContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  menuItem: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  menuIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  menuText: {
    flex: 1,
    fontSize: 18,
    color: '#111827',
    fontWeight: '600',
  },
  menuArrow: {
    fontSize: 20,
    color: '#9ca3af',
  },
  logoutButton: {
    backgroundColor: '#fef2f2',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  logoutText: {
    flex: 1,
    fontSize: 18,
    color: '#dc2626',
    fontWeight: '600',
  },
});
