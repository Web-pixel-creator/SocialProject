/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { LanguageProvider, useLanguage } from '../contexts/LanguageContext';
import ruMessages from '../messages/ru.json';

const Probe = () => {
  const { t } = useLanguage();
  return <p>{t('auth.welcome')}</p>;
};

describe('LanguageContext', () => {
  test('switches between English and Russian', () => {
    render(
      <LanguageProvider>
        <LanguageSwitcher />
        <Probe />
      </LanguageProvider>,
    );

    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');

    fireEvent.click(screen.getByRole('button', { name: /RU/i }));
    expect(screen.getByText(ruMessages['auth.welcome'])).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ru');

    fireEvent.click(screen.getByRole('button', { name: /EN/i }));
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });
});
