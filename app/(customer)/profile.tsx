import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

export default function CustomerProfileScreen() {
  const router = useRouter();

  const handleLogout = () => {
    // TODO: Implement logout logic
    router.replace('/');
  };

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 pt-14 pb-6 shadow-sm">
        <Text className="text-3xl font-bold text-gray-900">
          Profile
        </Text>
      </View>

      <ScrollView className="flex-1">
        {/* Profile Info */}
        <View className="bg-white mx-6 mt-6 p-6 rounded-2xl shadow-sm">
          <View className="items-center mb-6">
            <View className="w-24 h-24 bg-primary-500 rounded-full items-center justify-center mb-4">
              <Text className="text-white text-4xl font-bold">A</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-1">
              Ahmed Ben Ali
            </Text>
            <Text className="text-gray-600">
              +216 98 765 432
            </Text>
          </View>

          <View className="border-t border-gray-100 pt-4">
            <View className="flex-row justify-between py-3">
              <Text className="text-gray-600">Email</Text>
              <Text className="text-gray-900 font-medium">ahmed@example.com</Text>
            </View>
            <View className="flex-row justify-between py-3">
              <Text className="text-gray-600">Member Since</Text>
              <Text className="text-gray-900 font-medium">Jan 2026</Text>
            </View>
          </View>
        </View>

        {/* Menu Items */}
        <View className="px-6 py-4">
          <TouchableOpacity className="bg-white p-4 rounded-xl shadow-sm mb-3 flex-row items-center">
            <Text className="text-2xl mr-4">📍</Text>
            <Text className="flex-1 text-gray-900 font-medium text-lg">My Addresses</Text>
            <Text className="text-gray-400">→</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-white p-4 rounded-xl shadow-sm mb-3 flex-row items-center">
            <Text className="text-2xl mr-4">💳</Text>
            <Text className="flex-1 text-gray-900 font-medium text-lg">Wallet</Text>
            <Text className="text-gray-400">→</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-white p-4 rounded-xl shadow-sm mb-3 flex-row items-center">
            <Text className="text-2xl mr-4">🎁</Text>
            <Text className="flex-1 text-gray-900 font-medium text-lg">Referral Code</Text>
            <Text className="text-gray-400">→</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-white p-4 rounded-xl shadow-sm mb-3 flex-row items-center">
            <Text className="text-2xl mr-4">⚙️</Text>
            <Text className="flex-1 text-gray-900 font-medium text-lg">Settings</Text>
            <Text className="text-gray-400">→</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-white p-4 rounded-xl shadow-sm mb-3 flex-row items-center">
            <Text className="text-2xl mr-4">❓</Text>
            <Text className="flex-1 text-gray-900 font-medium text-lg">Help & Support</Text>
            <Text className="text-gray-400">→</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className="bg-red-50 p-4 rounded-xl shadow-sm mt-4 flex-row items-center"
            onPress={handleLogout}
          >
            <Text className="text-2xl mr-4">🚪</Text>
            <Text className="flex-1 text-red-600 font-medium text-lg">Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
