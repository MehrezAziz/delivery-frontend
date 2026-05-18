import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { api, resolveImageUrl } from '../../services/api/client';

type Eligibility =
  | 'OK'
  | 'NOT_ACTIVE_USER'
  | 'PHONE_REQUIRED'
  | 'COUNTRY_NOT_ELIGIBLE'
  | 'ORDER_REQUIRED'
  | 'CODE_REQUIRED'
  | 'CODE_VERSION_STALE'
  | 'GAME_INACTIVE'
  | 'NOT_OPEN_TODAY'
  | 'COMING_SOON';

type GameEntry = {
  id: string;
  name: string;
  description: string | null;
  bannerImageUrls: string[];
  status: 'COMING_SOON' | 'OPEN' | 'CLOSED_TODAY';
  eligibility: Eligibility;
  canEnter: boolean;
};

type Props = {
  placement: string;
  role?: 'customer' | 'driver';
};

const blockingMessages: Partial<Record<Eligibility, string>> = {
  NOT_ACTIVE_USER: 'Your account is not eligible to play this game yet.',
  COUNTRY_NOT_ELIGIBLE: 'This game is not available in your country.',
  ORDER_REQUIRED: 'You need at least one delivered order to play this game.',
};

export function GameEntrySection({ placement, role }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [entries, setEntries] = useState<GameEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<GameEntry[]>(`/games/entries?placement=${placement}`);
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [placement]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) return null;
  if (entries.length === 0) return null;

  const handlePress = (g: GameEntry) => {
    if (g.status === 'COMING_SOON') return;

    if (g.eligibility === 'PHONE_REQUIRED') {
      Alert.alert(
        'Phone number required',
        'Please add your phone number to your profile to participate in games.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add phone',
            onPress: () => {
              const target =
                role === 'driver' ? '/(driver)/edit-profile' : '/(customer)/edit-profile';
              router.push(target);
            },
          },
        ],
      );
      return;
    }

    const msg = blockingMessages[g.eligibility];
    if (msg) {
      Alert.alert(g.name, msg);
      return;
    }

    router.push(`/games/${g.id}`);
  };

  return (
    <View style={styles.wrap}>
      {entries.map((g) => {
        const comingSoon = g.status === 'COMING_SOON';
        return (
          <TouchableOpacity
            key={g.id}
            activeOpacity={0.9}
            onPress={() => handlePress(g)}
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: colors.primary,
                opacity: comingSoon ? 0.85 : 1,
              },
            ]}
          >
            {g.bannerImageUrls[0] ? (
              <Image source={{ uri: resolveImageUrl(g.bannerImageUrls[0]) }} style={styles.banner} />
            ) : (
              <View
                style={[
                  styles.bannerPlaceholder,
                  {
                    backgroundColor: colors.primary + '15',
                    borderColor: colors.primary + '33',
                  },
                ]}
              >
                <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
                  <Ionicons name="game-controller" size={28} color="#fff" />
                </View>
              </View>
            )}

            <View style={styles.body}>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {g.name}
              </Text>
              {g.description ? (
                <Text
                  style={[styles.sub, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {g.description}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, marginBottom: 16 },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowOpacity: 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 4 },
    }),
  },
  banner: { width: '100%', height: 130 },
  bannerPlaceholder: {
    width: '100%',
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 16, alignItems: 'center' },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  sub: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
  },
});
