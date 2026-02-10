'use client';

import { Languages } from 'lucide-react';
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
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wide">
        <Languages aria-hidden="true" className="h-3.5 w-3.5" />
        {t('lang.language')}
      </span>
      {languages.map((item) => {
        const active = item === language;
        return (
          <button
            aria-label={`${t('lang.switchTo')} ${labelByLanguage[item]}`}
            aria-pressed={active}
            className={`${BUTTON_BASE_CLASS} ${
              active
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-border bg-muted/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
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
