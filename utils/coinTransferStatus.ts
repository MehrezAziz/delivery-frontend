import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

type IonIcon = ComponentProps<typeof Ionicons>['name'];

export type CoinTransferStatusStyle = {
  label: string;
  bg: string;
  fg: string;
  icon: IonIcon;
};

const COIN_TRANSFER_STATUS_META: Record<string, CoinTransferStatusStyle> = {
  SCHEDULED: { label: 'Scheduled', bg: '#dbeafe', fg: '#1d4ed8', icon: 'calendar-outline' },
  PENDING: { label: 'Pending', bg: '#fef3c7', fg: '#b45309', icon: 'time-outline' },
  COMPLETED: { label: 'Completed', bg: '#dcfce7', fg: '#15803d', icon: 'checkmark-circle-outline' },
  FAILED: { label: 'Failed', bg: '#fee2e2', fg: '#b91c1c', icon: 'alert-circle-outline' },
  CANCELLED: { label: 'Cancelled', bg: '#f3f4f6', fg: '#6b7280', icon: 'close-circle-outline' },
};

export function coinTransferStatusMeta(status: string): CoinTransferStatusStyle {
  return (
    COIN_TRANSFER_STATUS_META[status] ?? {
      label: status.replace(/_/g, ' '),
      bg: '#f3f4f6',
      fg: '#4b5563',
      icon: 'ellipse-outline',
    }
  );
}
