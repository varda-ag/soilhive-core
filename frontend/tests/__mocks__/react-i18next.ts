import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

export const Trans = ({ i18nKey }: { i18nKey: string }) => i18nKey;

export const mockChangeLanguage = jest.fn();

type TranslationObject = Record<string, unknown>;

const translationsCache = new Map<string, TranslationObject>();

function loadNamespaceTranslations(ns: string, lang: string): TranslationObject {
  const cacheKey = `${lang}:${ns}`;
  const cached = translationsCache.get(cacheKey);
  if (cached) return cached;

  try {
    const filePath = path.join(process.cwd(), 'public', 'locales', lang, `${ns}.json`);
    const fileContents = fs.readFileSync(filePath, 'utf-8');
    const loaded = JSON.parse(fileContents) as TranslationObject;
    translationsCache.set(cacheKey, loaded);
    return loaded;
  } catch {
    const empty: TranslationObject = {};
    translationsCache.set(cacheKey, empty);
    return empty;
  }
}

function lookup(translations: TranslationObject, key: string): string {
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

export const useTranslation = (ns: string | string[] = 'translation') => {
  const namespace = Array.isArray(ns) ? ns[0] : ns;
  const translations = loadNamespaceTranslations(namespace, __resolvedLanguage);

  return {
    t: (k: string, options?: { defaultValue?: string }) => {
      const v = lookup(translations, k);
      return v === k ? (options?.defaultValue ?? k) : v;
    },
    i18n: {
      resolvedLanguage: __resolvedLanguage,
      changeLanguage: mockChangeLanguage,
    },
  };
};

const __defaultResolvedLanguage = 'en';
let __resolvedLanguage = __defaultResolvedLanguage;
export const __setResolvedLanguage = (newLang: string) => (__resolvedLanguage = newLang);
export const __resetResolvedLanguage = () => (__resolvedLanguage = __defaultResolvedLanguage);
export const __mockChangeLanguage = mockChangeLanguage;
