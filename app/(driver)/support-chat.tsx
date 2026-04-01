import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supportService, SupportMessage, SupportTicket } from '../../services/api/support.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useActiveChatForNotifications } from '../../hooks/useActiveChatForNotifications';

export default function DriverSupportChatScreen() {
  const router = useRouter();
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const { colors, isDark } = useTheme();
  const [ticket, setTicket] = useState<(SupportTicket & { messages: SupportMessage[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const loadTicket = useCallback(async () => {
    if (!ticketId) return;
    try {
      const data = await supportService.getTicket(ticketId);
      setTicket(data);
      await supportService.markRead(ticketId);
    } catch (e: any) {
      console.error('Failed to load ticket:', e);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { loadTicket(); }, [loadTicket]);

  useActiveChatForNotifications('support', ticketId);

  useEffect(() => {
    if (!ticketId) return;
    const interval = setInterval(loadTicket, 5000);
    return () => clearInterval(interval);
  }, [ticketId, loadTicket]);

  async function handleSend() {
    if (!message.trim() || !ticketId || sending) return;
    setSending(true);
    try {
      await supportService.sendMessage(ticketId, message.trim());
      setMessage('');
      await loadTicket();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      console.error('Failed to send:', e);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#c026d3" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#ef4444' }}>Ticket not found</Text>
      </View>
    );
  }

  const isClosed = ticket.status === 'CLOSED';

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{ticket.category.replace('_', ' ')}</Text>
          <Text style={[styles.headerStatus, { color: colors.textSecondary }]}>{ticket.status.replace('_', ' ')}</Text>
        </View>
        <View style={{ width: 50 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={ticket.messages}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          <View style={styles.ticketInfo}>
            <Text style={styles.ticketInfoText}>{ticket.description}</Text>
            <Text style={styles.ticketInfoDate}>Created {new Date(ticket.createdAt).toLocaleString()}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.senderType === 'USER';
          return (
            <View style={[styles.messageBubble, isMe ? styles.myMessage : [styles.theirMessage, { backgroundColor: colors.card, borderColor: colors.border }]]}>
              {!isMe && <Text style={[styles.senderLabel, { color: colors.textSecondary }]}>{item.senderType === 'ADMIN' ? 'Admin' : 'Customer Service'}</Text>}
              <Text style={[styles.messageText, isMe ? styles.myMessageText : [styles.theirMessageText, { color: colors.text }]]}>{item.content}</Text>
              <Text style={[styles.messageTime, isMe ? styles.myMessageTime : styles.theirMessageTime]}>
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {item.readAt ? ' ✓' : ''}
              </Text>
            </View>
          );
        }}
      />

      {isClosed ? (
        <View style={[styles.closedBanner, { backgroundColor: colors.surfaceVariant, borderTopColor: colors.border }]}>
          <Text style={[styles.closedText, { color: colors.textSecondary }]}>This ticket is closed</Text>
        </View>
      ) : (
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceVariant, borderColor: colors.border, color: colors.text }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity style={[styles.sendBtn, (!message.trim() || sending) && { opacity: 0.5 }]} onPress={handleSend} disabled={!message.trim() || sending}>
            <Text style={styles.sendBtnText}>{sending ? '...' : '→'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backText: { color: '#c026d3', fontSize: 16, fontWeight: '500', width: 50 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  headerStatus: { fontSize: 12, color: '#6b7280' },
  messagesList: { padding: 16, paddingBottom: 8 },
  ticketInfo: { backgroundColor: '#fdf4ff', borderRadius: 12, padding: 12, marginBottom: 16 },
  ticketInfoText: { fontSize: 14, color: '#86198f', marginBottom: 4 },
  ticketInfoDate: { fontSize: 11, color: '#6b7280' },
  messageBubble: { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 8 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#c026d3', borderBottomRightRadius: 4 },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  senderLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600', marginBottom: 2 },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: '#fff' },
  theirMessageText: { color: '#111827' },
  messageTime: { fontSize: 10, marginTop: 4 },
  myMessageTime: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  theirMessageTime: { color: '#9ca3af' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingBottom: 32, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 8 },
  input: { flex: 1, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#111827', maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#c026d3', alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  closedBanner: { padding: 16, paddingBottom: 32, backgroundColor: '#f3f4f6', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  closedText: { color: '#6b7280', fontSize: 14, fontWeight: '500' },
});
