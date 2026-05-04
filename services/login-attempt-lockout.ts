import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@login_attempt_lockout_v1';
/** After this many consecutive failed logins, a cooldown applies. */
export const LOGIN_MAX_FAILURES_BEFORE_LOCK = 5;
/** Cooldown duration after lockout (ms). */
export const LOGIN_LOCK_DURATION_MS = 2 * 60 * 1000;

export type LoginRole = 'customer' | 'driver';

function storageKey(role: LoginRole, phoneE164: string): string {
  return `${role}:${phoneE164}`;
}

type Entry = { consecutiveFailures: number; lockedUntil: number };

async function loadMap(): Promise<Record<string, Entry>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, Entry>;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

async function saveMap(map: Record<string, Entry>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export async function getLoginLockStatus(
  role: LoginRole,
  phoneE164: string,
): Promise<{ locked: boolean; msRemaining: number; lockedUntil: number }> {
  const key = storageKey(role, phoneE164);
  const map = await loadMap();
  const e = map[key];
  if (!e?.lockedUntil) {
    return { locked: false, msRemaining: 0, lockedUntil: 0 };
  }
  const rem = e.lockedUntil - Date.now();
  if (rem <= 0) {
    delete map[key];
    await saveMap(map);
    return { locked: false, msRemaining: 0, lockedUntil: 0 };
  }
  return { locked: true, msRemaining: rem, lockedUntil: e.lockedUntil };
}

export async function recordLoginFailure(role: LoginRole, phoneE164: string): Promise<void> {
  const key = storageKey(role, phoneE164);
  const map = await loadMap();
  const cur = map[key] || { consecutiveFailures: 0, lockedUntil: 0 };
  if (cur.lockedUntil > Date.now()) {
    return;
  }
  cur.consecutiveFailures += 1;
  if (cur.consecutiveFailures >= LOGIN_MAX_FAILURES_BEFORE_LOCK) {
    cur.lockedUntil = Date.now() + LOGIN_LOCK_DURATION_MS;
    cur.consecutiveFailures = 0;
  } else {
    cur.lockedUntil = 0;
  }
  map[key] = cur;
  await saveMap(map);
}

export async function clearLoginFailures(role: LoginRole, phoneE164: string): Promise<void> {
  const key = storageKey(role, phoneE164);
  const map = await loadMap();
  delete map[key];
  await saveMap(map);
}
