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

export type AppLanguage = 'en' | 'ru';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (nextLanguage: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (english: string, russian: string) => string;
}

const STORAGE_KEY = 'finishit-language';
const DEFAULT_LANGUAGE: AppLanguage = 'en';

const defaultContextValue: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
  t: (english) => english,
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
    (english: string, russian: string) =>
      language === 'ru' ? russian : english,
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
