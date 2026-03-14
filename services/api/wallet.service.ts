import { api } from './client';

export interface Wallet {
  id: string;
  customerId: string;
  balance: number;
  currency: string;
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
  status: string;
  descriptionOfCustomer?: string | null;
  descriptionOfAdmin?: string | null;
  requestedAt: string;
  processedAt?: string | null;
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

  createWithdrawal: (amount: number, description?: string) =>
    api.post<WithdrawalRequest>('/wallet/me/withdrawals', {
      amount,
      descriptionOfCustomer: description,
    }),

  setupCustomer: (countryId: string, address?: {
    delegationId: string;
    latitude?: number;
    longitude?: number;
    street?: string;
  }) =>
    api.post('/customers/me/setup', { countryId, address }),
};
