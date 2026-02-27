import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function DriverHomeScreen() {
  const availableOrders = [
    { 
      id: '12345', 
      from: 'Tunis Centre', 
      to: 'La Marsa', 
      distance: '8.5 km',
      price: '25.00',
      type: 'SAME_GOVERNORATE',
      weight: '3.5 kg'
    },
    { 
      id: '12346', 
      from: 'Tunis Centre', 
      to: 'Ariana Ville', 
      distance: '5.2 km',
      price: '15.00',
      type: 'SAME_DELEGATION',
      weight: '1.2 kg'
    },
  ];

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'SAME_DELEGATION': return 'bg-green-100 text-green-800';
      case 'SAME_GOVERNORATE': return 'bg-blue-100 text-blue-800';
      case 'DIFFERENT_GOVERNORATE': return 'bg-orange-100 text-orange-800';
      case 'DIFFERENT_COUNTRY': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-secondary-600 px-6 pt-14 pb-6">
        <Text className="text-white text-3xl font-bold mb-2">
          Available Orders
        </Text>
        <Text className="text-white/80">
          Accept orders to start earning
        </Text>
      </View>

      {/* Status Card */}
      <View className="mx-6 -mt-4 mb-4">
        <View className="bg-white p-4 rounded-xl shadow-lg flex-row items-center">
          <View className="w-12 h-12 bg-green-100 rounded-full items-center justify-center mr-4">
            <View className="w-6 h-6 bg-green-500 rounded-full" />
          </View>
          <View className="flex-1">
            <Text className="text-gray-900 font-bold text-lg">Online</Text>
            <Text className="text-gray-600">Ready to accept orders</Text>
          </View>
          <TouchableOpacity className="bg-gray-100 px-4 py-2 rounded-lg">
            <Text className="text-gray-700 font-medium">Go Offline</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-6">
        {/* Priority Info */}
        <View className="bg-blue-50 p-4 rounded-xl mb-4">
          <Text className="text-blue-900 font-bold mb-2">📍 Priority Orders</Text>
          <Text className="text-blue-800">
            Orders in your area are shown first for better earnings
          </Text>
        </View>

        {/* Available Orders */}
        {availableOrders.map((order) => (
          <View key={order.id} className="bg-white p-4 rounded-xl shadow-sm mb-4">
            <View className="flex-row justify-between items-start mb-3">
              <View>
                <Text className="text-gray-900 font-bold text-lg mb-2">
                  Order #{order.id}
                </Text>
                <View className={`px-3 py-1 rounded-full self-start ${getTypeColor(order.type)}`}>
                  <Text className="font-medium text-xs">
                    {order.type.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-secondary-600 font-bold text-2xl">
                  {order.price}
                </Text>
                <Text className="text-gray-600 text-sm">TND</Text>
              </View>
            </View>

            <View className="border-t border-gray-100 pt-3 mb-3">
              <View className="flex-row items-center mb-2">
                <Text className="text-gray-500 mr-2">📍</Text>
                <Text className="text-gray-700 flex-1 font-medium">From: {order.from}</Text>
              </View>
              <View className="flex-row items-center mb-3">
                <Text className="text-gray-500 mr-2">📍</Text>
                <Text className="text-gray-700 flex-1 font-medium">To: {order.to}</Text>
              </View>
              
              <View className="flex-row space-x-4">
                <View className="flex-row items-center">
                  <Text className="text-gray-500 mr-1">📏</Text>
                  <Text className="text-gray-600">{order.distance}</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-gray-500 mr-1">⚖️</Text>
                  <Text className="text-gray-600">{order.weight}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity className="bg-secondary-600 py-3 rounded-lg">
              <Text className="text-white text-center font-bold text-lg">
                Accept Order
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Empty State */}
        {availableOrders.length === 0 && (
          <View className="bg-white p-8 rounded-xl items-center mt-8">
            <Text className="text-6xl mb-4">📦</Text>
            <Text className="text-gray-900 font-bold text-lg mb-2">
              No Orders Available
            </Text>
            <Text className="text-gray-600 text-center">
              New orders will appear here when customers place them
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
