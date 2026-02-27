import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function DriverMyOrdersScreen() {
  const myOrders = [
    { 
      id: '12340', 
      status: 'PICKED_UP',
      from: 'Tunis Centre', 
      to: 'La Marsa', 
      price: '25.00',
      customer: 'Ahmed B.'
    },
    { 
      id: '12339', 
      status: 'DELIVERED',
      from: 'Sfax Ville', 
      to: 'Tunis Centre', 
      price: '45.00',
      customer: 'Fatma T.'
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRIVER_ASSIGNED': return 'bg-blue-100 text-blue-800';
      case 'DRIVER_ARRIVED': return 'bg-purple-100 text-purple-800';
      case 'PICKED_UP': return 'bg-yellow-100 text-yellow-800';
      case 'DELIVERING': return 'bg-orange-100 text-orange-800';
      case 'DELIVERED': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white px-6 pt-14 pb-6 shadow-sm">
        <Text className="text-3xl font-bold text-gray-900">
          My Orders
        </Text>
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        {myOrders.map((order) => (
          <TouchableOpacity 
            key={order.id}
            className="bg-white p-4 rounded-xl shadow-sm mb-4"
          >
            <View className="flex-row justify-between items-start mb-3">
              <View>
                <Text className="text-gray-900 font-bold text-lg mb-1">
                  Order #{order.id}
                </Text>
                <Text className="text-gray-600 mb-2">
                  Customer: {order.customer}
                </Text>
                <View className={`px-3 py-1 rounded-full self-start ${getStatusColor(order.status)}`}>
                  <Text className="font-medium text-xs">
                    {order.status.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
              <Text className="text-gray-900 font-bold text-lg">
                {order.price} TND
              </Text>
            </View>

            <View className="border-t border-gray-100 pt-3">
              <View className="flex-row items-center mb-2">
                <Text className="text-gray-500 mr-2">📍</Text>
                <Text className="text-gray-700 flex-1">{order.from}</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-gray-500 mr-2">📍</Text>
                <Text className="text-gray-700 flex-1">{order.to}</Text>
              </View>
            </View>

            {order.status === 'PICKED_UP' && (
              <TouchableOpacity className="bg-secondary-600 py-3 rounded-lg mt-4">
                <Text className="text-white text-center font-bold">
                  Mark as Delivered
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
