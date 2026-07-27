import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../api';

vi.mock('@/services/authService', () => ({
  authService: {
    refreshToken: vi.fn(),
  },
}));

describe('API Silent Refresh Interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports api object with standard HTTP methods', () => {
    expect(api).toBeDefined();
    expect(typeof api.get).toBe('function');
    expect(typeof api.post).toBe('function');
    expect(typeof api.put).toBe('function');
    expect(typeof api.delete).toBe('function');
    expect(typeof api.patch).toBe('function');
  });
});
