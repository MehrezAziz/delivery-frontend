import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderService, AvailableOrders, Order } from '../../services/api/order.service';

export default function AvailableOrdersScreen() {
  const router = useRouter();
  const [data, setData] = useState<AvailableOrders | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await orderService.getAvailableOrders()); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);

  const handleAccept = async (orderId: string) => {
    if (!data?.canAccept) {
      Alert.alert('Not Verified', 'You must be verified to accept orders. You can only view orders for now.');
      return;
    }
    Alert.alert('Accept Order', 'Accept this delivery?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: async () => {
        try { await orderService.acceptOrder(orderId); Alert.alert('Success', 'Order accepted!'); load(); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  if (loading) return <View className="flex-1 justify-center items-center bg-gray-50"><ActivityIndicator size="large" color="#0284c7" /></View>;

  const renderSection = (title: string, orders: Order[]) => {
    if (orders.length === 0) return null;
    return (
      <View className="mb-6">
        <Text className="text-gray-500 font-medium text-sm mb-3 uppercase">{title}</Text>
        {orders.map(order => (
          <View key={order.id} className="bg-white p-4 rounded-xl shadow-sm mb-3">
            <View className="flex-row justify-between items-start mb-2">
              <Text className="text-gray-900 font-bold">#{order.id.slice(0, 8)}</Text>
              <Text className="text-gray-900 font-bold">{order.price.toFixed(2)} TND</Text>
            </View>
            <View className="flex-row items-center mb-1">
              <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
              <Text className="text-gray-600 text-sm flex-1" numberOfLines={1}>{order.pickupAddress?.delegation.nameDelegation}</Text>
            </View>
            <View className="flex-row items-center mb-3">
              <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />
              <Text className="text-gray-600 text-sm flex-1" numberOfLines={1}>{order.dropoffAddress?.delegation.nameDelegation}</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-gray-400 text-xs">{order.distanceKm.toFixed(1)} km · {order.weight} kg</Text>
              <TouchableOpacity className={`px-4 py-2 rounded-lg ${data?.canAccept ? 'bg-green-500' : 'bg-gray-300'}`}
                onPress={() => handleAccept(order.id)}>
                <Text className="text-white font-bold text-sm">{data?.canAccept ? 'Accept' : 'View Only'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const totalOrders = (data?.sameDelegation.length || 0) + (data?.sameGovernorate.length || 0) +
    (data?.differentGovernorate.length || 0) + (data?.differentCountry.length || 0);

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-6 pt-14 pb-4 flex-row items-center shadow-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900">Available Orders</Text>
      </View>
      {!data?.canAccept && (
        <View className="bg-yellow-50 px-6 py-3">
          <Text className="text-yellow-800 text-sm">⚠️ Your account is not verified. You can view orders but cannot accept them.</Text>
        </View>
      )}
      <ScrollView className="flex-1 px-6 py-4" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {totalOrders === 0 ? (
          <View className="items-center py-20"><Text className="text-gray-400 text-lg">No available orders</Text></View>
        ) : (
          <>
            {renderSection('Same Delegation', data?.sameDelegation || [])}
            {renderSection('Same Governorate', data?.sameGovernorate || [])}
            {renderSection('Different Governorate', data?.differentGovernorate || [])}
            {renderSection('Different Country', data?.differentCountry || [])}
          </>
        )}
      </ScrollView>
    </View>
  );
}
