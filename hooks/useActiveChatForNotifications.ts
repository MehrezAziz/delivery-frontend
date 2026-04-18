import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  setActiveChatContext,
  clearActiveChatContextIfMatches,
  type ActiveChatContext,
} from '../services/notifications';

/**
 * Marks this chat as "open" only while the app is foregrounded, so we suppress
 * redundant push banners for the same thread (see notifications.ts).
 */
export function useActiveChatForNotifications(
  kind: ActiveChatContext['kind'],
  rawId: string | string[] | undefined,
) {
  useEffect(() => {
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || typeof id !== 'string') return;

    /** Set immediately so foreground FCM runs after this effect, not only after AppState events. */
    setActiveChatContext({ kind, id });

    const apply = (state: AppStateStatus) => {
      if (state === 'active') setActiveChatContext({ kind, id });
      else clearActiveChatContextIfMatches(kind, id);
    };

    apply(AppState.currentState);

    const sub = AppState.addEventListener('change', apply);
    return () => {
      sub.remove();
      clearActiveChatContextIfMatches(kind, id);
    };
  }, [kind, rawId]);
}
