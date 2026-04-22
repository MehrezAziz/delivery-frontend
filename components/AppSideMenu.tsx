import { Modal, View, Text, TouchableOpacity, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { clearSession } from '../services/auth-session';

type Role = 'guest' | 'customer' | 'driver';

type LinkItem = { label: string; icon: keyof typeof Ionicons.glyphMap; href: string };

const GUEST_LINKS: LinkItem[] = [
  { label: 'Welcome', icon: 'home-outline', href: '/' },
  { label: 'Customer sign in', icon: 'person-outline', href: '/(auth)/customer-login' },
  { label: 'Driver sign in', icon: 'car-outline', href: '/(auth)/driver-login' },
  { label: 'Terms & privacy', icon: 'document-text-outline', href: '/(auth)/terms' },
];

const CUSTOMER_LINKS: LinkItem[] = [
  { label: 'Home', icon: 'home-outline', href: '/(customer)/home' },
  { label: 'My orders', icon: 'receipt-outline', href: '/(customer)/orders' },
  { label: 'Wallet', icon: 'wallet-outline', href: '/(customer)/wallet' },
  { label: 'Profile', icon: 'person-outline', href: '/(customer)/profile' },
  { label: 'Addresses', icon: 'location-outline', href: '/(customer)/addresses' },
  { label: 'Notifications', icon: 'notifications-outline', href: '/(customer)/notifications' },
  { label: 'Support', icon: 'headset-outline', href: '/(customer)/support' },
];

const DRIVER_LINKS: LinkItem[] = [
  { label: 'Home', icon: 'home-outline', href: '/(driver)/home' },
  { label: 'My deliveries', icon: 'list-outline', href: '/(driver)/my-orders' },
  { label: 'Available orders', icon: 'cube-outline', href: '/(driver)/available-orders' },
  { label: 'Earnings', icon: 'cash-outline', href: '/(driver)/earnings' },
  { label: 'Profile', icon: 'person-outline', href: '/(driver)/profile' },
  { label: 'Notifications', icon: 'notifications-outline', href: '/(driver)/notifications' },
  { label: 'Support', icon: 'headset-outline', href: '/(driver)/support' },
  { label: 'Documents', icon: 'folder-outline', href: '/(driver)/documents' },
];

export function AppSideMenu({
  visible,
  onClose,
  role,
}: {
  visible: boolean;
  onClose: () => void;
  role: Role;
}) {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const links = role === 'guest' ? GUEST_LINKS : role === 'customer' ? CUSTOMER_LINKS : DRIVER_LINKS;

  const go = (href: string) => {
    onClose();
    setTimeout(() => router.push(href as any), 0);
  };

  const onLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          onClose();
          await clearSession();
          if (role === 'customer') router.replace('/(auth)/customer-login');
          else if (role === 'driver') router.replace('/(auth)/driver-login');
          else router.replace('/');
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Menu</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surfaceVariant }]} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {links.map((item) => (
              <TouchableOpacity
                key={item.href + item.label}
                style={[styles.row, { backgroundColor: colors.surfaceVariant }]}
                onPress={() => go(item.href)}
                activeOpacity={0.75}
              >
                <View style={[styles.rowIcon, { backgroundColor: isDark ? colors.primaryLight : colors.primaryLight }]}>
                  <Ionicons name={item.icon} size={20} color={colors.primary} />
                </View>
                <Text style={[styles.rowLabel, { color: colors.text }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
            {role !== 'guest' && (
              <TouchableOpacity
                style={[styles.logoutRow, { borderColor: colors.border }]}
                onPress={onLogout}
                activeOpacity={0.75}
              >
                <Ionicons name="log-out-outline" size={22} color={colors.danger} />
                <Text style={[styles.logoutText, { color: colors.danger }]}>Sign out</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    width: '86%',
    maxWidth: 340,
    marginTop: 56,
    marginBottom: 24,
    marginRight: 12,
    marginLeft: 0,
    alignSelf: 'stretch',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { maxHeight: '88%' },
  scrollContent: { padding: 14, paddingBottom: 24, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  logoutText: { fontSize: 15, fontWeight: '700' },
});
