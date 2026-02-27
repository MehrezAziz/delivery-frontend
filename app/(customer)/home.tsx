import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

export default function CustomerHomeScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 pt-14 pb-6 shadow-sm">
        <Text className="text-3xl font-bold text-gray-900 mb-2">
          Hello, Ahmed! 👋
        </Text>
        <Text className="text-gray-600">
          Where would you like to send your package?
        </Text>
      </View>

      <ScrollView className="flex-1">
        {/* Quick Actions */}
        <View className="px-6 py-6">
          <Text className="text-xl font-bold text-gray-900 mb-4">
            Quick Actions
          </Text>
          
          <TouchableOpacity 
            className="bg-primary-600 p-6 rounded-2xl shadow-lg mb-4"
            onPress={() => {/* TODO: Navigate to create order */}}
          >
            <View className="flex-row items-center">
              <View className="w-12 h-12 bg-white/20 rounded-full items-center justify-center mr-4">
                <Text className="text-2xl">📦</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white text-lg font-bold mb-1">
                  Create New Order
                </Text>
                <Text className="text-white/80">
                  Send a package now
                </Text>
              </View>
              <Text className="text-white text-2xl">→</Text>
            </View>
          </TouchableOpacity>

          <View className="flex-row space-x-4">
            <TouchableOpacity className="flex-1 bg-white p-4 rounded-xl shadow-sm">
              <Text className="text-3xl mb-2">📍</Text>
              <Text className="text-gray-900 font-semibold">
                My Addresses
              </Text>
            </TouchableOpacity>

            <TouchableOpacity className="flex-1 bg-white p-4 rounded-xl shadow-sm">
              <Text className="text-3xl mb-2">💳</Text>
              <Text className="text-gray-900 font-semibold">
                My Wallet
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Orders */}
        <View className="px-6 py-4">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-bold text-gray-900">
              Active Orders
            </Text>
            <TouchableOpacity>
              <Text className="text-primary-600 font-medium">See All</Text>
            </TouchableOpacity>
          </View>

          {/* Order Card */}
          <View className="bg-white p-4 rounded-xl shadow-sm mb-4">
            <View className="flex-row justify-between items-start mb-3">
              <View>
                <Text className="text-gray-900 font-bold text-lg mb-1">
                  Order #12345
                </Text>
                <Text className="text-gray-600">
                  Searching for driver...
                </Text>
              </View>
              <View className="bg-yellow-100 px-3 py-1 rounded-full">
                <Text className="text-yellow-800 font-medium text-xs">
                  SEARCHING
                </Text>
              </View>
            </View>

            <View className="border-t border-gray-100 pt-3">
              <View className="flex-row items-center mb-2">
                <Text className="text-gray-500 mr-2">📍</Text>
                <Text className="text-gray-700 flex-1">
                  Avenue Habib Bourguiba
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-gray-500 mr-2">📍</Text>
                <Text className="text-gray-700 flex-1">
                  Avenue de la Liberté
                </Text>
              </View>
            </View>

            <View className="flex-row justify-between items-center mt-4 pt-3 border-t border-gray-100">
              <Text className="text-gray-900 font-bold text-lg">
                25.00 TND
              </Text>
              <TouchableOpacity className="bg-primary-600 px-4 py-2 rounded-lg">
                <Text className="text-white font-medium">View Details</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Empty State */}
          {/* <View className="bg-white p-8 rounded-xl items-center">
            <Text className="text-6xl mb-4">📦</Text>
            <Text className="text-gray-900 font-bold text-lg mb-2">
              No Active Orders
            </Text>
            <Text className="text-gray-600 text-center">
              Create your first order to get started
            </Text>
          </View> */}
        </View>

        {/* Stats */}
        <View className="px-6 py-4 mb-6">
          <Text className="text-xl font-bold text-gray-900 mb-4">
            Your Stats
          </Text>
          <View className="flex-row space-x-4">
            <View className="flex-1 bg-white p-4 rounded-xl shadow-sm">
              <Text className="text-3xl font-bold text-primary-600 mb-1">
                12
              </Text>
              <Text className="text-gray-600">
                Total Orders
              </Text>
            </View>
            <View className="flex-1 bg-white p-4 rounded-xl shadow-sm">
              <Text className="text-3xl font-bold text-green-600 mb-1">
                10
              </Text>
              <Text className="text-gray-600">
                Completed
              </Text>
            </View>
            <View className="flex-1 bg-white p-4 rounded-xl shadow-sm">
              <Text className="text-3xl font-bold text-yellow-600 mb-1">
                2
              </Text>
              <Text className="text-gray-600">
                In Progress
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
