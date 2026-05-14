import { api } from './client';

export type SecurityTier = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SecuritySummary {
  hasPassword: boolean;
  hasTransferPin: boolean;
  hasVerificationDocument: boolean;
  securityTier: SecurityTier;
}

export const securityService = {
  getSummary: () => api.get<SecuritySummary>('/auth/user/security-summary'),

  /** Call after verifying account password at the Security gate; enables password/PIN changes without current values for a short window. */
  establishSecuritySession: (password: string) =>
    api.post<{ ok: true }>('/auth/user/security-session', { password }),

  revokeSecuritySession: () => api.post<{ ok: true }>('/auth/user/security-session/revoke', {}),

  /** Omit `currentPassword` when the Security screen was just unlocked (server-side window). */
  changePassword: (newPassword: string, currentPassword?: string) =>
    api.patch<{ ok: true }>('/auth/user/password', {
      newPassword,
      ...(currentPassword?.trim() ? { currentPassword: currentPassword.trim() } : {}),
    }),

  setVerificationDocument: (image: string) =>
    api.patch<{ ok: true }>('/auth/user/security-verification-document', { image }),
};
