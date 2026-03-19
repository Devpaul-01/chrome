/**
 * Tests for src/utils/errors.ts
 *
 * Covers:
 *  - Custom error classes (AppError, NetworkError, AuthenticationError,
 *    ValidationError, ServerError)
 *  - parseApiError
 *  - getErrorMessage
 *  - isRetryableError
 *  - validateEmail
 *  - validatePassword
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  NetworkError,
  AuthenticationError,
  ValidationError,
  ServerError,
  parseApiError,
  getErrorMessage,
  isRetryableError,
  validateEmail,
  validatePassword,
} from '../errors';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe('AppError', () => {
  it('sets message and name', () => {
    const err = new AppError('something broke', 'BROKEN', 500, true);
    expect(err.message).toBe('something broke');
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('BROKEN');
    expect(err.statusCode).toBe(500);
    expect(err.isRetryable).toBe(true);
  });

  it('isRetryable defaults to false', () => {
    expect(new AppError('x').isRetryable).toBe(false);
  });
});

describe('NetworkError', () => {
  it('is retryable and has correct code', () => {
    const err = new NetworkError();
    expect(err.name).toBe('NetworkError');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.isRetryable).toBe(true);
  });

  it('accepts custom message', () => {
    const err = new NetworkError('custom');
    expect(err.message).toBe('custom');
  });
});

describe('AuthenticationError', () => {
  it('is not retryable and has 401 status', () => {
    const err = new AuthenticationError();
    expect(err.name).toBe('AuthenticationError');
    expect(err.statusCode).toBe(401);
    expect(err.isRetryable).toBe(false);
  });
});

describe('ValidationError', () => {
  it('carries field information', () => {
    const err = new ValidationError('Invalid email', 'email');
    expect(err.name).toBe('ValidationError');
    expect(err.field).toBe('email');
    expect(err.statusCode).toBe(400);
  });
});

describe('ServerError', () => {
  it('is retryable with 500 status', () => {
    const err = new ServerError();
    expect(err.name).toBe('ServerError');
    expect(err.statusCode).toBe(500);
    expect(err.isRetryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseApiError
// ---------------------------------------------------------------------------

describe('parseApiError', () => {
  it('converts fetch TypeError to NetworkError', () => {
    const result = parseApiError(new TypeError('Failed to fetch'));
    expect(result).toBeInstanceOf(NetworkError);
  });

  it('returns 400 → ValidationError', () => {
    const result = parseApiError({ status: 400, data: { detail: 'bad field' } });
    expect(result).toBeInstanceOf(ValidationError);
    expect(result.message).toBe('bad field');
  });

  it('returns 401 → AuthenticationError', () => {
    const result = parseApiError({ status: 401, data: {} });
    expect(result).toBeInstanceOf(AuthenticationError);
  });

  it('returns 403 → AuthenticationError', () => {
    const result = parseApiError({ status: 403, data: {} });
    expect(result).toBeInstanceOf(AuthenticationError);
  });

  it('returns 404 → AppError with NOT_FOUND code', () => {
    const result = parseApiError({ status: 404, data: {} });
    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe('NOT_FOUND');
    expect(result.statusCode).toBe(404);
  });

  it('returns 422 → ValidationError', () => {
    const result = parseApiError({ status: 422, data: { detail: 'invalid' } });
    expect(result).toBeInstanceOf(ValidationError);
  });

  it('returns 429 → AppError with RATE_LIMIT code and isRetryable', () => {
    const result = parseApiError({ status: 429, data: {} });
    expect(result.code).toBe('RATE_LIMIT');
    expect(result.isRetryable).toBe(true);
  });

  it('returns 500 → ServerError', () => {
    const result = parseApiError({ status: 500, data: {} });
    expect(result).toBeInstanceOf(ServerError);
  });

  it('handles FastAPI 422 detail array', () => {
    const result = parseApiError({
      status: 422,
      data: {
        detail: [{ loc: ['body', 'email'], msg: 'field required' }],
      },
    });
    expect(result.message).toContain('field required');
  });

  it('handles generic Error', () => {
    const result = parseApiError(new Error('something'));
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('something');
  });

  it('handles unknown error type', () => {
    const result = parseApiError('just a string');
    expect(result).toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// getErrorMessage
// ---------------------------------------------------------------------------

describe('getErrorMessage', () => {
  it('returns string message for any error', () => {
    expect(typeof getErrorMessage(new Error('oops'))).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------

describe('isRetryableError', () => {
  it('returns true for NetworkError', () => {
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('returns false for AuthenticationError', () => {
    expect(isRetryableError({ status: 401, data: {} })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateEmail
// ---------------------------------------------------------------------------

describe('validateEmail', () => {
  it('passes a valid email', () => {
    expect(validateEmail('user@example.com').valid).toBe(true);
  });

  it('fails an empty string', () => {
    const r = validateEmail('');
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('fails a string with no @', () => {
    expect(validateEmail('notanemail').valid).toBe(false);
  });

  it('fails a string with no domain', () => {
    expect(validateEmail('user@').valid).toBe(false);
  });

  it('fails whitespace-only input', () => {
    expect(validateEmail('   ').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePassword
// ---------------------------------------------------------------------------

describe('validatePassword', () => {
  it('passes a strong password', () => {
    const r = validatePassword('StrongPass1');
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('fails an empty password', () => {
    const r = validatePassword('');
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('fails a short password', () => {
    const r = validatePassword('Ab1');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /8 character/i.test(e))).toBe(true);
  });

  it('fails a digits-only password', () => {
    const r = validatePassword('12345678');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /letter/i.test(e))).toBe(true);
  });

  it('fails a letters-only password', () => {
    const r = validatePassword('abcdefgh');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /number/i.test(e))).toBe(true);
  });
});
