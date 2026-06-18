import { normalizeAppPath } from './appRoutes';

export type AppRole = 'customer' | 'driver';

const CUSTOMER_MAIN_TABS: Record<string, string> = {
  home: '/(customer)/home',
  orders: '/(customer)/orders',
  wallet: '/(customer)/wallet',
  profile: '/(customer)/profile',
};

const DRIVER_MAIN_TABS: Record<string, string> = {
  home: '/(driver)/home',
  'my-orders': '/(driver)/my-orders',
  'available-orders': '/(driver)/available-orders',
  profile: '/(driver)/profile',
};

/** Hidden tab routes (sibling screens) — no stack pop; header back needs returnTo or previous tab. */
const CUSTOMER_NESTED_LEAVES = new Set([
  'addresses',
  'restrictions',
  'support',
  'support-chat',
  'create-order',
  'local-pickup-order',
  'pick-location',
  'order-detail',
  'order-chat',
  'track-driver',
  'edit-profile',
  'settings',
  'bank-details',
  'notifications',
  'notifications-settings',
  'send-coins',
  'buy-coins',
  'buy-coins-result',
  'security',
  'transfer-pin',
  'share-location-request',
  'location-requests',
]);

const DRIVER_NESTED_LEAVES = new Set([
  'addresses',
  'restrictions',
  'support',
  'support-chat',
  'order-detail',
  'order-chat',
  'edit-profile',
  'settings',
  'bank-details',
  'notifications',
  'notifications-settings',
  'send-coins',
  'buy-coins',
  'buy-coins-result',
  'security',
  'transfer-pin',
  'earnings',
  'transactions',
  'availability',
  'documents',
  'verification',
  'my-ratings',
  'upload-proofs',
  'address-map',
  'share-location-request',
  'location-requests',
]);

function routeLeaf(pathname: string): string {
  const parts = normalizeAppPath(pathname).split('/').filter(Boolean);
  return parts.filter((p) => !p.startsWith('(')).pop() || 'home';
}

function roleFromPath(pathname: string): AppRole | null {
  const norm = normalizeAppPath(pathname);
  if (norm.includes('(customer)')) return 'customer';
  if (norm.includes('(driver)')) return 'driver';
  return null;
}

export function getMainTabHref(role: AppRole, pathname: string): string | null {
  const leaf = routeLeaf(pathname);
  const map = role === 'customer' ? CUSTOMER_MAIN_TABS : DRIVER_MAIN_TABS;
  return map[leaf] ?? null;
}

export function isNestedTabScreen(role: AppRole, pathname: string): boolean {
  const leaf = routeLeaf(pathname);
  const nested = role === 'customer' ? CUSTOMER_NESTED_LEAVES : DRIVER_NESTED_LEAVES;
  return nested.has(leaf);
}

/** Default back target when `returnTo` is missing (tab sibling screens). */
const CUSTOMER_NESTED_DEFAULT_RETURN: Record<string, string> = {
  'local-pickup-order': '/(customer)/create-order',
};

export function getNestedDefaultReturnHref(role: AppRole, pathname: string): string | null {
  const leaf = routeLeaf(pathname);
  if (role === 'customer') return CUSTOMER_NESTED_DEFAULT_RETURN[leaf] ?? null;
  return null;
}

/** Map shorthand (`settings`, `wallet`) or full group path to a replace target. */
export function resolveReturnToHref(role: AppRole, returnTo: string): string | null {
  const raw = returnTo.trim();
  if (!raw) return null;
  if (raw.startsWith('/(')) return raw;
  if (raw.startsWith('/')) {
    const inferred = roleFromPath(raw);
    if (inferred) return raw;
  }
  const customerMap: Record<string, string> = {
    ...CUSTOMER_MAIN_TABS,
    settings: '/(customer)/settings',
  };
  const driverMap: Record<string, string> = {
    ...DRIVER_MAIN_TABS,
    settings: '/(driver)/settings',
  };
  const map = role === 'customer' ? customerMap : driverMap;
  return map[raw] ?? null;
}

export function parseReturnToFromSearch(
  returnToRaw: string | string[] | undefined,
  pathname: string,
  globalHref?: string,
): string | undefined {
  let r =
    typeof returnToRaw === 'string' ? returnToRaw : Array.isArray(returnToRaw) ? returnToRaw[0] : undefined;
  const tryParse = (s: string) => {
    if (!s.includes('?')) return undefined;
    try {
      return new URLSearchParams(s.slice(s.indexOf('?') + 1)).get('returnTo') ?? undefined;
    } catch {
      return undefined;
    }
  };
  if (!r) r = globalHref ? tryParse(globalHref) : undefined;
  if (!r) r = tryParse(pathname);
  return r;
}

/** Append ?returnTo= when pushing to a nested tab screen from a main tab. */
export function hrefWithReturnTo(currentPathname: string, targetHref: string): string {
  const role = roleFromPath(currentPathname);
  if (!role) return targetHref;
  if (!isNestedTabScreen(role, targetHref)) return targetHref;
  if (targetHref.includes('returnTo=')) return targetHref;

  const mainTab = getMainTabHref(role, currentPathname);
  if (!mainTab) return targetHref;

  const leaf = routeLeaf(mainTab);
  const sep = targetHref.includes('?') ? '&' : '?';
  return `${targetHref}${sep}returnTo=${encodeURIComponent(leaf)}`;
}
