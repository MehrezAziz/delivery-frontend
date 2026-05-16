import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, usePathname, useSegments } from 'expo-router';
import { getStoredUserRole } from '../services/notifications';

export type CoinTopupRole = 'customer' | 'driver';

function normalizeRoleParam(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim().toLowerCase();
  return '';
}

/** Resolve customer vs driver for buy-coins / payment result screens. */
export function detectCoinTopupRole(opts: {
  pathname?: string;
  segments?: string[];
  paramRole?: string | string[];
  storedRole?: string | null;
}): CoinTopupRole {
  const param = normalizeRoleParam(opts.paramRole);
  if (param === 'driver') return 'driver';
  if (param === 'customer') return 'customer';

  const segments = opts.segments ?? [];
  const path = opts.pathname ?? '';

  if (segments.includes('(driver)') || path.includes('(driver)') || path.includes('/driver/')) {
    return 'driver';
  }

  const stored = (opts.storedRole ?? '').trim().toUpperCase();
  if (stored === 'DRIVER') return 'driver';

  return 'customer';
}

export function coinTopupRoutes(role: CoinTopupRole) {
  const root = role === 'driver' ? '/(driver)' : '/(customer)';
  return {
    buyCoins: `${root}/buy-coins`,
    buyCoinsResult: `${root}/buy-coins-result`,
  } as const;
}

export function useCoinTopupRole(): CoinTopupRole {
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const params = useLocalSearchParams<{ role?: string }>();
  const [storedRole, setStoredRole] = useState<string | null>(null);

  useEffect(() => {
    void getStoredUserRole().then((r) => setStoredRole(r));
  }, []);

  return useMemo(
    () =>
      detectCoinTopupRole({
        pathname,
        segments,
        paramRole: params.role,
        storedRole,
      }),
    [pathname, segments, params.role, storedRole],
  );
}
