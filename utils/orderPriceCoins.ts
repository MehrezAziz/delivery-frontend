/** Convert local fiat amount to platform coins using active country coin config. */
export function fiatToCoins(fiat: number, coinsPerFiatUnit: number): number {
  if (!Number.isFinite(fiat) || !Number.isFinite(coinsPerFiatUnit) || coinsPerFiatUnit <= 0) {
    return fiat;
  }
  return Math.round(fiat * coinsPerFiatUnit * 100) / 100;
}

/** Convert platform coins to local fiat using active country coin config. */
export function coinsToFiat(coins: number, coinsPerFiatUnit: number): number {
  if (!Number.isFinite(coins) || !Number.isFinite(coinsPerFiatUnit) || coinsPerFiatUnit <= 0) {
    return coins;
  }
  return Math.round((coins / coinsPerFiatUnit) * 100) / 100;
}

export function hasCoinRate(coinsPerFiatUnit: number | null | undefined): coinsPerFiatUnit is number {
  return typeof coinsPerFiatUnit === 'number' && Number.isFinite(coinsPerFiatUnit) && coinsPerFiatUnit > 0;
}

/** Display value for a fiat-denominated fee line on the order preview. */
export function previewLineAmount(
  fiatValue: number,
  isCash: boolean,
  coinsPerFiatUnit: number | null | undefined,
  currencySymbol: string,
): { value: number; unit: string } {
  if (isCash) {
    return { value: fiatValue, unit: currencySymbol };
  }
  return {
    value: hasCoinRate(coinsPerFiatUnit) ? fiatToCoins(fiatValue, coinsPerFiatUnit) : fiatValue,
    unit: 'coins',
  };
}
