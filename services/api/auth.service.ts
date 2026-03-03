import { api } from './client';
import type { User, Customer, ReferralCode } from './types';

/**
 * Request DTO for customer registration
 */
export interface RegisterCustomerRequest {
  phone: string;
  password: string;
  firstName?: string;
  secondName?: string;
  image?: string;
  userGender?: 'MALE' | 'FEMALE' | 'OTHER';
  myEmail?: string;
  referralCode?: string;
}

/**
 * Response DTO for customer registration
 */
export interface RegisterCustomerResponse {
  accessToken: string;
  user: User;
  customer: Customer;
  referralCode: ReferralCode;
}

/**
 * Auth API Service
 * Handles authentication-related API calls
 */
export const authService = {
  /**
   * Register a new customer with optional referral code
   * 
   * @param data - Customer registration data
   * @returns Promise with access token, user, customer, and referral code
   * @throws ApiError if registration fails
   */
  registerCustomer: async (
    data: RegisterCustomerRequest
  ): Promise<RegisterCustomerResponse> => {
    return api.post<RegisterCustomerResponse>(
      '/auth/customer/register',
      data,
      { requiresAuth: false }
    );
  },
};

export default authService;
