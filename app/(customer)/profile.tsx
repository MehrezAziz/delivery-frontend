import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { clearPushToken } from '../../services/api/notification.service';
import { stopOrderTrackingSilently } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';
import { getCustomerStatusLabel, getCustomerStatusTextColor } from '../../utils/customerStatus';
import { consumeCustomerProfileNeedsRefresh } from '../../utils/profileRefreshSignals';
import { resetOrderConfirmIdentitySession } from '../../utils/createOrderStepUpSession';
import { GameEntrySection } from '../../components/games/GameEntrySection';

// Get API URL from environment variable
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  
  // State for user data
  const [user, setUser] = useState<any | null>(null);
  const [customer, setCustomer] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit states
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [signOutModalVisible, setSignOutModalVisible] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  useEffect(() => {
    void loadUserData('initial');
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (consumeCustomerProfileNeedsRefresh()) void loadUserData('silent');
    }, []),
  );

  type LoadKind = 'initial' | 'silent' | 'pull';

  const loadUserData = async (kind: LoadKind = 'initial') => {
    try {
      if (kind === 'initial') setLoading(true);
      if (kind === 'pull') setRefreshing(true);
      if (kind !== 'silent') setError(null);

      // Get auth token first
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        if (kind !== 'silent') setError(t('common.something_went_wrong'));
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

    } catch (err) {
      console.error('Error loading user data:', err);
      if (kind !== 'silent') setError(t('common.something_went_wrong'));
    } finally {
      if (kind === 'initial') setLoading(false);
      if (kind === 'pull') setRefreshing(false);
    }
  };

  const performSignOut = async () => {
    setSignOutBusy(true);
    try {
      await stopOrderTrackingSilently();
      await clearPushToken();
      await AsyncStorage.removeItem('accessToken');
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('customer');
      resetOrderConfirmIdentitySession();
      setSignOutModalVisible(false);
      router.replace('/(auth)/customer-login');
    } catch (err) {
      console.error('Error during logout:', err);
    } finally {
      setSignOutBusy(false);
    }
  };

  const handleLogout = () => setSignOutModalVisible(true);

  const signOutOverlayTint = isDark ? 'rgba(0,0,0,0.72)' : 'rgba(15,23,42,0.48)';

  const renderSignOutModal = () => (
    <Modal
      visible={signOutModalVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => !signOutBusy && setSignOutModalVisible(false)}
    >
      <View style={styles.signOutModalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: signOutOverlayTint }]}
          onPress={() => !signOutBusy && setSignOutModalVisible(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss')}
        />
        <View style={styles.signOutModalAlign} pointerEvents="box-none">
        <View
          style={[styles.signOutDialog, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityViewIsModal
        >
          <Text style={[styles.signOutDialogTitle, { color: colors.text }]}>{t('customerProfile.signOut')}</Text>
          <Text style={[styles.signOutDialogBody, { color: colors.textSecondary }]}>
            {t('sideMenu.signOutCustomerBody')}
          </Text>
          <View style={styles.signOutDialogActions}>
            <TouchableOpacity
              style={[styles.signOutBtnSecondary, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              onPress={() => setSignOutModalVisible(false)}
              disabled={signOutBusy}
              activeOpacity={0.8}
            >
              <Text style={[styles.signOutBtnSecondaryText, { color: colors.text }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.signOutBtnPrimary, { backgroundColor: colors.danger }]}
              onPress={() => void performSignOut()}
              disabled={signOutBusy}
              activeOpacity={0.85}
            >
              {signOutBusy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.signOutBtnPrimaryText}>{t('customerProfile.signOut')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </View>
    </Modal>
  );

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
        setError(t('common.something_went_wrong'));
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
        throw new Error(errorData.message || t('editProfile.saveFailed'));
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
      setError(err.message || t('editProfile.saveFailed'));
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
    if (!user) return t('customerProfile.title');
    
    const firstName = user.firstName || '';
    const secondName = user.secondName || '';
    
    if (firstName && secondName) {
      return `${firstName} ${secondName}`;
    } else if (firstName) {
      return firstName;
    } else if (secondName) {
      return secondName;
    }
    
    return t('customerProfile.title');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Show loading state
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
        </View>
        <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
          <TouchableOpacity style={[styles.signOutCompact, { borderColor: colors.border }]} onPress={handleLogout}>
            <Text style={[styles.signOutCompactText, { color: colors.danger }]}>{t('customerProfile.signOut')}</Text>
          </TouchableOpacity>
        </View>
        {renderSignOutModal()}
      </View>
    );
  }

  // Show error state
  if (error || !user || !customer) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error || t('common.something_went_wrong')}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => void loadUserData('initial')}>
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.signOutCompact, { marginTop: 24, borderColor: colors.border }]} onPress={handleLogout}>
            <Text style={[styles.signOutCompactText, { color: colors.danger }]}>{t('customerProfile.signOut')}</Text>
          </TouchableOpacity>
        </View>
        {renderSignOutModal()}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderSignOutModal()}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadUserData('pull')}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <GameEntrySection placement="CUSTOMER_PROFILE" role="customer" />
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
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('auth.genderOptional').replace(' (Optional)', '')}</Text>
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
                    ]}>{t('auth.male')}</Text>
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
                    ]}>{t('auth.female')}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.editButtonsRow}>
                  <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.surfaceVariant }]} onPress={handleCancelEdit}>
                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.saveButton, { backgroundColor: colors.primary }, !editValue && styles.saveButtonDisabled]} 
                    onPress={handleSaveField}
                    disabled={!editValue || isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : user.userGender ? (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('auth.genderOptional').replace(' (Optional)', '')}</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{user.userGender === 'MALE' ? t('auth.male') : user.userGender === 'FEMALE' ? t('auth.female') : user.userGender}</Text>
              </View>
            ) : (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('auth.genderOptional').replace(' (Optional)', '')}</Text>
                <TouchableOpacity 
                  style={[styles.addButton, { borderColor: colors.primary }]}
                  onPress={() => handleEditField('userGender')}
                >
                  <Text style={[styles.addButtonText, { color: colors.primary }]}>{t('common.add')}</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Email Field */}
            {editingField === 'myEmail' ? (
              <View style={[styles.editFieldContainer, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('editProfile.email')}</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  value={editValue}
                  onChangeText={setEditValue}
                  placeholder={t('auth.enterEmail')}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                />
                <View style={styles.editButtonsRow}>
                  <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.surfaceVariant }]} onPress={handleCancelEdit}>
                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.saveButton, { backgroundColor: colors.primary }, !editValue.trim() && styles.saveButtonDisabled]} 
                    onPress={handleSaveField}
                    disabled={!editValue.trim() || isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : user.myEmail ? (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('editProfile.email')}</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{user.myEmail}</Text>
              </View>
            ) : (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('editProfile.email')}</Text>
                <TouchableOpacity 
                  style={[styles.addButton, { borderColor: colors.primary }]}
                  onPress={() => handleEditField('myEmail')}
                >
                  <Text style={[styles.addButtonText, { color: colors.primary }]}>+ {t('editProfile.email')}</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* First Name Field */}
            {editingField === 'firstName' ? (
              <View style={[styles.editFieldContainer, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('editProfile.firstName')}</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  value={editValue}
                  onChangeText={setEditValue}
                  placeholder={t('auth.enterFirstName')}
                  placeholderTextColor={colors.textTertiary}
                  autoFocus
                />
                <View style={styles.editButtonsRow}>
                  <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.surfaceVariant }]} onPress={handleCancelEdit}>
                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.saveButton, { backgroundColor: colors.primary }, !editValue.trim() && styles.saveButtonDisabled]} 
                    onPress={handleSaveField}
                    disabled={!editValue.trim() || isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : user.firstName ? (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('editProfile.firstName')}</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{user.firstName}</Text>
              </View>
            ) : (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('editProfile.firstName')}</Text>
                <TouchableOpacity 
                  style={[styles.addButton, { borderColor: colors.primary }]}
                  onPress={() => handleEditField('firstName')}
                >
                  <Text style={[styles.addButtonText, { color: colors.primary }]}>+ {t('editProfile.firstName')}</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Last Name Field */}
            {editingField === 'secondName' ? (
              <View style={[styles.editFieldContainer, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('editProfile.lastName')}</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  value={editValue}
                  onChangeText={setEditValue}
                  placeholder={t('auth.enterLastName')}
                  placeholderTextColor={colors.textTertiary}
                  autoFocus
                />
                <View style={styles.editButtonsRow}>
                  <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.surfaceVariant }]} onPress={handleCancelEdit}>
                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.saveButton, { backgroundColor: colors.primary }, !editValue.trim() && styles.saveButtonDisabled]} 
                    onPress={handleSaveField}
                    disabled={!editValue.trim() || isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : user.secondName ? (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('editProfile.lastName')}</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{user.secondName}</Text>
              </View>
            ) : (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('editProfile.lastName')}</Text>
                <TouchableOpacity 
                  style={[styles.addButton, { borderColor: colors.primary }]}
                  onPress={() => handleEditField('secondName')}
                >
                  <Text style={[styles.addButtonText, { color: colors.primary }]}>+ {t('editProfile.lastName')}</Text>
                </TouchableOpacity>
              </View>
            )}
            
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('common.account')}</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{user.role}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('customerProfile.status')}</Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: getCustomerStatusTextColor(customer.customerStatus), fontWeight: '700' },
                ]}
              >
                {getCustomerStatusLabel(customer.customerStatus)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('customerProfile.completedOrders')}</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{customer.completedOrders}</Text>
            </View>
            {user.createdAt && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('customerProfile.memberSince')}</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{formatDate(user.createdAt)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.menuContainer}>
          <TouchableOpacity
            style={[styles.textLinkRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/(customer)/location-requests')}
            activeOpacity={0.75}
          >
            <Text style={[styles.textLinkLabel, { color: colors.text }]}>{t('locationShare.inboxTitle')}</Text>
            <Text style={[styles.textLinkChevron, { color: colors.textTertiary }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.textLinkRow, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 10 }]}
            onPress={() => router.push('/(customer)/support')}
            activeOpacity={0.75}
          >
            <Text style={[styles.textLinkLabel, { color: colors.text }]}>{t('customerProfile.support')}</Text>
            <Text style={[styles.textLinkChevron, { color: colors.textTertiary }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.signOutCompact, { borderColor: colors.border, marginTop: 20 }]}
            onPress={handleLogout}
            activeOpacity={0.75}
          >
            <Text style={[styles.signOutCompactText, { color: colors.danger }]}>{t('customerProfile.signOut')}</Text>
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
  menuContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
  },
  textLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  textLinkLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  textLinkChevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  signOutCompact: {
    alignSelf: 'center',
    minWidth: 160,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutCompactText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  signOutModalRoot: {
    flex: 1,
  },
  signOutModalAlign: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  signOutDialog: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  signOutDialogTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  signOutDialogBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  signOutDialogActions: {
    flexDirection: 'row',
    gap: 12,
  },
  signOutBtnSecondary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  signOutBtnPrimary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  signOutBtnPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
