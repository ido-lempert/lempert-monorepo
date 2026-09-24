/**
 * UI text. Hebrew first; the shape (`Dict`) is ready for more languages. Kids are addressed in the plural
 * ("בחרו", "תעזרו") and buttons use the infinitive ("לשחק"), which reads naturally for every child.
 */
export const he = {
  appName: 'עולם הסוכה',
  tagline: 'בונים סוכה, פוגשים אושפיזין ומשחקים בכפר הסוכות',

  // Character creator
  creatorTitle: 'בואו ניצור את הדמות שלכם',
  nameLabel: 'איך קוראים לך?',
  namePlaceholder: 'השם שלך',
  shirt: 'חולצה',
  skin: 'גוון עור',
  hat: 'כובע',
  hatNone: 'בלי',
  hatKippah: 'כיפה',
  hatCap: 'כובע מצחייה',
  hatCrown: 'כתר',
  enterVillage: 'יוצאים לכפר!',
  saveAvatar: 'שמירה',
  defaultName: 'אורח',

  // Places and characters (floating labels)
  plaza: 'כיכר הכפר',
  grandSukkah: 'הסוכה הגדולה',
  mySukkah: 'הסוכה שלי',
  garden: 'גינת ארבעת המינים',
  etrogHunt: 'ציד אתרוגים',
  abraham: 'אברהם',
  rival: 'שושי הכבשה',

  // Species
  etrog: 'אתרוג',
  lulav: 'לולב',
  hadas: 'הדס',
  arava: 'ערבה',

  // Abraham's quest
  abrahamIntro:
    'שלום {name}! אני אברהם, האושפיז הראשון שמגיע לסוכה. אורחים בדרך לסוכה הגדולה, ועוד אין לנו ארבעת המינים. תעזרו לי לאסוף אותם בגינה?',
  abrahamAccept: 'בטח, יוצאים לדרך!',
  abrahamLater: 'עוד מעט',
  abrahamWaiting: 'הגינה של ארבעת המינים נמצאת משמאל לכיכר, מאחורי השיחים. חסרים לנו עוד {n}.',
  abrahamThanks:
    'כל הכבוד, {name}! אתרוג, לולב, הדס וערבה – הכול כאן. זה בשבילכם: {coins} מטבעות ופנס לסוכה. הסוכה שלכם נמצאת מימין לכיכר – לכו לקשט אותה!',
  abrahamDone: 'יצחק כבר בדרך לכפר. בינתיים אפשר לקשט את הסוכה, או לנסות לנצח את שושי בציד האתרוגים.',
  ok: 'אוקיי',
  thanks: 'תודה!',
  foundSpecies: 'מצאתם {item}!',
  allFound: 'יש את כל ארבעת המינים! חזרו לאברהם בכיכר',

  // Quest tracker
  questTalk: 'דברו עם אברהם בכיכר',
  questCollect: 'ארבעת המינים: {n}/4',
  questReturn: 'חזרו לאברהם',
  questDone: 'יצחק מגיע בקרוב…',

  // Contextual action button
  talkAbraham: 'לדבר עם אברהם',
  playHunt: 'לשחק בציד אתרוגים',
  decorate: 'לקשט את הסוכה',

  // Decorating
  buildTitle: 'מקשטים את הסוכה',
  buildHint: 'בחרו קישוט ואז געו ברצפת הסוכה כדי לשים אותו',
  buildSelected: 'בחרתם קישוט שכבר בסוכה',
  rotate: 'לסובב',
  remove: 'להוריד',
  done: 'סיימתי',
  inBag: 'יש לכם {n}',
  buy: 'לקנות · {price} 🪙',
  notEnough: 'צריך עוד {n} מטבעות',
  sukkahFull: 'הסוכה מלאה! אפשר להוריד משהו כדי לפנות מקום',
  chain: 'שרשרת נייר',
  star: 'כוכב זהב',
  pomegranates: 'רימונים',
  lantern: 'פנס',
  chair: 'כיסא',
  rug: 'שטיח',
  table: 'שולחן',

  // Etrog hunt
  huntTitle: 'ציד אתרוגים',
  huntIntro:
    'שושי הכבשה מזמינה אתכם לתחרות: מי יאסוף יותר אתרוגים ברחבי הכפר בתוך דקה? כל אתרוג שווה {per} מטבעות, ומי שמנצח מקבל עוד {bonus}.',
  huntStart: 'יאללה, מתחילים!',
  notNow: 'לא עכשיו',
  huntYou: 'אתם',
  huntShoshi: 'שושי',
  huntGo: 'צאו לחפש!',
  huntWin: 'ניצחתם! 🎉',
  huntLose: 'הפעם שושי ניצחה',
  huntTie: 'תיקו!',
  huntResult: 'אספתם {mine} אתרוגים, ושושי אספה {rival}. קיבלתם {coins} מטבעות.',
  huntBest: 'השיא שלכם: {best}',
  playAgain: 'עוד סיבוב',
  backToVillage: 'חזרה לכפר',

  // Achievements
  newAchievement: 'הישג חדש: {name}',
  ach_metAbraham: 'פגשתם את אברהם',
  ach_fourSpecies: 'אספתם את ארבעת המינים',
  ach_firstDecoration: 'קישוט ראשון בסוכה',
  ach_firstHunt: 'ציד האתרוגים הראשון',
  ach_beatRival: 'ניצחתם את שושי',

  // HUD, menu, app
  coins: 'מטבעות',
  menu: 'תפריט',
  close: 'סגירה',
  editAvatar: 'עריכת הדמות',
  goToMySukkah: 'לסוכה שלי',
  goToPlaza: 'לכיכר',
  install: 'התקנת האפליקציה',
  fullscreen: 'מסך מלא',
  exitFullscreen: 'יציאה ממסך מלא',
  reset: 'להתחיל הכול מההתחלה',
  resetConfirm: 'למחוק את כל ההתקדמות ולהתחיל מההתחלה?',
  version: 'גרסה',
  hintKeys: 'חצים או WASD כדי ללכת',
  hintTouch: 'גררו על המסך כדי ללכת',
  updateAvailable: 'יש גרסה חדשה',
  updateNow: 'לעדכן',
  sceneLabel: 'כפר הסוכות בתלת־ממד',
  loading: 'טוען…',
};

export type Dict = typeof he;
