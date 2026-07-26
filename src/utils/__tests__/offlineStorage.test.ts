import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getUnsyncedEntries,
  saveUnsyncedEntry,
  removeUnsyncedEntry,
  isEntryUnsynced,
  STORAGE_KEY,
} from '../offlineStorage';
import { JournalEntry } from '@/types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

describe('offlineStorage', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    console.error = vi.fn(); // Mock console.error to keep test output clean
  });

  afterEach(() => {
    console.error = originalConsoleError; // Restore console.error
  });

  const mockEntry: JournalEntry = {
    id: 'test-123',
    title: 'Test Entry',
    content: 'Test content',
    date: '2023-10-27',
    tags: ['test'],
    created_at: '2023-10-27T10:00:00Z',
  };

  describe('getUnsyncedEntries', () => {
    it('returns parsed object when localStorage has valid JSON', () => {
      const entries = { 'test-123': mockEntry };
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(entries));

      const result = getUnsyncedEntries();
      expect(result).toEqual(entries);
      expect(localStorageMock.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('returns an empty object when localStorage returns null (empty path)', () => {
      const result = getUnsyncedEntries();
      expect(result).toEqual({});
      expect(localStorageMock.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('returns an empty object and logs error when JSON.parse throws (error path)', () => {
      localStorageMock.setItem(STORAGE_KEY, 'invalid-json');

      const result = getUnsyncedEntries();
      expect(result).toEqual({});
      expect(console.error).toHaveBeenCalledWith('Failed to parse unsynced journals:', expect.any(Error));
    });

    it('returns an empty object and logs error when localStorage.getItem throws (error path)', () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('localStorage error');
      });

      const result = getUnsyncedEntries();
      expect(result).toEqual({});
      expect(console.error).toHaveBeenCalledWith('Failed to parse unsynced journals:', expect.any(Error));
    });
  });

  describe('saveUnsyncedEntry', () => {
    it('saves a new entry, appending it to the existing storage map', () => {
      // Setup initial state
      const existingEntry = { ...mockEntry, id: 'existing-456' };
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'existing-456': existingEntry }));

      // Action
      saveUnsyncedEntry(mockEntry);

      // Verify
      const expectedStorage = {
        'existing-456': existingEntry,
        'test-123': mockEntry,
      };
      expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(expectedStorage));
    });

    it('assigns a created_at timestamp if none is provided', () => {
      const mockDate = new Date('2023-11-01T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      const entryWithoutCreatedAt: JournalEntry = {
        id: 'new-789',
        title: 'New Entry',
        content: 'New content',
        date: '2023-11-01',
        tags: [],
      };

      saveUnsyncedEntry(entryWithoutCreatedAt);

      const setItemArgs = localStorageMock.setItem.mock.calls[0];
      const parsedStoredData = JSON.parse(setItemArgs[1]);

      expect(parsedStoredData['new-789'].created_at).toBe(mockDate.toISOString());

      vi.useRealTimers();
    });

    it('logs error when localStorage.setItem throws and does not crash', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('Storage full');
      });

      expect(() => saveUnsyncedEntry(mockEntry)).not.toThrow();
      expect(console.error).toHaveBeenCalledWith('Failed to save unsynced journal:', expect.any(Error));
    });
  });

  describe('removeUnsyncedEntry', () => {
    it('successfully removes an entry by id and updates localStorage', () => {
      // Setup initial state
      const entries = { 'test-123': mockEntry, 'test-456': { ...mockEntry, id: 'test-456' } };
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(entries));

      // Action
      removeUnsyncedEntry('test-123');

      // Verify
      const expectedStorage = { 'test-456': entries['test-456'] };
      expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(expectedStorage));
    });

    it('logs error when localStorage.setItem throws and does not crash', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      expect(() => removeUnsyncedEntry('test-123')).not.toThrow();
      expect(console.error).toHaveBeenCalledWith('Failed to remove unsynced journal:', expect.any(Error));
    });
  });

  describe('isEntryUnsynced', () => {
    it('returns true if the entry exists', () => {
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'test-123': mockEntry }));
      expect(isEntryUnsynced('test-123')).toBe(true);
    });

    it('returns false if the entry does not exist', () => {
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'test-123': mockEntry }));
      expect(isEntryUnsynced('test-456')).toBe(false);
    });

    it('returns false if storage is empty', () => {
      expect(isEntryUnsynced('test-123')).toBe(false);
    });
  });
});
