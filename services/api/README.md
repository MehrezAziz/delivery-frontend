# API Client

This directory contains the API client configuration for the delivery frontend application.

## Features

- **JWT Token Management**: Automatically adds JWT tokens to authenticated requests
- **Error Handling**: Centralized error handling with custom `ApiError` class
- **Type Safety**: TypeScript types for API requests and responses
- **Token Storage**: Secure token storage using AsyncStorage
- **Environment Configuration**: Configurable API base URL via environment variables

## Configuration

Set the API base URL in your `.env` file:

```
EXPO_PUBLIC_API_URL=http://localhost:3000/api
```

If not set, it defaults to `http://localhost:3000/api`.

## Usage

### Basic GET Request

```typescript
import { api } from '@/services/api';

// Authenticated request (default)
const data = await api.get('/referral/my-code');

// Public request (no authentication)
const data = await api.get('/public/endpoint', { requiresAuth: false });
```

### POST Request

```typescript
import { api } from '@/services/api';

const response = await api.post('/auth/register/customer', {
  phone: '+1234567890',
  password: 'password123',
  firstName: 'John',
  referralCode: 'ABC123'
});
```

### Error Handling

```typescript
import { api, ApiError } from '@/services/api';

try {
  const data = await api.get('/referral/statistics');
} catch (error) {
  if (error instanceof ApiError) {
    console.log('Status:', error.statusCode);
    console.log('Message:', error.message);
    console.log('Error Code:', error.errorCode);
    
    // Handle specific error codes
    if (error.errorCode === 'INVALID_REFERRAL_CODE') {
      // Show user-friendly message
    }
  }
}
```

### Token Management

```typescript
import { setAuthToken, getAuthToken, removeAuthToken } from '@/services/api';

// Store token after login
await setAuthToken('your-jwt-token');

// Get current token
const token = await getAuthToken();

// Remove token on logout
await removeAuthToken();
```

## API Methods

- `api.get<T>(endpoint, options?)` - GET request
- `api.post<T>(endpoint, body?, options?)` - POST request
- `api.put<T>(endpoint, body?, options?)` - PUT request
- `api.patch<T>(endpoint, body?, options?)` - PATCH request
- `api.delete<T>(endpoint, options?)` - DELETE request

## Request Options

```typescript
interface RequestOptions {
  requiresAuth?: boolean;  // Default: true
  headers?: HeadersInit;   // Additional headers
  // ... other fetch options
}
```

## Error Codes

The API client handles various error scenarios:

- `NETWORK_ERROR` - Network connectivity issues
- `INVALID_REFERRAL_CODE` - Invalid referral code provided
- `CODE_GENERATION_FAILED` - Failed to generate unique code
- `USAGE_LIMIT_EXCEEDED` - Referral code usage limit reached
- `REFERRAL_CODE_EXPIRED` - Referral code has expired
- `CANNOT_USE_OWN_CODE` - Attempting to use own referral code
- `NO_REFERRAL_CODE` - Customer has no referral code
- `UNKNOWN_ERROR` - Unexpected error occurred

## Types

Common types are exported from `types.ts`:

- `User` - User entity
- `Customer` - Customer entity
- `ReferralCode` - Referral code entity
- `ReferralStatistics` - Referral statistics
- `ErrorResponse` - API error response format
