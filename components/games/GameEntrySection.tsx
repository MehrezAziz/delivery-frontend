import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  Animated,
  Easing,
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
      {entries.map((g) => (
        <GameEntryCard
          key={g.id}
          game={g}
          colors={colors}
          onPress={() => handlePress(g)}
        />
      ))}
    </View>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];

function GameEntryCard({
  game,
  colors,
  onPress,
}: {
  game: GameEntry;
  colors: Colors;
  onPress: () => void;
}) {
  const comingSoon = game.status === 'COMING_SOON';
  const banners = game.bannerImageUrls;
  const [bannerIdx, setBannerIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const float = useRef(new Animated.Value(0)).current;

  // Crossfade through banners every ~3.2s
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setBannerIdx((i) => (i + 1) % banners.length);
        Animated.timing(fade, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start();
      });
    }, 3200);
    return () => clearInterval(interval);
  }, [banners.length, fade]);

  // Gentle floating motion
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });
  const shadowScale = float.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.92],
  });

  const banner = banners[bannerIdx];

  return (
    <View>
      <Animated.View
        style={[
          styles.cardWrap,
          {
            transform: [{ translateY }],
            shadowColor: colors.primary,
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={onPress}
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: comingSoon ? 0.85 : 1,
            },
          ]}
        >
          <View style={styles.heroWrap}>
            {banner ? (
              <Animated.Image
                source={{ uri: resolveImageUrl(banner) }}
                style={[styles.banner, { opacity: fade }]}
              />
            ) : (
              <View
                style={[
                  styles.bannerPlaceholder,
                  {
                    backgroundColor: colors.primary + '15',
                  },
                ]}
              />
            )}

            {/* Top-left attractive badge */}
            <View style={styles.badgeWrap} pointerEvents="none">
              <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
                <Ionicons name="sparkles" size={12} color="#fff" />
                <Text style={styles.badgeText}>Win valuable prizes</Text>
              </View>
            </View>

            {/* Game logo overlay (always visible) */}
            <View style={styles.logoWrap} pointerEvents="none">
              <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
                <Ionicons name="game-controller" size={24} color="#fff" />
              </View>
            </View>

            {/* Pagination dots when multiple banners */}
            {banners.length > 1 && (
              <View style={styles.dotsWrap} pointerEvents="none">
                {banners.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor: i === bannerIdx ? '#fff' : 'rgba(255,255,255,0.5)',
                        width: i === bannerIdx ? 14 : 6,
                      },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>

          <View style={styles.body}>
            <Text
              style={[styles.title, { color: colors.text }]}
              numberOfLines={1}
            >
              {game.name}
            </Text>
            {game.description ? (
              <Text
                style={[styles.sub, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {game.description}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Soft glowing ground shadow that subtly pulses with the floating motion */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            backgroundColor: colors.primary,
            transform: [{ scaleX: shadowScale }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 22, marginBottom: 18 },
  cardWrap: {
    ...Platform.select({
      ios: {
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 8 },
    }),
  },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  heroWrap: {
    width: '100%',
    height: 150,
    overflow: 'hidden',
    position: 'relative',
  },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    width: '100%',
    height: '100%',
  },
  badgeWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 4 },
    }),
  },
  badgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  logoWrap: {
    position: 'absolute',
    bottom: 12,
    right: 12,
  },
  logoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 6 },
    }),
  },
  dotsWrap: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    height: 6,
    borderRadius: 3,
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
  glow: {
    position: 'absolute',
    bottom: -14,
    left: '15%',
    right: '15%',
    height: 16,
    borderRadius: 999,
    opacity: 0.18,
  },
});
