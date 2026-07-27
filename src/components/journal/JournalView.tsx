import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Edit2 } from 'lucide-react';
import { JournalEntry, FontStyle, ContentFontSize } from '@/types';
import { JournalTimeline } from './JournalTimeline';
import { JournalPage } from './JournalPage';
import { TagManager } from './TagManager';
import { getUnsyncedEntries, removeUnsyncedEntry, saveUnsyncedEntry, STORAGE_KEY } from '@utils/offlineStorage';
import { useAllTags } from '@hooks/useTags';

type SortOption = 'date-desc' | 'date-asc';

interface JournalViewProps {
  entries: JournalEntry[];
  font: FontStyle;
  fontSize: ContentFontSize;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onUpdateEntry: (id: number | string, updates: Partial<JournalEntry>) => Promise<void>;
  onDeleteEntry: (id: number | string) => void;
  onSaveNewEntry: (title: string, content: string, tags: string[], created_at?: string) => Promise<number | string>;
  onStartChat: (entry: JournalEntry) => void;
  selectedEntryId: number | string | null;
  onSelectEntry: (id: number | string | null, action?: 'push' | 'replace') => void;
}

function makeDraftEntry(): JournalEntry {
  const now = new Date();
  return {
    id: 'new',
    date: now.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }),
    title: '',
    content: '',
    tags: [],
  };
}

function isEntrySynced(local: JournalEntry, backend: JournalEntry): boolean {
  const localTags = (local.tags || []).map(t => t.toLowerCase()).sort();
  const backendTags = (backend.tags || []).map(t => t.toLowerCase()).sort();
  const tagsMatch =
    localTags.length === backendTags.length &&
    localTags.every((t, i) => t === backendTags[i]);

  // Compare created_at as parsed timestamps with a 1s tolerance: the local
  // value comes from toISOString() (ms precision) while the backend may
  // return second precision or a reformatted string, so a strict string
  // compare would leave the "Unsynced" badge stuck forever.
  const localTs = local.created_at ? new Date(local.created_at).getTime() : NaN;
  const backendTs = backend.created_at ? new Date(backend.created_at).getTime() : NaN;
  const datesMatch =
    (Number.isNaN(localTs) && Number.isNaN(backendTs)) ||
    (!Number.isNaN(localTs) && !Number.isNaN(backendTs) &&
      Math.abs(localTs - backendTs) <= 1000);

  return (
    local.title.trim() === backend.title.trim() &&
    local.content.trim() === backend.content.trim() &&
    tagsMatch &&
    datesMatch &&
    (local.mood || null) === (backend.mood || null)
  );
}

