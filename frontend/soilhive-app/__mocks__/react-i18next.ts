import { jest } from '@jest/globals';

export const Trans = ({ i18nKey }: { i18nKey: string }) => i18nKey;

export const mockChangeLanguage = jest.fn();

export const useTranslation = () => ({
  t: (k: string, options?: object) => `${k}${options ? ` with options: ${JSON.stringify(options)}` : ''}`,
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
