import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Share, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { clearPushToken } from '../../services/api/notification.service';
import { useTheme } from '../../contexts/ThemeContext';

// Get API URL from environment variable
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useTheme();
  
  // State for user data
  const [user, setUser] = useState<any | null>(null);
  const [customer, setCustomer] = useState<any | null>(null);
  const [referralCode, setReferralCode] = useState<any | null>(null);
  const [referralStats, setReferralStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit states
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch user data from AsyncStorage and API
  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get auth token first
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        setError('No auth token found. Please login again.');
        return;
      }

      // Fetch fresh profile data from API
      const profileResponse = await fetch(`${API_BASE_URL}/customers/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!profileResponse.ok) {
        throw new Error('Failed to load profile data');
      }

      const profileData = await profileResponse.json();
      
      console.log('Loaded profile data:', profileData);
      console.log('User gender:', profileData.user?.userGender);

      // Update AsyncStorage with fresh data
      await AsyncStorage.setItem('user', JSON.stringify(profileData.user));
      await AsyncStorage.setItem('customer', JSON.stringify({
        id: profileData.id,
        userId: profileData.userId,
        completedOrders: profileData.completedOrders,
        customerStatus: profileData.customerStatus,
        referredByCodeId: profileData.referredByCodeId,
      }));

      setUser(profileData.user);
      setCustomer({
        id: profileData.id,
        userId: profileData.userId,
        completedOrders: profileData.completedOrders,
        customerStatus: profileData.customerStatus,
        referredByCodeId: profileData.referredByCodeId,
      });

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
      // Clear FCM token on backend before logout
      await clearPushToken();
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

  const handleCopyReferralCode = async () => {
    if (!referralCode) return;

    try {
      await Clipboard.setStringAsync(referralCode.code);
      Alert.alert('Copied!', 'Referral code copied to clipboard');
    } catch (error) {
      console.error('Error copying referral code:', error);
      Alert.alert('Error', 'Failed to copy referral code');
    }
  };

  const handleEditField = (field: string, currentValue: string = '') => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleSaveField = async () => {
    if (!editingField || !editValue.trim()) return;

    setIsSaving(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        setError('No auth token found. Please login again.');
        return;
      }

      // Prepare update data - only send the field being updated
      const updateData: any = {};
      if (editingField === 'firstName') {
        updateData.firstName = editValue.trim();
      } else if (editingField === 'secondName') {
        updateData.secondName = editValue.trim();
      } else if (editingField === 'myEmail') {
        updateData.myEmail = editValue.trim();
      } else if (editingField === 'userGender') {
        updateData.userGender = editValue; // 'MALE' or 'FEMALE'
      }

      console.log('Sending update data:', updateData);

      // Call update API
      const response = await fetch(`${API_BASE_URL}/customers/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Update error response:', errorData);
        throw new Error(errorData.message || 'Failed to update profile');
      }

      const updatedProfile = await response.json();
      console.log('Updated profile:', updatedProfile);

      // Update local state and AsyncStorage
      const updatedUser = {
        ...user,
        ...updatedProfile.user,
      };
      setUser(updatedUser);
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));

      // Reset edit state
      setEditingField(null);
      setEditValue('');
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const getInitials = () => {
    if (!user) return 'U';
    
    const firstName = user.firstName || '';
    const secondName = user.secondName || '';
    
    if (firstName && secondName) {
      return `${firstName.charAt(0)}${secondName.charAt(0)}`.toUpperCase();
    } else if (firstName) {
      return firstName.charAt(0).toUpperCase();
    } else if (secondName) {
      return secondName.charAt(0).toUpperCase();
    }
    
    return 'U';
  };

  const getFullName = () => {
    if (!user) return 'Customer Profile';
    
    const firstName = user.firstName || '';
    const secondName = user.secondName || '';
    
    if (firstName && secondName) {
      return `${firstName} ${secondName}`;
    } else if (firstName) {
      return firstName;
    } else if (secondName) {
      return secondName;
    }
    
    return 'Customer Profile';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Show loading state
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading profile...</Text>
        </View>
        <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
          <TouchableOpacity style={[styles.logoutButton, { backgroundColor: colors.dangerBg }]} onPress={handleLogout}>
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={[styles.logoutText, { color: colors.danger }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show error state
  if (error || !user || !customer) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error || 'Failed to load profile'}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={loadUserData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.logoutButton, { marginTop: 24, width: '100%', backgroundColor: colors.dangerBg }]} onPress={handleLogout}>
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={[styles.logoutText, { color: colors.danger }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Profile Info */}
        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{getInitials()}</Text>
            </View>
            <Text style={[styles.name, { color: colors.text }]}>{getFullName()}</Text>
            <Text style={[styles.phone, { color: colors.textSecondary }]}>{user.phone}</Text>
            {user.myEmail && (
              <Text style={[styles.email, { color: colors.textSecondary }]}>{user.myEmail}</Text>
            )}
          </View>

          <View style={[styles.profileDetails, { borderTopColor: colors.border }]}>
            {/* Gender Field */}
            {editingField === 'userGender' ? (
              <View style={[styles.editFieldContainer, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Gender</Text>
                <View style={styles.genderEditContainer}>
                  <TouchableOpacity
                    style={[
                      styles.genderEditButton, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                      editValue === 'MALE' && styles.genderEditButtonActive
                    ]}
                    onPress={() => setEditValue('MALE')}
                  >
                    <Text style={[
                      styles.genderEditButtonText, { color: colors.textSecondary },
                      editValue === 'MALE' && styles.genderEditButtonTextActive
                    ]}>Male</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.genderEditButton, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                      editValue === 'FEMALE' && styles.genderEditButtonActive
                    ]}
                    onPress={() => setEditValue('FEMALE')}
                  >
                    <Text style={[
                      styles.genderEditButtonText, { color: colors.textSecondary },
                      editValue === 'FEMALE' && styles.genderEditButtonTextActive
                    ]}>Female</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.editButtonsRow}>
                  <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.surfaceVariant }]} onPress={handleCancelEdit}>
                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.saveButton, { backgroundColor: colors.primary }, !editValue && styles.saveButtonDisabled]} 
                    onPress={handleSaveField}
                    disabled={!editValue || isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : user.userGender ? (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Gender</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{user.userGender}</Text>
              </View>
            ) : (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Gender</Text>
                <TouchableOpacity 
                  style={[styles.addButton, { borderColor: colors.primary }]}
                  onPress={() => handleEditField('userGender')}
                >
                  <Text style={[styles.addButtonText, { color: colors.primary }]}>+ Add Gender {user.userGender}</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Email Field */}
            {editingField === 'myEmail' ? (
              <View style={[styles.editFieldContainer, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Email</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  value={editValue}
                  onChangeText={setEditValue}
                  placeholder="Enter email"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                />
                <View style={styles.editButtonsRow}>
                  <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.surfaceVariant }]} onPress={handleCancelEdit}>
                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.saveButton, { backgroundColor: colors.primary }, !editValue.trim() && styles.saveButtonDisabled]} 
                    onPress={handleSaveField}
                    disabled={!editValue.trim() || isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : user.myEmail ? (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Email</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{user.myEmail}</Text>
              </View>
            ) : (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Email</Text>
                <TouchableOpacity 
                  style={[styles.addButton, { borderColor: colors.primary }]}
                  onPress={() => handleEditField('myEmail')}
                >
                  <Text style={[styles.addButtonText, { color: colors.primary }]}>+ Add Email</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* First Name Field */}
            {editingField === 'firstName' ? (
              <View style={[styles.editFieldContainer, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>First Name</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  value={editValue}
                  onChangeText={setEditValue}
                  placeholder="Enter first name"
                  placeholderTextColor={colors.textTertiary}
                  autoFocus
                />
                <View style={styles.editButtonsRow}>
                  <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.surfaceVariant }]} onPress={handleCancelEdit}>
                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.saveButton, { backgroundColor: colors.primary }, !editValue.trim() && styles.saveButtonDisabled]} 
                    onPress={handleSaveField}
                    disabled={!editValue.trim() || isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : user.firstName ? (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>First Name</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{user.firstName}</Text>
              </View>
            ) : (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>First Name</Text>
                <TouchableOpacity 
                  style={[styles.addButton, { borderColor: colors.primary }]}
                  onPress={() => handleEditField('firstName')}
                >
                  <Text style={[styles.addButtonText, { color: colors.primary }]}>+ Add First Name</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Last Name Field */}
            {editingField === 'secondName' ? (
              <View style={[styles.editFieldContainer, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Last Name</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  value={editValue}
                  onChangeText={setEditValue}
                  placeholder="Enter last name"
                  placeholderTextColor={colors.textTertiary}
                  autoFocus
                />
                <View style={styles.editButtonsRow}>
                  <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.surfaceVariant }]} onPress={handleCancelEdit}>
                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.saveButton, { backgroundColor: colors.primary }, !editValue.trim() && styles.saveButtonDisabled]} 
                    onPress={handleSaveField}
                    disabled={!editValue.trim() || isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : user.secondName ? (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Last Name</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{user.secondName}</Text>
              </View>
            ) : (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Last Name</Text>
                <TouchableOpacity 
                  style={[styles.addButton, { borderColor: colors.primary }]}
                  onPress={() => handleEditField('secondName')}
                >
                  <Text style={[styles.addButtonText, { color: colors.primary }]}>+ Add Last Name</Text>
                </TouchableOpacity>
              </View>
            )}
            
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>User ID</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{user.id.substring(0, 8)}...</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Role</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{user.role}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Status</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{customer.customerStatus}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Completed Orders</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{customer.completedOrders}</Text>
            </View>
            {user.createdAt && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Member Since</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{formatDate(user.createdAt)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Referral Code Card */}
        {referralCode && referralStats && (
          <View style={[styles.referralCard, { backgroundColor: colors.card }]}>
            <View style={styles.referralHeader}>
              <Text style={styles.referralIcon}>🎁</Text>
              <Text style={[styles.referralTitle, { color: colors.text }]}>My Referral Code</Text>
            </View>
            
            <View style={[styles.referralCodeContainer, { borderColor: colors.primary }]}>
              <View style={styles.referralCodeRow}>
                <View style={styles.referralCodeTextContainer}>
                  <Text style={[styles.referralCode, { color: colors.primary }]}>{referralCode.code}</Text>
                  <Text style={[styles.referralBenefit, { color: colors.primary }]}>
                    {referralCode.type === 'PERCENTAGE' 
                      ? `${referralCode.value}% discount`
                      : `${referralCode.value} TND discount`}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={[styles.copyButton, { backgroundColor: colors.primary }]}
                  onPress={handleCopyReferralCode}
                  activeOpacity={0.7}
                >
                  <Text style={styles.copyIcon}>📋</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.shareButton, { backgroundColor: colors.primary }]}
              onPress={handleShareReferralCode}
              activeOpacity={0.7}
            >
              <Text style={styles.shareButtonText}>Share Code</Text>
            </TouchableOpacity>

            <View style={[styles.referralStats, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>{referralStats.totalReferrals}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Referrals</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>{referralStats.totalCommission.toFixed(2)} TND</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Earned</Text>
              </View>
            </View>

            <View style={styles.commissionDetails}>
              <View style={styles.commissionRow}>
                <Text style={[styles.commissionLabel, { color: colors.textSecondary }]}>Pending</Text>
                <Text style={styles.commissionPending}>{referralStats.pendingCommission.toFixed(2)} TND</Text>
              </View>
              <View style={styles.commissionRow}>
                <Text style={[styles.commissionLabel, { color: colors.textSecondary }]}>Paid</Text>
                <Text style={styles.commissionPaid}>{referralStats.paidCommission.toFixed(2)} TND</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.refreshButton, { borderColor: colors.primary }]}
              onPress={loadReferralData}
              activeOpacity={0.7}
            >
              <Text style={[styles.refreshButtonText, { color: colors.primary }]}>🔄 Refresh Statistics</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/(customer)/edit-profile')}
          >
            <Text style={styles.menuIcon}>✏️</Text>
            <Text style={[styles.menuText, { color: colors.text }]}>Edit Profile</Text>
            <Text style={[styles.menuArrow, { color: colors.textTertiary }]}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/(auth)/customer-setup')}
          >
            <Text style={styles.menuIcon}>🌍</Text>
            <Text style={[styles.menuText, { color: colors.text }]}>Add address</Text>
            <Text style={[styles.menuArrow, { color: colors.textTertiary }]}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/(customer)/addresses')}
          >
            <Text style={styles.menuIcon}>📍</Text>
            <Text style={[styles.menuText, { color: colors.text }]}>My Addresses</Text>
            <Text style={[styles.menuArrow, { color: colors.textTertiary }]}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/(customer)/restrictions')}
          >
            <Text style={styles.menuIcon}>⚠️</Text>
            <Text style={[styles.menuText, { color: colors.text }]}>My Restrictions</Text>
            <Text style={[styles.menuArrow, { color: colors.textTertiary }]}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.card }]}>
            <Text style={styles.menuIcon}>💳</Text>
            <Text style={[styles.menuText, { color: colors.text }]}>Wallet</Text>
            <Text style={[styles.menuArrow, { color: colors.textTertiary }]}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.card }]}>
            <Text style={styles.menuIcon}>⚙️</Text>
            <Text style={[styles.menuText, { color: colors.text }]}>Settings</Text>
            <Text style={[styles.menuArrow, { color: colors.textTertiary }]}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => router.push('/(customer)/support')}
          >
            <Text style={styles.menuIcon}>❓</Text>
            <Text style={[styles.menuText, { color: colors.text }]}>Help & Support</Text>
            <Text style={[styles.menuArrow, { color: colors.textTertiary }]}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.card }]} onPress={toggleTheme}>
            <Text style={styles.menuIcon}>{isDark ? '☀️' : '🌙'}</Text>
            <Text style={[styles.menuText, { color: colors.text }]}>{isDark ? 'Light Mode' : 'Dark Mode'}</Text>
            <Text style={[styles.menuArrow, { color: colors.textTertiary }]}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.logoutButton, { backgroundColor: colors.dangerBg }]}
            onPress={handleLogout}
          >
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={[styles.logoutText, { color: colors.danger }]}>Logout</Text>
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
  email: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
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
  addButton: {
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  addButtonText: {
    color: '#0284c7',
    fontSize: 14,
    fontWeight: '600',
  },
  editFieldContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  editInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    marginTop: 8,
    marginBottom: 12,
  },
  genderEditContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  genderEditButton: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  genderEditButtonActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  genderEditButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  genderEditButtonTextActive: {
    color: '#ffffff',
  },
  editButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
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
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  referralCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  referralCodeTextContainer: {
    flex: 1,
    alignItems: 'center',
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
  copyButton: {
    backgroundColor: '#0284c7',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  copyIcon: {
    fontSize: 24,
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
  menuSubText: {
    fontSize: 13,
    color: '#f59e0b',
    fontWeight: '500',
    marginTop: 2,
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
