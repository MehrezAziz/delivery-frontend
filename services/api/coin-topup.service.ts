import { api } from './client';

export interface CoinTopUpQuote {
  coinsPerFiatUnit: number;
  currencyCode: string;
  currencySymbol: string;
  countryId: string;
  minCoins: number;
  maxCoins: number;
  stepCoins: number;
  presets: Array<{ coins: number; label: string; sub: string; badge?: string }>;
  flouciReady: boolean;
  flouciNote: string | null;
}

export interface CoinTopUpInit {
  trackingId: string;
  paymentId: string;
  checkoutUrl: string;
  amountMillimes: number;
  fiatTotalTnd: number;
  coinsQuoted: number;
  currencySymbol: string;
}

export interface CoinTopUpVerifyResponse {
  fulfilled?: boolean;
  status: string;
  trackingId: string;
  coins: number;
  message?: string;
}

export interface CoinTopUpSessionSummary {
  status: string;
  coins: number;
  fiatTotal: number;
  currencyCode: string;
  amountMillimes: number;
}

export const coinTopupService = {
  quote: () => api.get<CoinTopUpQuote>('/coin-topup/quote'),

  initFlouci: (coinsAmount: number) =>
    api.post<CoinTopUpInit>('/coin-topup/flouci/init', { coinsAmount }),

  verify: (body: { paymentId?: string; trackingId?: string }) =>
    api.post<CoinTopUpVerifyResponse>('/coin-topup/flouci/verify', body),

  session: (trackingId: string) =>
    api.get<CoinTopUpSessionSummary>(`/coin-topup/sessions/${encodeURIComponent(trackingId)}`),
};
