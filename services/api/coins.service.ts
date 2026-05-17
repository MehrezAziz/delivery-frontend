import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './client';

const DEVICE_ID_KEY = 'coin_transfer_client_device_id';

export async function getCoinTransferDeviceId(): Promise<string> {
  let v = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!v) {
    v = `d_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, v);
  }
  return v;
}

export interface CoinTransferDto {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  grossCoins: number;
  feeCoins: number;
  netCoins: number;
  feeBps: number;
  /** When false, viewer is recipient — UI must not show sender fee breakdown (API also redacts fee fields). */
  showFeeBreakdown?: boolean;
  /** Populated for incoming transfers when the viewer is the recipient. */
  senderDisplayName?: string | null;
  senderPhone?: string | null;
  status: string;
  giftMessage: string | null;
  scheduledAt: string | null;
  pendingUntil: string | null;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  failedReason: string | null;
}

export interface CoinTransferPreview {
  grossCoins: number;
  feeBps: number;
  feeCoins: number;
  netCoins: number;
  minimumGross: number;
  pendingDelayMinutes: number;
  feeModel: 'sender_pays_gross';
  recipientPreview: { userId: string; displayName: string; role?: string };
}

export const coinsService = {
  setTransferPin: (body: { transferPin: string; oldTransferPin?: string }) =>
    api.post<{ ok: true }>('/coins/transfer-pin', body),

  verifyTransferPin: (transferPin: string) =>
    api.post<{ ok: true }>('/coins/transfer-pin/verify', { transferPin }),

  /** After verifying transfer PIN at the Security gate; same post-unlock window as password. */
  establishTransferPinSecuritySession: (transferPin: string) =>
    api.post<{ ok: true }>('/coins/transfer-pin/security-session', { transferPin }),

  clearTransferPin: (oldTransferPin?: string) =>
    api.post<{ ok: true }>(
      '/coins/transfer-pin/clear',
      oldTransferPin && /^\d{8}$/.test(oldTransferPin) ? { oldTransferPin } : {},
    ),

  /**
   * Optional `transferPin` and/or `accountPassword` for step-up (required by API when a transfer PIN is set, or when
   * confirming with password on devices without biometrics).
   */
  createChallenge: (body?: { transferPin?: string; accountPassword?: string }) => {
    const payload: { transferPin?: string; accountPassword?: string } = {};
    if (body?.transferPin) payload.transferPin = body.transferPin;
    if (body?.accountPassword) payload.accountPassword = body.accountPassword;
    return api.post<{ challengeToken: string; expiresAt: string }>(
      '/coins/transfers/challenge',
      Object.keys(payload).length ? payload : {},
    );
  },

  preview: (body: {
    grossCoins: number;
    recipientUserId?: string;
    recipientPhone?: string;
  }) => api.post<CoinTransferPreview>('/coins/transfers/preview', body),

  createTransfer: async (
    body: {
      recipientUserId?: string;
      recipientPhone?: string;
      grossCoins: number;
      challengeToken: string;
      giftMessage?: string;
      scheduledAt?: string;
    },
    opts?: { idempotencyKey?: string },
  ) => {
    const headers: Record<string, string> = {
      'X-Device-Id': await getCoinTransferDeviceId(),
    };
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    return api.post<CoinTransferDto>('/coins/transfers', body, { headers });
  },

  listTransfers: (page = 1, limit = 20) =>
    api.get<{ transfers: CoinTransferDto[]; total: number; page: number; totalPages: number }>(
      `/coins/transfers?page=${page}&limit=${limit}`,
    ),

  getTransfer: (id: string) => api.get<CoinTransferDto>(`/coins/transfers/${id}`),

  cancelTransfer: (id: string) => api.post<{ ok: true }>(`/coins/transfers/${id}/cancel`, {}),

  rescheduleTransfer: (id: string, scheduledAt: string) =>
    api.patch<CoinTransferDto>(`/coins/transfers/${id}/schedule`, { scheduledAt }),

  reportTransfer: (id: string, body?: { note?: string }) =>
    api.post<{ ok: true }>(`/coins/transfers/${id}/report`, body ?? {}),
};
