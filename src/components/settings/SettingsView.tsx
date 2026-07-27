import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, LogOut, Check, Mail, Palette, BookOpen, User } from 'lucide-react';
import { Mode, Accent, FontStyle, ContentFontSize } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmModal } from '@components/journal';

import { ActiveSessionsCard } from './ActiveSessionsCard';

const FONT_FAMILIES: Record<FontStyle, string> = {
  serif: "'Lora', Georgia, serif",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
};

interface SettingsViewProps {
  mode: Mode;
  accent: Accent;
  fontStyle: FontStyle;
  fontSize: ContentFontSize;
  onModeChange: (m: Mode) => void;
  onAccentChange: (a: Accent) => void;
  onFontStyleChange: (f: FontStyle) => void;
  onFontSizeChange: (s: ContentFontSize) => void;
}

const ACCENTS: { value: Accent; label: string; light: string; dark: string }[] = [
  { value: 'sage', label: 'Sage', light: '#5a8a6a', dark: '#7ab890' },
  { value: 'dusk', label: 'Dusk', light: '#7a6caa', dark: '#a898d0' },
  { value: 'amber', label: 'Amber', light: '#92400e', dark: '#d48a50' },
  { value: 'slate', label: 'Slate', light: '#607080', dark: '#8aaabb' },
  { value: 'blush', label: 'Blush', light: '#c0607a', dark: '#d888a0' },
  { value: 'ink', label: 'Ink', light: '#3a5896', dark: '#6888c4' },
  { value: 'sand', label: 'Sand', light: '#c4a664', dark: '#d4b880' },
  { value: 'moss', label: 'Moss', light: '#4d7a6a', dark: '#70a090' },
];

const FONT_STYLES: { value: FontStyle; label: string; preview: string }[] = [
  { value: 'serif', label: 'Serif', preview: 'Lora' },
  { value: 'sans', label: 'Sans', preview: 'Inter' },
  { value: 'mono', label: 'Mono', preview: 'JetBrains Mono' },
];

const FONT_SIZES: { value: ContentFontSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'x-large', label: 'X-Large' },
];

const MODE_ICONS: Record<string, React.ReactNode> = {
  light: <Sun className="w-5 h-5" />,
  dark: <Moon className="w-5 h-5" />,
  system: <Monitor className="w-5 h-5" />,
};

const PREVIEW_TEXT = {
  title: 'A Quiet Morning',
  date: 'May 30, 2026',
  tags: ['reflection', 'morning'],
  body: 'The light filters through the window in that particular way it only does in spring. I find myself thinking about how small moments carry the most weight — the sound of coffee brewing, a page turning, the distant hum of the city waking up.',
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  mode,
  accent,
  fontStyle,
  fontSize,
  onModeChange,
  onAccentChange,
  onFontStyleChange,
  onFontSizeChange,
}) => {
  const { logout, user } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const prevSettings = useRef({ mode, accent, fontStyle, fontSize });

  useEffect(() => {
    const current = { mode, accent, fontStyle, fontSize };
    if (JSON.stringify(current) !== JSON.stringify(prevSettings.current)) {
      prevSettings.current = current;
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [mode, accent, fontStyle, fontSize]);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    await logout();
  };

  const handleReset = () => {
    onModeChange('system');
    onAccentChange('sage');
    onFontStyleChange('sans');
    onFontSizeChange('medium');
  };

  return (
    <>
      <div className="max-w-2xl mx-auto p-4 pt-6 space-y-5">
        <div
          className={`flex justify-center transition-all duration-300 ${
            showSaved ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 text-xs text-accent bg-accent-tint px-3 py-1 rounded-full">
            <Check className="w-3 h-3" />
            All changes saved
          </span>
        </div>

        <section className="bg-[var(--bg-elevated)] border border-subtle rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-secondary" />
            <h2 className="text-base font-semibold text-primary">Appearance</h2>
          </div>

          <div>
            <label className="text-sm font-medium text-primary mb-2 block">Mode</label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Appearance mode">
              {(['light', 'dark', 'system'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => onModeChange(m)}
                  role="radio"
                  aria-checked={mode === m}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border transition-all text-sm ${
                    mode === m
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface text-primary border-default hover:border-hover'
                  }`}
                >
                  {MODE_ICONS[m]}
                  <span className="capitalize">{m}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-primary mb-2 block">Accent Color</label>
            <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map(({ value, label, light }) => (
                <button
                  key={value}
                  onClick={() => onAccentChange(value)}
                  role="radio"
                  aria-checked={accent === value}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    accent === value
                      ? 'border-accent bg-accent-tint'
                      : 'border-default hover:border-hover'
                  }`}
                >
                  <span
                    className="w-8 h-8 rounded-full border border-white/20 shadow-sm"
                    style={{ background: light }}
                  />
                  <span className="text-xs text-secondary">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--bg-elevated)] border border-subtle rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-secondary" />
            <h2 className="text-base font-semibold text-primary">Reading</h2>
          </div>

          <div>
            <label id="font-style-label" className="text-sm font-medium text-primary mb-2 block">Font Style</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-labelledby="font-style-label">
              {FONT_STYLES.map(({ value, label, preview }) => (
                <button
                  key={value}
                  onClick={() => onFontStyleChange(value)}
                  role="radio"
                  aria-checked={fontStyle === value}
                  className={`p-4 rounded-lg border-2 transition-all text-center ${
                    fontStyle === value
                      ? 'border-accent bg-accent-tint'
                      : 'border-default hover:border-hover'
                  }`}
                >
                  <p className="text-lg font-semibold text-primary" style={{ fontFamily: FONT_FAMILIES[value] }}>
                    {preview}
                  </p>
                  <p className="text-xs text-secondary mt-1">{label}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label id="font-size-label" className="text-sm font-medium text-primary mb-2 block">Font Size</label>
            <div className="flex gap-2" role="radiogroup" aria-labelledby="font-size-label">
              {FONT_SIZES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onFontSizeChange(value)}
                  role="radio"
                  aria-checked={fontSize === value}
                  className={`flex-1 py-2.5 rounded-lg border-2 transition-all text-sm ${
                    fontSize === value
                      ? 'border-accent bg-accent-tint text-accent'
                      : 'border-default text-primary hover:border-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-primary mb-2 block">Preview</label>
            <div className="content-typography border border-subtle rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-xs font-medium text-accent">{PREVIEW_TEXT.date}</span>
                  <h3 className="text-xl font-bold text-primary mt-0.5">{PREVIEW_TEXT.title}</h3>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PREVIEW_TEXT.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 rounded-full text-xs bg-accent-tint text-accent-tint"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-primary leading-relaxed">{PREVIEW_TEXT.body}</p>
            </div>
          </div>
        </section>

        <ActiveSessionsCard />

        <section className="bg-[var(--bg-elevated)] border border-subtle rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-secondary" />
            <h2 className="text-base font-semibold text-primary">Account</h2>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-surface border border-default">
            <div className="w-9 h-9 rounded-full bg-accent-tint flex items-center justify-center">
              <User className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary truncate">{user?.email}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href="mailto:support@innerpages.ir"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-default bg-surface text-primary hover:bg-surface-hover transition-all text-sm"
            >
              <Mail className="w-4 h-4" />
              Contact support
            </a>
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-default bg-surface text-primary hover:bg-surface-hover transition-all text-sm"
            >
              Reset defaults
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/5 transition-all text-sm"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </section>
      </div>

      <ConfirmModal
        isOpen={showLogoutModal}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmLabel="Logout"
        variant="danger"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutModal(false)}
      />
    </>
  );
};
