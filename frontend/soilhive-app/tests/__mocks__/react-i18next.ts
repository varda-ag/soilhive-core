import { jest } from '@jest/globals';
import translations from '../../public/locales/en/availability.json';

export const Trans = ({ i18nKey }: { i18nKey: string }) => i18nKey;

export const mockChangeLanguage = jest.fn();

function lookup(key: string): string {
  const parts = key.split('.');
  let val: any = translations;
  for (const p of parts) {
    if (val && val[p] !== undefined) val = val[p];
    else {
      val = key;
      break;
    }
  }
  return typeof val === 'string' ? val : key;
}

export const useTranslation = () => ({
  t: (k: string) => lookup(k),
  i18n: {
    resolvedLanguage: __resolvedLanguage,
    changeLanguage: mockChangeLanguage,
  },
});

const __defaultResolvedLanguage = 'en';
let __resolvedLanguage = __defaultResolvedLanguage;
export const __setResolvedLanguage = (newLang: string) => (__resolvedLanguage = newLang);
export const __resetResolvedLanguage = () => (__resolvedLanguage = __defaultResolvedLanguage);
export const __mockChangeLanguage = mockChangeLanguage;
