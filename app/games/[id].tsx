import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { api, resolveImageUrl } from '../../services/api/client';
import { CorrectCelebration } from '../../components/games/CorrectCelebration';
import i18n from '../../i18n';

type GameDetail = {
  id: string;
  name: string;
  description: string | null;
  bannerImageUrls: string[];
  status: string;
  eligibility: string;
  unlocked: boolean;
  questionsPerDay: number;
  answeredToday: number;
  correctToday: number;
  remainingToday: number;
  completedToday: boolean;
  nextDayResetUtc: string | null;
  periodEnd: string | null;
  participationCertificate: { message: string; periodEnd: string } | null;
  prizeTiers: Array<{
    rank: number;
    prizeType: string;
    coinAmount: number | null;
    prizeLabel: string | null;
    prizeImageUrl: string | null;
  }>;
  recentWinners: Array<{
    displayName: string;
    prizeLabel: string;
    prizeImageUrl: string | null;
    wonAt: string;
  }>;
};

type QuestionPayload = {
  questionId: string;
  text: string | null;
  imageUrl: string | null;
  categoryName: string;
  options: Array<{ id: string; text: string | null; imageUrl: string | null }>;
  progress: { answeredToday: number; limit: number };
};

function formatCountdown(targetIso: string | null): string {
  if (!targetIso) return '';
  const ms = new Date(targetIso).getTime() - Date.now();
  if (ms <= 0) return i18n.t('games.countdownNow');
  const days = Math.floor(ms / (24 * 3600 * 1000));
  const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
  const mins = Math.floor((ms % (3600 * 1000)) / 60000);
  const parts: string[] = [];
  if (days > 0)
    parts.push(`${days} ${days === 1 ? i18n.t('games.dayShort') : i18n.t('games.daysShort')}`);
  if (hours > 0)
    parts.push(`${hours} ${hours === 1 ? i18n.t('games.hourShort') : i18n.t('games.hoursShort')}`);
  if (days === 0 && mins > 0) parts.push(`${mins} ${i18n.t('games.minShort')}`);
  return parts.length ? parts.join(' & ') : i18n.t('games.countdownLessThanMinute');
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<GameDetail | null>(null);
  const [code, setCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'wrong'; text: string } | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.get<GameDetail>(`/games/${id}`);
      setGame(data);
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('games.couldNotLoad'));
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

  useEffect(() => {
    const tickInterval = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(tickInterval);
  }, []);

  const unlock = async () => {
    if (!id || code.length !== 6) return;
    setUnlocking(true);
    try {
      await api.post(`/games/${id}/unlock`, { code });
      setCode('');
      await load();
    } catch (e: unknown) {
      Alert.alert(t('games.invalidCode'), e instanceof Error ? e.message : t('games.tryAgain'));
    } finally {
      setUnlocking(false);
    }
  };

  const loadQuestion = async () => {
    if (!id) return;
    setLoadingQ(true);
    setFeedback(null);
    try {
      const q = await api.get<QuestionPayload>(`/games/${id}/next-question`);
      setQuestion(q);
    } catch (e: unknown) {
      Alert.alert(t('games.quiz'), e instanceof Error ? e.message : t('games.noQuestionAvailable'));
    } finally {
      setLoadingQ(false);
    }
  };

  const answer = async (optionId: string) => {
    if (!id || !question) return;
    try {
      const res = await api.post<{ isCorrect: boolean; remainingToday: number }>(
        `/games/${id}/answer`,
        { questionId: question.questionId, optionId },
      );
      setQuestion(null);
      if (res.isCorrect) {
        setFeedback(null);
        setCelebrating(true);
      } else {
        setFeedback({ type: 'wrong', text: t('games.notQuiteKeepPlaying') });
      }
      await load();
      if (res.remainingToday > 0 && !res.isCorrect) {
        setTimeout(() => void loadQuestion(), 700);
      }
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('games.couldNotSubmit'));
    }
  };

  const drawCountdown = useMemo(
    () => formatCountdown(game?.periodEnd ?? null),
    [game?.periodEnd],
  );
  const nextDayCountdown = useMemo(
    () => formatCountdown(game?.nextDayResetUtc ?? null),
    [game?.nextDayResetUtc],
  );

  if (loading || !game) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const comingSoon = game.status === 'COMING_SOON';
  const needsCode = game.eligibility === 'CODE_REQUIRED' || game.eligibility === 'CODE_VERSION_STALE';
  const blockedMessage =
    game.eligibility === 'PHONE_REQUIRED'
      ? t('games.blockedPhoneRequired')
      : game.eligibility === 'NOT_ACTIVE_USER'
        ? t('games.blockedNotActive')
        : game.eligibility === 'COUNTRY_NOT_ELIGIBLE'
          ? t('games.blockedCountry')
          : game.eligibility === 'ORDER_REQUIRED'
            ? t('games.blockedOrderRequired')
            : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {game.bannerImageUrls[0] ? (
          <Image source={{ uri: resolveImageUrl(game.bannerImageUrls[0]) }} style={styles.hero} />
        ) : null}

        <Text style={[styles.title, { color: colors.text }]}>{game.name}</Text>
        {comingSoon && (
          <View style={[styles.pill, { backgroundColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>
              {t('games.comingSoon')}
            </Text>
          </View>
        )}
        {game.description ? (
          <Text style={[styles.desc, { color: colors.textSecondary }]}>{game.description}</Text>
        ) : null}

        {blockedMessage && !comingSoon && (
          <View style={[styles.blocked, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.blockedText, { color: colors.text }]}>{blockedMessage}</Text>
          </View>
        )}

        {needsCode && !comingSoon && !blockedMessage && (
          <View style={[styles.codeBox, { backgroundColor: colors.primary + '12', borderColor: colors.primary }]}>
            <View style={styles.codeHeader}>
              <Ionicons name="key" size={22} color={colors.primary} />
              <Text style={[styles.codeTitle, { color: colors.text }]}>
                {t('games.joinWithCode')}
              </Text>
            </View>
            <Text style={[styles.codeLabel, { color: colors.textSecondary }]}>
              {game.eligibility === 'CODE_VERSION_STALE'
                ? t('games.enterCodeNew')
                : t('games.enterCode')}
            </Text>
            <TextInput
              value={code}
              onChangeText={(val) => setCode(val.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              style={[styles.codeInput, { color: colors.text, borderColor: colors.primary, backgroundColor: colors.card }]}
              placeholder="••••••"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: code.length === 6 ? 1 : 0.5 }]}
              onPress={() => void unlock()}
              disabled={unlocking || code.length !== 6}
            >
              <Text style={styles.primaryBtnText}>
                {unlocking ? t('games.checking') : t('games.joinTheGame')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {game.unlocked && (
          <View style={[styles.stats, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.statRow}>
              <View style={[styles.statBlock, { borderColor: colors.border }]}>
                <Text style={[styles.statNum, { color: colors.text }]}>
                  {game.answeredToday}
                  <Text style={[styles.statTotal, { color: colors.textSecondary }]}>
                    /{game.questionsPerDay}
                  </Text>
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  {t('games.answeredToday')}
                </Text>
              </View>
              <View style={[styles.statBlock, { borderColor: colors.border }]}>
                <Text style={[styles.statNum, { color: colors.primary }]}>{game.correctToday}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  {t('games.correctToday')}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* COMPLETED STATE */}
        {game.unlocked && game.completedToday && !question && (
          <View style={[styles.doneCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            <View style={[styles.doneIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="checkmark-done" size={32} color="#fff" />
            </View>
            <Text style={[styles.doneTitle, { color: colors.text }]}>
              {t('games.doneForToday')}
            </Text>
            <Text style={[styles.doneSub, { color: colors.textSecondary }]}>
              {t('games.answeredSummary', { count: game.answeredToday, correct: game.correctToday })}
            </Text>

            {game.nextDayResetUtc && (
              <View style={[styles.countdownRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <Text style={[styles.countdownText, { color: colors.text }]}>
                  {t('games.moreQuestionsIn')}{' '}
                  <Text style={{ fontWeight: '800' }}>{nextDayCountdown}</Text>
                </Text>
              </View>
            )}
            {game.periodEnd && (
              <View style={[styles.countdownRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Ionicons name="trophy-outline" size={18} color={colors.primary} />
                <Text style={[styles.countdownText, { color: colors.text }]}>
                  {t('games.nextDrawIn')}{' '}
                  <Text style={{ fontWeight: '800' }}>{drawCountdown}</Text>
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.back()}
            >
              <Ionicons name="close" size={20} color="#fff" />
              <Text style={styles.closeBtnText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {game.participationCertificate && !game.completedToday && (
          <View style={[styles.cert, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}>
            <Ionicons name="ribbon-outline" size={22} color={colors.primary} />
            <Text style={[styles.certText, { color: colors.text }]}>{game.participationCertificate.message}</Text>
          </View>
        )}

        {game.unlocked && !comingSoon && game.status === 'OPEN' && game.remainingToday > 0 && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => void loadQuestion()}
            disabled={loadingQ}
          >
            <Text style={styles.primaryBtnText}>
              {loadingQ
                ? t('games.loadingDots')
                : question
                  ? t('games.nextQuestion')
                  : t('games.startContinueQuiz')}
            </Text>
          </TouchableOpacity>
        )}

        {feedback && (
          <View style={[styles.feedbackWrong, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="close-circle" size={20} color="#EF4444" />
            <Text style={[styles.feedbackText, { color: colors.text }]}>{feedback.text}</Text>
          </View>
        )}

        {question && (
          <View style={[styles.quizCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cat, { color: colors.textSecondary }]}>{question.categoryName}</Text>
            {question.imageUrl ? (
              <Image source={{ uri: resolveImageUrl(question.imageUrl) }} style={styles.qImage} resizeMode="contain" />
            ) : null}
            {question.text ? (
              <Text style={[styles.qText, { color: colors.text }]}>{question.text}</Text>
            ) : null}
            {question.options.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={[styles.option, { borderColor: colors.border }]}
                onPress={() => void answer(o.id)}
              >
                {o.imageUrl ? (
                  <Image source={{ uri: resolveImageUrl(o.imageUrl) }} style={styles.optImage} resizeMode="contain" />
                ) : null}
                <Text style={{ color: colors.text, flex: 1 }}>{o.text || t('games.option')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {game.recentWinners.length > 0 && (
          <View style={styles.winners}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              <Ionicons name="trophy" size={18} color={colors.primary} />  {t('games.winners')}
            </Text>
            {game.recentWinners.map((w, i) => (
              <View
                key={i}
                style={[
                  styles.winnerRow,
                  {
                    borderColor: colors.border,
                    backgroundColor: i === 0 ? colors.primary + '12' : 'transparent',
                  },
                ]}
              >
                {w.prizeImageUrl ? (
                  <Image source={{ uri: resolveImageUrl(w.prizeImageUrl) }} style={styles.winnerImg} />
                ) : (
                  <View
                    style={[
                      styles.winnerImg,
                      { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
                    ]}
                  >
                    <Ionicons name="trophy" size={22} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{w.displayName}</Text>
                    {i === 0 && (
                      <View style={[styles.latestPill, { backgroundColor: colors.primary }]}>
                        <Text style={styles.latestPillText}>{t('games.latest')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{w.prizeLabel}</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {formatDate(w.wonAt)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <CorrectCelebration
        visible={celebrating}
        message={t('games.correctBang')}
        onDone={() => {
          setCelebrating(false);
          if (game && game.remainingToday > 0) {
            void loadQuestion();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { width: '100%', height: 160, borderRadius: 14, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  desc: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
  cert: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  certText: { flex: 1, fontSize: 14, lineHeight: 20 },
  stats: {
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  statRow: { flexDirection: 'row', gap: 12 },
  statBlock: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statNum: { fontSize: 28, fontWeight: '900' },
  statTotal: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  blocked: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  blockedText: { flex: 1, fontSize: 14, lineHeight: 20 },
  codeBox: { padding: 20, borderRadius: 16, borderWidth: 2, marginBottom: 16 },
  codeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  codeTitle: { fontSize: 18, fontWeight: '800' },
  codeLabel: { fontSize: 14, marginBottom: 14, lineHeight: 20 },
  codeInput: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    letterSpacing: 10,
    textAlign: 'center',
    marginBottom: 14,
    fontWeight: '800',
  },
  primaryBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  feedbackWrong: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  feedbackText: { flex: 1, fontWeight: '600' },
  doneCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: 2,
    marginBottom: 16,
    alignItems: 'center',
  },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  doneTitle: { fontSize: 22, fontWeight: '900', marginBottom: 4, textAlign: 'center' },
  doneSub: { fontSize: 14, marginBottom: 16, textAlign: 'center' },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    width: '100%',
  },
  countdownText: { flex: 1, fontSize: 14 },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  closeBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  quizCard: { padding: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  cat: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  qImage: { width: '100%', height: 160, marginBottom: 12, borderRadius: 8 },
  qText: { fontSize: 17, fontWeight: '700', marginBottom: 16, lineHeight: 24 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  optImage: { width: 48, height: 48, borderRadius: 6 },
  winners: { marginTop: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  winnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  winnerImg: { width: 44, height: 44, borderRadius: 10 },
  latestPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  latestPillText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});
