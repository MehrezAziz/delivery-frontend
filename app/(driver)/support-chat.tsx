import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [ticket, setTicket] = useState<(SupportTicket & { messages: SupportMessage[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  /** Android: tab bar is `position: 'absolute'` — lift composer by keyboard height so it sits above the IME (incl. suggestion row). */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
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

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const apply = (e: { endCoordinates?: { height?: number } }) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    };
    const showSub = Keyboard.addListener('keyboardDidShow', apply);
    const frameSub = Keyboard.addListener('keyboardDidChangeFrame', apply);
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      frameSub.remove();
      hideSub.remove();
    };
  }, []);

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

  const tabBarLift = 60 + insets.bottom + 3;
  const androidComposerBottom =
    Platform.OS === 'android' ? (keyboardHeight > 0 ? keyboardHeight : tabBarLift) : 0;

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
    <SafeAreaView style={[styles.safeOuter, { backgroundColor: colors.background }]} edges={['bottom']}>
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <View style={[styles.ticketToolbar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {ticket.category.replace('_', ' ')}
          </Text>
          <Text style={[styles.headerStatus, { color: colors.textSecondary }]} numberOfLines={1}>
            {ticket.status.replace('_', ' ')}
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        style={styles.messagesFlex}
        data={ticket.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messagesList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
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
        <View
          style={[
            styles.closedBanner,
            {
              backgroundColor: colors.surfaceVariant,
              borderTopColor: colors.border,
              paddingBottom: Platform.OS === 'android' ? (keyboardHeight > 0 ? 10 : Math.max(insets.bottom, 12)) : Math.max(insets.bottom, 12),
              marginBottom: Platform.OS === 'android' ? androidComposerBottom : 0,
            },
          ]}
        >
          <Text style={[styles.closedText, { color: colors.textSecondary }]}>This ticket is closed</Text>
        </View>
      ) : (
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: Platform.OS === 'android' ? (keyboardHeight > 0 ? 10 : Math.max(insets.bottom, 12)) : Math.max(insets.bottom, 12),
              marginBottom: Platform.OS === 'android' ? androidComposerBottom : 0,
            },
          ]}
        >
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceVariant, borderColor: colors.border, color: colors.text }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
            textAlignVertical="top"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeOuter: { flex: 1 },
  container: { flex: 1 },
  ticketToolbar: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  headerStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  messagesFlex: { flex: 1 },
  messagesList: { padding: 16, paddingBottom: 8, flexGrow: 1 },
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
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 52,
    maxHeight: 160,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#c026d3', alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  closedBanner: { padding: 16, paddingBottom: 32, alignItems: 'center', borderTopWidth: 1 },
  closedText: { fontSize: 14, fontWeight: '500' },
});












