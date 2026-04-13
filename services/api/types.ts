/**
 * Common API response types
 */

export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  errorCode?: string;
  timestamp?: string;
  path?: string;
  errors?: any;
}

export interface User {
  id: string;
  phone: string;
  role: 'CUSTOMER' | 'DRIVER' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  userId: string;
  completedOrders: number;
  customerStatus: 'CREATED' | 'VERIFIED' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  myReferralCodeId?: string;
  referredByCodeId?: string;
}

export interface ReferralCode {
  id: string;
  code: string;
  type: 'FIXED' | 'PERCENTAGE';
  value: number;
  maxDiscountAmount?: number;
  minOrderAmount?: number;
  active: boolean;
  validFrom?: string;
  validUntil?: string;
  usageLimit?: number;
  totalUses: number;
}

export interface ReferralStatistics {
  totalReferrals: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
  myReferralCode: ReferralCode;
}
