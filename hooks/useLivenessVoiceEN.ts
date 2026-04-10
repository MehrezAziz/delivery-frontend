import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/** Order matches `LIVENESS_STEPS` indices (mirrored labels: left, right, look at camera, wink). */
const STEP_SOURCES = [
  require('../assets/audio/liveness/en/left.mp3'),
  require('../assets/audio/liveness/en/right.mp3'),
  require('../assets/audio/liveness/en/look_directly_at_the_camera.mp3'),
  require('../assets/audio/liveness/en/signle_eye_wink.mp3'),
] as const;

const THANK_YOU_SOURCE = require('../assets/audio/liveness/en/thank_you.mp3');

async function configurePlaybackMode() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'duckOthers',
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  });
}

export function useLivenessVoiceEN(livenessActive: boolean) {
  const [voiceReady, setVoiceReady] = useState(false);
  const cuePlayerRef = useRef<AudioPlayer | null>(null);
  const lastStepPlayedRef = useRef(-1);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setVoiceReady(false);
      return;
    }

    if (!livenessActive) {
      cuePlayerRef.current?.remove();
      cuePlayerRef.current = null;
      setVoiceReady(false);
      lastStepPlayedRef.current = -1;
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await configurePlaybackMode();
        if (cancelled) return;

        cuePlayerRef.current?.remove();
        const p = createAudioPlayer(STEP_SOURCES[0], {
          downloadFirst: true,
        });
        cuePlayerRef.current = p;
        lastStepPlayedRef.current = -1;
        if (!cancelled) {
          setVoiceReady(true);
        }
      } catch (e) {
        console.warn('Liveness voice init failed:', e);
        if (!cancelled) {
          setVoiceReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      cuePlayerRef.current?.remove();
      cuePlayerRef.current = null;
      setVoiceReady(false);
    };
  }, [livenessActive]);

  useEffect(() => {
    if (livenessActive && voiceReady) {
      lastStepPlayedRef.current = -1;
    }
  }, [livenessActive, voiceReady]);

  const playStepCue = useCallback(async (stepIndex: number) => {
    if (Platform.OS === 'web' || stepIndex < 0 || stepIndex >= STEP_SOURCES.length) return;
    if (lastStepPlayedRef.current === stepIndex) return;

    const p = cuePlayerRef.current;
    if (!p) return;

    lastStepPlayedRef.current = stepIndex;

    try {
      p.pause();
      p.replace(STEP_SOURCES[stepIndex]);
      await p.seekTo(0);
      p.play();
    } catch (e) {
      console.warn('Liveness voice play failed:', e);
    }
  }, []);

  const playThankYou = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      await configurePlaybackMode();
      const p = createAudioPlayer(THANK_YOU_SOURCE, { downloadFirst: true });
      let finished = false;
      let timeoutId: ReturnType<typeof setTimeout>;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        sub.remove();
        p.remove();
      };
      const sub = p.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded && status.didJustFinish) {
          finish();
        }
      });
      timeoutId = setTimeout(finish, 30_000);
      await p.seekTo(0);
      p.play();
    } catch (e) {
      console.warn('Thank-you voice failed:', e);
    }
  }, []);

  return { playStepCue, playThankYou, voiceReady };
}
