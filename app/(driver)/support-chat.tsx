import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  supportService,
  SupportMessage,
  SupportTicket,
  sendSupportMessageStream,
} from '../../services/api/support.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useActiveChatForNotifications } from '../../hooks/useActiveChatForNotifications';
import { SupportChatMessageItem } from '../../components/support/SupportChatMessageItem';

export default function DriverSupportChatScreen() {
  const router = useRouter();
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/home');
  };
  const { colors } = useTheme();
  const [ticket, setTicket] = useState<(SupportTicket & { messages: SupportMessage[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingPreview, setStreamingPreview] = useState('');
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, boolean | undefined>>({});
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

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  useActiveChatForNotifications('support', ticketId);

  useEffect(() => {
    if (!ticketId) return;
    const interval = setInterval(loadTicket, 5000);
    return () => clearInterval(interval);
  }, [ticketId, loadTicket]);

  const onFeedback = useCallback(
    async (messageId: string, helpful: boolean) => {
      if (!ticketId) return;
      try {
        await supportService.submitAiFeedback(ticketId, messageId, helpful);
        setFeedbackGiven((prev) => ({ ...prev, [messageId]: helpful }));
      } catch (e) {
        console.error('Feedback failed', e);
      }
    },
    [ticketId],
  );

  async function handleSend() {
    if (!message.trim() || !ticketId || sending) return;
    setSending(true);
    setStreamingPreview('');
    const text = message.trim();
    setMessage('');
    try {
      await sendSupportMessageStream(ticketId, text, {
        onChunk: (t) => setStreamingPreview((p) => p + t),
        onDone: () => {
          setStreamingPreview('');
          loadTicket();
        },
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: unknown) {
      console.warn('Stream failed, recovering:', e);
      try {
        const fresh = await supportService.getTicket(ticketId);
        const m = fresh.messages;
        const last = m[m.length - 1];
        const prev = m[m.length - 2];
        if (
          last?.senderType === 'BOT' &&
          prev?.senderType === 'USER' &&
          prev.content.trim() === text
        ) {
          setTicket(fresh);
          setStreamingPreview('');
          return;
        }
        if (last?.senderType === 'USER' && last.content.trim() === text) {
          await supportService.aiFollowup(ticketId);
          setTicket(await supportService.getTicket(ticketId));
          setStreamingPreview('');
          return;
        }
        await supportService.sendMessage(ticketId, text);
        setTicket(await supportService.getTicket(ticketId));
      } catch (e2) {
        console.error('Failed to send:', e2);
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }]}>
        <Text style={{ color: colors.danger }}>Ticket not found</Text>
      </View>
    );
  }

  const isClosed = ticket.status === 'CLOSED';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack}>
          <Text style={[styles.backText, { color: colors.primary }]}>← Back</Text>
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
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          <View style={[styles.ticketInfo, { backgroundColor: colors.surfaceVariant }]}>
            <Text style={[styles.ticketInfoText, { color: colors.text }]}>{ticket.description}</Text>
            <Text style={[styles.ticketInfoDate, { color: colors.textSecondary }]}>
              Created {new Date(ticket.createdAt).toLocaleString()}
            </Text>
          </View>
        }
        ListFooterComponent={
          streamingPreview ? (
            <View style={[styles.streamingBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.streamingLabel, { color: colors.textSecondary }]}>Assistant</Text>
              <Text style={{ color: colors.text }}>{streamingPreview}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isMe = item.senderType === 'USER';
          return (
            <SupportChatMessageItem
              item={item}
              isMe={isMe}
              colors={colors}
              feedbackGiven={feedbackGiven}
              onFeedback={onFeedback}
            />
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
          <TouchableOpacity
            style={[styles.sendBtn, (!message.trim() || sending) && { opacity: 0.5 }]}
            onPress={handleSend}
            disabled={!message.trim() || sending}
          >
            <Text style={styles.sendBtnText}>{sending ? '...' : '→'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1 },
  backText: { fontSize: 16, fontWeight: '500', width: 50 },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerStatus: { fontSize: 12 },
  messagesList: { padding: 16, paddingBottom: 8 },
  ticketInfo: { borderRadius: 12, padding: 12, marginBottom: 16 },
  ticketInfoText: { fontSize: 14, marginBottom: 4 },
  ticketInfoDate: { fontSize: 11 },
  streamingBubble: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  streamingLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingBottom: 32, borderTopWidth: 1, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#c026d3', alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  closedBanner: { padding: 16, paddingBottom: 32, alignItems: 'center', borderTopWidth: 1 },
  closedText: { fontSize: 14, fontWeight: '500' },
});
