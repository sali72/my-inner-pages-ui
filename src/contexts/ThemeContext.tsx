import React, { createContext, useContext, useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { Mode, Accent, FontStyle, ContentFontSize } from '@/types';
import { buildThemeTokens } from '@/utils/themeTokens';
import { getAuthSession } from '@/utils/authSession';
import { api } from '@/utils/api';

interface ThemeContextValue {
  mode: Mode;
  accent: Accent;
  fontStyle: FontStyle;
  fontSize: ContentFontSize;
  resolvedMode: 'light' | 'dark';

  setMode: (m: Mode) => void;
  setAccent: (a: Accent) => void;
  setFontStyle: (f: FontStyle) => void;
  setFontSize: (s: ContentFontSize) => void;
  syncFromRemote: () => Promise<void>;
  resetToDefaults: () => void;
}

const LOCAL_KEY = 'my-inner-pages-theme';

interface PersistedSettings {
  mode: Mode;
  accent: Accent;
  fontStyle: FontStyle;
  fontSize: ContentFontSize;
}

const VALID_ACCENTS: Accent[] = ['sage', 'dusk', 'amber', 'slate', 'blush', 'ink', 'sand', 'moss'];
const VALID_MODES: Mode[] = ['light', 'dark', 'system'];
const VALID_FONTS: FontStyle[] = ['serif', 'sans', 'mono'];
const VALID_SIZES: ContentFontSize[] = ['small', 'medium', 'large', 'x-large'];

const DEFAULTS: PersistedSettings = {
  mode: 'system',
  accent: 'amber',
  fontStyle: 'serif',
  fontSize: 'medium',
};

function validate(raw: Partial<PersistedSettings>): PersistedSettings {
  return {
    mode: VALID_MODES.includes(raw.mode!) ? raw.mode! : DEFAULTS.mode,
    accent: VALID_ACCENTS.includes(raw.accent!) ? raw.accent! : DEFAULTS.accent,
    fontStyle: VALID_FONTS.includes(raw.fontStyle!) ? raw.fontStyle! : DEFAULTS.fontStyle,
    fontSize: VALID_SIZES.includes(raw.fontSize!) ? raw.fontSize! : DEFAULTS.fontSize,
  };
}

function readLocal(): PersistedSettings {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return validate(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to read theme settings locally:', error);
  }
  return { ...DEFAULTS };
}

function writeLocal(settings: PersistedSettings) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to write theme settings locally:', error);
  }
}

async function fetchRemote(): Promise<PersistedSettings | null> {
  try {
    const data = await api.get<{ preferences?: PersistedSettings }>('/auth/me');
    if (data.preferences) {
      return validate(data.preferences);
    }
  } catch (error) {
    console.error('Failed to fetch remote theme settings:', error);
  }
  return null;
}

async function saveRemote(settings: PersistedSettings, generation: number): Promise<boolean> {
  try {
    await api.put('/auth/me/preferences', settings);
    return generation === getAuthSession().generation;
  } catch {
    return false;
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Hydrate synchronously from localStorage so reloads don't flash the default
  // theme and logged-out users keep their preferences.
  const [settings, setSettings] = useState<PersistedSettings>(() => readLocal());
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const hydrated = useRef(false);

  // Debounce + sequence remote writes: rapid changes (sage → dusk → amber) are
  // coalesced into one PUT, and writes are chained in order so the last user
  // action is always the last one to reach the server — no last-resolver-wins
  // race that leaves server and UI out of sync.
  const pendingSettingsRef = useRef<PersistedSettings | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const sessionGenerationRef = useRef(getAuthSession().generation);

  useEffect(() => {
    const handleSessionChange = () => {
      sessionGenerationRef.current = getAuthSession().generation;
      pendingSettingsRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    window.addEventListener('auth:session-changed', handleSessionChange);
    return () => window.removeEventListener('auth:session-changed', handleSessionChange);
  }, []);

  const scheduleRemoteSave = useCallback((s: PersistedSettings) => {
    pendingSettingsRef.current = s;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const latest = pendingSettingsRef.current;
      pendingSettingsRef.current = null;
      if (!latest) return;
      const gen = getAuthSession().generation;
      if (gen !== sessionGenerationRef.current) return;
      saveChainRef.current = saveChainRef.current
        .then(() => gen === getAuthSession().generation ? saveRemote(latest, gen) : false)
        .catch(() => false);
    }, 400);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const syncFromRemote = useCallback(async () => {
    const gen = getAuthSession().generation;
    const remote = await fetchRemote();
    if (remote && gen === getAuthSession().generation) {
      writeLocal(remote);
      setSettings(remote);
    }
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings({ ...DEFAULTS });
  }, []);

  const resolvedMode: 'light' | 'dark' =
    settings.mode === 'system' ? (systemDark ? 'dark' : 'light') : settings.mode;

  const applyTokens = useCallback(() => {
    const tokens = buildThemeTokens({
      mode: settings.mode,
      accent: settings.accent,
      fontStyle: settings.fontStyle,
      fontSize: settings.fontSize,
    });

    const root = document.documentElement;
    Object.entries(tokens).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });

    root.setAttribute('data-mode', resolvedMode);
    root.setAttribute('data-accent', settings.accent);
    root.setAttribute('data-font-style', settings.fontStyle);
    root.setAttribute('data-font-size', settings.fontSize);

    root.style.colorScheme = resolvedMode;
  }, [settings, resolvedMode]);

  // Apply CSS tokens whenever settings OR resolvedMode changes. This must run
  // on OS dark/light toggle (resolvedMode flip) to swap the theme, but it does
  // NOT trigger a remote save — that's handled by the persist effect below,
  // which keys only on `settings` so toggling the OS theme doesn't spam
  // identical PUTs.
  useEffect(() => {
    applyTokens();
  }, [applyTokens]);

  // Persist settings: always write locally (sync, durable), and schedule a
  // debounced remote save. Skip the very first run so we don't overwrite the
  // server record with the just-hydrated local value on mount.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    writeLocal(settings);
    scheduleRemoteSave(settings);
  }, [settings, scheduleRemoteSave]);

  const setter = useCallback(<K extends keyof PersistedSettings>(
    key: K,
    value: PersistedSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const ctx = useMemo<ThemeContextValue>(() => ({
    mode: settings.mode,
    accent: settings.accent,
    fontStyle: settings.fontStyle,
    fontSize: settings.fontSize,
    resolvedMode,
    setMode: (m) => setter('mode', m),
    setAccent: (a) => setter('accent', a),
    setFontStyle: (f) => setter('fontStyle', f),
    setFontSize: (s) => setter('fontSize', s),
    syncFromRemote,
    resetToDefaults,
  }), [settings, resolvedMode, setter, syncFromRemote, resetToDefaults]);

  return (
    <ThemeContext.Provider value={ctx}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
