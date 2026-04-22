import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderService, ChatMessage, ChatRoom } from '../../services/api/order.service';
import { notificationService } from '../../services/api/notification.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useActiveChatForNotifications } from '../../hooks/useActiveChatForNotifications';

export default function OrderChatScreen() {
  const router = useRouter();
  const { orderId: orderIdParam } = useLocalSearchParams<{ orderId: string | string[] }>();
  const orderId = typeof orderIdParam === 'string' ? orderIdParam : orderIdParam?.[0] ?? '';
  const { colors, isDark } = useTheme();
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

  useActiveChatForNotifications('order', orderId || undefined);

  const markChatThreadRead = useCallback(() => {
    if (!orderId) return;
    void notificationService.markThreadAsRead(`chat:${orderId}`).catch(() => {});
  }, [orderId]);

  useEffect(() => {
    markChatThreadRead();
  }, [orderId, messages.length, markChatThreadRead]);

  useEffect(() => {
    return () => {
      if (orderId) void notificationService.markThreadAsRead(`chat:${orderId}`).catch(() => {});
    };
  }, [orderId]);

  const loadChat = useCallback(async () => {
    if (!orderId) return;
    try {
      const room = await orderService.getChatRoom(orderId);
      setChatRoom(room || null);
      setMessages(room?.messages || []);
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
      await orderService.sendChatMessage(orderId, input.trim());
      setInput('');
      loadChat();
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  const handleAssistance = async () => {
    try {
      await orderService.requestAssistance(orderId, 'I need help with this order');
      router.push('/(customer)/support');
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isClosed = chatRoom?.status === 'CLOSED';

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === myUserId;
    return (
      <View style={[s.msgRow, isMe ? s.msgRowMe : s.msgRowOther]}>
        <View style={[s.bubble, isMe ? s.bubbleMe : [s.bubbleOther, { backgroundColor: colors.card, borderColor: colors.border }]]}>
          <Text style={[s.bubbleText, isMe ? s.bubbleTextMe : [s.bubbleTextOther, { color: colors.text }]]}>{item.content}</Text>
        </View>
        <Text style={[s.msgTime, { color: colors.textTertiary }, isMe && s.msgTimeMe]}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.chatToolbar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.toolbarMeta, { color: colors.textTertiary }]}>Order</Text>
          <Text style={[s.toolbarOrderId, { color: colors.text }]} numberOfLines={1}>
            #{orderId?.slice(0, 8)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleAssistance}
          style={[s.assistBtn, { backgroundColor: isDark ? 'rgba(234,88,12,0.22)' : '#fff3e0' }]}
          accessibilityLabel="Request assistance"
        >
          <Ionicons name="headset-outline" size={20} color="#ea580c" />
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
            <Ionicons name="chatbubbles-outline" size={48} color={colors.border} />
            <Text style={[s.emptyText, { color: colors.textTertiary }]}>No messages yet</Text>
            <Text style={[s.emptySub, { color: colors.border }]}>Start the conversation</Text>
          </View>
        }
      />

      {/* Input */}
      {isClosed ? (
        <View style={[s.closedBar, { backgroundColor: colors.surfaceVariant }]}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />
          <Text style={[s.closedText, { color: colors.textTertiary }]}>chatroom closed</Text>
        </View>
      ) : (
        <View style={[s.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TextInput
            style={[s.textInput, { backgroundColor: colors.surfaceVariant, color: colors.text }]}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
            multiline
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={sending || !input.trim()}
            style={[s.sendBtn, input.trim() ? [s.sendBtnActive, { backgroundColor: colors.primary }] : s.sendBtnDisabled]}
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

  chatToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  toolbarMeta: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  toolbarOrderId: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  assistBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  messagesList: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 8 },

  msgRow: { marginBottom: 12, maxWidth: '80%' },
  msgRowMe: { alignSelf: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  bubble: { padding: 12, borderRadius: 18 },
  bubbleMe: { backgroundColor: '#0284c7', borderBottomRightRadius: 4 },
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
  sendBtnActive: { backgroundColor: '#0284c7' },
  sendBtnDisabled: { backgroundColor: '#d1d5db' },
});
