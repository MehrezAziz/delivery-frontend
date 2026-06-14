import AsyncStorage from '@react-native-async-storage/async-storage';

export const CREATE_ORDER_DRAFT_KEY = '@create_order_draft_v1';

export type CreateOrderDraftSnapshot = {
  hasPickup: boolean;
  hasDropoff: boolean;
  weight: string;
  description: string;
  paymentType: 'COD' | 'WALLET';
  scheduleLater: boolean;
  customerExtraAmount: string;
  cancelAfterMinutes: number;
  step: 'form' | 'preview';
};

export function isMeaningfulCreateOrderDraft(d: CreateOrderDraftSnapshot | null): boolean {
  if (!d) return false;
  if (d.hasPickup || d.hasDropoff) return true;
  if (d.step === 'preview') return true;
  if (d.description.trim().length > 0) return true;
  if (d.weight !== '1' && d.weight.trim() !== '') return true;
  if (d.scheduleLater) return true;
  const extra = parseFloat((d.customerExtraAmount || '0').replace(',', '.'));
  if (!Number.isNaN(extra) && extra > 0) return true;
  if (d.paymentType !== 'COD') return true;
  if (d.cancelAfterMinutes !== 15) return true;
  return false;
}

export async function saveCreateOrderDraft(snapshot: CreateOrderDraftSnapshot): Promise<void> {
  if (isMeaningfulCreateOrderDraft(snapshot)) {
    await AsyncStorage.setItem(CREATE_ORDER_DRAFT_KEY, JSON.stringify(snapshot));
  } else {
    await clearCreateOrderDraft();
  }
}

export async function getCreateOrderDraft(): Promise<CreateOrderDraftSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CREATE_ORDER_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CreateOrderDraftSnapshot;
  } catch {
    return null;
  }
}

export async function hasIncompleteCreateOrderDraft(): Promise<boolean> {
  const draft = await getCreateOrderDraft();
  return isMeaningfulCreateOrderDraft(draft);
}

export async function clearCreateOrderDraft(): Promise<void> {
  await AsyncStorage.removeItem(CREATE_ORDER_DRAFT_KEY);
}
