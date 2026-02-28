import { Tabs } from 'expo-router';

export default function DriverLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#c026d3',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Available',
        }}
      />
      <Tabs.Screen
        name="my-orders"
        options={{
          title: 'My Orders',
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  );
}
