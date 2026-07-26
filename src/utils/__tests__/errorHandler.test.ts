import { describe, it, expect } from 'vitest';
import {
  handleApiError,
  formatErrorMessage,
  isNetworkError,
  isAuthError,
} from '../errorHandler';

describe('errorHandler', () => {
  describe('handleApiError', () => {
    it('returns the error message if the error is an instance of Error', () => {
      const error = new Error('Test error message');
      expect(handleApiError(error, 'Fallback message')).toBe('Test error message');
    });

    it('returns the error itself if the error is a string', () => {
      const error = 'String error message';
      expect(handleApiError(error, 'Fallback message')).toBe('String error message');
    });

    it('returns the fallback message for unknown error types', () => {
      const error = { code: 500 };
      expect(handleApiError(error, 'Fallback message')).toBe('Fallback message');
    });
  });

  describe('formatErrorMessage', () => {
    it('removes the "Error: " prefix from Error objects', () => {
      const error = new Error('Error: Technical details');
      expect(formatErrorMessage(error)).toBe('Technical details');
    });

    it('handles Error objects without the "Error: " prefix', () => {
      const error = new Error('Technical details');
      expect(formatErrorMessage(error)).toBe('Technical details');
    });

    it('returns the string as is if the error is a string', () => {
      const error = 'String error message';
      expect(formatErrorMessage(error)).toBe('String error message');
    });

    it('returns the default unexpected error message for unknown types', () => {
      const error = { status: 500 };
      expect(formatErrorMessage(error)).toBe('An unexpected error occurred');
    });
  });

  describe('isNetworkError', () => {
    it('returns true for Error with "network" in message', () => {
      const error = new Error('network request failed');
      expect(isNetworkError(error)).toBe(true);
    });

    it('returns true for Error with "fetch" in message', () => {
      const error = new Error('Failed to fetch');
      expect(isNetworkError(error)).toBe(true);
    });

    it('returns true for Error with "connection" in message', () => {
      const error = new Error('connection timeout');
      expect(isNetworkError(error)).toBe(true);
    });

    it('returns false for other Error messages', () => {
      const error = new Error('Internal Server Error');
      expect(isNetworkError(error)).toBe(false);
    });

    it('returns false for non-Error types', () => {
      expect(isNetworkError('network error')).toBe(false);
      expect(isNetworkError({ message: 'network error' })).toBe(false);
    });
  });

  describe('isAuthError', () => {
    it('returns true for Error with "401" in message', () => {
      const error = new Error('Request failed with status code 401');
      expect(isAuthError(error)).toBe(true);
    });

    it('returns true for Error with "unauthorized" in message', () => {
      const error = new Error('User is unauthorized');
      expect(isAuthError(error)).toBe(true);
    });

    it('returns true for Error with "authentication" in message', () => {
      const error = new Error('authentication failed');
      expect(isAuthError(error)).toBe(true);
    });

    it('returns false for other Error messages', () => {
      const error = new Error('Internal Server Error');
      expect(isAuthError(error)).toBe(false);
    });

    it('returns false for non-Error types', () => {
      expect(isAuthError('401 unauthorized')).toBe(false);
      expect(isAuthError({ message: '401' })).toBe(false);
    });
  });
});
