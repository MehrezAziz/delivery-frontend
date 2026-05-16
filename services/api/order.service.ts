import { api } from './client';

/** Matches backend `computeCancelRemainingSeconds` — do not subtract elapsed from `cancelRemainingSeconds` (that value is already computed). */
export function computeOrderCancelRemainingSec(order: Order, nowMs: number): number {
  if (order.status !== 'SEARCHING_DRIVER') {
    return Math.max(0, Math.floor(order.cancelRemainingSeconds ?? 0));
  }
  const fallback = Math.max(0, (order.cancelAfterMinutes ?? 15) * 60);
  const baseRemaining =
    typeof order.cancelTimerRemainingSeconds === 'number'
      ? order.cancelTimerRemainingSeconds
      : fallback;
  const lastResumed = order.cancelTimerLastResumedAt
    ? new Date(order.cancelTimerLastResumedAt).getTime()
    : null;
  if (!lastResumed) return Math.max(0, baseRemaining);
  const elapsedSec = Math.floor((nowMs - lastResumed) / 1000);
  return Math.max(0, baseRemaining - elapsedSec);
}

export interface OrderAddress {
  id: string;
  street: string | null;
  nickname?: string | null;
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
    avgRating: number | null;
    completedOrders: number;
    totalOrders: number;
    cancelledOrders: number;
    completionRate: number | null;
    avgDeliveryTimeMinutes: number | null;
  } | null;
}

export interface Order {
  id: string;
  customerId: string;
  status: string;
  paymentType: 'COD' | 'WALLET';
  sourceType?: 'NORMAL_CUSTOMER' | 'DELIVERY_COMPANY';
  deliveryCompanyId?: string | null;
  /** Present on company-sourced orders for driver UI (e.g. available list label). */
  deliveryCompanyName?: string | null;
  description: string | null;
  weight: number;
  distanceKm: number;
  price: number;
  /** Order total in platform coins (from country coin config). */
  priceCoins?: number;
  coinsPerFiatUnit?: number | null;
  currencySymbol?: string | null;
  currencyCode?: string | null;
  /** Optional extra chosen by customer (errand / long service); charged in addition to calculated delivery price. */
  customerExtraAmount?: number;
  nightFee: number;
  extraWeightFee: number;
  isNightDelivery: boolean;
  localPickupOnly?: boolean;
  cancelAfterMinutes?: number;
  cancelRemainingSeconds?: number;
  /** Seconds budget when timer last resumed; pair with `cancelTimerLastResumedAt` for live countdown. */
  cancelTimerRemainingSeconds?: number | null;
  cancelTimerRunning?: boolean;
  cancelTimerLastResumedAt?: string | null;
  /** Present when the customer scheduled visibility (status PENDING_PUBLISH). */
  scheduledPublishAt?: string | null;
  deliveryZoneType: string | null;
  createdAt: string;
  pickupAddress: OrderAddress | null;
  dropoffAddress: OrderAddress | null;
  driverAssignment: DriverAssignment | null;
  chatRoom: { id: string; status: string } | null;
  dispute: { id: string; status: string; reason: string; resolution: string | null } | null;
  rating: { id: string; score: number; comment: string | null; createdAt: string } | null;
  driverAvailability?: {
    availableInDelegation: number | string;
    availableNearDelegationApprox: number | string;
  };
  urgentNotify?: {
    canStartNewCycle: boolean;
    nextButtonEnabledAt: string | null;
    wavesSentThisCycle: number;
    cycleInProgress: boolean;
  };
  arrivalConflict?: {
    id: string;
    status: string;
    customerReason: string;
    driverFeedback: string | null;
    createdAt: string;
  } | null;
  myOrderDriverRejection?: {
    id: string;
    reason: string | null;
    driverResponse: string | null;
    driverRespondedAt: string | null;
  } | null;
  returnDepositFeedback?: {
    id: string;
    reportedByUserId: string;
    conditionIssue: boolean;
    feedback: string;
    createdAt: string;
  } | null;
  customer?: {
    firstName: string | null;
    secondName: string | null;
    image?: string | null;
  } | null;
  driverFeeBreakdown?: {
    totalPriceCoins: number;
    baseFeeCoins: number;
    platformFeeCoins: number;
  };
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
  createOrder: (data: {
    pickupAddressId: string;
    dropoffAddressId?: string;
    localPickupOnly?: boolean;
    paymentType: 'COD' | 'WALLET';
    weight: number;
    description?: string;
    cancelAfterMinutes?: number;
    customerExtraAmount?: number;
    scheduledPublishAt?: string;
  }) =>
    api.post<Order>('/orders', data),

