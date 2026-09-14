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
    // The bridge attaches the server's message as `err.message` — use it as
    // the default before trying to dig into the data payload.
    const errMessage = error instanceof Error ? error.message : undefined;

    let message = errMessage || 'An error occurred';
    if (data && typeof data === 'object' && data !== null) {
      // FastAPI returns 422 with detail as an array of validation errors
      if ('detail' in data) {
        const detail = (data as { detail?: unknown }).detail;
        if (typeof detail === 'string') {
          message = detail;
        } else if (Array.isArray(detail)) {
          // Build a concise message from the validation items
          message = detail
            .map((item: unknown) => {
              if (typeof item === 'string') return item;
              if (item !== null && typeof item === 'object') {
                const i = item as { loc?: unknown; msg?: string };
                const loc = Array.isArray(i.loc) ? i.loc.join('.') : String(i.loc ?? '');
                return `${loc}: ${i.msg ?? ''}`;
              }
              return String(item);
            })
            .join('; ');
        }
      } else if ('message' in data && typeof (data as { message?: unknown }).message === 'string') {
        message = (data as { message: string }).message;
      }
    }

    switch (status) {
      case 0:
        // status 0 is sent by the background worker for TypeError (fetch network failure)
        return new NetworkError();
      case 400:
        return new ValidationError(message);
      case 401:
        return new AuthenticationError('The email or password you entered is incorrect.');
      case 403:
        if (
          message.toLowerCase().includes('verify your email') ||
          message.toLowerCase().includes('check your inbox')
        ) {
          return new AuthenticationError(message);
        }
        if (message.toLowerCase().includes('locked')) {
          return new AuthenticationError(
            'Your account is temporarily locked after too many failed sign-in attempts. Please try again later.',
          );
        }
        return new AuthenticationError('We could not sign you in. Please try again.');
      case 404:
        return new AppError(
          'We could not reach the BirthdayMessaging sign-in service. Please try again.',
          'NOT_FOUND',
          404,
          true,
        );
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
        return new ServerError(
          'BirthdayMessaging is temporarily unavailable. Please try again shortly.',
        );
      default:
        return new AppError(message, 'UNKNOWN_ERROR', status);
    }
  }

  // Generic errors
  if (error instanceof Error) {
    const msg = error.message;
    // Bridge/service-worker connectivity errors that never reach the network layer
    if (
      msg.includes('timed out') ||
      msg.includes('did not respond') ||
      msg.includes('No response from background') ||
      msg.includes('Could not establish connection') ||
      msg.includes('Receiving end does not exist') ||
      msg.includes('Extension context invalidated')
    ) {
      return new NetworkError();
    }
    return new AppError(msg, 'UNKNOWN_ERROR');
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
