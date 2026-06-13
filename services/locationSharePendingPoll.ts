import { locationRequestService } from './api/locationRequest.service';
import {
  clearLocationSharePending,
  getLocationSharePending,
  mapRequestToResult,
  saveLocationSharePending,
  type LocationSharePendingSnapshot,
  type LocationShareSlotKey,
} from '../utils/locationSharePendingStorage';
import type { RequestLocationResult } from '../components/location/RequestLocationModal';

const POLL_MS = 4000;
const SLOTS: LocationShareSlotKey[] = ['pickup', 'dropoff'];

export type LocationSharePollEvent =
  | { type: 'accepted'; slot: LocationShareSlotKey; result: RequestLocationResult }
  | { type: 'declined'; slot: LocationShareSlotKey; snapshot: LocationSharePendingSnapshot }
  | { type: 'cleared'; slot: LocationShareSlotKey };

type Listener = (event: LocationSharePollEvent) => void;

const listeners = new Set<Listener>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;
let sharedLocationLabel = 'Shared location';

export function setLocationSharePollSharedLocationLabel(label: string) {
  sharedLocationLabel = label;
}

export function subscribeLocationSharePoll(listener: Listener): () => void {
  listeners.add(listener);
  ensureLocationSharePollRunning();
  return () => listeners.delete(listener);
}

function emit(event: LocationSharePollEvent) {
  listeners.forEach((l) => {
    try {
      l(event);
    } catch {
      /* ignore */
    }
  });
}

export function ensureLocationSharePollRunning() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void tickLocationSharePoll();
  }, POLL_MS);
  void tickLocationSharePoll();
}

export function stopLocationSharePollIfIdle() {
  /* keep running while create-order may remount — cheap interval */
}

async function tickLocationSharePoll() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    for (const slot of SLOTS) {
      const pending = await getLocationSharePending(slot);
      if (!pending || pending.phase === 'declined') continue;
      try {
        const req = await locationRequestService.getById(pending.requestId);
        if (req.status === 'ACCEPTED') {
          const result = mapRequestToResult(req, sharedLocationLabel);
          if (result) {
            await clearLocationSharePending(slot);
            emit({ type: 'accepted', slot, result });
          }
        } else if (req.status === 'DECLINED') {
          const snapshot: LocationSharePendingSnapshot = {
            ...pending,
            phase: 'declined',
            targetDisplayName: req.target.displayName || pending.targetDisplayName,
          };
          await saveLocationSharePending(snapshot);
          emit({ type: 'declined', slot, snapshot });
        } else if (req.status === 'CANCELLED' || req.status === 'EXPIRED') {
          await clearLocationSharePending(slot);
          emit({ type: 'cleared', slot });
        }
      } catch {
        /* network blip — retry next tick */
      }
    }
  } finally {
    pollInFlight = false;
  }
}
