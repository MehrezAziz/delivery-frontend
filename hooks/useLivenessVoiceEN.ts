import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

/** Order matches `LIVENESS_STEPS` indices (mirrored labels: left, right, hold, blink). */
const STEP_SOURCES = [
  require('../assets/audio/liveness/en/left.mp3'),
  require('../assets/audio/liveness/en/right.mp3'),
  require('../assets/audio/liveness/en/high.mp3'),
  require('../assets/audio/liveness/en/blink_eyes.mp3'),
] as const;

const THANK_YOU_SOURCE = require('../assets/audio/liveness/en/thank_you.mp3');

async function stopAndUnloadSounds(sounds: Audio.Sound[]) {
  await Promise.all(
    sounds.map((s) =>
      s
        .stopAsync()
        .catch(() => {})
        .then(() => s.unloadAsync().catch(() => {})),
    ),
  );
}

export function useLivenessVoiceEN(livenessActive: boolean) {
  const [voiceReady, setVoiceReady] = useState(false);
  const soundsRef = useRef<Audio.Sound[]>([]);
  const loadingRef = useRef(false);
  const lastStepPlayedRef = useRef(-1);

  const deactivateVoice = useCallback(async () => {
    const list = soundsRef.current;
    soundsRef.current = [];
    lastStepPlayedRef.current = -1;
    setVoiceReady(false);
    await stopAndUnloadSounds(list);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setVoiceReady(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      if (!livenessActive || loadingRef.current) return;
      loadingRef.current = true;
      setVoiceReady(false);
      try {
        const previous = soundsRef.current;
        soundsRef.current = [];
        lastStepPlayedRef.current = -1;
        await stopAndUnloadSounds(previous);

        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        const created = await Promise.all(
          STEP_SOURCES.map((src) =>
            Audio.Sound.createAsync(src, { shouldPlay: false, volume: 1, isLooping: false }),
          ),
        );
        if (cancelled) {
          await Promise.all(created.map((c) => c.sound.unloadAsync().catch(() => {})));
          return;
        }
        soundsRef.current = created.map((c) => c.sound);
        lastStepPlayedRef.current = -1;
        setVoiceReady(true);
      } catch (e) {
        console.warn('Liveness voice preload failed:', e);
        setVoiceReady(false);
      } finally {
        loadingRef.current = false;
      }
    };

    if (livenessActive) {
      void load();
    } else {
      void deactivateVoice();
    }

    return () => {
      cancelled = true;
      void deactivateVoice();
    };
  }, [livenessActive, deactivateVoice]);

  useEffect(() => {
    if (livenessActive && voiceReady) {
      lastStepPlayedRef.current = -1;
    }
  }, [livenessActive, voiceReady]);

  const playStepCue = useCallback(async (stepIndex: number) => {
    if (Platform.OS === 'web' || stepIndex < 0 || stepIndex >= STEP_SOURCES.length) return;
    if (lastStepPlayedRef.current === stepIndex) return;
    const sounds = soundsRef.current;
    if (sounds.length !== STEP_SOURCES.length) return;

    lastStepPlayedRef.current = stepIndex;

    await Promise.all(
      sounds.map((s, i) =>
        i === stepIndex ? Promise.resolve() : s.stopAsync().catch(() => {}),
      ),
    );

    try {
      const s = sounds[stepIndex]!;
      await s.setPositionAsync(0);
      await s.playAsync();
    } catch (e) {
      console.warn('Liveness voice failed:', e);
    }
  }, []);

  const playThankYou = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync(THANK_YOU_SOURCE, {
        shouldPlay: true,
        volume: 1,
        isLooping: false,
      });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && !status.isPlaying && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (e) {
      console.warn('Thank-you voice failed:', e);
    }
  }, []);

  return { playStepCue, playThankYou, voiceReady };
}
