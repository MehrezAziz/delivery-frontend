import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderService, Order } from '../../services/api/order.service';

const STATUS_ACTIONS: Record<string, { next: string; label: string; color: string }> = {
  DRIVER_ASSIGNED: { next: 'DRIVER_ARRIVED', label: 'Mark Arrived', color: 'bg-purple-500' },
  DRIVER_ARRIVED: { next: 'PICKED_UP', label: 'Mark Picked Up', color: 'bg-orange-500' },
  PICKED_UP: { next: 'DELIVERING', label: 'Start Delivering', color: 'bg-indigo-500' },
  DELIVERING: { next: 'DELIVERED', label: 'Mark Delivered', color: 'bg-green-500' },
};

export default function DriverMyOrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setOrders(await orderService.getDriverMyOrders()); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);

  const handleStatusUpdate = async (orderId: string, status: string) => {
    try {
      await orderService.updateOrderStatus(orderId, status);
      load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleCancel = (orderId: string) => {
    Alert.alert('Cancel Assignment', 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: async () => {
        try { await orderService.cancelAssignment(orderId, 'Driver cancelled'); load(); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  if (loading) return <View className="flex-1 justify-center items-center bg-gray-50"><ActivityIndicator size="large" color="#0284c7" /></View>;

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-6 pt-14 pb-6 shadow-sm">
        <Text className="text-3xl font-bold text-gray-900">My Orders</Text>
      </View>
      <ScrollView className="flex-1 px-6 py-4" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {orders.length === 0 ? (
          <View className="items-center py-20"><Text className="text-gray-400 text-lg">No orders yet</Text></View>
        ) : orders.map(order => {
          const action = STATUS_ACTIONS[order.status];
          return (
            <View key={order.id} className="bg-white p-4 rounded-xl shadow-sm mb-4">
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1">
                  <Text className="text-gray-900 font-bold text-lg">#{order.id.slice(0, 8)}</Text>
                  <Text className="text-gray-500 text-sm">{order.status.replace(/_/g, ' ')}</Text>
                </View>
                <Text className="text-gray-900 font-bold text-lg">{order.price.toFixed(2)} TND</Text>
              </View>
              <View className="border-t border-gray-100 pt-3 mb-3">
                <View className="flex-row items-center mb-1">
                  <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                  <Text className="text-gray-600 text-sm flex-1" numberOfLines={1}>{order.pickupAddress?.delegation.nameDelegation}</Text>
                </View>
                <View className="flex-row items-center">
                  <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />
                  <Text className="text-gray-600 text-sm flex-1" numberOfLines={1}>{order.dropoffAddress?.delegation.nameDelegation}</Text>
                </View>
              </View>

              {/* Chat + Assistance buttons */}
              {order.chatRoom?.status === 'ACTIVE' && (
                <View className="flex-row gap-2 mb-3">
                  <TouchableOpacity className="flex-1 bg-blue-100 py-2 rounded-lg flex-row justify-center items-center"
                    onPress={() => router.push(`/(driver)/order-chat?orderId=${order.id}`)}>
                    <Ionicons name="chatbubbles" size={16} color="#2563eb" />
                    <Text className="text-blue-600 font-medium ml-1 text-sm">Chat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-1 bg-orange-100 py-2 rounded-lg flex-row justify-center items-center"
                    onPress={async () => {
                      try { await orderService.driverRequestAssistance(order.id); router.push('/(driver)/support'); }
                      catch (e: any) { Alert.alert('Error', e.message); }
                    }}>
                    <Ionicons name="headset" size={16} color="#ea580c" />
                    <Text className="text-orange-600 font-medium ml-1 text-sm">Assistance</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Status action */}
              {action && (
                <TouchableOpacity className={`${action.color} py-3 rounded-lg mb-2`}
                  onPress={() => handleStatusUpdate(order.id, action.next)}>
                  <Text className="text-white text-center font-bold">{action.label}</Text>
                </TouchableOpacity>
              )}

              {/* Cancel (only when assigned) */}
              {order.status === 'DRIVER_ASSIGNED' && (
                <TouchableOpacity className="bg-red-100 py-2 rounded-lg" onPress={() => handleCancel(order.id)}>
                  <Text className="text-red-600 text-center font-medium">Cancel Assignment</Text>
                </TouchableOpacity>
              )}

              {/* Upload proofs */}
              {['PICKED_UP', 'DELIVERING', 'DELIVERED'].includes(order.status) && (
                <TouchableOpacity className="bg-gray-100 py-2 rounded-lg mt-2 flex-row justify-center items-center"
                  onPress={() => router.push(`/(driver)/upload-proofs?orderId=${order.id}`)}>
                  <Ionicons name="camera" size={16} color="#374151" />
                  <Text className="text-gray-700 font-medium ml-1 text-sm">Upload Proofs</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