export const JournalView: React.FC<JournalViewProps> = ({
  entries,
  font,
  fontSize,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onUpdateEntry,
  onDeleteEntry,
  onSaveNewEntry,
  onStartChat,
  selectedEntryId,
  onSelectEntry,
}) => {
  const isNewEntry = selectedEntryId === 'new';
  const [editorSessionKey, setEditorSessionKey] = useState<string>('');

  const newSessionRef = useRef(false);

  React.useEffect(() => {
    if (selectedEntryId !== null) {
      if (selectedEntryId === 'new') {
        newSessionRef.current = true;
        setEditorSessionKey(`new-${Date.now()}`);
      } else if (newSessionRef.current) {
        // Transitioning from 'new' to real entry ID — keep the same session key
        // to avoid remounting the editor mid-typing.
        newSessionRef.current = false;
      } else {
        setEditorSessionKey(String(selectedEntryId));
      }
    }
  }, [selectedEntryId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'or' | 'and'>('or');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);

  const navigatedAwayRef = useRef(false);
  const localEntryRef = useRef<Map<string | number, JournalEntry> | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  if (!localEntryRef.current) {
    const map = new Map<string | number, JournalEntry>();
    const unsynced = getUnsyncedEntries();
    Object.values(unsynced).forEach(entry => {
      map.set(entry.id, entry);
    });
    localEntryRef.current = map;
  }

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const unsynced = getUnsyncedEntries();
      const map = new Map<string | number, JournalEntry>();
      Object.values(unsynced).forEach(entry => {
        map.set(entry.id, entry);
      });
      localEntryRef.current = map;
      setSyncVersion(v => v + 1);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Synchronize and prune localEntryRef entries when they are fully synced to
  // backend entries. This mutates a ref and writes localStorage, so it must
  // run as an effect (not during render) — otherwise it double-fires under
  // StrictMode and violates React's render purity.
  useEffect(() => {
    entries.forEach(backendEntry => {
      const localEntry = localEntryRef.current!.get(backendEntry.id);
      if (localEntry && isEntrySynced(localEntry, backendEntry)) {
        localEntryRef.current!.delete(backendEntry.id);
        removeUnsyncedEntry(backendEntry.id);
      }
    });
  }, [entries]);

  const { data: serverTagResponses } = useAllTags();

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();

    if (serverTagResponses) {
      serverTagResponses.forEach(t => tagSet.add(t.name));
    }

    entries.forEach(entry => {
      entry.tags?.forEach(tag => tagSet.add(tag));
    });
    localEntryRef.current!.forEach(entry => {
      entry.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [entries, syncVersion, serverTagResponses]);

  const tagColorMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    if (serverTagResponses) {
      serverTagResponses.forEach(t => {
        if (t.color) map[t.name] = t.color;
      });
    }
    return map;
  }, [serverTagResponses]);

  const filteredEntries = useMemo(() => {
    const allEntriesMap = new Map<string | number, JournalEntry>();
    
    // Add all backend entries first
    entries.forEach(entry => {
      allEntriesMap.set(entry.id, entry);
    });
    
    // Override with/add local entries containing unsynced modifications
    localEntryRef.current!.forEach(entry => {
      allEntriesMap.set(entry.id, entry);
    });

    const allEntries = Array.from(allEntriesMap.values());
    const lowerSearchQuery = searchQuery.toLowerCase();
    const filtered = allEntries.filter(entry => {
      const matchesSearch = searchQuery === '' ||
        entry.title.toLowerCase().includes(lowerSearchQuery) ||
        entry.content.toLowerCase().includes(lowerSearchQuery);
      const matchesTags = selectedTags.length === 0 ||
        (tagMode === 'and'
          ? selectedTags.every(tag => entry.tags?.includes(tag))
          : selectedTags.some(tag => entry.tags?.includes(tag)));
      return matchesSearch && matchesTags;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'date-asc':
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [entries, searchQuery, selectedTags, tagMode, sortBy, syncVersion]);

  const currentEntry = useMemo(() => {
    if (selectedEntryId === null) return null;
    const fromLocal = localEntryRef.current!.get(selectedEntryId);
    if (fromLocal) return fromLocal;
    return entries.find(e => e.id === selectedEntryId) || null;
  }, [entries, selectedEntryId, syncVersion]);

  const handleSelectEntry = useCallback((id: number | string) => {
    navigatedAwayRef.current = false;
    onSelectEntry(id);
  }, [onSelectEntry]);

  const handleNewEntry = useCallback(() => {
    navigatedAwayRef.current = false;
    onSelectEntry('new');
  }, [onSelectEntry]);

  const handleBackToTimeline = useCallback(() => {
    navigatedAwayRef.current = true;
    onSelectEntry(null);
  }, [onSelectEntry]);

  const handleCreateEntry = useCallback(async (title: string, content: string, tags: string[], created_at?: string) => {
    try {
      const id = await onSaveNewEntry(title, content, tags, created_at);
      if (navigatedAwayRef.current) return id;
      localEntryRef.current!.set(id, {
        id,
        title,
        content,
        tags,
        date: created_at
          ? new Date(created_at).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
          : new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
        created_at,
      });
      setSyncVersion(v => v + 1);
      onSelectEntry(id, 'replace');
      return id;
    } catch (err) {
      // Offline fallback: generate a client-side draft ID and save it locally
      const tempId = `draft-${Date.now()}`;
      const localEntry: JournalEntry = {
        id: tempId,
        title,
        content,
        tags,
        date: created_at
          ? new Date(created_at).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
          : new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
        created_at,
      };
      saveUnsyncedEntry(localEntry);
      localEntryRef.current!.set(tempId, localEntry);
      setSyncVersion(v => v + 1);
      onSelectEntry(tempId, 'replace');
      return tempId;
    }
  }, [onSaveNewEntry, onSelectEntry]);

  const handleUpdateEntry = useCallback(async (id: number | string, updates: Partial<JournalEntry>) => {
    const local = localEntryRef.current!.get(id);
    const backend = entries.find(e => e.id === id);
    const existing = local || backend;
    if (existing) {
      localEntryRef.current!.set(id, {
        ...existing,
        ...updates,
      });
      setSyncVersion(v => v + 1);
    }
    await onUpdateEntry(id, updates);
  }, [entries, onUpdateEntry]);

  const handleDeleteEntry = useCallback((id: number | string) => {
    localEntryRef.current!.delete(id);
    setSyncVersion(v => v + 1);
    onDeleteEntry(id);
    onSelectEntry(null);
  }, [onDeleteEntry, onSelectEntry]);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedTags([]);
  }, []);

  const draftEntry = useMemo(() => makeDraftEntry(), [isNewEntry]);
  const displayEntry = isNewEntry ? draftEntry : currentEntry;

  if (displayEntry) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-5rem)]">
          <JournalPage
            key={editorSessionKey}
            entry={displayEntry}
            font={font}
            fontSize={fontSize}
            isNew={isNewEntry}
            allAppTags={allTags}
            tagColorMap={tagColorMap}
            onUpdateById={handleUpdateEntry}
            onUpdate={(updates) => handleUpdateEntry(displayEntry.id, updates)}
            onCreate={isNewEntry ? handleCreateEntry : undefined}
            onDelete={() => handleDeleteEntry(displayEntry.id)}
            onChat={() => onStartChat(displayEntry)}
            onBack={handleBackToTimeline}
          />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 pt-2 pb-20 relative min-h-[calc(100vh-5rem)]">
      <JournalTimeline
        entries={filteredEntries}
        allTags={allTags}
        tagColorMap={tagColorMap}
        font={font}
        fontSize={fontSize}
        searchQuery={searchQuery}
        selectedTags={selectedTags}
        tagMode={tagMode}
        sortBy={sortBy}
        showFilters={showFilters}
        onSearchChange={setSearchQuery}
        onTagToggle={(tag) =>
          setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
          )
        }
        onTagModeChange={setTagMode}
        onSortByChange={setSortBy}
        onFilterToggle={() => setShowFilters(prev => !prev)}
        onClearFilters={handleClearFilters}
        onManageTags={() => setShowTagManager(true)}
        onSelectEntry={handleSelectEntry}
        onNewEntry={handleNewEntry}
        onStartChat={onStartChat}
        onDeleteEntry={(id) => handleDeleteEntry(id)}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
      />
      <button
        onClick={handleNewEntry}
        className="fixed bottom-6 right-6 btn-primary w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all z-30"
        aria-label="New entry"
      >
        <Edit2 className="w-6 h-6" />
      </button>
      <TagManager isOpen={showTagManager} onClose={() => setShowTagManager(false)} />
    </div>
  );
};
