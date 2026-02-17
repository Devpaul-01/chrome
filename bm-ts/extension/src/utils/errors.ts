/**
 * Centralized error handling utilities
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public isRetryable: boolean = false,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NetworkError extends AppError {
  constructor(
    message: string = 'Network connection failed. Please check your internet connection.',
  ) {
    super(message, 'NETWORK_ERROR', undefined, true);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed. Please log in again.') {
    super(message, 'AUTH_ERROR', 401, false);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR', 400, false);
    this.name = 'ValidationError';
  }
}

export class ServerError extends AppError {
  constructor(message: string = 'Server error occurred. Please try again later.') {
    super(message, 'SERVER_ERROR', 500, true);
    this.name = 'ServerError';
  }
}

/**
 * Parse API errors and convert to user-friendly messages
 */
export function parseApiError(error: unknown): AppError {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new NetworkError();
  }

  // API errors with status codes
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    const data = 'data' in error ? (error as { data: unknown }).data : null;

    let message = 'An error occurred';
    if (data && typeof data === 'object' && data !== null) {
      if ('detail' in data && typeof data.detail === 'string') {
        message = data.detail;
      } else if ('message' in data && typeof data.message === 'string') {
        message = data.message;
      }
    }

    switch (status) {
      case 400:
        return new ValidationError(message);
      case 401:
      case 403:
        return new AuthenticationError(message);
      case 404:
        return new AppError('Resource not found', 'NOT_FOUND', 404);
      case 409:
        return new AppError(message || 'Conflict occurred', 'CONFLICT', 409);
      case 422:
        return new ValidationError(message || 'Invalid data provided');
      case 429:
        return new AppError('Too many requests. Please try again later.', 'RATE_LIMIT', 429, true);
      case 500:
      case 502:
      case 503:
      case 504:
        return new ServerError(message);
      default:
        return new AppError(message, 'UNKNOWN_ERROR', status);
    }
  }

  // Generic errors
  if (error instanceof Error) {
    return new AppError(error.message, 'UNKNOWN_ERROR');
  }

  // Unknown error type
  return new AppError('An unexpected error occurred', 'UNKNOWN_ERROR');
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  const appError = parseApiError(error);
  return appError.message;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const appError = parseApiError(error);
  return appError.isRetryable;
}

/**
 * Log error to console with context
 */
export function logError(error: unknown, context?: string): void {
  const appError = parseApiError(error);
  const timestamp = new Date().toISOString();

  console.error('=== Error Log ===');
  console.error('Timestamp:', timestamp);
  if (context) {
    console.error('Context:', context);
  }
  console.error('Error:', appError);
  console.error('Message:', appError.message);
  console.error('Code:', appError.code);
  console.error('Status:', appError.statusCode);
  console.error('Retryable:', appError.isRetryable);
  console.error('Stack:', appError.stack);
  console.error('================');
}

/**
 * Validate email format
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: 'Email is required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }

  return { valid: true };
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!password || password.length === 0) {
    errors.push('Password is required');
    return { valid: false, errors };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[a-zA-Z]/.test(password)) {
    errors.push('Password must contain at least one letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password should contain at least one number');
  }

  return { valid: errors.length === 0, errors };
}
