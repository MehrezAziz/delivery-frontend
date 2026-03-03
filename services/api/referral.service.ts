import { api } from './client';
import type { ReferralCode, ReferralStatistics } from './types';

/**
 * Referral API Service
 * Handles referral-related API calls
 */
export const referralService = {
  /**
   * Validate a referral code
   * 
   * @param code - The referral code to validate
   * @returns Promise with referral code details if valid
   * @throws ApiError if code is invalid, expired, or usage limit exceeded
   */
  validateReferralCode: async (code: string): Promise<ReferralCode> => {
    return api.get<ReferralCode>(`/referral/validate/${code}`, {
      requiresAuth: false,
    });
  },

  /**
   * Get the authenticated customer's referral code
   * 
   * @returns Promise with the customer's referral code
   * @throws ApiError if customer has no referral code or not authenticated
   */
  getMyReferralCode: async (): Promise<ReferralCode> => {
    return api.get<ReferralCode>('/referral/my-code');
  },

  /**
   * Get referral statistics for the authenticated customer
   * 
   * @returns Promise with referral statistics including total referrals and commissions
   * @throws ApiError if not authenticated
   */
  getReferralStatistics: async (): Promise<ReferralStatistics> => {
    return api.get<ReferralStatistics>('/referral/statistics');
  },
};

export default referralService;
