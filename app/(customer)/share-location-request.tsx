import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import {
  locationRequestService,
  type LocationShareRequestDto,
} from '../../services/api/locationRequest.service';
import { acceptLocationShareWithCurrentGps, dismissLocationShareNotification } from '../../services/locationShareNotificationActions';
import { appAlert } from '../../utils/appAlert';
import { ApiError } from '../../services/api/client';

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

export default function ShareLocationRequestScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<LocationShareRequestDto | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await locationRequestService.getById(id);
      setRequest(res);
    } catch (e) {
      appAlert(t('common.error'), errMsg(e));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const slotLabel =
    request?.slot === 'PICKUP' ? t('createOrder.pickup') : t('createOrder.delivery');
  const accent = request?.slot === 'PICKUP' ? '#16a34a' : '#dc2626';
  const canRespond =
    request?.status === 'PENDING' &&
    new Date(request.expiresAt).getTime() > Date.now();
  const isCancelled = request?.status === 'CANCELLED';
  const isDeclinedFinal =
    request?.status === 'DECLINED' &&
    new Date(request.expiresAt).getTime() > Date.now();

  const handleDecline = async () => {
    if (!request?.id || request.status === 'CANCELLED') {
      if (request?.status === 'CANCELLED') {
        appAlert(t('locationShare.notifCancelledTitle'), t('locationShare.requestCancelled', { name: request.requester.displayName }));
      }
      return;
    }
    setBusy(true);
    try {
      await locationRequestService.decline(request.id);
      await dismissLocationShareNotification(request.id);
      appAlert(t('locationShare.declinedTitle'), t('locationShare.declinedBody'));
      router.back();
    } catch (e) {
      appAlert(t('common.error'), errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!request?.id) return;
    setBusy(true);
    try {
      const outcome = await acceptLocationShareWithCurrentGps(request.id);
      if (!outcome.ok) {
        if (outcome.reason === 'cancelled') {
          await load();
        }
        return;
      }
      await dismissLocationShareNotification(request.id);
      setRequest(outcome.result);
      appAlert(t('locationShare.acceptedTitle'), t('locationShare.acceptedBody'));
      router.back();
    } catch (e) {
      appAlert(t('common.error'), errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !request) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const initials = (request.requester.displayName || 'U').charAt(0).toUpperCase();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.hero, { backgroundColor: isDark ? '#0f172a' : '#f0fdf4', borderColor: colors.border }]}>
        <View style={[styles.avatarLg, { backgroundColor: `${accent}22` }]}>
          <Text style={[styles.avatarLgTxt, { color: accent }]}>{initials}</Text>
        </View>
        <Text style={[styles.heroTitle, { color: colors.text }]}>{t('locationShare.incomingTitle')}</Text>
        <Text style={[styles.heroBody, { color: colors.textSecondary }]}>{t('locationShare.incomingBody')}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('locationShare.requestedBy')}</Text>
        <View style={styles.nameBlock}>
          <View style={styles.nameRow}>
            <Text style={[styles.nameLabel, { color: colors.textSecondary }]}>{t('editProfile.firstName')}</Text>
            <Text style={[styles.nameValue, { color: colors.text }]}>
              {request.requester.firstName?.trim() || '—'}
            </Text>
          </View>
          <View style={styles.nameRow}>
            <Text style={[styles.nameLabel, { color: colors.textSecondary }]}>{t('editProfile.lastName')}</Text>
            <Text style={[styles.nameValue, { color: colors.text }]}>
              {request.requester.secondName?.trim() || '—'}
            </Text>
          </View>
        </View>
        {request.requester.phone ? (
          <TouchableOpacity
            style={styles.phoneRow}
            onPress={() => void Linking.openURL(`tel:${request.requester.phone}`)}
          >
            <Ionicons name="call-outline" size={18} color={colors.primary} />
            <Text style={[styles.requesterPhone, { color: colors.primary }]}>{request.requester.phone}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={[styles.slotBadge, { backgroundColor: `${accent}18` }]}>
          <Ionicons name="location-outline" size={16} color={accent} />
          <Text style={[styles.slotBadgeTxt, { color: accent }]}>
            {t('locationShare.forSlot', { slot: slotLabel })}
          </Text>
        </View>
      </View>

      {request.status === 'ACCEPTED' ? (
        <View style={[styles.statusCard, { backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#dcfce7' }]}>
          <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
          <Text style={[styles.statusTxt, { color: '#166534' }]}>{t('locationShare.alreadyAccepted')}</Text>
        </View>
      ) : isCancelled ? (
        <View style={[styles.statusCard, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fee2e2' }]}>
          <Ionicons name="close-circle-outline" size={22} color="#dc2626" />
          <Text style={[styles.statusTxt, { color: '#b91c1c' }]}>
            {t('locationShare.requestCancelled', { name: request.requester.displayName })}
          </Text>
        </View>
      ) : request.status === 'EXPIRED' ? (
        <View style={[styles.statusCard, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fee2e2' }]}>
          <Ionicons name="time-outline" size={22} color="#dc2626" />
          <Text style={[styles.statusTxt, { color: '#b91c1c' }]}>{t('locationShare.expired')}</Text>
        </View>
      ) : isDeclinedFinal ? (
        <View style={[styles.statusCard, { backgroundColor: isDark ? 'rgba(234,88,12,0.12)' : '#fff7ed' }]}>
          <Ionicons name="hand-left-outline" size={22} color="#ea580c" />
          <Text style={[styles.statusTxt, { color: '#c2410c' }]}>
            {t('locationShare.declinedFinal', { name: request.requester.displayName })}
          </Text>
        </View>
      ) : canRespond ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: colors.primary }, busy && styles.btnDisabled]}
            onPress={() => void handleAccept()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="navigate" size={20} color="#fff" />
                <Text style={styles.acceptBtnTxt}>{t('locationShare.acceptButton')}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rejectBtn, { borderColor: colors.border }, busy && styles.btnDisabled]}
            onPress={() => void handleDecline()}
            disabled={busy}
          >
            <Text style={[styles.rejectBtnTxt, { color: colors.textSecondary }]}>{t('locationShare.rejectButton')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={[styles.privacy, { color: colors.textTertiary }]}>{t('locationShare.privacyNote')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  avatarLg: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarLgTxt: { fontSize: 28, fontWeight: '800' },
  heroTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  heroBody: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  card: { borderRadius: 16, padding: 18, borderWidth: StyleSheet.hairlineWidth, marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  nameBlock: { marginTop: 10, gap: 10 },
  nameRow: { gap: 2 },
  nameLabel: { fontSize: 12, fontWeight: '600' },
  nameValue: { fontSize: 18, fontWeight: '800' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  requesterPhone: { fontSize: 16, fontWeight: '600' },
  slotBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginTop: 16 },
  slotBadgeTxt: { fontSize: 13, fontWeight: '700' },
  actions: { gap: 12, marginTop: 4 },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
  },
  acceptBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  rejectBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  rejectBtnTxt: { fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, marginBottom: 12 },
  statusTxt: { flex: 1, fontSize: 14, fontWeight: '600' },
  privacy: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 16, paddingHorizontal: 8 },
});
