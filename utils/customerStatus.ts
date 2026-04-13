/** Dot color for account status indicators (home header, etc.) */
export function getCustomerStatusDotColor(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return '#22c55e';
    case 'CREATED':
    case 'VERIFIED':
      return '#9ca3af';
    case 'SUSPENDED':
      return '#f97316';
    case 'BLOCKED':
      return '#ef4444';
    default:
      return '#9ca3af';
  }
}

/** Human-readable status for profile and UI copy */
export function getCustomerStatusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'CREATED':
      return 'Created';
    case 'VERIFIED':
      return 'Verified';
    case 'SUSPENDED':
      return 'Suspended';
    case 'BLOCKED':
      return 'Blocked';
    default:
      return status;
  }
}

/** Text color matching status (for profile line without a dot) */
export function getCustomerStatusTextColor(status: string): string {
  return getCustomerStatusDotColor(status);
}
