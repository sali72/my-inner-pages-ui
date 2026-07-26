import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildUserMessage, buildPlaceholder } from './chatHelpers';
import type { MessageStatus } from '@/types/chat';

describe('chatHelpers', () => {
  const MOCK_TIME = 1620000000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('buildUserMessage', () => {
    it('should build a valid user message with all provided fields', () => {
      const id = 'msg-123';
      const content = 'Hello, world!';
      const status: MessageStatus = 'delivered';

      const result = buildUserMessage(id, content, status);

      expect(result).toEqual({
        id: 'msg-123',
        role: 'user',
        content: 'Hello, world!',
        timestamp: MOCK_TIME,
        status: 'delivered',
      });
    });

    it('should build a valid user message when status is undefined', () => {
      const id = 'msg-456';
      const content = 'Another message';

      const result = buildUserMessage(id, content, undefined);

      expect(result).toEqual({
        id: 'msg-456',
        role: 'user',
        content: 'Another message',
        timestamp: MOCK_TIME,
        status: undefined,
      });
    });
  });

  describe('buildPlaceholder', () => {
    it('should build a valid placeholder message', () => {
      const result = buildPlaceholder();

      expect(result).toEqual({
        id: 'streaming',
        role: 'assistant',
        content: '',
        timestamp: MOCK_TIME,
      });
    });
  });
});
