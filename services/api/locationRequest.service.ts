import { api } from './client';

export type LocationShareSlot = 'PICKUP' | 'DROPOFF';
export type LocationShareStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';

export interface LocationShareUser {
  id: string;
  firstName?: string | null;
  secondName?: string | null;
  displayName: string;
  phone?: string | null;
  phoneMasked?: string;
}

export interface LocationShareAddress {
  id: string;
  latitude: number | null;
  longitude: number | null;
  street: string | null;
  delegationName: string;
  governorateName: string;
}

export interface LocationShareRequestDto {
  id: string;
  slot: LocationShareSlot;
  status: LocationShareStatus;
  clientRequestId: string | null;
  requester: LocationShareUser;
  target: LocationShareUser;
  address: LocationShareAddress | null;
  resultLat: number | null;
  resultLng: number | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  pushWarning?: string;
  reused?: boolean;
}

export interface LookupRecipientResult {
  userId: string;
  displayName: string;
  phoneMasked: string;
}

export const locationRequestService = {
  lookup: (params: { recipientUserId?: string; recipientPhone?: string }) => {
    const q = new URLSearchParams();
    if (params.recipientUserId) q.set('recipientUserId', params.recipientUserId);
    if (params.recipientPhone) q.set('recipientPhone', params.recipientPhone);
    return api.get<LookupRecipientResult>(`/location-requests/lookup?${q.toString()}`);
  },

  create: (body: {
    recipientUserId?: string;
    recipientPhone?: string;
    slot: LocationShareSlot;
    clientRequestId?: string;
  }) => api.post<LocationShareRequestDto>('/location-requests', body),

  getById: (id: string) => api.get<LocationShareRequestDto>(`/location-requests/${id}`),

  listIncoming: () => api.get<LocationShareRequestDto[]>('/location-requests/incoming'),

  accept: (id: string, body: { latitude: number; longitude: number; street?: string }) =>
    api.post<LocationShareRequestDto>(`/location-requests/${id}/accept`, body),

  decline: (id: string) => api.post<LocationShareRequestDto>(`/location-requests/${id}/decline`, {}),

  cancel: (id: string) => api.post<LocationShareRequestDto>(`/location-requests/${id}/cancel`, {}),
};
