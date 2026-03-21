import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
} from 'react-native';
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
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { loadChat(); }, [loadChat]);
  useEffect(() => {
    const interval = setInterval(loadChat, 3000);
    return () => clearInterval(interval);
  }, [loadChat]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await orderService.driverSendChatMessage(orderId, input.trim());
      setInput('');
      loadChat();
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  const handleAssistance = async () => {
    try {
      await orderService.driverRequestAssistance(orderId);
      router.push('/(driver)/support');
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  const isClosed = chatRoom?.status === 'CLOSED';

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === myUserId;
    return (
      <View style={[s.msgRow, isMe ? s.msgRowMe : s.msgRowOther]}>
        <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther]}>
          <Text style={[s.bubbleText, isMe ? s.bubbleTextMe : s.bubbleTextOther]}>{item.content}</Text>
        </View>
        <Text style={[s.msgTime, isMe && s.msgTimeMe]}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Order Chat</Text>
          <Text style={s.headerSub}>#{orderId?.slice(0, 8)}</Text>
        </View>
        <TouchableOpacity onPress={handleAssistance} style={s.assistBtn}>
          <Ionicons name="headset" size={18} color="#ea580c" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={m => m.id}
        style={s.messagesList}
        contentContainerStyle={s.messagesContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        renderItem={renderMessage}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
            <Text style={s.emptyText}>No messages yet</Text>
            <Text style={s.emptySub}>Start the conversation</Text>
          </View>
        }
      />

      {/* Input */}
      {isClosed ? (
        <View style={s.closedBar}>
          <Ionicons name="lock-closed-outline" size={16} color="#9ca3af" />
          <Text style={s.closedText}>Chat is closed</Text>
        </View>
      ) : (
        <View style={s.inputBar}>
          <TextInput
            style={s.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            placeholderTextColor="#9ca3af"
            multiline
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={sending || !input.trim()}
            style={[s.sendBtn, input.trim() ? s.sendBtnActive : s.sendBtnDisabled]}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  header: {
    backgroundColor: '#16a34a', paddingTop: 50, paddingBottom: 16, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
  assistBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff3e0',
    alignItems: 'center', justifyContent: 'center',
  },

  messagesList: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 8 },

  msgRow: { marginBottom: 12, maxWidth: '80%' },
  msgRowMe: { alignSelf: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  bubble: { padding: 12, borderRadius: 18 },
  bubbleMe: { backgroundColor: '#16a34a', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextOther: { color: '#111827' },
  msgTime: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  msgTimeMe: { textAlign: 'right' },

  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#9ca3af' },
  emptySub: { fontSize: 13, color: '#d1d5db' },

  closedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#f3f4f6', paddingVertical: 16,
  },
  closedText: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  textInput: {
    flex: 1, backgroundColor: '#f3f4f6', borderRadius: 22, paddingHorizontal: 18,
    paddingVertical: 10, fontSize: 15, color: '#111827', maxHeight: 100,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: '#16a34a' },
  sendBtnDisabled: { backgroundColor: '#d1d5db' },
});
