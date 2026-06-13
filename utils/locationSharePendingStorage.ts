import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RequestLocationResult } from '../components/location/RequestLocationModal';

export type LocationShareSlotKey = 'pickup' | 'dropoff';

export type LocationSharePendingSnapshot = {
  requestId: string;
  slot: LocationShareSlotKey;
  targetDisplayName: string;
  recipientMode: 'phone' | 'id';
  recipientId: string;
  localPhone: string;
  countryIso: string | null;
  lookupUserId: string;
  lookupDisplayName: string;
  lookupPhoneMasked: string;
  /** PENDING while waiting; DECLINED after recipient rejected (form shown again). */
  phase: 'waiting' | 'declined';
};

const keyFor = (slot: LocationShareSlotKey) => `locationSharePending:${slot}`;

export async function getLocationSharePending(
  slot: LocationShareSlotKey,
): Promise<LocationSharePendingSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(slot));
    if (!raw) return null;
    return JSON.parse(raw) as LocationSharePendingSnapshot;
  } catch {
    return null;
  }
}

export async function saveLocationSharePending(snapshot: LocationSharePendingSnapshot): Promise<void> {
  await AsyncStorage.setItem(keyFor(snapshot.slot), JSON.stringify(snapshot));
}

export async function clearLocationSharePending(slot: LocationShareSlotKey): Promise<void> {
  await AsyncStorage.removeItem(keyFor(slot));
}

export function mapRequestToResult(
  req: {
    address?: {
      id: string;
      street: string | null;
      delegationName: string;
      governorateName: string;
      latitude: number | null;
      longitude: number | null;
    } | null;
    resultLat: number | null;
    resultLng: number | null;
  },
  sharedLocationLabel: string,
): RequestLocationResult | null {
  if (!req.address?.id) return null;
  return {
    addressId: req.address.id,
    label: req.address.street || sharedLocationLabel,
    sublabel: `${req.address.delegationName}, ${req.address.governorateName}`,
    lat: req.resultLat ?? req.address.latitude ?? 0,
    lng: req.resultLng ?? req.address.longitude ?? 0,
  };
}
