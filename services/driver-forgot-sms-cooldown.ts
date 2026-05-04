import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@driver_forgot_sms_cooldown_v1';

async function readMap(): Promise<Record<string, number>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, number>;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

async function writeMap(map: Record<string, number>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** Unix ms after which the driver may request another forgot-password SMS for this E.164. */
export async function getDriverSmsForgotCooldownUntil(phoneE164: string): Promise<number> {
  const map = await readMap();
  const until = map[phoneE164] || 0;
  if (until <= Date.now()) {
    if (until > 0) {
      delete map[phoneE164];
      await writeMap(map);
    }
    return 0;
  }
  return until;
}

export async function setDriverSmsForgotCooldownUntil(phoneE164: string, untilMs: number): Promise<void> {
  const map = await readMap();
  map[phoneE164] = untilMs;
  await writeMap(map);
}

export async function clearDriverSmsForgotCooldown(phoneE164: string): Promise<void> {
  const map = await readMap();
  delete map[phoneE164];
  await writeMap(map);
}
