/** UI text (Hebrew for now). Talk to players in the plural; buttons use infinitives. */
import type { ConceptId, FailReason, Kind } from '../game/types';

export const he = {
  title: 'ארכיפלגו',
  tagline: 'בונים ארכיטקטורת תוכנה, אי אחרי אי',
  loading: 'טוען…',
  play: 'לשחק',
  run: 'להריץ',
  running: 'רץ…',
  clear: 'להתחיל מחדש',
  next: 'לשלב הבא',
  again: 'לשחק שוב',
  close: 'לסגור',
  levels: 'שלבים',
  book: 'ספר השרטוטים',
  menu: 'תפריט',
  sound: 'צלילים',
  install: 'להתקין כאפליקציה',
  fullscreen: 'מסך מלא',
  reset: 'למחוק את ההתקדמות',
  resetConfirm: 'למחוק את כל הכוכבים והכרטיסים?',
  version: 'גרסה',
  island1: 'אי השכבות',
  level: 'שלב {n}',
  tray: 'רכיבים להצבה',
  removePiece: 'להחזיר למגש',
  sceneLabel: 'האי. נגיעה ברכיב בוחרת אותו, ונגיעה ברכיב נוסף מחברת ביניהם.',
  updateAvailable: 'יש גרסה חדשה',
  updateNow: 'לעדכן',
  offlineReady: 'המשחק מוכן לשחק גם בלי אינטרנט',

  winTitle: 'יש! זה עובד',
  winFirstTry: 'ובהרצה הראשונה – מרשים',
  newCard: 'כרטיס שרטוט חדש',
  bookEmpty: 'כאן ייאספו כרטיסי השרטוט שתרוויחו.',
  bookCount: '{n} מתוך {total}',
  comingSoon: 'האי הבא בדרך: אי האירועים',
  allDone: 'סיימתם את כל מה שיש כרגע! בקרוב: אי האירועים 🦋',

  names: {
    phone: 'טלפון',
    laptop: 'מחשב נייד',
    server: 'שרת',
    db: 'מסד נתונים',
    adapter: 'מתאם',
    bank: 'הבנק הוותיק',
  } satisfies Record<Kind, string>,
  terms: {
    phone: 'Client',
    laptop: 'Client',
    server: 'Server',
    db: 'Database',
    adapter: 'Adapter',
    bank: 'Legacy system',
  } satisfies Record<Kind, string>,

  levelTitles: {
    l1: 'שלוש קומות',
    l2: 'בלי קיצורי דרך',
    l3: 'הבנק הוותיק',
  } as Record<string, string>,
  levelGoals: {
    l1: 'הטלפון צריך מידע שנמצא במסד הנתונים',
    l2: 'שני לקוחות ושרת אחד. רגע, מישהו כבר חיבר פה משהו…',
    l3: 'הטלפון רוצה מוצרים ממסד הנתונים ולשלם בבנק. לבנק יש שקע מרובע',
  } as Record<string, string>,

  coach: {
    pickServer: 'תגעו בשרת שבמגש',
    pickPad: 'ועכשיו בעיגול הזוהר',
    connectFirst: 'כדי לחבר: תגעו בטלפון, ואז בשרת',
    connectSecond: 'ועכשיו בשרת',
    connectDb: 'עכשיו מהשרת אל מסד הנתונים',
    pressRun: 'הכול מחובר? תלחצו ▶',
    arrows: 'החץ מראה מי פונה למי. נגיעה בצינור מוחקת אותו',
    placedPiece: 'נגיעה ברכיב שהצבתם בוחרת אותו, ואפשר להחזיר אותו למגש',
    drag: 'גוררים כדי לסובב את האי, וצובטים כדי להתקרב',
  },

  fails: {
    noPath: 'הבקשה לא מצאה דרך. חסר חיבור?',
    reversed: 'החץ הפוך! בקשה הולכת בכיוון החץ: ממי ששואל אל מי שעונה',
    shape: 'התקע לא נכנס: עגול לתוך מרובע. מי יכול לתרגם בין השניים?',
    exposedDb: 'אזעקה! לקוח שמדבר ישר עם מסד הנתונים יכול לקרוא (ולמחוק) הכול. רק השרת ניגש לנתונים',
  } satisfies Record<FailReason, string>,

  concepts: {
    threeTier: {
      title: 'ארכיטקטורת שלוש שכבות',
      term: '3-Tier Architecture',
      body: [
        'תצוגה, לוגיקה ונתונים. כל שכבה עושה דבר אחד ומדברת רק עם השכבה שלידה.',
        'ככה אפשר לבנות אפליקציה חדשה לטלפון בלי לגעת במסד הנתונים.',
      ],
      chain: ['phone', 'server', 'db'],
    },
    noShortcuts: {
      title: 'לא מדלגים על שכבות',
      term: 'Layered Architecture',
      body: [
        'כל הלקוחות עוברים דרך אותו שרת, אז החוקים (הרשאות, בדיקות, חישובים) כתובים במקום אחד.',
        'קיצור דרך ישר למסד הנתונים עוקף את כל זה ופותח פרצת אבטחה.',
      ],
      chain: ['laptop', 'server', 'db'],
    },
    adapter: {
      title: 'מתאם',
      term: 'Adapter Pattern',
      body: [
        'כשלשני רכיבים יש ממשקים שלא מתאימים, שמים ביניהם מתאם שמתרגם, בלי לשנות אף אחד מהם.',
        'בדיוק כמו המתאם לשקע שלוקחים לחו״ל.',
      ],
      chain: ['server', 'adapter', 'bank'],
    },
  } satisfies Record<ConceptId, { title: string; term: string; body: string[]; chain: Kind[] }>,
};

export const t = he;

export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
