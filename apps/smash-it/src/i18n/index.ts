import { type Dict, he } from './strings';

export type StringKey = keyof Dict;

export function t(key: StringKey, params: Record<string, string | number> = {}): string {
  return he[key].replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

export function isKey(key: string): key is StringKey {
  return key in he;
}

/**
 * Applies translations to static markup:
 *   data-i18n="key"                 → textContent
 *   data-i18n-attr="aria-label:key" → attributes (semicolon-separated)
 */
export function applyDocument(root: ParentNode = document) {
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
