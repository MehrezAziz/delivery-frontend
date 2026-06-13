/** Route segment (expo file name) → human-readable title.
 *
 * NOTE: These English values are kept as fallbacks. Components should use the
 * `getAuthRouteTitle`, `getCustomerRouteTitle`, `getDriverRouteTitle` helpers
 * (or read translations via `useTranslation` with key `nav.auth.<segment>` etc.)
 * to get a localized title.
 */

import i18n from '../i18n';

export const AUTH_ROUTE_TITLES: Record<string, string> = {
  'customer-login': 'Customer sign in',
  'customer-forgot-password': 'Forgot password',
  'driver-login': 'Driver sign in',
  'driver-forgot-password': 'Forgot password',
  'customer-register': 'Create account',
  'driver-register': 'Driver registration',
  'driver-register-step1': 'Driver registration',
  'driver-register-step2': 'Driver registration',
  'driver-register-step3': 'Driver registration',
  'customer-setup': 'Complete profile',
  terms: 'Terms & privacy',
};

export const CUSTOMER_ROUTE_TITLES: Record<string, string> = {
  home: 'Home',
  orders: 'My orders',
  wallet: 'Wallet',
  profile: 'Profile',
  settings: 'Settings',
  addresses: 'Addresses',
  restrictions: 'Restrictions',
  support: 'Support',
  'support-chat': 'Support chat',
  'create-order': 'New order',
  'local-pickup-order': 'Local pickup',
  'pick-location': 'Pick location',
  'order-detail': 'Order details',
  'order-chat': 'Order chat',
  'track-driver': 'Track driver',
  'edit-profile': 'Edit profile',
  notifications: 'Notifications',
  'notifications-settings': 'Notifications',
  'send-coins': 'Send coins',
  security: 'Security',
  'transfer-pin': 'Transfer PIN',
};

export const DRIVER_ROUTE_TITLES: Record<string, string> = {
  home: 'Home',
  'my-orders': 'My deliveries',
  'available-orders': 'Available orders',
  'order-chat': 'Order chat',
  'order-detail': 'Order details',
  'address-map': 'Map',
  'upload-proofs': 'Upload proofs',
  support: 'Support',
  'support-chat': 'Support chat',
  addresses: 'Addresses',
  availability: 'Availability',
  documents: 'Documents',
  earnings: 'Earnings',
  transactions: 'Transactions',
  profile: 'Profile',
  settings: 'Settings',
  'edit-profile': 'Edit profile',
  restrictions: 'Restrictions',
  verification: 'Verification',
  notifications: 'Notifications',
  'my-ratings': 'My ratings',
  'send-coins': 'Send coins',
  security: 'Security',
  'transfer-pin': 'Transfer PIN',
};

/** Translate an auth route segment using the active i18n language. */
export function getAuthRouteTitle(segment: string): string {
  const key = `nav.auth.${segment}`;
  const tr = i18n.t(key);
  if (tr && tr !== key) return tr;
  return AUTH_ROUTE_TITLES[segment] || segment.replace(/-/g, ' ');
}

export function getCustomerRouteTitle(segment: string): string {
  const key = `nav.customer.${segment}`;
  const tr = i18n.t(key);
  if (tr && tr !== key) return tr;
  return CUSTOMER_ROUTE_TITLES[segment] || segment.replace(/-/g, ' ');
}

export function getDriverRouteTitle(segment: string): string {
  const key = `nav.driver.${segment}`;
  const tr = i18n.t(key);
  if (tr && tr !== key) return tr;
  return DRIVER_ROUTE_TITLES[segment] || segment.replace(/-/g, ' ');
}
