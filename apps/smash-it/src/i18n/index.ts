import { ar } from './ar';
import { enGB } from './en-GB';
import { enUS } from './en-US';
import { es } from './es';
import { fr } from './fr';
import { isLang, type Lang, LANGUAGES, matchLanguage } from './langs';
import { ru } from './ru';
import { type Dict, he } from './strings';

export { LANGUAGES, type Lang } from './langs';
export type StringKey = keyof Dict;

const DICTS: Record<Lang, Dict> = { he, 'en-US': enUS, 'en-GB': enGB, fr, ru, es, ar };
const KEY = 'smashIt.lang';

/** Saved choice, else the device's language. (index.html runs the same detection to set the page language early.) */
function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage can be blocked */
  }
  return matchLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

let lang: Lang = detect();
const info = () => LANGUAGES.find((l) => l.code === lang)!;
const listeners = new Set<() => void>();

export const getLang = () => lang;
export const isRtl = () => info().dir === 'rtl';
/** Locale for number formatting. */
export const locale = () => info().locale;

export function setLang(next: Lang) {
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  applyDocument();
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void) {
  listeners.add(fn);
}

export function t(key: StringKey, params: Record<string, string | number> = {}): string {
  return DICTS[lang][key].replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

export function isKey(key: string): key is StringKey {
  return key in he;
}

/**
 * Applies translations to static markup:
 *   data-i18n="key"                 → textContent
 *   data-i18n-attr="aria-label:key" → attributes (semicolon-separated)
 * and sets the page's language and direction.
 */
export function applyDocument(root: ParentNode = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = info().dir;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('metaDescription'));
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n!;
    if (isKey(key)) el.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr!.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (isKey(key)) el.setAttribute(attr, t(key));
    }
  });
}
