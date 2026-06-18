/** Append selected wallet id when opening wallet sub-screens from the Wallet tab. */
export function hrefWithWalletId(href: string, walletId: string | null | undefined): string {
  if (!walletId) return href;
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}walletId=${encodeURIComponent(walletId)}`;
}

export function parseWalletIdParam(raw: string | string[] | undefined): string | undefined {
  const v = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return v?.trim() || undefined;
}
