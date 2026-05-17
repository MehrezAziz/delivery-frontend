import type { CoinTransferDto } from '../services/api/coins.service';

/** "Jane Doe · +21655664488" for received transfers when API provides sender fields. */
export function formatCoinSenderLine(
  transfer: Pick<CoinTransferDto, 'senderDisplayName' | 'senderPhone'>,
): string | null {
  const name = transfer.senderDisplayName?.trim();
  const phone = transfer.senderPhone?.trim();
  if (!name && !phone) return null;
  if (name && phone) return `${name} · ${phone}`;
  return name || phone || null;
}
