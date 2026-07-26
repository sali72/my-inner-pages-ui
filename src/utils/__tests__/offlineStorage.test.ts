import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getUnsyncedEntries,
  saveUnsyncedEntry,
  removeUnsyncedEntry,
  isEntryUnsynced,
  STORAGE_KEY
} from '../offlineStorage';

describe('offlineStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('getUnsyncedEntries', () => {
    it('returns empty object when JSON parsing fails', () => {
      // Mock localStorage.getItem to return invalid JSON
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{ invalid json');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const entries = getUnsyncedEntries();

      expect(entries).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse unsynced journals:', expect.any(Error));
    });

    it('returns empty object when localStorage throws an error', () => {
      // Mock localStorage.getItem to throw an error (e.g., when localStorage is disabled)
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Access to localStorage denied');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const entries = getUnsyncedEntries();

      expect(entries).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse unsynced journals:', expect.any(Error));
    });

    it('returns valid data when present', () => {
      const mockData = { '1': { id: '1', content: 'test' } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockData));

      const entries = getUnsyncedEntries();
      expect(entries).toEqual(mockData);
    });

    it('returns empty object when no data exists', () => {
      const entries = getUnsyncedEntries();
      expect(entries).toEqual({});
    });
  });

  describe('saveUnsyncedEntry', () => {
    it('saves entry successfully', () => {
      const entry = { id: 'test-id', title: 'Test', content: 'Content' } as any;
      saveUnsyncedEntry(entry);

      const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(savedData['test-id']).toMatchObject({
        id: 'test-id',
        title: 'Test',
        content: 'Content'
      });
      expect(savedData['test-id'].created_at).toBeDefined();
    });

    it('handles localStorage throw error during save', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Quota Exceeded');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const entry = { id: 'test-id', title: 'Test' } as any;
      saveUnsyncedEntry(entry);

      expect(consoleSpy).toHaveBeenCalledWith('Failed to save unsynced journal:', expect.any(Error));
    });
  });

  describe('removeUnsyncedEntry', () => {
    it('removes entry successfully', () => {
      const initialData = { '1': { id: '1', title: 'Test 1' }, '2': { id: '2', title: 'Test 2' } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialData));

      removeUnsyncedEntry('1');

      const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(savedData).toEqual({ '2': { id: '2', title: 'Test 2' } });
    });

    it('handles localStorage throw error during remove', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage error');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      removeUnsyncedEntry('1');

      expect(consoleSpy).toHaveBeenCalledWith('Failed to remove unsynced journal:', expect.any(Error));
    });
  });

  describe('isEntryUnsynced', () => {
    it('returns true if entry exists in storage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '123': { id: '123' } }));
      expect(isEntryUnsynced('123')).toBe(true);
    });

    it('returns false if entry does not exist in storage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '123': { id: '123' } }));
      expect(isEntryUnsynced('456')).toBe(false);
    });
  });
});
