import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { CustomerTabsHeader } from '../../components/AppChromeHeader';

export default function CustomerLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <CustomerTabsHeader />,
        headerStyle: { backgroundColor: colors.headerBg },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 24,
          height: 64,
          paddingBottom: 10,
          paddingTop: 10,
          borderRadius: 20,
          backgroundColor: isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.96)',
          borderTopWidth: 0,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
            },
            android: { elevation: 10 },
          }),
        },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
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
