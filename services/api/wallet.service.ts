import { api } from './client';

export interface Wallet {
  id: string;
  customerId: string;
  countryId?: string;
  countryName?: string;
  countryIsoCode?: string;
  currencyCode?: string;
  currencySymbol?: string;
  coinsPerFiatUnit?: number;
  balance: number;
  spendable?: number;
  lockedForTransfers?: number;
  currency: string;
  balanceUnit?: 'COINS';
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

export interface WalletCountryPreference {
  countryId: string;
  codOnly: boolean;
}

export interface WalletsSummary {
  primaryWalletId: string | null;
  wallets: Wallet[];
  countryPreferences: WalletCountryPreference[];
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
  getWallet: (countryId?: string, walletId?: string) => {
    const q = new URLSearchParams();
    if (countryId) q.set('countryId', countryId);
    if (walletId) q.set('walletId', walletId);
    const qs = q.toString();
    return api.get<Wallet>(`/wallet/me${qs ? `?${qs}` : ''}`);
  },

  getWalletsSummary: () => api.get<WalletsSummary>('/wallet/me/summary'),

  createCountryWallet: (countryId: string) =>
    api.post<Wallet>('/wallet/countries', { countryId }),

  setCountryPreference: (countryId: string, codOnly: boolean) =>
    api.put<{ countryId: string; codOnly: boolean }>(
      `/customers/me/country-preferences/${countryId}`,
      { codOnly },
    ),

  getTransactions: (page = 1, limit = 20, walletId?: string, countryId?: string) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (walletId) q.set('walletId', walletId);
    if (countryId) q.set('countryId', countryId);
    return api.get<PaginatedResponse<WalletTransaction>>(`/wallet/me/transactions?${q}`);
  },

  getWithdrawals: (page = 1, limit = 20, walletId?: string, countryId?: string) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (walletId) q.set('walletId', walletId);
    if (countryId) q.set('countryId', countryId);
    return api.get<PaginatedResponse<WithdrawalRequest>>(`/wallet/me/withdrawals?${q}`);
  },

  getWithdrawalQuote: (amount: number, walletId?: string, countryId?: string) => {
    const q = new URLSearchParams({ amount: String(amount) });
    if (walletId) q.set('walletId', walletId);
    if (countryId) q.set('countryId', countryId);
    return api.get<WithdrawalQuote>(`/wallet/me/withdrawals/quote?${q}`);
  },

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
      walletId?: string;
      countryId?: string;
    },
  ) => {
    const payoutMethod = opts?.payoutMethod ?? 'BANK_TRANSFER';
    const body: Record<string, unknown> = {
      amount,
      descriptionOfCustomer: opts?.description,
      payoutMethod,
    };
    if (opts?.walletId) body.walletId = opts.walletId;
    if (opts?.countryId) body.countryId = opts.countryId;
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
