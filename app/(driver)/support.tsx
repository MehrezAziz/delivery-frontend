import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Modal, TextInput, ScrollView } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { supportService, SupportTicket } from '../../services/api/support.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';

const CATEGORIES = ['ORDER_ISSUE', 'PAYMENT', 'TECHNICAL', 'OTHER'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#f59e0b',
  IN_PROGRESS: '#3b82f6',
  RESOLVED: '#10b981',
  CLOSED: '#6b7280',
};

export default function DriverSupportScreen() {
  const { push } = useAppNavigation();
  const { colors, isDark } = useTheme();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState('OTHER');
  const [priority, setPriority] = useState('MEDIUM');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const loadTickets = useCallback(async () => {
    try {
      const data = await supportService.getMyTickets();
      setTickets(data);
    } catch (e: any) {
      console.error('Failed to load tickets:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // Poll for status updates every 10 seconds
  useEffect(() => {
    const interval = setInterval(loadTickets, 10000);
    return () => clearInterval(interval);
  }, [loadTickets]);

  async function handleCreate() {
    if (!description.trim()) { setError('Description is required'); return; }
    setCreating(true);
    setError('');
    try {
      await supportService.createTicket({ category, priority, description: description.trim() });
      setShowCreate(false);
      setDescription('');
      setCategory('OTHER');
      setPriority('MEDIUM');
      setLoading(true);
      loadTickets();
    } catch (e: any) {
      setError(e.message || 'Failed to create ticket');
    } finally {
      setCreating(false);
    }
  }

  function getLastMessage(ticket: SupportTicket) {
    if (ticket.messages && ticket.messages.length > 0) {
      const msg = ticket.messages[0];
      const prefix = msg.senderType === 'CUSTOMER_SERVICE' ? 'CS: ' : 'You: ';
      return prefix + (msg.content.length > 40 ? msg.content.slice(0, 40) + '...' : msg.content);
    }
    return ticket.description.length > 50 ? ticket.description.slice(0, 50) + '...' : ticket.description;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.supportToolbar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.toolbarHint, { color: colors.textSecondary }]}>Your tickets</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={[styles.newBtn, { backgroundColor: '#c026d3' }]}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#c026d3" style={{ marginTop: 40 }} />
      ) : tickets.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={[styles.emptyText, { color: colors.text }]}>No support tickets yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>Tap "+ New" to create one</Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={t => t.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => push(`/(driver)/support-chat?ticketId=${item.id}`)}
            >
              <View style={styles.ticketHeader}>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#6b7280' }]}>
                  <Text style={styles.statusText}>{item.status.replace('_', ' ')}</Text>
                </View>
                <Text style={[styles.ticketCategory, { color: colors.textSecondary }]}>{item.category.replace('_', ' ')}</Text>
              </View>
              <Text style={[styles.ticketDesc, { color: colors.text }]}>{getLastMessage(item)}</Text>
              <View style={styles.ticketFooter}>
                <Text style={[styles.ticketDate, { color: colors.textTertiary }]}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                {item.customerService && (
                  <Text style={[styles.ticketAssigned, { color: colors.textSecondary }]}>Assigned: {item.customerService.superUser.pseudo}</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Support Ticket</Text>
            <ScrollView>
              <Text style={[styles.label, { color: colors.text }]}>Category</Text>
              <View style={styles.chipRow}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity key={c} style={[styles.chip, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
                    <Text style={[styles.chipText, { color: colors.text }, category === c && styles.chipTextActive]}>{c.replace('_', ' ')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.label, { color: colors.text }]}>Priority</Text>
              <View style={styles.chipRow}>
                {PRIORITIES.map(p => (
                  <TouchableOpacity key={p} style={[styles.chip, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }, priority === p && styles.chipActive]} onPress={() => setPriority(p)}>
                    <Text style={[styles.chipText, { color: colors.text }, priority === p && styles.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.label, { color: colors.text }]}>Description</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: colors.surfaceVariant, borderColor: colors.border, color: colors.text }]}
                multiline
                numberOfLines={4}
                placeholder="Describe your issue..."
                placeholderTextColor={colors.textTertiary}
                value={description}
                onChangeText={setDescription}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowCreate(false); setError(''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, creating && { opacity: 0.6 }]} onPress={handleCreate} disabled={creating}>
                <Text style={styles.submitBtnText}>{creating ? 'Creating...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  supportToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toolbarHint: { fontSize: 13, fontWeight: '600', flex: 1 },
  newBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  newBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151' },
  emptySubtext: { fontSize: 14, color: '#9ca3af' },
  ticketCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  ticketHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  ticketCategory: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  ticketDesc: { fontSize: 14, color: '#374151', marginBottom: 8 },
  ticketFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketDate: { fontSize: 12, color: '#9ca3af' },
  ticketAssigned: { fontSize: 12, color: '#6b7280' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  chipActive: { backgroundColor: '#c026d3', borderColor: '#c026d3' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  textArea: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, fontSize: 15, color: '#111827', minHeight: 100, textAlignVertical: 'top', marginTop: 4 },
  error: { color: '#ef4444', fontSize: 13, marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' },
  cancelBtnText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  submitBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#c026d3', alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
