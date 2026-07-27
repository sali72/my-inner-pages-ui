import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Copy, Share2, Plus, X, Calendar,
  MessageCircle, Trash2, MoreVertical, AlertCircle, CloudOff, Loader2, RefreshCw
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Collaboration } from '@tiptap/extension-collaboration';
import { Placeholder } from '@tiptap/extension-placeholder';


import { JournalEntry, FontStyle, ContentFontSize } from '@/types';
import { getFontClass, getFontSizeClass } from '@utils/fonts';
import { detectRTL } from '@utils/textDirection';
import { ConfirmModal } from './ConfirmModal';
import { isEntryUnsynced, saveUnsyncedEntry, removeUnsyncedEntry } from '@utils/offlineStorage';
import { useJournalDoc } from '@hooks/useJournalDoc';

interface JournalPageProps {
  entry: JournalEntry;
  font: FontStyle;
  fontSize: ContentFontSize;
  isNew?: boolean;
  allAppTags?: string[];
  tagColorMap?: Record<string, string | null>;
  onUpdate?: (updates: Partial<JournalEntry>) => void;
  onUpdateById?: (id: string | number, updates: Partial<JournalEntry>) => Promise<void>;
  onCreate?: (title: string, content: string, tags: string[], created_at?: string) => Promise<number | string>;
  onDelete: () => void;
  onChat: () => void;
  onBack: () => void;
}

type SaveStatus = 'error' | 'unsynced' | null;

const SaveIndicator: React.FC<{ status: SaveStatus; onRetry?: () => void }> = ({ status, onRetry }) => {
  if (!status) return null;
  const styles: Record<string, { icon: React.ReactNode; text: string; cls: string }> = {
    error: { icon: <AlertCircle className="w-3 h-3" />, text: 'Couldn\'t save', cls: 'text-red-500' },
    unsynced: { icon: <CloudOff className="w-3 h-3" />, text: 'Unsynced (Saved locally)', cls: 'text-amber-500' },
  };
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${s.cls}`}>
      {s.icon}{s.text}
      {onRetry && (
        <button onClick={onRetry} className="ml-1 p-0.5 rounded hover:bg-accent-tint transition-colors" aria-label="Retry save">
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </span>
  );
};

function parseHashTags(text: string): string[] {
  const matches = text.match(/#([\w-]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

function stripHashTag(text: string, tag: string): string {
  return text.replace(new RegExp(`#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), '').replace(/\s+/g, ' ').trim();
}

function isRealId(v: string | number | null): boolean {
  return v !== null && v !== 'pending' && !v.toString().startsWith('draft-');
}

