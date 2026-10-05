/** UI text. Hebrew only for now; technical terms stay in English. Plural address, infinitives on buttons. */
export const t = {
  title: 'הארכיטקט',
  tagline: 'ערב לחוץ במסעדה. מוצאים מה נשבר, ופותרים את זה כמו ארכיטקטים.',
  play: 'לפתוח את המסעדה',
  update: 'יש גרסה חדשה',
  updateNow: 'לעדכן',
  stage: 'המסעדה',

  pause: 'לעצור',
  resume: 'להמשיך',
  speed: 'מהירות',
  cash: 'קופה',
  reputation: 'מוניטין',

  coachStart: 'זה הערב הראשון שלכם כבעלים. שבו בצד ותראו איך המסעדה עובדת.',
  busCall: '📞 סוכנות הטיולים: אוטובוס תיירים מגיע ב-20:00!',
  cardTip: 'יש לכם קלף. אפשר לשחק אותו עכשיו, או באמצע הערב.',
  waitTip: 'יש שולחן שמחכה שמישהו ייקח הזמנה ⏳',
  leftTable: 'שולחן קם והלך בכעס. אף מלצר לא הגיע אליהם.',
  leftDoor: 'לאורחים בחוץ נמאס לחכות, והם הלכו.',
  waiterIn: 'מלצר נוסף הגיע למשמרת!',

  cards: {
    extraWaiter: {
      name: 'מלצר נוסף',
      action: 'להזמין עוד מלצר להערב',
      money: '\u2066−300 ₪\u2069',
      time: 'מהיר יותר',
      rep: 'פחות כועסים',
    },
  },
  cardPlayed: 'בתוקף מ-{time}',

  nightGood: 'ערב מוצלח! 🎉',
  nightBad: 'ערב קשה',
  revenue: 'הכנסות',
  wages: 'משכורות',
  cardsCost: 'קלפים',
  profit: 'רווח',
  avgWait: 'המתנה ממוצעת למלצר',
  minutes: '{n} דק׳',
  served: 'שולחנות שקיבלו שירות',
  leftAngry: 'קמו והלכו',
  hintBad: 'רוב ההמתנה הייתה למלצר. מה היה עוזר בשעת העומס?',
  replay: 'לשחק את הערב שוב',

  verdictLabel: 'כרטיס פסק דין',
  verdicts: {
    horizontalScaling: {
      term: 'Horizontal scaling',
      sub: 'עוד מלצר, בדיוק כמו הראשון',
      body: 'כשמלצר אחד לא עומד בעומס, מוסיפים עוד אחד זהה ומחלקים ביניהם את השולחנות. בתוכנה זה עוד instance של אותו שירות, ו-load balancer מחלק ביניהם את הבקשות. המחיר: משלמים על כל instance, גם כשהמסעדה ריקה.',
    },
  },
};

export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
