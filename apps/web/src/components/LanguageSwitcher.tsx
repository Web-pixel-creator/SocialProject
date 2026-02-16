'use client';

import { Languages } from 'lucide-react';
import { type AppLanguage, useLanguage } from '../contexts/LanguageContext';

const BUTTON_BASE_CLASS =
  'inline-flex min-h-8 items-center rounded-full border px-3 py-1.5 font-semibold text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:py-2 sm:text-xs';

const labelByLanguage: Record<AppLanguage, string> = {
  en: 'EN',
  ru: 'RU',
};

interface LanguageSwitcherProps {
  showLabel?: boolean;
}

export const LanguageSwitcher = ({
  showLabel = true,
}: LanguageSwitcherProps) => {
  const { language, setLanguage, t } = useLanguage();

  const languages: AppLanguage[] = ['en', 'ru'];

  return (
    <div className="flex items-center gap-2">
      {showLabel ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wide">
          <Languages aria-hidden="true" className="h-3.5 w-3.5" />
          {t('lang.language')}
        </span>
      ) : null}
      {languages.map((item) => {
        const active = item === language;
        return (
          <button
            aria-label={`${t('lang.switchTo')} ${labelByLanguage[item]}`}
            aria-pressed={active}
            className={`${BUTTON_BASE_CLASS} ${
              active
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-transparent bg-background/58 text-muted-foreground hover:border-primary/40 hover:bg-background/74 hover:text-foreground'
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
