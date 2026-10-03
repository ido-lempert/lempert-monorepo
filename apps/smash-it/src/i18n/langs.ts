export type Lang = 'he' | 'en-US' | 'en-GB' | 'fr' | 'ru' | 'es' | 'ar';

/** `name` is written in the language itself, so people can find theirs; `locale` formats numbers. */
export const LANGUAGES: { code: Lang; name: string; dir: 'rtl' | 'ltr'; locale: string }[] = [
  { code: 'he', name: 'עברית', dir: 'rtl', locale: 'he-IL' },
  { code: 'en-US', name: 'English (US)', dir: 'ltr', locale: 'en-US' },
  { code: 'en-GB', name: 'English (UK)', dir: 'ltr', locale: 'en-GB' },
  { code: 'fr', name: 'Français', dir: 'ltr', locale: 'fr-FR' },
  { code: 'ru', name: 'Русский', dir: 'ltr', locale: 'ru-RU' },
  { code: 'es', name: 'Español', dir: 'ltr', locale: 'es-ES' },
  // Western digits, to match the rest of the game's numbers.
  { code: 'ar', name: 'العربية', dir: 'rtl', locale: 'ar-u-nu-latn' },
];

export const isLang = (code: unknown): code is Lang => LANGUAGES.some((l) => l.code === code);

/** English tags that are American; every other English (en-GB, en-AU, en-IE, en-IN...) gets British. */
const AMERICAN = new Set(['us', 'ca', 'ph', 'pr']);

/** The first supported language in the device's list (most preferred first), else American English. */
export function matchLanguage(tags: readonly string[]): Lang {
  for (const tag of tags) {
    const [primary, region] = tag.toLowerCase().split('-');
    if (primary === 'iw') return 'he';
    if (primary === 'en') return region && !AMERICAN.has(region) ? 'en-GB' : 'en-US';
    if (primary === 'he' || primary === 'fr' || primary === 'ru' || primary === 'es' || primary === 'ar') return primary;
  }
  return 'en-US';
}