  previewOrder: (data: {
    pickupAddressId: string;
    dropoffAddressId?: string;
    localPickupOnly?: boolean;
    paymentType: 'COD' | 'WALLET';
    weight: number;
    customerExtraAmount?: number;
    scheduledPublishAt?: string;
  }) =>
    api.post<{
      isNightDelivery: boolean;
      distanceKm: number;
      deliveryZoneType: string;
      baseFee: number;
      distanceFee: number;
      extraWeightFee: number;
      nightFee: number;
      calculatedPrice: number;
      customerExtraAmount: number;
      totalPrice: number;
      totalPriceCoins: number;
      coinsPerFiatUnit: number | null;
      currency: string;
      currencySymbol: string;
      walletBalance: number | null;
      paymentType: 'COD' | 'WALLET';
    }>('/orders/preview', data),

  getMyOrders: () => api.get<Order[]>('/orders/my-orders'),

  getOrder: (id: string) => api.get<Order>(`/orders/${id}`),

  cancelOrder: (id: string, reason: string) => api.delete(`/orders/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),

  reactivateOrder: (id: string) => api.post<Order>(`/orders/${id}/reactivate`),

  changePaymentMethod: (id: string, paymentType: 'COD' | 'WALLET') =>
    api.patch<Order>(`/orders/${id}/payment-method`, { paymentType }),

  updateScheduledPublish: (id: string, scheduledPublishAt: string) =>
    api.patch<Order>(`/orders/${id}/scheduled-publish`, { scheduledPublishAt }),

  getDriverLocation: (id: string) => api.get(`/orders/${id}/driver-location`),

  getTrackingToken: (id: string) => api.get<{ trackingToken: string }>(`/orders/${id}/tracking-token`),

  getPublicTracking: (token: string) => api.get<{ status: string; driverLocation: { latitude: number; longitude: number; timestamp: string } | null; dropoffAddress: { street: string | null; delegation: string; governorate: string } | null }>(`/tracking/${token}`),

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

  updateOrderStatus: (
    id: string,
    status: string,
    extra?: { customerCallCountBeforeReturn?: number; returnEvidenceImageUrl?: string },
  ) => api.patch(`/driver/orders/${id}/status`, { status, ...extra }),

  cancelAssignment: (id: string, reason: string) => api.post(`/driver/orders/${id}/cancel-assignment`, { reason }),

  uploadProofs: (id: string, image1Proof?: string, image2Proof?: string) =>
    api.patch(`/driver/orders/${id}/proofs`, { image1Proof, image2Proof }),

  updateDriverLocation: (id: string, latitude: number, longitude: number, accuracy?: number) =>
    api.post(`/driver/orders/${id}/location`, { latitude, longitude, accuracy }),

  driverRequestAssistance: (id: string, message?: string) => api.post(`/driver/orders/${id}/assistance`, { message }),

  driverGetChatRoom: (orderId: string) => api.get<ChatRoom>(`/driver/orders/${orderId}/chat`),

  driverSendChatMessage: (orderId: string, content: string, image?: string) =>
    api.post<ChatMessage>(`/driver/orders/${orderId}/chat/messages`, { content, image }),

  // Rating
  rateOrder: (orderId: string, score: number, comment?: string) =>
    api.post(`/orders/${orderId}/rate`, { score, comment }),

  // Customer reject driver
  rejectDriver: (orderId: string, reason?: string) =>
    api.post(`/orders/${orderId}/reject-driver`, { reason }),

  notifyDriversUrgent: (orderId: string) =>
    api.post<{ message: string; notifiedDrivers: number }>(`/orders/${orderId}/notify-drivers`),

  updateCancelAfter: (orderId: string, cancelAfterMinutes: number) =>
    api.patch<Order>(`/orders/${orderId}/cancel-after`, { cancelAfterMinutes }),

  /** Driver: respond to customer rejection after arrival */
  submitArrivalConflictFeedback: (orderId: string, feedback: string) =>
    api.post<{ message: string }>(`/orders/${orderId}/arrival-conflict/feedback`, { feedback }),

  // Customer approve driver
  approveDriver: (orderId: string) =>
    api.post(`/orders/${orderId}/approve-driver`),

  // Get driver reviews for an order
  getDriverReviews: (orderId: string) =>
    api.get<{ reviews: { id: string; score: number; comment: string | null; createdAt: string; customerName: string }[] }>(`/orders/${orderId}/driver-reviews`),

  // Driver revert status
  revertOrderStatus: (orderId: string) =>
    api.post(`/driver/orders/${orderId}/revert-status`),

  // Driver rejected orders
  getDriverRejectedOrders: () =>
    api.get<{
      rejectionId: string;
      rejectedAt: string;
      reason: string | null;
      driverResponse: string | null;
      driverRespondedAt: string | null;
      order: Order;
    }[]>('/driver/orders/rejected'),

  respondToOrderDriverRejection: (orderId: string, response: string) =>
    api.post<{ message: string }>(`/driver/orders/${orderId}/order-driver-rejection-response`, { response }),

  // Driver ratings
  getDriverRatings: () => api.get<{
    avgRating: number | null;
    totalRatings: number;
    completedOrders: number;
    ratings: { id: string; score: number; comment: string | null; createdAt: string; customerName: string; orderId: string | null }[];
  }>('/drivers/me/ratings'),
};