export const JournalPage: React.FC<JournalPageProps> = ({
  entry,
  font,
  fontSize,
  isNew = false,
  allAppTags = [],
  tagColorMap = {},
  onUpdate,
  onUpdateById,
  onCreate,
  onDelete,
  onChat,
  onBack,
}) => {
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [explicitTags, setExplicitTags] = useState<string[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(() => {
    return isEntryUnsynced(entry.id) ? 'unsynced' : null;
  });
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInputValue, setTagInputValue] = useState('');
  const [tagAutoActiveIndex, setTagAutoActiveIndex] = useState(0);

  const [entryDate, setEntryDate] = useState(() => {
    if (entry.created_at) {
      const d = new Date(entry.created_at);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day}T${hours}:${mins}`;
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = now.getDate();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${String(day).padStart(2, '0')}T${hours}:${mins}`;
  });
  const dateInputRef = useRef<HTMLInputElement>(null);

  const formattedDate = useMemo(() => {
    const d = new Date(entryDate);
    return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }, [entryDate]);

  const [showAuto, setShowAuto] = useState(false);
  const [autoQuery, setAutoQuery] = useState('');
  const [autoPos, setAutoPos] = useState({ top: 0, left: 0 });
  const autoTriggerPosRef = useRef(0);
  const [autoActiveIndex, setAutoActiveIndex] = useState(0);

  const menuRef = useRef<HTMLDivElement>(null);
  const autoRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const entryIdRef = useRef<string | number | null>(isNew ? null : entry.id);
  const creationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable Yjs doc ID — captured once at mount so the persistence doesn't
  // switch databases when transitioning from 'new' to a real entry ID.
  const docEntryId = useMemo(() => entry.id, []);
  const { ydoc, isLoaded } = useJournalDoc(docEntryId, entry.title);

  const checkAutocomplete = useCallback((ed: any) => {
    const { from } = ed.state.selection;
    const $from = ed.state.selection.$from;
    const textBefore = $from.parent.textBetween(0, $from.parentOffset);
    const match = textBefore.match(/(?:^|\s)(#([\w-]*))$/);

    if (match) {
      setAutoQuery(match[2]);
      setShowAuto(true);
      autoTriggerPosRef.current = from - match[1].length;
      
      const coords = ed.view.coordsAtPos(from);
      setAutoPos({
        top: coords.top + window.scrollY,
        left: coords.left + window.scrollX,
      });
    } else {
      setShowAuto(false);
    }
  }, []);

  // 2. Initialize Tiptap Editor with Collaboration Support
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Collaboration.configure({
        document: ydoc,
        field: 'content',
      }),
      Placeholder.configure({
        placeholder: isNew ? 'Begin writing your story...' : 'Begin writing...',
      }),
    ],
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[8rem] leading-relaxed text-body placeholder:text-muted/40',
        style: 'unicode-bidi: plaintext;',
      },
    },
    onUpdate: ({ editor: ed }) => {
      setContent(ed.getText());
      checkAutocomplete(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      checkAutocomplete(ed);
    },
  }, [ydoc]);

  // Handle local database migration when a draft receives a real backend ID
  useEffect(() => {
    const handleIdMigrated = (e: Event) => {
      const { oldId, newId } = (e as CustomEvent).detail;
      const currentActiveId = isNew ? entryIdRef.current : entry.id;
      if (currentActiveId === oldId) {
        entryIdRef.current = newId;
      }
    };
    window.addEventListener('journal:id-migrated', handleIdMigrated);
    return () => window.removeEventListener('journal:id-migrated', handleIdMigrated);
  }, [entry.id, isNew]);

  // Populate Tiptap if the local document is uninitialized
  useEffect(() => {
    if (editor && isLoaded) {
      const contentFragment = ydoc.getXmlFragment('content');
      if (contentFragment.length === 0 && entry.content) {
        editor.commands.setContent(entry.content);
      }
    }
  }, [editor, isLoaded, entry.content, ydoc]);

  // Handle loaded IndexedDB Title
  useEffect(() => {
    if (isLoaded) {
      const localTitle = ydoc.getText('title').toString();
      if (localTitle) {
        setTitle(localTitle);
      }
    }
  }, [isLoaded, ydoc]);

  useEffect(() => {
    const fromContent = parseHashTags(entry.content || '');
    const fromContentSet = new Set(fromContent);
    const orphaned = (entry.tags || []).filter(t => !fromContentSet.has(t));
    setExplicitTags(orphaned);
  }, [entry.id]);

  const parsedTags = useMemo(() => parseHashTags(content), [content]);

  const allTags = useMemo(() => {
    return [...new Set([...explicitTags, ...parsedTags])];
  }, [explicitTags, parsedTags]);

  const filteredAutoTags = useMemo(() => {
    if (!showAuto) return [];
    return allAppTags.filter(t =>
      t.toLowerCase().includes(autoQuery.toLowerCase())
    );
  }, [showAuto, autoQuery, allAppTags]);

  const filteredTagInputSuggestions = useMemo(() => {
    if (!showTagInput || !tagInputValue) return [];
    const q = tagInputValue.toLowerCase();
    return allAppTags.filter(t =>
      t.toLowerCase().includes(q) && !allTags.includes(t)
    );
  }, [showTagInput, tagInputValue, allAppTags, allTags]);

  useEffect(() => {
    if (showTagInput && tagInputRef.current) tagInputRef.current.focus();
  }, [showTagInput]);

  useEffect(() => {
    if (saveStatus === 'unsynced' && !isEntryUnsynced(entry.id)) {
      setSaveStatus(null);
    }
  }, [entry.id, saveStatus]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  useEffect(() => {
    if (!showAuto) return;
    const handleClick = (e: MouseEvent) => {
      if (autoRef.current && !autoRef.current.contains(e.target as Node) &&
          editor && !editor.view.dom.contains(e.target as Node)) {
        setShowAuto(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAuto, editor]);

  // Sync title input updates to Y.Doc
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (isLoaded) {
      ydoc.transact(() => {
        const titleText = ydoc.getText('title');
        titleText.delete(0, titleText.length);
        titleText.insert(0, val);
      });
    }
  };

  const save = useCallback(async () => {
    const isoDate = entryDate ? new Date(entryDate).toISOString() : undefined;

    const draftCheckId = entryIdRef.current;
    if (isNew && !isRealId(draftCheckId) && (title.trim() || content.trim() || allTags.length > 0)) {
      // If we are offline and this is a draft, we delegate creation to handleCreateEntry fallback
      if (draftCheckId && draftCheckId.toString().startsWith('draft-')) {
        // Already mapped to offline draft, save updates locally
        const updatedEntry: JournalEntry = {
          id: draftCheckId,
          title: title.trim(),
          content: content.trim(),
          tags: allTags,
          created_at: isoDate,
          date: entryDate || new Date().toLocaleString(),
        };
        saveUnsyncedEntry(updatedEntry);
        setSaveStatus('unsynced');
        return;
      }

      entryIdRef.current = 'pending';
      try {
        const id = await onCreate!(title, content, allTags, isoDate);
        entryIdRef.current = id;
      } catch {
        // Creation failed (likely offline). Trigger local-first draft creation fallback
        const tempId = `draft-${Date.now()}`;
        entryIdRef.current = tempId;
        const updatedEntry: JournalEntry = {
          id: tempId,
          title: title.trim(),
          content: content.trim(),
          tags: allTags,
          created_at: isoDate,
          date: entryDate || new Date().toLocaleString(),
        };
        saveUnsyncedEntry(updatedEntry);
        setSaveStatus('unsynced');

        if (onUpdateById) {
          await onUpdateById(tempId, updatedEntry);
        }
      }
      return;
    }

    const currentActiveId = isNew ? entryIdRef.current : entry.id;
    if (isNew && isRealId(currentActiveId)) {
      const realId = currentActiveId as string | number;
      try {
        await onUpdateById!(realId, { title: title.trim(), content: content.trim(), tags: allTags, created_at: isoDate });
        removeUnsyncedEntry(realId);
      } catch {
        const updatedEntry: JournalEntry = {
          id: realId,
          title: title.trim(),
          content: content.trim(),
          tags: allTags,
          created_at: isoDate,
          date: entryDate || new Date().toLocaleString(),
        };
        saveUnsyncedEntry(updatedEntry);
        setSaveStatus('unsynced');
      }
      return;
    }

    if (isNew) return;

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const dateChanged = isoDate
      ? !entry.created_at || Math.abs(new Date(isoDate).getTime() - new Date(entry.created_at).getTime()) > 1000
      : false;
    if (
      trimmedTitle !== entry.title ||
      trimmedContent !== entry.content ||
      JSON.stringify(allTags) !== JSON.stringify(entry.tags) ||
      dateChanged
    ) {
      try {
        await onUpdate!({ title: trimmedTitle, content: trimmedContent, tags: allTags, created_at: isoDate });
        removeUnsyncedEntry(entry.id);
      } catch (error) {
        const updatedEntry: JournalEntry = {
          ...entry,
          title: trimmedTitle,
          content: trimmedContent,
          tags: allTags,
          created_at: isoDate || entry.created_at,
          date: entryDate || entry.date,
        };
        saveUnsyncedEntry(updatedEntry);
        setSaveStatus('unsynced');
      }
    }
  }, [isNew, title, content, allTags, entryDate, entry, onCreate, onUpdate, onUpdateById]);

  const handleRetry = useCallback(async () => {
    if (isNew && entryIdRef.current?.toString().startsWith('draft-')) {
      entryIdRef.current = null;
    }
    await save();
  }, [isNew, save]);

  const persistLocally = useCallback(() => {
    const id = isNew ? entryIdRef.current : entry.id;
    if (!id || id === 'pending') return;

    const isoDate = entryDate ? new Date(entryDate).toISOString() : undefined;
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const dateChanged = !isNew && isoDate
      ? !entry.created_at || Math.abs(new Date(isoDate).getTime() - new Date(entry.created_at).getTime()) > 1000
      : false;
    const hasChanges = isNew
      ? trimmedTitle !== '' || trimmedContent !== '' || allTags.length > 0
      : trimmedTitle !== entry.title ||
        trimmedContent !== entry.content ||
        JSON.stringify(allTags) !== JSON.stringify(entry.tags) ||
        dateChanged;
    if (!hasChanges) return;

    saveUnsyncedEntry({
      ...(isNew ? {} : entry),
      id,
      title: trimmedTitle,
      content: trimmedContent,
      tags: allTags,
      created_at: isoDate || entry.created_at,
      date: entryDate || entry.date,
    });
  }, [isNew, title, content, allTags, entryDate, entry]);

  useEffect(() => {
    if (isNew) return;
    const timer = setTimeout(() => save(), 1500);
    return () => clearTimeout(timer);
  }, [title, content, allTags, isNew, save]);

  useEffect(() => {
    if (!isNew || entryIdRef.current !== null) return;
    if (title.trim() || content.trim() || allTags.length > 0) {
      if (creationTimerRef.current) clearTimeout(creationTimerRef.current);
      creationTimerRef.current = setTimeout(() => save(), 600);
    }
    return () => {
      if (creationTimerRef.current) clearTimeout(creationTimerRef.current);
    };
  }, [title, content, allTags, isNew, save]);

  useEffect(() => {
    const handleBeforeUnload = () => { persistLocally(); };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') persistLocally();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [persistLocally]);

  useEffect(() => {
    return () => {
      if (creationTimerRef.current) clearTimeout(creationTimerRef.current);
    };
  }, []);

  // Clean up the IndexedDB database for 'new' entries to prevent stale content
  // from reappearing when the user creates another new entry later.
  useEffect(() => {
    return () => {
      if (docEntryId === 'new') {
        const dbName = `my-inner-pages-journal-new`;
        indexedDB.deleteDatabase(dbName);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = useCallback(async () => {
    await save();
    onBack();
  }, [save, onBack]);

  const removeTag = (tag: string) => {
    setExplicitTags(prev => prev.filter(t => t !== tag));
    if (editor) {
      const text = editor.getText();
      const newText = stripHashTag(text, tag);
      editor.commands.setContent(newText);
    }
  };

  const addTagDirect = (name: string) => {
    const t = name.trim().toLowerCase();
    if (t && !allTags.includes(t)) {
      setExplicitTags(prev => [...prev, t]);
    }
    setShowTagInput(false);
    setTagInputValue('');
  };

  const selectAutoTag = (tag: string) => {
    if (!editor) return;
    const from = autoTriggerPosRef.current;
    const to = editor.state.selection.from;
    
    editor.chain()
      .focus()
      .insertContentAt({ from, to }, `#${tag} `)
      .run();
      
    setShowAuto(false);
  };

  // Keyboard navigation for floating autocomplete dropdown
  useEffect(() => {
    const el = editor?.view.dom;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showAuto) return;
      if (e.key === 'Escape') {
        setShowAuto(false);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'Enter') {
        if (filteredAutoTags.length > 0) {
          selectAutoTag(filteredAutoTags[autoActiveIndex]);
        } else if (autoQuery) {
          selectAutoTag(autoQuery);
        }
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'ArrowDown') {
        setAutoActiveIndex(i => Math.min(i + 1, filteredAutoTags.length - 1));
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'ArrowUp') {
        setAutoActiveIndex(i => Math.max(i - 1, 0));
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener('keydown', handleKeyDown, true);
    return () => el.removeEventListener('keydown', handleKeyDown, true);
  }, [editor, showAuto, filteredAutoTags, autoActiveIndex, autoQuery]);

  useEffect(() => {
    setAutoActiveIndex(0);
  }, [showAuto, autoQuery]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(`${entry.title}\n\n${content}`);
    } catch {}
    setShowMenu(false);
  };

  const shareEntry = async () => {
    const text = `${entry.title}\n\n${content}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: entry.title, text });
      } else {
        await copyToClipboard();
      }
    } catch {}
    setShowMenu(false);
  };

  const handleDeleteClick = () => { setShowDeleteConfirm(true); setShowMenu(false); };
  const handleConfirmDelete = () => { onDelete(); setShowDeleteConfirm(false); };

  if (!isLoaded) {
    return (
      <div className="w-full max-w-2xl mx-auto flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted/50" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto relative flex flex-col flex-1">
      <div
        className="sticky top-0 z-20 pt-4 pb-2 px-6 md:px-8"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <div className="flex items-start justify-between h-8">
          <button
            onClick={handleBack}
            className="p-1 rounded-md text-muted/50 hover:text-muted transition-colors"
            aria-label="Back to journal"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {!isNew && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded-md text-muted/50 hover:text-muted transition-colors"
                aria-label="Entry options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <div className="absolute right-0 mt-2 min-w-[12rem] rounded-lg shadow-card-lg z-20 card py-1">
                  <button onClick={() => { copyToClipboard(); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-body hover:bg-accent-tint transition-all">
                    <Copy className="w-4 h-4" />Copy
                  </button>
                  <button onClick={() => { shareEntry(); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-body hover:bg-accent-tint transition-all">
                    <Share2 className="w-4 h-4" />Share
                  </button>
                  <button onClick={() => { onChat(); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-body hover:bg-accent-tint transition-all">
                    <MessageCircle className="w-4 h-4" />Chat
                  </button>
                  <div className="h-px bg-border-default my-2" />
                  <button onClick={handleDeleteClick}
                    className="w-full flex items-center gap-3 px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all">
                    <Trash2 className="w-4 h-4" />Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className="flex items-center gap-3 px-6 md:px-8"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <button
          onClick={() => dateInputRef.current?.showPicker?.()}
          className="inline-flex items-center gap-1.5 text-xs text-muted/50 hover:text-muted transition-colors text-left"
          aria-label={`Edit date: ${formattedDate}`}
        >
          <Calendar className="w-3 h-3" />
          {formattedDate}
        </button>
        <input
          ref={dateInputRef}
          type="datetime-local"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              dateInputRef.current?.showPicker?.();
            }
          }}
          className="sr-only"
          tabIndex={0}
        />
        <SaveIndicator status={saveStatus} onRetry={saveStatus ? handleRetry : undefined} />
      </div>

      <div
        className="flex flex-col flex-1 px-6 md:px-8 pt-4 pb-12"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onBlur={() => save()}
          placeholder="Title..."
          className={`w-full text-3xl md:text-4xl ${getFontClass(font)} font-bold text-body bg-transparent border-none focus:outline-none p-0 mb-4`}
          style={{ direction: detectRTL(title) ? 'rtl' : 'ltr' }}
          autoFocus={isNew}
        />

        <div className="flex flex-wrap items-center gap-1.5 mb-6 min-h-[1.5rem]">
          {allTags.map((tag) => {
            const color = tagColorMap[tag];
            return color ? (
              <span key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs group"
                style={{ backgroundColor: `${color}20`, color }}
              >
                #{tag}
                <button onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 hover:text-red-500 transition-all">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : (
              <span key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-accent-tint/50 text-accent-tint group"
              >
                #{tag}
                <button onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 hover:text-red-500 transition-all">
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          {!showTagInput && (
            <button onClick={() => setShowTagInput(true)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs text-muted/30 hover:text-muted hover:bg-accent-tint/30 transition-colors">
              <Plus className="w-3 h-3" />
            </button>
          )}
          {showTagInput && (
            <div className="relative inline-block">
              <input
                ref={tagInputRef}
                type="text"
                value={tagInputValue}
                onChange={(e) => { setTagInputValue(e.target.value); setTagAutoActiveIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (filteredTagInputSuggestions.length > 0) {
                      addTagDirect(filteredTagInputSuggestions[tagAutoActiveIndex]);
                    } else {
                      addTagDirect(tagInputValue);
                    }
                    e.preventDefault();
                  }
                  if (e.key === 'Escape') { setShowTagInput(false); setTagInputValue(''); }
                  if (e.key === 'ArrowDown') {
                    setTagAutoActiveIndex(i => Math.min(i + 1, filteredTagInputSuggestions.length - 1));
                    e.preventDefault();
                  }
                  if (e.key === 'ArrowUp') {
                    setTagAutoActiveIndex(i => Math.max(i - 1, 0));
                    e.preventDefault();
                  }
                }}
                onBlur={() => {
                  // Delay to allow click on dropdown item
                  setTimeout(() => addTagDirect(tagInputValue), 150);
                }}
                placeholder="Tag"
                className="px-2 py-0.5 rounded text-xs input-field w-28"
              />
              {filteredTagInputSuggestions.length > 0 && (
                <div className="absolute top-full left-0 mt-1 z-50 card py-1 shadow-elevated min-w-[8rem] max-h-40 overflow-y-auto">
                  {filteredTagInputSuggestions.map((tag, i) => {
                    const color = tagColorMap[tag];
                    return (
                      <button
                        key={tag}
                        onMouseDown={(e) => { e.preventDefault(); addTagDirect(tag); }}
                        onMouseEnter={() => setTagAutoActiveIndex(i)}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          i === tagAutoActiveIndex ? 'bg-accent-tint text-accent' : 'text-body hover:bg-accent-tint'
                        }`}
                      >
                        {color && <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: color }} />}
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`relative flex-1 flex ${getFontClass(font)} ${getFontSizeClass(fontSize)}`}>
          <EditorContent editor={editor} className="w-full flex-1" />

          {showAuto && (
            <div
              ref={autoRef}
              className="fixed z-50 card py-1 shadow-elevated min-w-[10rem] max-h-48 overflow-y-auto"
              style={{
                top: Math.min(autoPos.top, window.innerHeight - 250) + 'px',
                left: Math.min(autoPos.left, window.innerWidth - 200) + 'px',
              }}
            >
              {filteredAutoTags.length > 0 ? (
                filteredAutoTags.map((tag, i) => (
                  <button key={tag}
                    onMouseDown={(e) => { e.preventDefault(); selectAutoTag(tag); }}
                    onMouseEnter={() => setAutoActiveIndex(i)}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                      i === autoActiveIndex ? 'bg-accent-tint text-accent' : 'text-body hover:bg-accent-tint'
                    }`}
                  >
                    #{tag}
                  </button>
                ))
              ) : autoQuery ? (
                <button
                  onMouseDown={(e) => { e.preventDefault(); selectAutoTag(autoQuery); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-muted hover:bg-accent-tint transition-colors"
                >
                  Create "#{autoQuery}"
                </button>
              ) : (
                <div className="px-3 py-2 text-xs text-muted">No tags yet</div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Entry"
        message="Are you sure you want to delete this entry? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};
