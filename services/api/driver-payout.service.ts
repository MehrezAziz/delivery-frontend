import { api } from './client';
import type { PayoutBankDetails } from './wallet.service';

export const driverPayoutService = {
  getPayoutBankDetails: () => api.get<PayoutBankDetails | null>('/drivers/me/payout-bank-details'),

  updatePayoutBankDetails: (body: {
    accountHolderName: string;
    bankName: string;
    accountReference: string;
  }) => api.put<PayoutBankDetails>('/drivers/me/payout-bank-details', body),

  deletePayoutBankDetails: () => api.delete<{ ok: boolean }>('/drivers/me/payout-bank-details'),

  cancelWithdrawal: (requestId: string) =>
    api.post<{ ok: boolean }>(`/drivers/me/withdrawal-requests/${requestId}/cancel`, {}),
};
