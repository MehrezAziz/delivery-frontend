/** In-memory flags so Profile can refetch once after edit-profile or address changes that affect status. */

let customerPending = false;
let driverPending = false;

export function markCustomerProfileNeedsRefresh() {
  customerPending = true;
}

export function consumeCustomerProfileNeedsRefresh(): boolean {
  if (!customerPending) return false;
  customerPending = false;
  return true;
}

export function markDriverProfileNeedsRefresh() {
  driverPending = true;
}

export function consumeDriverProfileNeedsRefresh(): boolean {
  if (!driverPending) return false;
  driverPending = false;
  return true;
}
