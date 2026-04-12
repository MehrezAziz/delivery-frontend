import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { SupportMessage } from '../../services/api/support.service';

type ThemeColors = {
  background: string;
  card: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  surfaceVariant?: string;
};

type Props = {
  item: SupportMessage;
  isMe: boolean;
  colors: ThemeColors;
  /** Only for customers: open live tracking */
  onTrackPress?: (orderId: string) => void;
  /** messageId -> helpful (true/false) once submitted */
  feedbackGiven?: Record<string, boolean | undefined>;
  onFeedback?: (messageId: string, helpful: boolean) => void;
};

function senderLabel(senderType: string): string {
  if (senderType === 'BOT') return 'Assistant';
  if (senderType === 'ADMIN') return 'Admin';
  return 'Customer Service';
}

function SupportChatMessageItemInner({
  item,
  isMe,
  colors,
  onTrackPress,
  feedbackGiven,
  onFeedback,
}: Props) {
  const meta = item.metadata;
  const tr = meta?.trackRecommendation;
  const showTrack = tr?.showTrackButton && tr.orderId && onTrackPress;
  const citations = meta?.citations?.length ? meta.citations : [];
  const fb = feedbackGiven?.[item.id];

  return (
    <View
      style={[
        styles.messageBubble,
        isMe ? styles.myMessage : [styles.theirMessage, { backgroundColor: colors.card, borderColor: colors.border }],
      ]}
    >
      {!isMe && (
        <Text style={[styles.senderLabel, { color: colors.textSecondary }]}>{senderLabel(item.senderType)}</Text>
      )}
      <Text style={[styles.messageText, isMe ? styles.myMessageText : [styles.theirMessageText, { color: colors.text }]]}>
        {item.content}
      </Text>
      {citations.length > 0 && (
        <View style={[styles.citations, { borderTopColor: colors.border }]}>
          <Text style={[styles.citationsTitle, { color: colors.textTertiary }]}>Based on</Text>
          {citations.slice(0, 6).map((c, i) => (
            <Text key={i} style={[styles.citationLine, { color: colors.textSecondary }]}>
              • {c}
            </Text>
          ))}
        </View>
      )}
      {showTrack && (
        <TouchableOpacity
          style={[styles.trackBtn, { backgroundColor: colors.primary }]}
          onPress={() => onTrackPress!(tr!.orderId)}
          activeOpacity={0.85}
        >
          <Text style={styles.trackBtnText}>
            {tr.driverTrackable ? 'Track delivery' : 'Open order / tracking'}
          </Text>
          {!tr.driverTrackable && (
            <Text style={styles.trackHint}>Live position may be unavailable if the driver is offline.</Text>
          )}
        </TouchableOpacity>
      )}
      {item.senderType === 'BOT' && meta?.helpfulnessPrompt && onFeedback && fb === undefined && (
        <View style={styles.feedbackRow}>
          <Text style={[styles.feedbackAsk, { color: colors.textSecondary }]}>Was this helpful?</Text>
          <TouchableOpacity
            style={[styles.feedbackBtn, { borderColor: colors.border }]}
            onPress={() => onFeedback(item.id, true)}
          >
            <Text style={{ color: colors.primary }}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.feedbackBtn, { borderColor: colors.border }]}
            onPress={() => onFeedback(item.id, false)}
          >
            <Text style={{ color: colors.textSecondary }}>No</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.senderType === 'BOT' && fb !== undefined && (
        <Text style={[styles.feedbackThanks, { color: colors.textTertiary }]}>Thanks for your feedback.</Text>
      )}
      <Text style={[styles.messageTime, isMe ? styles.myMessageTime : styles.theirMessageTime]}>
        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        {item.readAt ? ' ✓' : ''}
      </Text>
    </View>
  );
}

export const SupportChatMessageItem = memo(SupportChatMessageItemInner);

const styles = StyleSheet.create({
  messageBubble: { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 8 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#0284c7', borderBottomRightRadius: 4 },
  theirMessage: { alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1 },
  senderLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: '#fff' },
  theirMessageText: { color: '#111827' },
  citations: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  citationsTitle: { fontSize: 10, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  citationLine: { fontSize: 11, lineHeight: 16 },
  trackBtn: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  trackBtnText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  trackHint: { color: 'rgba(255,255,255,0.85)', fontSize: 10, marginTop: 4, textAlign: 'center' },
  feedbackRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  feedbackAsk: { fontSize: 12, marginRight: 4 },
  feedbackBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  feedbackThanks: { fontSize: 11, marginTop: 6 },
  messageTime: { fontSize: 10, marginTop: 4 },
  myMessageTime: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  theirMessageTime: { color: '#9ca3af' },
});
