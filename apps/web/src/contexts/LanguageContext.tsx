'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import enMessages from '../messages/en.json';
import ruMessages from '../messages/ru.json';

export type AppLanguage = 'en' | 'ru';

type MessageMap = Record<string, string>;

const messages: Record<AppLanguage, MessageMap> = {
  en: enMessages,
  ru: ruMessages,
};

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (nextLanguage: AppLanguage) => void;
  toggleLanguage: () => void;
  /**
   * Translate a message key or inline pair.
   *
   * **Keyed mode (preferred):** `t('header.feeds')` — looks up key in
   * en.json / ru.json.
   *
   * **Legacy inline mode:** `t('English', 'Russian')` — returns the
   * appropriate string directly.  Use keyed mode for new code.
   */
  t: (keyOrEnglish: string, russian?: string) => string;
}

const STORAGE_KEY = 'finishit-language';
const DEFAULT_LANGUAGE: AppLanguage = 'en';

const translateFromDefaultMessages = (
  keyOrEnglish: string,
  russian?: string,
): string => {
  if (russian !== undefined) {
    return keyOrEnglish;
  }
  return messages.en[keyOrEnglish] ?? keyOrEnglish;
};

const defaultContextValue: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
  t: (keyOrEnglish, russian) =>
    translateFromDefaultMessages(keyOrEnglish, russian),
};

const LanguageContext =
  createContext<LanguageContextValue>(defaultContextValue);

const parseLanguage = (raw: string | null): AppLanguage | null => {
  if (raw === 'en' || raw === 'ru') {
    return raw;
  }
  return null;
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    try {
      const storedLanguage = parseLanguage(
        window.localStorage.getItem(STORAGE_KEY),
      );
      if (storedLanguage) {
        setLanguageState(storedLanguage);
      }
    } catch {
      // ignore localStorage read errors
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // ignore localStorage write errors
    }
  }, [language]);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((current) => (current === 'en' ? 'ru' : 'en'));
  }, []);

  const t = useCallback(
    (keyOrEnglish: string, russian?: string): string => {
      // Legacy inline mode: t('English text', 'Russian text')
      if (russian !== undefined) {
        return language === 'ru' ? russian : keyOrEnglish;
      }

      // Keyed mode: t('namespace.key')
      const map = messages[language];
      return map[keyOrEnglish] ?? keyOrEnglish;
    },
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
    }),
    [language, setLanguage, toggleLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
