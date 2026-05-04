/**
 * In-memory only: cleared when the JS process ends (app killed). While the app stays open,
 * the customer is not asked again for Face ID / fingerprint / password to confirm orders.
 */
let orderConfirmIdentityVerified = false;

export function isOrderConfirmIdentityVerified(): boolean {
  return orderConfirmIdentityVerified;
}

export function setOrderConfirmIdentityVerified(value: boolean): void {
  orderConfirmIdentityVerified = value;
}

export function resetOrderConfirmIdentitySession(): void {
  orderConfirmIdentityVerified = false;
}
