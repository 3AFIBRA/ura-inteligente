import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ptBR from './pt-BR.json';
import en from './en.json';
import es from './es.json';

export const SUPPORTED_LOCALES = ['pt-BR', 'en', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  'pt-BR': 'Português (BR)',
  en: 'English',
  es: 'Español',
};

export function normalizeLocale(v: string | null | undefined): SupportedLocale {
  if (!v) return 'pt-BR';
  if (v.startsWith('pt')) return 'pt-BR';
  if (v.startsWith('es')) return 'es';
  if (v.startsWith('en')) return 'en';
  return 'pt-BR';
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      pt: { translation: ptBR },
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: 'pt-BR',
    supportedLngs: ['pt-BR', 'pt', ...SUPPORTED_LOCALES.filter((l) => l !== 'pt-BR')],
    nonExplicitSupportedLngs: true,
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'ura.locale',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
