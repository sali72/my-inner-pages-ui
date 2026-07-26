import React, { useState } from 'react';
import { X, Pencil, Trash2, Palette, Tags, Hash } from 'lucide-react';
import { useAllTags, useRenameTag, useDeleteTag, useUpdateTagColor } from '@hooks/useTags';

const COLOR_PRESETS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e91e63', '#795548', '#607d8b',
];

interface TagManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TagManager: React.FC<TagManagerProps> = ({ isOpen, onClose }) => {
  const { data: tags = [] } = useAllTags();
  const renameTag = useRenameTag();
  const deleteTag = useDeleteTag();
  const updateTagColor = useUpdateTagColor();

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [colorPicker, setColorPicker] = useState<string | null>(null);
  const [showCloud, setShowCloud] = useState(false);

  if (!isOpen) return null;

  const maxUsage = tags.length > 0 ? Math.max(...tags.map(t => t.usage_count)) : 1;

  const handleStartRename = (tagName: string) => {
    setEditingTag(tagName);
    setRenameValue(tagName);
    setColorPicker(null);
  };

  const handleRename = async () => {
    if (!editingTag || !renameValue.trim()) return;
    try {
      await renameTag.mutateAsync({ oldName: editingTag, newName: renameValue.trim() });
      setEditingTag(null);
      setRenameValue('');
    } catch (error) {
      console.error('Failed to update tag:', error);
    }
  };

  const handleDelete = async (tagName: string) => {
    try {
      await deleteTag.mutateAsync(tagName);
      setConfirmDelete(null);
    } catch (error) {
      console.error('Failed to delete tag:', error);
    }
  };

  const handleColorChange = async (tagName: string, color: string | null) => {
    try {
      await updateTagColor.mutateAsync({ name: tagName, color });
      setColorPicker(null);
    } catch (error) {
      console.error('Failed to update tag:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative card rounded-xl shadow-elevated max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <h2 className="text-lg font-semibold text-body">Manage Tags</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCloud(!showCloud)}
              className={`p-1.5 rounded-md transition-colors ${showCloud ? 'bg-accent-tint text-accent' : 'text-muted hover:text-body hover:bg-accent-tint/30'}`}
              aria-label={showCloud ? 'List view' : 'Cloud view'}
            >
              <Tags className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1 rounded-md text-muted hover:text-body hover:bg-accent-tint/30 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tags.length === 0 && (
            <p className="text-sm text-muted text-center py-8">No tags yet. Tags appear when you add them to your journal entries.</p>
          )}

          {showCloud ? (
            <div className="flex flex-wrap gap-2 justify-center py-4">
              {tags.map((tag) => {
                const ratio = tag.usage_count / maxUsage;
                const size = Math.max(0.7, Math.min(2, 0.7 + ratio * 1.3));
                const color = tag.color || 'var(--accent-tint)';
                return (
                  <span
                    key={tag.name}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full transition-transform hover:scale-110"
                    style={{
                      fontSize: `${size}rem`,
                      backgroundColor: `${color}20`,
                      color: color,
                    }}
                  >
                    <Hash className="w-3 h-3" style={{ width: `${size * 0.6}rem`, height: `${size * 0.6}rem` }} />
                    {tag.name}
                    <span className="opacity-60 text-xs" style={{ fontSize: `${Math.max(0.6, size * 0.6)}rem` }}>
                      {tag.usage_count}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div key={tag.name} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent-tint/20 transition-colors group relative">
                  <button
                    onClick={() => setColorPicker(colorPicker === tag.name ? null : tag.name)}
                    className="flex-shrink-0 w-5 h-5 rounded-full border border-border-default flex items-center justify-center hover:scale-110 transition-transform"
                    style={{ backgroundColor: tag.color || 'transparent' }}
                    aria-label={`Change color for ${tag.name}`}
                  >
                    {!tag.color && <Palette className="w-3 h-3 text-muted/50" />}
                  </button>

                  {colorPicker === tag.name && (
                    <div className="absolute z-10 top-full left-0 mt-1 p-2 card shadow-elevated rounded-lg flex gap-1">
                      {COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          onClick={() => handleColorChange(tag.name, tag.color === c ? null : c)}
                          className="w-6 h-6 rounded-full border border-border-default hover:scale-110 transition-transform"
                          style={{ backgroundColor: c }}
                          aria-label={c}
                        />
                      ))}
                    </div>
                  )}

                  {editingTag === tag.name ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename();
                        if (e.key === 'Escape') { setEditingTag(null); setRenameValue(''); }
                      }}
                      onBlur={handleRename}
                      className="flex-1 px-2 py-0.5 rounded text-sm input-field"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 text-sm text-body">{tag.name}</span>
                  )}

                  <span className="text-xs text-muted tabular-nums">{tag.usage_count}</span>

                  <button
                    onClick={() => handleStartRename(tag.name)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-accent transition-all"
                    aria-label={`Rename ${tag.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  {confirmDelete === tag.name ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(tag.name)} className="px-2 py-0.5 rounded text-xs bg-red-500 text-white hover:bg-red-600 transition-colors">Confirm</button>
                      <button onClick={() => setConfirmDelete(null)} className="px-2 py-0.5 rounded text-xs text-muted hover:text-body transition-colors">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(tag.name)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-red-500 transition-all"
                      aria-label={`Delete ${tag.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
