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
    case 'REJECTED':
      return '#ef4444';
    default:
      return '#9ca3af';
  }
}

/** Driver account status — header dot (aligned with common UI expectations). */
export function getDriverStatusDotColor(status: string): string {
  switch (status) {
    case 'VERIFIED':
      return '#22c55e';
    case 'INCOMPLETE':
    case 'PENDING_REVIEW':
      return '#9ca3af';
    case 'SUSPENDED':
      return '#f97316';
    case 'REJECTED':
      return '#ef4444';
    case 'PAUSED':
      return '#94a3b8';
    default:
      return '#9ca3af';
  }
}

/** Resolve stored profile image URL for Image source (relative paths → API origin). */
export function resolveUserProfileImageUri(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://') || t.startsWith('file:')) {
    return t;
  }
  const api = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
  const origin = api.replace(/\/?api\/?$/i, '');
  return `${origin}${t.startsWith('/') ? '' : '/'}${t}`;
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
