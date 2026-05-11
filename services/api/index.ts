/**
 * API Client Module
 * 
 * This module provides a configured API client for making HTTP requests
 * to the backend API with automatic JWT token handling and error processing.
 */

export { api, apiClient, ApiError, getAuthToken, setAuthToken, removeAuthToken } from './client';
export * from './types';
export { authService } from './auth.service';
export type { RegisterCustomerRequest, RegisterCustomerResponse } from './auth.service';
export { referralService } from './referral.service';
export { geographyService } from './geography.service';
export type { Country, Governorate, Delegation } from './geography.service';
export { walletService } from './wallet.service';
export type { Wallet, WalletTransaction, WithdrawalRequest } from './wallet.service';
export { driverPayoutService } from './driver-payout.service';
