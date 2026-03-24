import { api } from './client';

export interface OrderAddress {
  id: string;
  street: string | null;
  latitude: number | null;
  longitude: number | null;
  delegation: {
    nameDelegation: string;
    governorate: {
      nameGovernorate: string;
      country: { name: string };
    };
  };
}

export interface DriverAssignment {
  id: string;
  driverId: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  image1Proof: string | null;
  image2Proof: string | null;
  cancelledBy: string | null;
  driver: {
    userId: string;
    user: { firstName: string | null; secondName: string | null; phone: string; image: string | null };
  } | null;
}

export interface Order {
  id: string;
  customerId: string;
  status: string;
  paymentType: 'COD' | 'WALLET';
  description: string | null;
  weight: number;
  distanceKm: number;
  price: number;
  nightFee: number;
  extraWeightFee: number;
  isNightDelivery: boolean;
  deliveryZoneType: string | null;
  createdAt: string;
  pickupAddress: OrderAddress | null;
  dropoffAddress: OrderAddress | null;
  driverAssignment: DriverAssignment | null;
  chatRoom: { id: string; status: string } | null;
  dispute: { id: string; status: string; reason: string; resolution: string | null } | null;
}

export interface AvailableOrders {
  canAccept: boolean;
  isAvailable?: boolean;
  sameDelegation: Order[];
  sameGovernorate: Order[];
  differentGovernorate: Order[];
  differentCountry: Order[];
}

export interface FilteredOrders {
  canAccept: boolean;
  orders: Order[];
}

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderType: 'CUSTOMER' | 'DRIVER' | 'SYSTEM';
  content: string;
  image: string | null;
  timestamp: string;
  readAt: string | null;
}

export interface ChatRoom {
  id: string;
  orderId: string;
  status: string;
  messages: ChatMessage[];
}

export const orderService = {
  // Customer endpoints
  createOrder: (data: { pickupAddressId: string; dropoffAddressId: string; paymentType: 'COD' | 'WALLET'; weight: number; description?: string }) =>
    api.post<Order>('/orders', data),

  previewOrder: (data: { pickupAddressId: string; dropoffAddressId: string; paymentType: 'COD' | 'WALLET'; weight: number }) =>
    api.post<{
      isNightDelivery: boolean;
      distanceKm: number;
      deliveryZoneType: string;
      baseFee: number;
      distanceFee: number;
      extraWeightFee: number;
      nightFee: number;
      totalPrice: number;
      currency: string;
      currencySymbol: string;
      walletBalance: number | null;
      paymentType: 'COD' | 'WALLET';
    }>('/orders/preview', data),

  getMyOrders: () => api.get<Order[]>('/orders/my-orders'),

  getOrder: (id: string) => api.get<Order>(`/orders/${id}`),

  cancelOrder: (id: string, reason: string) => api.delete(`/orders/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),

  changePaymentMethod: (id: string, paymentType: 'COD' | 'WALLET') =>
    api.patch<Order>(`/orders/${id}/payment-method`, { paymentType }),

  getDriverLocation: (id: string) => api.get(`/orders/${id}/driver-location`),

  createDispute: (id: string, reason: string) => api.post(`/orders/${id}/dispute`, { reason }),

  cancelDispute: (id: string) => api.delete(`/orders/${id}/dispute`),

  requestAssistance: (id: string, message?: string) => api.post(`/orders/${id}/assistance`, { message }),

  getChatRoom: (orderId: string) => api.get<ChatRoom>(`/orders/${orderId}/chat`),

  sendChatMessage: (orderId: string, content: string, image?: string) =>
    api.post<ChatMessage>(`/orders/${orderId}/chat/messages`, { content, image }),

  // Driver endpoints
  getAvailableOrders: (filters?: {
    countryId?: string; governorateId?: string; delegationId?: string;
    delegationIds?: string[]; governorateIds?: string[]; countryIds?: string[];
    availableNow?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (filters?.countryId) params.set('countryId', filters.countryId);
    if (filters?.governorateId) params.set('governorateId', filters.governorateId);
    if (filters?.delegationId) params.set('delegationId', filters.delegationId);
    if (filters?.delegationIds?.length) params.set('delegationIds', filters.delegationIds.join(','));
    if (filters?.governorateIds?.length) params.set('governorateIds', filters.governorateIds.join(','));
    if (filters?.countryIds?.length) params.set('countryIds', filters.countryIds.join(','));
    if (filters?.availableNow) params.set('availableNow', 'true');
    const qs = params.toString();
    return api.get<AvailableOrders | FilteredOrders>(`/driver/orders/available${qs ? `?${qs}` : ''}`);
  },

  getDriverMyOrders: () => api.get<Order[]>('/driver/orders/my-orders'),

  acceptOrder: (id: string) => api.post(`/driver/orders/${id}/accept`),

  updateOrderStatus: (id: string, status: string) => api.patch(`/driver/orders/${id}/status`, { status }),

  cancelAssignment: (id: string, reason: string) => api.post(`/driver/orders/${id}/cancel-assignment`, { reason }),

  uploadProofs: (id: string, image1Proof?: string, image2Proof?: string) =>
    api.patch(`/driver/orders/${id}/proofs`, { image1Proof, image2Proof }),

  updateDriverLocation: (id: string, latitude: number, longitude: number, accuracy?: number) =>
    api.post(`/driver/orders/${id}/location`, { latitude, longitude, accuracy }),

  driverRequestAssistance: (id: string, message?: string) => api.post(`/driver/orders/${id}/assistance`, { message }),

  driverGetChatRoom: (orderId: string) => api.get<ChatRoom>(`/driver/orders/${orderId}/chat`),

  driverSendChatMessage: (orderId: string, content: string, image?: string) =>
    api.post<ChatMessage>(`/driver/orders/${orderId}/chat/messages`, { content, image }),
};
