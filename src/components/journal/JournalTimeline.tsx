import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Tag, Search, Filter, X, Loader2, UnfoldVertical, Settings2 } from 'lucide-react';
import { JournalEntry, FontStyle, ContentFontSize } from '@/types';
import { isEntryUnsynced } from '@utils/offlineStorage';
import { getFontClass, getFontSizeClass } from '@utils/fonts';
import { renderTextWithLineDirection } from '@utils/textDirection';
import { EntryMenu } from './EntryMenu';
import { ConfirmModal } from './ConfirmModal';

type SortOption = 'date-desc' | 'date-asc';
type TagMode = 'or' | 'and';

interface JournalTimelineProps {
  entries: JournalEntry[];
  allTags: string[];
  tagColorMap: Record<string, string | null>;
  font: FontStyle;
  fontSize: ContentFontSize;
  searchQuery: string;
  selectedTags: string[];
  tagMode: TagMode;
  sortBy: SortOption;
  showFilters: boolean;
  onSearchChange: (query: string) => void;
  onTagToggle: (tag: string) => void;
  onTagModeChange: (mode: TagMode) => void;
  onSortByChange: (sort: SortOption) => void;
  onFilterToggle: () => void;
  onClearFilters: () => void;
  onManageTags: () => void;
  onSelectEntry: (id: number | string) => void;
  onNewEntry: () => void;
  onStartChat: (entry: JournalEntry) => void;
  onDeleteEntry: (id: number | string) => void;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

const MOOD_COLORS: Record<string, string> = {
  happy: 'bg-green-400',
  sad: 'bg-blue-400',
  anxious: 'bg-yellow-400',
  calm: 'bg-teal-400',
  angry: 'bg-red-400',
  grateful: 'bg-purple-400',
  excited: 'bg-orange-400',
  tired: 'bg-gray-400',
};

const getMoodDot = (mood?: string) => {
  if (!mood) return null;
  const color = MOOD_COLORS[mood.toLowerCase()] || 'bg-gray-300';
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5`} />;
};

export const JournalTimeline: React.FC<JournalTimelineProps> = ({
  entries,
  allTags,
  tagColorMap,
  font,
  fontSize,
  searchQuery,
  selectedTags,
  tagMode,
  sortBy,
  showFilters,
  onSearchChange,
  onTagToggle,
  onTagModeChange,
  onSortByChange,
  onFilterToggle,
  onClearFilters,
  onManageTags,
  onSelectEntry,
  onNewEntry,
  onStartChat,
  onDeleteEntry,
  isLoadingMore,
  hasMore,
  onLoadMore,
}) => {
  const MAX_VISIBLE_TAGS = 2;
  const hasActiveFilters = searchQuery || selectedTags.length > 0;
  const [openMenuId, setOpenMenuId] = useState<number | string | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<JournalEntry | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  const handleCopy = async (entry: JournalEntry) => {
    try {
      await navigator.clipboard.writeText(`${entry.title}\n\n${entry.content}`);
    } catch (error) {
      console.error('Failed to copy entry:', error);
    }
  };

  const handleShare = async (entry: JournalEntry) => {
    const text = `${entry.title}\n\n${entry.content}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: entry.title, text });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch (error) {
      console.error('Failed to share entry:', error);
    }
  };

  const handleConfirmDelete = () => {
    if (entryToDelete) {
      onDeleteEntry(entryToDelete.id);
      setEntryToDelete(null);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search journals..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl border text-body placeholder:text-muted input-field"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-body"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div>
          <button
            onClick={onFilterToggle}
            className={`flex items-center gap-2 text-sm transition-colors ${
              showFilters || hasActiveFilters ? 'text-accent' : 'text-muted hover:text-body'
            }`}
          >
            <Filter className="w-4 h-4" />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
            {hasActiveFilters && !showFilters && (
              <span className="w-2 h-2 rounded-full bg-accent" />
            )}
          </button>

          <div className={`overflow-hidden transition-all duration-200 ${
            showFilters ? 'max-h-64' : 'max-h-0'
          }`}>
            <div className="mt-3 p-4 card rounded-xl space-y-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">
                  Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => onSortByChange(e.target.value as SortOption)}
                  className="w-full px-3 py-1.5 rounded-lg border text-sm input-field appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundPosition: 'right 0.6rem center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '1rem',
                    paddingRight: '2rem',
                  }}
                >
                  <option value="date-desc">Date (Newest First)</option>
                  <option value="date-asc">Date (Oldest First)</option>
                </select>
              </div>

                  {allTags.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">
                    Filter by Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map(tag => {
                      const color = tagColorMap[tag];
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => onTagToggle(tag)}
                          className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                            isSelected
                              ? color ? 'text-white' : 'bg-accent text-white'
                              : 'bg-surface-hover text-muted hover:text-accent'
                          }`}
                          style={isSelected && color ? { backgroundColor: color } : {}}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  {selectedTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <button
                        onClick={() => onTagModeChange(tagMode === 'or' ? 'and' : 'or')}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                          tagMode === 'and'
                            ? 'bg-accent/10 text-accent border border-accent/30'
                            : 'text-muted hover:text-accent border border-transparent'
                        }`}
                      >
                        <UnfoldVertical className="w-3 h-3" />
                        {tagMode === 'or' ? 'Match any (OR)' : 'Match all (AND)'}
                      </button>
                      <button
                        onClick={onClearFilters}
                        className="text-xs text-muted hover:underline"
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
              )}
              {allTags.length > 0 && (
                <div className="pt-2 border-t border-border-default">
                  <button
                    onClick={onManageTags}
                    className="flex items-center gap-2 text-xs text-muted hover:text-accent transition-colors"
                  >
                    <Settings2 className="w-3 h-3" />
                    Manage Tags
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-secondary text-lg mb-4">
            {hasActiveFilters ? 'No journals match your search' : 'No journal entries yet'}
          </p>
          <button
            onClick={onNewEntry}
            className="btn-primary px-6 py-3 rounded-full"
          >
            {hasActiveFilters ? 'Clear filters & write' : 'Write your first entry'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="relative group">
              <button
                onClick={() => onSelectEntry(entry.id)}
                className="w-full text-left card p-6 hover:shadow-elevated transition-all hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-2 text-sm text-muted mb-2 w-full">
                  {getMoodDot(entry.mood)}
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{entry.date}</span>
                  {isEntryUnsynced(entry.id) && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-auto" title="Unsynced changes (Saved locally)" />
                  )}
                </div>

                <h2
                  className={`text-xl ${getFontClass(font)} font-bold text-body mb-2`}
                >
                  {entry.title}
                </h2>

                {entry.tags && entry.tags.length > 0 && (
                  <div className="hidden sm:flex flex-wrap gap-1.5 mb-3">
                    {entry.tags.slice(0, MAX_VISIBLE_TAGS).map((tag, i) => {
                      const color = tagColorMap[tag];
                      return color ? (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                        </span>
                      ) : (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-accent-tint/50 text-accent-tint"
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                        </span>
                      );
                    })}
                    {entry.tags.length > MAX_VISIBLE_TAGS && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-muted">
                        +{entry.tags.length - MAX_VISIBLE_TAGS}
                      </span>
                    )}
                  </div>
                )}

                {entry.content && (
                  <div
                    className={`${getFontClass(font)} ${getFontSizeClass(fontSize)} leading-relaxed text-body line-clamp-3`}
                  >
                    {renderTextWithLineDirection(entry.content)}
                  </div>
                )}
              </button>

              <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                <div className={`${openMenuId === entry.id ? '' : 'md:invisible md:group-hover:visible md:group-focus-within:visible'} transition-all`}>
                  <EntryMenu
                    isOpen={openMenuId === entry.id}
                    onToggle={() => setOpenMenuId(openMenuId === entry.id ? null : entry.id)}
                    onCopy={() => { handleCopy(entry); setOpenMenuId(null); }}
                    onShare={() => { handleShare(entry); setOpenMenuId(null); }}
                    onChat={() => { onStartChat(entry); setOpenMenuId(null); }}
                    onDelete={() => { setEntryToDelete(entry); setOpenMenuId(null); }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-4" />

      {isLoadingMore && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted" />
        </div>
      )}

      <ConfirmModal
        isOpen={entryToDelete !== null}
        title="Delete Entry"
        message={`Are you sure you want to delete "${entryToDelete?.title || 'this entry'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setEntryToDelete(null)}
      />
    </div>
  );
};
