import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

export default function DriverProfileScreen() {
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
            <View className="w-24 h-24 bg-secondary-500 rounded-full items-center justify-center mb-4">
              <Text className="text-white text-4xl font-bold">M</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-1">
              Mohamed Trabelsi
            </Text>
            <Text className="text-gray-600 mb-2">
              +216 23 456 789
            </Text>
            <View className="bg-green-100 px-4 py-2 rounded-full">
              <Text className="text-green-800 font-bold">✓ VERIFIED</Text>
            </View>
          </View>

          <View className="border-t border-gray-100 pt-4">
            <View className="flex-row justify-between py-3">
              <Text className="text-gray-600">Vehicle Type</Text>
              <Text className="text-gray-900 font-medium">Motorcycle</Text>
            </View>
            <View className="flex-row justify-between py-3">
              <Text className="text-gray-600">Rating</Text>
              <Text className="text-gray-900 font-medium">4.8 ⭐</Text>
            </View>
            <View className="flex-row justify-between py-3">
              <Text className="text-gray-600">Total Deliveries</Text>
              <Text className="text-gray-900 font-medium">45</Text>
            </View>
          </View>
        </View>

        {/* Menu Items */}
        <View className="px-6 py-4">
          <TouchableOpacity className="bg-white p-4 rounded-xl shadow-sm mb-3 flex-row items-center">
            <Text className="text-2xl mr-4">📄</Text>
            <Text className="flex-1 text-gray-900 font-medium text-lg">My Documents</Text>
            <Text className="text-gray-400">→</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-white p-4 rounded-xl shadow-sm mb-3 flex-row items-center">
            <Text className="text-2xl mr-4">📍</Text>
            <Text className="flex-1 text-gray-900 font-medium text-lg">My Location</Text>
            <Text className="text-gray-400">→</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-white p-4 rounded-xl shadow-sm mb-3 flex-row items-center">
            <Text className="text-2xl mr-4">📅</Text>
            <Text className="flex-1 text-gray-900 font-medium text-lg">Availability</Text>
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
