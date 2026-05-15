import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ensureDriverPushNotificationSetup } from '../../services/driverPushSetup';
import { getStoredUserRole, restoreOrderTrackingForDriver } from '../../services/notifications';
import { DriverTabsHeader } from '../../components/AppChromeHeader';
import { useTheme } from '../../contexts/ThemeContext';

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  home: { active: 'home', inactive: 'home-outline' },
  'my-orders': { active: 'list', inactive: 'list-outline' },
  'available-orders': { active: 'compass', inactive: 'compass-outline' },
  profile: { active: 'person', inactive: 'person-outline' },
};

export default function DriverLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60 + insets.bottom;
  const bottomOverlayClearance = tabBarHeight - 1;
  const noSceneBottomInsetRoutes = new Set(['order-chat', 'support-chat']);

  useEffect(() => {
    void (async () => {
      const token = await AsyncStorage.getItem('accessToken');
      const role = await getStoredUserRole();
      if (token && role === 'DRIVER') {
        await ensureDriverPushNotificationSetup();
        await restoreOrderTrackingForDriver();
      }
    })();
  }, []);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: true,
        header: () => <DriverTabsHeader />,
        headerStyle: { backgroundColor: colors.headerBg },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: {
          paddingBottom: noSceneBottomInsetRoutes.has(route.name) ? 0 : bottomOverlayClearance,
        },
        tabBarIcon: ({ color, focused }) => {
          const pair = TAB_ICONS[route.name];
          if (!pair) return <Ionicons name="ellipse-outline" size={22} color={color} />;
          return <Ionicons name={focused ? pair.active : pair.inactive} size={24} color={color} />;
        },
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          minHeight: 58,
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 10),
          borderRadius: 0,
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
      <Tabs.Screen name="my-orders" options={{ title: 'Deliveries' }} />
      <Tabs.Screen name="available-orders" options={{ title: 'Explore' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="order-chat" options={{ href: null }} />
      <Tabs.Screen name="order-detail" options={{ href: null }} />
      <Tabs.Screen name="address-map" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="upload-proofs" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen name="support-chat" options={{ href: null }} />
      <Tabs.Screen name="addresses" options={{ href: null }} />
      <Tabs.Screen name="availability" options={{ href: null }} />
      <Tabs.Screen name="documents" options={{ href: null }} />
      <Tabs.Screen name="earnings" options={{ href: null }} />
      <Tabs.Screen name="transactions" options={{ href: null }} />
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
      <Tabs.Screen name="restrictions" options={{ href: null }} />
      <Tabs.Screen name="verification" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="my-ratings" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="bank-details" options={{ href: null }} />
      <Tabs.Screen name="send-coins" options={{ href: null }} />
      <Tabs.Screen name="buy-coins" options={{ href: null }} />
      <Tabs.Screen name="security" options={{ href: null }} />
      <Tabs.Screen name="transfer-pin" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});
