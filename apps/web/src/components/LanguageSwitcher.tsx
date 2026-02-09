'use client';

import { type AppLanguage, useLanguage } from '../contexts/LanguageContext';

const BUTTON_BASE_CLASS =
  'rounded-full border px-3 py-1 font-semibold text-xs transition';

const labelByLanguage: Record<AppLanguage, string> = {
  en: 'EN',
  ru: 'RU',
};

export const LanguageSwitcher = () => {
  const { language, setLanguage, t } = useLanguage();

  const languages: AppLanguage[] = ['en', 'ru'];

  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 text-xs">{t('Language', 'Язык')}</span>
      {languages.map((item) => {
        const active = item === language;
        return (
          <button
            aria-label={`${t('Switch language to', 'Переключить язык на')} ${labelByLanguage[item]}`}
            aria-pressed={active}
            className={`${BUTTON_BASE_CLASS} ${
              active
                ? 'border-ember bg-ember text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-ember hover:text-ember'
            }`}
            key={item}
            onClick={() => setLanguage(item)}
            type="button"
          >
            {labelByLanguage[item]}
          </button>
        );
      })}
    </div>
  );
};
