import { api } from './client';

export interface Wallet {
  id: string;
  customerId: string;
  countryId?: string;
  balance: number;
  /** Available for orders & withdrawals (balance minus pending P2P locks) */
  spendable?: number;
  lockedForTransfers?: number;
  /** Legacy: country fiat code; primary balance is shown as Coins in the app. */
  currency: string;
  balanceUnit?: 'COINS';
  /** Estimated local fiat equivalent from active country coin config (coins per 1.00 fiat). */
  coinsToLocalFiat?: {
    coinsPerFiatUnit: number;
    currencyCode: string;
    currencySymbol: string;
    balanceAsLocalFiat: number;
    spendableAsLocalFiat: number;
    withdrawalFeeBps?: number;
  } | null;
  discount: number;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  orderId?: string | null;
  type: string;
  amount: number;
  status: string;
  referenceId?: string | null;
  referenceType?: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  walletId: string;
  amount: number;
  feeAmount?: number;
  status: string;
  payoutMethod?: string | null;
  payoutBankHolderName?: string | null;
  payoutBankName?: string | null;
  payoutBankAccountRef?: string | null;
  descriptionOfCustomer?: string | null;
  descriptionOfAdmin?: string | null;
  rejectionReason?: string | null;
  requestedAt: string;
  processedAt?: string | null;
}

export interface WithdrawalQuote {
  amountCoins: number;
  feeCoins: number;
  feeBps: number;
  /** Coins paid out to the user after fee is deducted. */
  netPayoutCoins: number;
  /** Total debited from wallet (= amountCoins). */
  totalCoins: number;
  spendableCoins: number;
  currencyCode: string;
  currencySymbol: string;
  amountFiat: number | null;
  feeFiat: number | null;
  totalFiat: number | null;
  coinsPerFiatUnit: number | null;
}

export interface PayoutBankDetails {
  accountHolderName: string;
  bankName: string;
  accountReference: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  totalPages: number;
  transactions?: T[];
  requests?: T[];
}

export const walletService = {
  getWallet: () => api.get<Wallet>('/wallet/me'),

  getTransactions: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<WalletTransaction>>(`/wallet/me/transactions?page=${page}&limit=${limit}`),

  getWithdrawals: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<WithdrawalRequest>>(`/wallet/me/withdrawals?page=${page}&limit=${limit}`),

  getWithdrawalQuote: (amount: number) =>
    api.get<WithdrawalQuote>(`/wallet/me/withdrawals/quote?amount=${encodeURIComponent(String(amount))}`),

  getPayoutBankDetails: () =>
    api.get<PayoutBankDetails | null>('/wallet/me/payout-bank-details'),

  cancelWithdrawal: (requestId: string) =>
    api.post<{ ok: boolean }>(`/wallet/me/withdrawals/${requestId}/cancel`, {}),

  updatePayoutBankDetails: (body: {
    accountHolderName: string;
    bankName: string;
    accountReference: string;
  }) => api.put<PayoutBankDetails>('/wallet/me/payout-bank-details', body),

  deletePayoutBankDetails: () => api.delete<{ ok: boolean }>('/wallet/me/payout-bank-details'),

  createWithdrawal: (
    amount: number,
    opts?: {
      description?: string;
      payoutMethod?: 'CASH' | 'BANK_TRANSFER';
      payoutBankHolderName?: string;
      payoutBankName?: string;
      payoutBankAccountRef?: string;
      saveBankDetailsToProfile?: boolean;
    },
  ) => {
    const payoutMethod = opts?.payoutMethod ?? 'BANK_TRANSFER';
    const body: Record<string, unknown> = {
      amount,
      descriptionOfCustomer: opts?.description,
      payoutMethod,
    };
    if (payoutMethod === 'BANK_TRANSFER') {
      body.payoutBankHolderName = opts?.payoutBankHolderName?.trim();
      body.payoutBankName = opts?.payoutBankName?.trim();
      body.payoutBankAccountRef = opts?.payoutBankAccountRef?.trim();
      body.saveBankDetailsToProfile = !!opts?.saveBankDetailsToProfile;
    }
    return api.post<WithdrawalRequest>('/wallet/me/withdrawals', body);
  },

  setupCustomer: (countryId: string, address?: {
    delegationId: string;
    latitude?: number;
    longitude?: number;
    street?: string;
  }) =>
    api.post('/customers/me/setup', { countryId, address }),
};
