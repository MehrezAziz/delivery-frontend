import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderService, ChatMessage, ChatRoom } from '../../services/api/order.service';

export default function DriverOrderChatScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [myUserId, setMyUserId] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    AsyncStorage.getItem('user').then(u => {
      if (u) setMyUserId(JSON.parse(u).id || '');
    });
  }, []);

  const loadChat = useCallback(async () => {
    try {
      const room = await orderService.driverGetChatRoom(orderId);
      if (room) { setChatRoom(room); setMessages(room.messages || []); }
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { loadChat(); }, [loadChat]);
  useEffect(() => { const i = setInterval(loadChat, 3000); return () => clearInterval(i); }, [loadChat]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try { await orderService.driverSendChatMessage(orderId, input.trim()); setInput(''); loadChat(); }
    catch (e: any) { console.error(e); }
    finally { setSending(false); }
  };

  if (loading) return <View className="flex-1 justify-center items-center bg-gray-50"><ActivityIndicator size="large" color="#0284c7" /></View>;

  const isClosed = chatRoom?.status === 'CLOSED';

  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="bg-white px-4 pt-14 pb-3 flex-row items-center shadow-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">Order Chat</Text>
        <TouchableOpacity onPress={async () => {
          try { await orderService.driverRequestAssistance(orderId); router.push('/(driver)/support'); }
          catch (e: any) { console.error(e); }
        }} className="bg-orange-100 p-2 rounded-full">
          <Ionicons name="headset" size={18} color="#ea580c" />
        </TouchableOpacity>
      </View>

      <FlatList ref={flatListRef} data={messages} keyExtractor={m => m.id} className="flex-1 px-4 py-2"
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        renderItem={({ item }) => {
          const isMe = item.senderId === myUserId;
          return (
            <View className={`mb-3 max-w-[80%] ${isMe ? 'self-end' : 'self-start'}`}>
              <View className={`p-3 rounded-2xl ${isMe ? 'bg-green-500' : 'bg-white border border-gray-200'}`}>
                <Text className={isMe ? 'text-white' : 'text-gray-900'}>{item.content}</Text>
              </View>
              <Text className={`text-xs text-gray-400 mt-1 ${isMe ? 'text-right' : ''}`}>
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<View className="items-center py-10"><Text className="text-gray-400">No messages yet</Text></View>}
      />

      {isClosed ? (
        <View className="bg-gray-200 p-4"><Text className="text-gray-500 text-center">Chat is closed</Text></View>
      ) : (
        <View className="bg-white border-t border-gray-200 px-4 py-3 flex-row items-center">
          <TextInput className="flex-1 bg-gray-100 rounded-full px-4 py-3 mr-3 text-gray-900"
            value={input} onChangeText={setInput} placeholder="Type a message..." />
          <TouchableOpacity onPress={handleSend} disabled={sending || !input.trim()}
            className={`w-10 h-10 rounded-full items-center justify-center ${input.trim() ? 'bg-green-500' : 'bg-gray-300'}`}>
            <Ionicons name="send" size={18} color="white" />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
