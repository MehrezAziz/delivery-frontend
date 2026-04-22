import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { CustomerTabsHeader } from '../../components/AppChromeHeader';

const TAB_ICON_NAMES: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  home: { active: 'home', inactive: 'home-outline' },
  orders: { active: 'receipt', inactive: 'receipt-outline' },
  wallet: { active: 'wallet', inactive: 'wallet-outline' },
  profile: { active: 'person', inactive: 'person-outline' },
};

export default function CustomerLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  /** Flush with system navigation: bar bottom aligns to safe-area inset (no extra gap). */
  const tabBarBottom = insets.bottom;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: true,
        header: () => <CustomerTabsHeader />,
        headerStyle: { backgroundColor: colors.headerBg },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, focused }) => {
          const pair = TAB_ICON_NAMES[route.name];
          if (!pair) return <Ionicons name="ellipse-outline" size={22} color={color} />;
          return <Ionicons name={focused ? pair.active : pair.inactive} size={24} color={color} />;
        },
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: tabBarBottom,
          minHeight: 58,
          height: 58 + (insets.bottom > 0 ? 6 : 0),
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? 6 : 10,
          borderRadius: 18,
          backgroundColor: isDark ? 'rgba(30,41,59,0.98)' : 'rgba(255,255,255,0.98)',
          borderTopWidth: 0,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.14,
              shadowRadius: 14,
            },
            android: { elevation: 12 },
          }),
        },
        tabBarItemStyle: { paddingVertical: 2 },
      })}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="addresses" options={{ href: null, headerShown: true }} />
      <Tabs.Screen name="restrictions" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen name="support-chat" options={{ href: null }} />
      <Tabs.Screen name="create-order" options={{ href: null }} />
      <Tabs.Screen name="local-pickup-order" options={{ href: null }} />
      <Tabs.Screen name="pick-location" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="order-detail" options={{ href: null }} />
      <Tabs.Screen name="order-chat" options={{ href: null }} />
      <Tabs.Screen name="track-driver" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});
