import { useCallback, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { api } from '../../services/api/client';

type Congrats = {
  winnerId: string;
  gameId: string;
  gameName: string;
  prizeLabel: string;
  congratsImageUrl: string | null;
  prizeImageUrl: string | null;
  prizeType: string;
};

export function GameCongratsModal() {
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

  const imageUri = data.congratsImageUrl || data.prizeImageUrl;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.box, { backgroundColor: colors.card }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.hero} resizeMode="cover" />
          ) : null}
          <Text style={[styles.title, { color: colors.text }]}>Congratulations!</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            You won {data.prizeLabel} in {data.gameName}.
          </Text>
          {data.prizeType === 'PHYSICAL' && (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Our team will contact you to arrange your prize.
            </Text>
          )}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => void dismiss()}
          >
            <Text style={styles.btnText}>Awesome!</Text>
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
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  sub: { fontSize: 16, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  hint: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  btn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
