import { ar, type Dict, en, es, fr, he, ru } from './strings';

export type Lang = 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es';

export const LANGUAGES: { code: Lang; name: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'he', name: 'עברית', dir: 'rtl' },
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'ru', name: 'Русский', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
];

const DICTS: Record<Lang, Dict> = { he, en, ar, ru, fr, es };
const KEY = 'mancala.lang';

export type StringKey = keyof Dict;

/** Saved choice, else the first browser language we support, else English. */
function detect(): Lang {
  const saved = localStorage.getItem(KEY) as Lang | null;
  if (saved && saved in DICTS) return saved;
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.toLowerCase().split('-')[0];
    if (code === 'iw') return 'he';
    if (code in DICTS) return code as Lang;
  }
  return 'en';
}

let lang: Lang = detect();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function isRtl(): boolean {
  return LANGUAGES.find((l) => l.code === lang)!.dir === 'rtl';
}

export function setLang(next: Lang) {
  lang = next;
  localStorage.setItem(KEY, next);
  applyDocument();
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void) {
  listeners.add(fn);
}

export function t(key: StringKey, params: Record<string, string | number> = {}): string {
  const s = DICTS[lang][key] ?? en[key];
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

/**
 * Applies translations to static markup:
 *   data-i18n="key"                 → textContent
 *   data-i18n-attr="aria-label:key" → attributes (semicolon-separated)
 */
export function applyDocument(root: ParentNode = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
  document.title = t('appName');
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as StringKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr!.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr.trim(), t(key.trim() as StringKey));
    }
  });
}
