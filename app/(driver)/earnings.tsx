import { View, Text, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function DriverEarningsScreen() {
  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 pt-14 pb-6 shadow-sm">
        <Text className="text-3xl font-bold text-gray-900">
          Earnings
        </Text>
      </View>

      <ScrollView className="flex-1 px-6 py-6">
        {/* Balance Card */}
        <View className="bg-gradient-to-br from-secondary-600 to-secondary-700 p-6 rounded-2xl shadow-lg mb-6">
          <Text className="text-white/80 text-lg mb-2">Total Balance</Text>
          <Text className="text-white text-5xl font-bold mb-4">
            150.50
          </Text>
          <Text className="text-white/80 text-lg">TND</Text>
        </View>

        {/* Stats */}
        <View className="flex-row space-x-4 mb-6">
          <View className="flex-1 bg-white p-4 rounded-xl shadow-sm">
            <Text className="text-gray-600 mb-1">Today</Text>
            <Text className="text-2xl font-bold text-gray-900">45.00</Text>
            <Text className="text-gray-500 text-sm">TND</Text>
          </View>
          <View className="flex-1 bg-white p-4 rounded-xl shadow-sm">
            <Text className="text-gray-600 mb-1">This Week</Text>
            <Text className="text-2xl font-bold text-gray-900">320.50</Text>
            <Text className="text-gray-500 text-sm">TND</Text>
          </View>
        </View>

        {/* Deliveries Stats */}
        <View className="bg-white p-6 rounded-xl shadow-sm mb-6">
          <Text className="text-xl font-bold text-gray-900 mb-4">
            Delivery Stats
          </Text>
          <View className="space-y-3">
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Total Deliveries</Text>
              <Text className="text-gray-900 font-bold">45</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Completed Today</Text>
              <Text className="text-gray-900 font-bold">8</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Average Rating</Text>
              <Text className="text-gray-900 font-bold">4.8 ⭐</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Completion Rate</Text>
              <Text className="text-gray-900 font-bold">98%</Text>
            </View>
          </View>
        </View>

        {/* Recent Transactions */}
        <View className="bg-white p-6 rounded-xl shadow-sm">
          <Text className="text-xl font-bold text-gray-900 mb-4">
            Recent Transactions
          </Text>
          <View className="space-y-4">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-gray-900 font-medium">Order #12340</Text>
                <Text className="text-gray-500 text-sm">Today, 2:30 PM</Text>
              </View>
              <Text className="text-green-600 font-bold">+25.00 TND</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-gray-900 font-medium">Order #12339</Text>
                <Text className="text-gray-500 text-sm">Today, 11:15 AM</Text>
              </View>
              <Text className="text-green-600 font-bold">+20.00 TND</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-gray-900 font-medium">Platform Fee</Text>
                <Text className="text-gray-500 text-sm">Yesterday</Text>
              </View>
              <Text className="text-red-600 font-bold">-5.00 TND</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
