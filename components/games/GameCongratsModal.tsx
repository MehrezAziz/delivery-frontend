import { useCallback, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { api, resolveImageUrl } from '../../services/api/client';

type Congrats = {
  winnerId: string;
  gameId: string;
  gameName: string;
  prizeLabel: string;
  congratsImageUrl: string | null;
  prizeImageUrl: string | null;
  prizeType: string;
  wonAt: string;
  announcedAt: string;
};

function formatAnnouncementDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function GameCongratsModal() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [data, setData] = useState<Congrats | null>(null);

  const load = useCallback(async () => {
    try {
      const row = await api.get<Congrats | null>('/games/me/pending-congrats');
      setData(row);
    } catch {
      setData(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const dismiss = async () => {
    if (!data) return;
    try {
      await api.post('/games/me/congrats-shown', { winnerId: data.winnerId });
    } catch {
      /* ignore */
    }
    setData(null);
  };

  if (!data) return null;

  const imageUri = resolveImageUrl(data.congratsImageUrl || data.prizeImageUrl);
  const announcedOn = formatAnnouncementDate(data.announcedAt || data.wonAt);

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.box, { backgroundColor: colors.card }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.hero} resizeMode="cover" />
          ) : (
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.primary }]}>
              <Ionicons name="trophy" size={56} color="#fff" />
            </View>
          )}
          <Text style={[styles.title, { color: colors.text }]}>{t('gameCongrats.title')}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {t('gameCongrats.bodyPrefix')}{data.prizeLabel}{t('gameCongrats.bodyMiddle')}{data.gameName}{t('gameCongrats.bodyEnd')}
          </Text>
          {announcedOn ? (
            <View style={[styles.dateRow, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={[styles.dateText, { color: colors.text }]}>
                {t('gameCongrats.announcedOn')}<Text style={{ fontWeight: '800' }}>{announcedOn}</Text>
              </Text>
            </View>
          ) : null}
          {data.prizeType === 'PHYSICAL' && (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {t('gameCongrats.teamWillContact')}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => void dismiss()}
          >
            <Text style={styles.btnText}>{t('gameCongrats.awesome')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  box: { borderRadius: 20, padding: 24, alignItems: 'center' },
  hero: { width: '100%', height: 140, borderRadius: 12, marginBottom: 16 },
  heroPlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  sub: { fontSize: 16, textAlign: 'center', lineHeight: 22, marginBottom: 10 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 6,
  },
  dateText: { fontSize: 13 },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 8 },
  btn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, marginTop: 12 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
