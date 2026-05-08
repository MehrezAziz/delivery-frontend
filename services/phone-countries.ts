import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { PhoneNumberUtil } from 'google-libphonenumber';
import { geographyService } from './api';

const PHONE_COUNTRIES_CACHE_KEY = '@phone_countries_cache_v2';
const PHONE_COUNTRY_ISO_KEY = '@phone_country_iso_v1';
let phoneCountriesLoadPromise: Promise<PhoneCountry[]> | null = null;
const phoneUtil = PhoneNumberUtil.getInstance();

export type PhoneCountry = {
  id: string;
  name: string;
  isoCode: string;
  dialCode: string;
  flag: string;
};

function isoToFlag(isoCode?: string): string {
  if (!isoCode || isoCode.length !== 2) return '🏳️';
  const upper = isoCode.toUpperCase();
  const first = upper.codePointAt(0);
  const second = upper.codePointAt(1);
  if (!first || !second) return '🏳️';
  return String.fromCodePoint(127397 + first, 127397 + second);
}

function normalizeCountries(rawCountries: { id: string; name: string; isoCode: string }[]): PhoneCountry[] {
  return rawCountries.map((country) => {
    const isoCode = country.isoCode.toUpperCase();
    let dialCode = '';
    try {
      const countryCode = phoneUtil.getCountryCodeForRegion(isoCode);
      dialCode = countryCode > 0 ? String(countryCode) : '';
    } catch {
      // Keep Tunisia as a safe fallback only for invalid/unknown ISO values.
      dialCode = '216';
    }
    if (!dialCode) dialCode = '216';
    return {
      id: country.id,
      name: country.name,
      isoCode,
      dialCode,
      flag: isoToFlag(isoCode),
    };
  });
}

/**
 * Validates the national number for the selected ISO region using libphonenumber
 * (length and format, e.g. TN 8 digits after +216, US 10 after +1).
 */
export function validateNationalPhoneForCountry(
  isoCode: string,
  dialCode: string,
  localPhoneRaw: string,
): { ok: true } | { ok: false; message: string } {
  const digits = localPhoneRaw.replace(/\D/g, '');
  const noTrunk = digits.replace(/^0+/, '');
  const national = noTrunk.length > 0 ? noTrunk : digits;
  if (!national) {
    return { ok: false, message: 'Enter your phone number' };
  }
  const region = (isoCode || '').trim().toUpperCase();
  if (region.length !== 2) {
    return { ok: false, message: 'Select a country' };
  }
  try {
    const e164 = `+${dialCode}${national}`;
    const num = phoneUtil.parse(e164, region);
    if (!phoneUtil.isValidNumberForRegion(num, region)) {
      return {
        ok: false,
        message: `Enter a valid phone number for ${region} (check length and digits).`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'This phone number does not match the selected country.',
    };
  }
}

export function toE164Phone(dialCode: string, localPhoneRaw: string): string {
  const localDigits = localPhoneRaw.replace(/\D/g, '');
  const noTrunkPrefix = localDigits.replace(/^0+/, '');
  const national = noTrunkPrefix.length > 0 ? noTrunkPrefix : localDigits;
  return `+${dialCode}${national}`;
}

export function getLocalPhoneFromE164(fullPhoneRaw: string, dialCode: string): string {
  const digits = fullPhoneRaw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith(dialCode)) return digits.slice(dialCode.length);
  return digits;
}

export function inferPhoneCountryAndLocal(
  countries: PhoneCountry[],
  fullPhoneRaw: string,
  preferredIso?: string | null,
): { country: PhoneCountry | null; localPhone: string } {
  const digits = fullPhoneRaw.replace(/\D/g, '');
  const preferredCountry = resolvePreferredPhoneCountry(countries, preferredIso);
  if (!digits) return { country: preferredCountry, localPhone: '' };

  const candidates = countries
    .filter((c) => digits.startsWith(c.dialCode))
    .sort((a, b) => b.dialCode.length - a.dialCode.length);

  const matchedCountry = candidates[0] || preferredCountry;
  if (!matchedCountry) return { country: null, localPhone: digits };

  return {
    country: matchedCountry,
    localPhone: getLocalPhoneFromE164(fullPhoneRaw, matchedCountry.dialCode),
  };
}

export function resolvePreferredPhoneCountry(countries: PhoneCountry[], preferredIso?: string | null): PhoneCountry | null {
  const normalizedIso = preferredIso?.toUpperCase() || null;
  const fromPreferred = normalizedIso ? countries.find((c) => c.isoCode === normalizedIso) : null;
  const fallbackTunisia = countries.find((c) => c.isoCode === 'TN');
  return fromPreferred || fallbackTunisia || countries[0] || null;
}

export async function getCachedPhoneCountries(): Promise<PhoneCountry[] | null> {
  const raw = await AsyncStorage.getItem(PHONE_COUNTRIES_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PhoneCountry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function cachePhoneCountries(countries: PhoneCountry[]): Promise<void> {
  if (!Array.isArray(countries) || countries.length === 0) return;
  await AsyncStorage.setItem(PHONE_COUNTRIES_CACHE_KEY, JSON.stringify(countries));
}

export async function ensurePhoneCountriesLoaded(): Promise<PhoneCountry[]> {
  const cached = await getCachedPhoneCountries();
  if (cached && cached.length > 0) {
    // Older builds could cache a Tunisia-only fallback entry like "fallback-tn".
    // Avoid reusing that stale data forever, otherwise geography pickers break.
    const hasFallbackIds = cached.some((c) => (c.id || '').startsWith('fallback-'));
    const suspiciouslySmall = cached.length < 10;
    if (!hasFallbackIds && !suspiciouslySmall) {
      return cached;
    }
  }

  if (phoneCountriesLoadPromise) return phoneCountriesLoadPromise;

  phoneCountriesLoadPromise = (async () => {
    const countries = await geographyService.getCountries();
    const normalized = normalizeCountries(countries);
    await cachePhoneCountries(normalized);
    return normalized;
  })();

  try {
    return await phoneCountriesLoadPromise;
  } finally {
    phoneCountriesLoadPromise = null;
  }
}

export async function getCachedPreferredPhoneCountryIso(): Promise<string | null> {
  return AsyncStorage.getItem(PHONE_COUNTRY_ISO_KEY);
}

export async function setCachedPreferredPhoneCountryIso(isoCode: string): Promise<void> {
  const normalized = (isoCode || '').trim().toUpperCase();
  if (!normalized) return;
  await AsyncStorage.setItem(PHONE_COUNTRY_ISO_KEY, normalized);
}

export async function detectAndCachePreferredPhoneCountryIso(): Promise<string | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const geocoded = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    const detectedIso = geocoded?.[0]?.isoCountryCode?.toUpperCase() || null;
    if (!detectedIso) return null;

    await AsyncStorage.setItem(PHONE_COUNTRY_ISO_KEY, detectedIso);
    return detectedIso;
  } catch {
    return null;
  }
}

export async function warmupPhoneCountriesData(): Promise<void> {
  try {
    await ensurePhoneCountriesLoaded();
    await detectAndCachePreferredPhoneCountryIso();
  } catch {
    // Warmup is best-effort only.
  }
}
