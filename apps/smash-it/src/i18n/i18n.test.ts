import { describe, expect, it } from 'vitest';
import { ar } from './ar';
import { enGB } from './en-GB';
import { enUS } from './en-US';
import { es } from './es';
import { fr } from './fr';
import { isLang, type Lang, LANGUAGES, matchLanguage } from './langs';
import { ru } from './ru';
import { type Dict, he } from './strings';

const DICTS: Record<Lang, Dict> = { he, 'en-US': enUS, 'en-GB': enGB, fr, ru, es, ar };
const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('dictionaries', () => {
  it('has a dictionary for every listed language', () => {
    expect(Object.keys(DICTS).sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
  });

  for (const [code, dict] of Object.entries(DICTS)) {
    describe(code, () => {
      it('has exactly the same keys as the source', () => {
        expect(Object.keys(dict).sort()).toEqual(Object.keys(he).sort());
      });

      it('has no empty strings and uses the same {params} as the source', () => {
        for (const key of Object.keys(he) as (keyof Dict)[]) {
          expect(dict[key].trim(), key).not.toBe('');
          expect(params(dict[key]), key).toBe(params(he[key]));
        }
      });

      it('has nicknames that fit the 14-character limit with a number', () => {
        const nicks = dict.randomNicks.split('|');
        expect(nicks.length).toBeGreaterThanOrEqual(8);
        for (const n of nicks) expect([...`${n} 99`].length, n).toBeLessThanOrEqual(14);
      });

      it('keeps the combo number readable inside right-to-left text', () => {
        for (const key of ['combo', 'goalCombo'] as const) expect(dict[key]).toContain('⁦×{n}⁩');
      });
    });
  }

  it('has a different second English', () => {
    expect(enGB.bug_ladybug).toBe('Ladybird');
    expect(enUS.bug_ladybug).toBe('Ladybug');
  });
});

describe('matchLanguage', () => {
  it('takes the first supported language of the device list', () => {
    expect(matchLanguage(['he-IL', 'en-US'])).toBe('he');
    expect(matchLanguage(['de-DE', 'fr-CA', 'en'])).toBe('fr');
    expect(matchLanguage(['ru'])).toBe('ru');
    expect(matchLanguage(['es-MX'])).toBe('es');
    expect(matchLanguage(['ar-EG'])).toBe('ar');
  });

  it('knows the old Hebrew code', () => {
    expect(matchLanguage(['iw'])).toBe('he');
  });

  it('splits English into American and British', () => {
    expect(matchLanguage(['en'])).toBe('en-US');
    expect(matchLanguage(['en-US'])).toBe('en-US');
    expect(matchLanguage(['en-CA'])).toBe('en-US');
    expect(matchLanguage(['en-GB'])).toBe('en-GB');
    expect(matchLanguage(['en-AU'])).toBe('en-GB');
    expect(matchLanguage(['en-IN'])).toBe('en-GB');
  });

  it('falls back to American English', () => {
    expect(matchLanguage(['ja-JP', 'de'])).toBe('en-US');
    expect(matchLanguage([])).toBe('en-US');
  });

  it('recognises saved codes', () => {
    expect(isLang('en-GB')).toBe(true);
    expect(isLang('en')).toBe(false);
    expect(isLang(null)).toBe(false);
  });
});
