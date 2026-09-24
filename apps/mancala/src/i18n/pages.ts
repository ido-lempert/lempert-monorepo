import type { Lang } from './index';

export type PageId = 'rules' | 'terms' | 'accessibility';

const ISSUES = 'https://github.com/ido-lempert/lempert-monorepo/issues';
const link = (text: string) => `<a href="${ISSUES}" target="_blank" rel="noopener">${text}</a>`;
const UPDATED = '2026-09-24';

/** Long-form page content per language (trusted, static HTML). */
export const PAGES: Record<Lang, Record<PageId, string>> = {
  he: {
    rules: `
      <h3>המטרה</h3>
      <p>לאסוף לקופה שלך יותר אבנים מהיריב.</p>
      <ul>
        <li>לכל שחקן יש 6 גומות בצד שלו, וקופה – הגומה הגדולה – <strong>משמאלו</strong>. בתחילת המשחק יש 4 אבנים בכל גומה.</li>
        <li>בכל תור בוחרים אחת מהגומות שלך, מוציאים ממנה את כל האבנים ומפזרים אותן אחת-אחת <strong>עם כיוון השעון</strong>: גם לקופה שלך, אבל לא לקופה של היריב – עליה מדלגים.</li>
        <li>האבן האחרונה נפלה לקופה שלך? מגיע לך <strong>תור נוסף</strong>.</li>
        <li>האבן האחרונה נפלה לגומה ריקה בצד שלך, ובגומה שמולה יש אבנים? זו <strong>לכידה</strong>: האבן שלך וכל האבנים שמולה עוברות לקופה שלך.</li>
        <li>המשחק נגמר כשלאחד השחקנים לא נשארו אבנים בגומות. כל שחקן מעביר לקופה שלו את מה שנשאר בצד שלו, ומי שבקופה שלו יותר אבנים – מנצח.</li>
      </ul>
      <h3>משחק קסום ✨</h3>
      <p>במשחק קסום כל שחקן מקבל קלף קסם אחד. אפשר להפעיל אותו פעם אחת במשחק, בתור שלך, לפני שמזיזים אבנים – ואחר כך ממשיכים את התור כרגיל.</p>
      <ul>
        <li><strong>חסימה 🔒</strong> – נועלים גומה של היריב, והוא לא יכול לשחק ממנה. אבנים עדיין נכנסות אליה בפיזור, והנעילה נשברת כשהאבן האחרונה של מהלך כלשהו – של כל אחד מהשחקנים – נופלת לתוכה. שחקן שכל האבנים שלו בגומות נעולות מפסיד את התור.</li>
        <li><strong>מראה 🪞</strong> – כל גומה מחליפה את האבנים שלה עם הגומה שמולה. הקופות נשארות כמו שהן.</li>
      </ul>
      <h3>שליטה</h3>
      <ul>
        <li>כדי לשחק לוחצים על גומה מסומנת, על המקשים 1–6, או על כפתורי הגומות שמופיעים כשלוחצים Tab.</li>
        <li>מסובבים את המצלמה בגרירה או בחיצים, ומתקרבים בגלגלת, בצביטה או במקשים + ו-−. המקש 0 מחזיר את המצלמה למקום.</li>
        <li>Escape סוגר חלונות ותפריטים.</li>
      </ul>`,
    terms: `
      <p>המשחק חינמי, ומסופק <strong>"כמות שהוא" (AS IS), בלי אחריות מכל סוג</strong> – מפורשת או משתמעת – ובכלל זה לא לגבי התאמה למטרה מסוימת, זמינות, רציפות או פעולה ללא תקלות. השימוש הוא באחריותך בלבד, ואנחנו לא אחראים לשום נזק, ישיר או עקיף, שנגרם מהשימוש במשחק או מחוסר היכולת להשתמש בו.</p>
      <h3>קיר התהילה</h3>
      <ul>
        <li>השם שבחרת מוצג לכולם בקיר התהילה, יחד עם מספר הניצחונות שלך.</li>
        <li>ניצחונות נגד המחשב מדווחים מהדפדפן ולא נבדקים, כך שהדירוג הוא בשביל הכיף בלבד.</li>
        <li><strong>קיר התהילה עלול להימחק, להתאפס או להשתנות בכל רגע ובלי הודעה מראש</strong>, ואיננו מתחייבים לשמור עליו.</li>
        <li>אנחנו רשאים להסיר כל שם לפי שיקול דעתנו, ובמיוחד שמות פוגעניים.</li>
      </ul>
      <h3>פרטיות</h3>
      <ul>
        <li>אין פרסומות, אין מעקב ואין עוגיות.</li>
        <li>במשחק אונליין, השמות והמהלכים עוברים דרך שרת המשחק ונשמרים רק בזיכרון ורק למשך המשחק. הם נמחקים לכל המאוחר כמה שעות אחרי הפעילות האחרונה.</li>
        <li>בקיר התהילה נשמרים רק השם, מספר הניצחונות ומועד הניצחון האחרון.</li>
        <li>במכשיר שלך נשמרים ההגדרות, השמות, השפה, ערכת הצבעים והעדפות הצליל והאנימציה.</li>
      </ul>
      <h3>כללי</h3>
      <ul>
        <li>נא לא להשתמש בשמות פוגעניים.</li>
        <li>השירות עשוי להשתנות או להיפסק בכל עת ובלי הודעה מראש.</li>
      </ul>
      <p class="updated">עדכון אחרון: ${UPDATED}</p>`,
    accessibility: `
      <p>חשוב לנו שכל אחד ואחת יוכלו ליהנות מהמשחק. הממשק נבנה כך שיעמוד בהנחיות <strong>WCAG 2.2 ברמה AAA</strong> בכל מקום שבו הן רלוונטיות – מעבר לדרישות התקן הישראלי 5568 (רמה AA).</p>
      <h3>מה עשינו</h3>
      <ul>
        <li><strong>מקלדת בלבד:</strong> אפשר לעשות הכול מהמקלדת – לבחור גומות (1–6, או כפתורי הגומות עם Tab), להפעיל קלפי קסם, להזיז את המצלמה (חיצים, +/−, 0) ולנווט בתפריטים ובחלונות. כשחלון פתוח, הפוקוס נשאר בתוכו, ו-Escape סוגר אותו.</li>
        <li><strong>קוראי מסך:</strong> מהלכים, לכידות, תור נוסף, קלפי קסם, התוצאה ומי בתור – הכול מוקרא. לכל כפתור יש תווית, והמצב על הלוח מתואר גם בטקסט.</li>
        <li><strong>ניגודיות גבוהה:</strong> יחס ניגודיות של 7:1 לפחות לכל הטקסטים, גם בערכה הבהירה וגם בכהה. צבעי השחקנים מופיעים תמיד יחד עם סמל (🔥/❄️) וטקסט.</li>
        <li><strong>ערכה בהירה או כהה</strong> – אוטומטית לפי המכשיר, או לפי בחירה.</li>
        <li><strong>כפתורים גדולים:</strong> כל כפתור בגודל 44×44 פיקסלים לפחות.</li>
        <li><strong>אנימציה:</strong> המתג "פחות אנימציות" (שמופעל אוטומטית לפי הגדרות המכשיר) מבטל את החלקיקים והקונפטי ומקצר את האנימציות. אין במשחק הבהובים.</li>
        <li><strong>צליל:</strong> אפשר לכבות בנפרד את המוזיקה ואת צלילי המשחק, ושום מידע לא מועבר רק בצליל.</li>
        <li><strong>בלי לחץ של זמן:</strong> אין הגבלת זמן למהלך, והמשחק לא מתרענן לגרסה חדשה בלי אישור שלך.</li>
        <li><strong>שפה וטקסט:</strong> שש שפות, כולל עברית וערבית מימין לשמאל. דפי המידע כתובים ברוחב נוח לקריאה ובמרווח שורות נדיב, ואפשר להגדיל את הטקסט עד 200%.</li>
        <li><strong>עזרה:</strong> דף "איך משחקים" והסבר מובנה לכל קלף קסם.</li>
      </ul>
      <h3>מגבלות ידועות</h3>
      <ul>
        <li>הלוח התלת-ממדי עצמו הוא חזותי, אבל כל המידע שבו זמין גם בטקסט ובהודעות לקורא המסך.</li>
        <li>את שמות השחקנים כותבים המשתמשים, והם לא מתורגמים.</li>
        <li>התרגומים לשפות שאינן עברית ואנגלית עוד לא נבדקו על ידי דוברי השפה.</li>
      </ul>
      <h3>נתקלתם בבעיה?</h3>
      <p>נשמח לשמוע ולתקן: ${link('לפתיחת פנייה ב-GitHub')}.</p>
      <p class="updated">עדכון אחרון: ${UPDATED}</p>`,
  },
  en: {
    rules: `
      <h3>Goal</h3>
      <p>Collect more stones in your store than your opponent.</p>
      <ul>
        <li>Each player has 6 pits on their side and a store (the big pit) on their <strong>left</strong>. Every pit starts with 4 stones.</li>
        <li>On your turn, pick one of your pits, take all its stones and sow them one by one <strong>clockwise</strong> – including your own store, skipping your opponent's.</li>
        <li>If your last stone lands in your store, you get an <strong>extra turn</strong>.</li>
        <li>If your last stone lands in an empty pit on your side and the opposite pit has stones, you <strong>capture</strong> both into your store.</li>
        <li>When one side runs out of stones, the game ends: each player adds the stones left on their side to their store. Most stones wins.</li>
      </ul>
      <h3>Magic mode ✨</h3>
      <p>In Magic mode each player gets one magic card. Play it once per game, on your turn, before you move – then carry on with your move as usual.</p>
      <ul>
        <li><strong>Block 🔒</strong> – lock one of your opponent's pits so they can't play it. Stones are still sown into it, and the lock breaks when the last stone of any move (by either player) lands in it. A player whose stones are all in locked pits skips their turn.</li>
        <li><strong>Mirror 🪞</strong> – every pit swaps its stones with the pit facing it. Stores don't change.</li>
      </ul>
      <h3>Controls</h3>
      <ul>
        <li>Tap or click a highlighted pit, press 1–6, or use the pit buttons that appear when you press Tab.</li>
        <li>Rotate the camera by dragging or with the arrow keys. Zoom with the wheel, a pinch, or the + and − keys. 0 resets the camera.</li>
        <li>Escape closes dialogs and menus.</li>
      </ul>`,
    terms: `
      <p>This game is free to use and is provided <strong>"AS IS", without warranty of any kind</strong>, express or implied, including fitness for a particular purpose, availability, or freedom from errors. You use it at your own risk, and we are not liable for any direct or indirect damage arising from using, or being unable to use, the game.</p>
      <h3>Wall of fame</h3>
      <ul>
        <li>The name you choose is shown publicly on the wall of fame together with your number of wins.</li>
        <li>Wins against the computer are reported by your browser and are not verified; the ranking is just for fun.</li>
        <li><strong>The wall of fame may be erased, reset or changed at any time without notice</strong>, and we make no commitment to keep it.</li>
        <li>We may remove any name at our discretion, in particular offensive ones.</li>
      </ul>
      <h3>Privacy</h3>
      <ul>
        <li>No ads, no tracking, no cookies.</li>
        <li>In online games, names and moves pass through the game server and are kept in memory only for the duration of the game (deleted at most a few hours after the last activity).</li>
        <li>The wall of fame stores only the name, the number of wins and the time of the latest win.</li>
        <li>Your device stores your settings, names, language, theme, and sound and motion preferences locally.</li>
      </ul>
      <h3>General</h3>
      <ul>
        <li>Please don't use offensive names.</li>
        <li>The service may change or stop at any time without notice.</li>
      </ul>
      <p class="updated">Last updated: ${UPDATED}</p>`,
    accessibility: `
      <p>We want everyone to be able to enjoy the game. The interface is built to meet <strong>WCAG 2.2 level AAA</strong> wherever it applies.</p>
      <h3>What we support</h3>
      <ul>
        <li><strong>Keyboard only:</strong> everything works from the keyboard – pits (1–6 or the pit buttons via Tab), magic cards, the camera (arrows, +/−, 0), menus and dialogs. Focus stays inside an open dialog and Escape closes it.</li>
        <li><strong>Screen readers:</strong> moves, captures, extra turns, magic cards, results and whose turn it is are announced. Every button has a label and the board is also described in text.</li>
        <li><strong>Enhanced contrast:</strong> at least 7:1 for all text, in both light and dark themes. Player colours always come with symbols (🔥/❄️) and text.</li>
        <li><strong>Light and dark themes</strong> that follow your system, or can be chosen manually.</li>
        <li><strong>Target size:</strong> every button is at least 44×44 pixels.</li>
        <li><strong>Motion:</strong> a "Reduce motion" switch (following your system by default) turns off particles and confetti and shortens animations. Nothing flashes.</li>
        <li><strong>Sound:</strong> music and sound effects can be turned off separately; no information is given by sound alone.</li>
        <li><strong>No time limits:</strong> there is no move timer, and updates never reload the page without your consent.</li>
        <li><strong>Language and text:</strong> six languages including right-to-left Hebrew and Arabic; information pages use a readable width and line spacing; text can be enlarged to 200%.</li>
        <li><strong>Help:</strong> a "How to play" page and a built-in explanation for every magic card.</li>
      </ul>
      <h3>Known limitations</h3>
      <ul>
        <li>The 3D board itself is visual; all of its information is also available as text and screen-reader announcements.</li>
        <li>Player names are written by users and are not translated.</li>
        <li>Translations other than Hebrew and English have not yet been reviewed by native speakers.</li>
      </ul>
      <h3>Found a problem?</h3>
      <p>We'd love to hear about it: ${link('open an issue on GitHub')}.</p>
      <p class="updated">Last updated: ${UPDATED}</p>`,
  },
  ar: {
    rules: `
      <h3>الهدف</h3>
      <p>اجمع في مخزنك حصى أكثر من خصمك.</p>
      <ul>
        <li>لكل لاعب 6 حفر في جهته ومخزن (الحفرة الكبيرة) على <strong>يساره</strong>. تبدأ كل حفرة بـ 4 حصى.</li>
        <li>في دورك اختر إحدى حفرك، وخذ كل ما فيها ووزّعه حصاةً حصاةً <strong>باتجاه عقارب الساعة</strong> – بما في ذلك مخزنك، مع تخطي مخزن الخصم.</li>
        <li>إذا وقعت الحصاة الأخيرة في مخزنك تحصل على <strong>دور إضافي</strong>.</li>
        <li>إذا وقعت الحصاة الأخيرة في حفرة فارغة في جهتك وكانت الحفرة المقابلة غير فارغة، <strong>تستولي</strong> على الحصى كلها إلى مخزنك.</li>
        <li>عندما تفرغ حفر أحد اللاعبين تنتهي اللعبة: يضيف كل لاعب الحصى المتبقية في جهته إلى مخزنه. الفائز صاحب الحصى الأكثر.</li>
      </ul>
      <h3>النمط السحري ✨</h3>
      <p>في النمط السحري يحصل كل لاعب على بطاقة سحرية واحدة. تُستخدم مرة واحدة في اللعبة، في دورك وقبل أن تحرّك الحصى، ثم تكمل حركتك كالمعتاد.</p>
      <ul>
        <li><strong>حجب 🔒</strong> – اقفل إحدى حفر خصمك فلا يستطيع اللعب منها. يستمر توزيع الحصى فيها، وينكسر الحجب عندما تقع فيها الحصاة الأخيرة لأي حركة (من أي لاعب). اللاعب الذي تكون كل حصاه في حفر محجوبة يُتخطّى دوره.</li>
        <li><strong>مرآة 🪞</strong> – تتبادل كل حفرة حصاها مع الحفرة المقابلة لها. المخازن لا تتغير.</li>
      </ul>
      <h3>التحكم</h3>
      <ul>
        <li>اضغط على حفرة مميزة، أو المفاتيح 1–6، أو أزرار الحفر التي تظهر عند الضغط على Tab.</li>
        <li>دوّر الكاميرا بالسحب أو بمفاتيح الأسهم، وكبّر بالعجلة أو القرص أو المفتاحين + و−. المفتاح 0 يعيد الكاميرا.</li>
        <li>مفتاح Escape يغلق النوافذ والقوائم.</li>
      </ul>`,
    terms: `
      <p>اللعبة مجانية وتُقدَّم <strong>"كما هي" دون أي ضمان</strong> صريح أو ضمني، بما في ذلك الملاءمة لغرض معين أو التوفر أو الخلو من الأخطاء. الاستخدام على مسؤوليتك وحدك، ولسنا مسؤولين عن أي ضرر مباشر أو غير مباشر ناتج عن استخدام اللعبة أو تعذر استخدامها.</p>
      <h3>جدار الشرف</h3>
      <ul>
        <li>يُعرض الاسم الذي تختاره علنًا في جدار الشرف مع عدد انتصاراتك.</li>
        <li>يُبلَّغ عن الانتصارات ضد الحاسوب من متصفحك دون تحقق؛ الترتيب للتسلية فقط.</li>
        <li><strong>قد يُمسح جدار الشرف أو يُعاد ضبطه أو يتغير في أي وقت ودون إشعار</strong>، ولا نلتزم بالحفاظ عليه.</li>
        <li>يحق لنا إزالة أي اسم وفق تقديرنا، ولا سيما الأسماء المسيئة.</li>
      </ul>
      <h3>الخصوصية</h3>
      <ul>
        <li>لا إعلانات ولا تتبع ولا ملفات تعريف ارتباط.</li>
        <li>في اللعب عن بُعد تمر الأسماء والحركات عبر خادم اللعبة وتُحفظ في الذاكرة فقط طوال مدة اللعبة (وتُحذف خلال بضع ساعات على الأكثر بعد آخر نشاط).</li>
        <li>يحفظ جدار الشرف الاسم وعدد الانتصارات ووقت آخر انتصار فقط.</li>
        <li>يحفظ جهازك محليًا إعداداتك والأسماء واللغة والمظهر وتفضيلات الصوت والحركة.</li>
      </ul>
      <h3>عام</h3>
      <ul>
        <li>يُرجى عدم استخدام أسماء مسيئة.</li>
        <li>قد تتغير الخدمة أو تتوقف في أي وقت دون إشعار.</li>
      </ul>
      <p class="updated">آخر تحديث: ${UPDATED}</p>`,
    accessibility: `
      <p>نريد أن يستمتع الجميع باللعبة. صُممت الواجهة لتلبية إرشادات <strong>WCAG 2.2 بمستوى AAA</strong> حيثما ينطبق ذلك.</p>
      <h3>ما ندعمه</h3>
      <ul>
        <li><strong>لوحة المفاتيح وحدها:</strong> كل شيء متاح من لوحة المفاتيح – الحفر (1–6 أو أزرار الحفر عبر Tab)، البطاقات السحرية، الكاميرا (الأسهم، +/−، 0)، القوائم والنوافذ. يبقى التركيز داخل النافذة المفتوحة وEscape يغلقها.</li>
        <li><strong>قارئات الشاشة:</strong> تُعلَن الحركات والاستيلاء والأدوار الإضافية والبطاقات السحرية والنتائج ودور كل لاعب. لكل زر تسمية، واللوح موصوف نصيًا أيضًا.</li>
        <li><strong>تباين معزز:</strong> 7:1 على الأقل لكل النصوص في المظهرين الفاتح والداكن. ألوان اللاعبين مصحوبة دائمًا برموز (🔥/❄️) ونص.</li>
        <li><strong>مظهر فاتح وداكن</strong> حسب النظام أو باختيار يدوي.</li>
        <li><strong>حجم الأهداف:</strong> كل زر بحجم 44×44 بكسل على الأقل.</li>
        <li><strong>الحركة:</strong> مفتاح "تقليل الحركة" (افتراضيًا حسب النظام) يوقف الجسيمات والقصاصات ويقصّر الرسوم المتحركة. لا يوجد وميض.</li>
        <li><strong>الصوت:</strong> يمكن إيقاف الموسيقى والمؤثرات كلٌّ على حدة؛ لا تُنقل أي معلومة بالصوت وحده.</li>
        <li><strong>بلا حدود زمنية:</strong> لا مؤقت للحركات، والتحديثات لا تعيد تحميل الصفحة دون موافقتك.</li>
        <li><strong>اللغة والنص:</strong> ست لغات منها العربية والعبرية من اليمين إلى اليسار؛ صفحات المعلومات بعرض وتباعد أسطر مريحين؛ يمكن تكبير النص حتى 200%.</li>
        <li><strong>المساعدة:</strong> صفحة "طريقة اللعب" وشرح مدمج لكل بطاقة سحرية.</li>
      </ul>
      <h3>قيود معروفة</h3>
      <ul>
        <li>اللوح ثلاثي الأبعاد مرئي بطبيعته؛ وكل معلوماته متاحة نصيًا وعبر إعلانات قارئ الشاشة.</li>
        <li>أسماء اللاعبين يكتبها المستخدمون ولا تُترجم.</li>
        <li>لم يراجع متحدثون أصليون بعدُ الترجمات إلى غير العبرية والإنجليزية.</li>
      </ul>
      <h3>واجهت مشكلة؟</h3>
      <p>يسعدنا أن نسمع منك: ${link('افتح بلاغًا على GitHub')}.</p>
      <p class="updated">آخر تحديث: ${UPDATED}</p>`,
  },
  ru: {
    rules: `
      <h3>Цель</h3>
      <p>Собрать в своём амбаре больше камней, чем соперник.</p>
      <ul>
        <li>У каждого игрока 6 лунок на своей стороне и амбар (большая лунка) <strong>слева</strong> от него. В начале в каждой лунке 4 камня.</li>
        <li>В свой ход выберите одну из своих лунок, возьмите все камни и раскладывайте по одному <strong>по часовой стрелке</strong> – включая свой амбар и пропуская амбар соперника.</li>
        <li>Если последний камень попал в ваш амбар – <strong>ещё один ход</strong>.</li>
        <li>Если последний камень попал в пустую лунку на вашей стороне, а напротив есть камни, вы <strong>захватываете</strong> их вместе со своим камнем в амбар.</li>
        <li>Когда у одного из игроков заканчиваются камни в лунках, игра завершается: каждый добавляет оставшиеся на своей стороне камни в свой амбар. Побеждает тот, у кого больше.</li>
      </ul>
      <h3>Режим «Магия» ✨</h3>
      <p>В режиме «Магия» каждый игрок получает одну магическую карту. Её можно сыграть один раз за игру, в свой ход до перемещения камней, а затем сделать ход как обычно.</p>
      <ul>
        <li><strong>Блок 🔒</strong> – заблокируйте лунку соперника, и он не сможет из неё ходить. Камни по-прежнему раскладываются в неё, а блок снимается, когда в неё попадает последний камень любого хода (любого игрока). Игрок, у которого все камни в заблокированных лунках, пропускает ход.</li>
        <li><strong>Зеркало 🪞</strong> – каждая лунка меняется камнями с лункой напротив. Амбары не меняются.</li>
      </ul>
      <h3>Управление</h3>
      <ul>
        <li>Нажмите на подсвеченную лунку, клавиши 1–6 или кнопки лунок, которые появляются при нажатии Tab.</li>
        <li>Камера вращается перетаскиванием или стрелками; масштаб – колесом, щипком или клавишами + и −. Клавиша 0 сбрасывает камеру.</li>
        <li>Escape закрывает окна и меню.</li>
      </ul>`,
    terms: `
      <p>Игра бесплатна и предоставляется <strong>«КАК ЕСТЬ», без каких-либо гарантий</strong>, явных или подразумеваемых, включая пригодность для определённой цели, доступность и отсутствие ошибок. Вы используете её на свой риск; мы не несём ответственности за прямой или косвенный ущерб от использования игры или невозможности её использовать.</p>
      <h3>Доска почёта</h3>
      <ul>
        <li>Выбранное вами имя публично показывается на доске почёта вместе с числом побед.</li>
        <li>Победы над компьютером сообщает браузер, и они не проверяются; рейтинг – просто для удовольствия.</li>
        <li><strong>Доска почёта может быть удалена, сброшена или изменена в любой момент без уведомления</strong>, и мы не обязуемся её сохранять.</li>
        <li>Мы можем удалить любое имя по своему усмотрению, особенно оскорбительное.</li>
      </ul>
      <h3>Конфиденциальность</h3>
      <ul>
        <li>Без рекламы, отслеживания и cookie.</li>
        <li>В онлайн-играх имена и ходы проходят через игровой сервер и хранятся только в памяти на время игры (удаляются не позднее чем через несколько часов после последней активности).</li>
        <li>На доске почёта хранятся только имя, число побед и время последней победы.</li>
        <li>На вашем устройстве локально хранятся настройки, имена, язык, тема и параметры звука и анимации.</li>
      </ul>
      <h3>Общее</h3>
      <ul>
        <li>Пожалуйста, не используйте оскорбительные имена.</li>
        <li>Сервис может измениться или прекратить работу в любое время без уведомления.</li>
      </ul>
      <p class="updated">Последнее обновление: ${UPDATED}</p>`,
    accessibility: `
      <p>Мы хотим, чтобы игрой могли наслаждаться все. Интерфейс создан с целью соответствовать <strong>WCAG 2.2 уровня AAA</strong> везде, где это применимо.</p>
      <h3>Что поддерживается</h3>
      <ul>
        <li><strong>Только клавиатура:</strong> всё доступно с клавиатуры – лунки (1–6 или кнопки через Tab), магические карты, камера (стрелки, +/−, 0), меню и окна. Фокус остаётся внутри открытого окна, Escape закрывает его.</li>
        <li><strong>Программы чтения с экрана:</strong> озвучиваются ходы, захваты, дополнительные ходы, магические карты, результаты и очередь хода. У всех кнопок есть подписи, доска описана и текстом.</li>
        <li><strong>Повышенный контраст:</strong> не менее 7:1 для всего текста в светлой и тёмной темах. Цвета игроков всегда дополнены символами (🔥/❄️) и текстом.</li>
        <li><strong>Светлая и тёмная темы</strong> по настройкам системы или на выбор.</li>
        <li><strong>Размер целей:</strong> каждая кнопка не меньше 44×44 пикселей.</li>
        <li><strong>Движение:</strong> переключатель «Меньше движения» (по умолчанию – как в системе) отключает частицы и конфетти и сокращает анимацию. Ничего не мигает.</li>
        <li><strong>Звук:</strong> музыку и эффекты можно отключить по отдельности; никакая информация не передаётся только звуком.</li>
        <li><strong>Без ограничений по времени:</strong> таймера хода нет, а обновления не перезагружают страницу без вашего согласия.</li>
        <li><strong>Язык и текст:</strong> шесть языков, включая иврит и арабский справа налево; удобная ширина и межстрочный интервал страниц; текст можно увеличить до 200%.</li>
        <li><strong>Справка:</strong> страница «Как играть» и встроенное описание каждой магической карты.</li>
      </ul>
      <h3>Известные ограничения</h3>
      <ul>
        <li>Сама трёхмерная доска визуальна; вся её информация доступна также текстом и в объявлениях для экранных чтецов.</li>
        <li>Имена игроков вводятся пользователями и не переводятся.</li>
        <li>Переводы, кроме иврита и английского, ещё не проверены носителями языка.</li>
      </ul>
      <h3>Нашли проблему?</h3>
      <p>Будем рады узнать: ${link('создайте обращение на GitHub')}.</p>
      <p class="updated">Последнее обновление: ${UPDATED}</p>`,
  },
  fr: {
    rules: `
      <h3>But du jeu</h3>
      <p>Réunir plus de graines que l'adversaire dans son grenier.</p>
      <ul>
        <li>Chaque joueur a 6 trous de son côté et un grenier (le grand trou) à sa <strong>gauche</strong>. Chaque trou commence avec 4 graines.</li>
        <li>À votre tour, choisissez un de vos trous, prenez toutes ses graines et semez-les une par une <strong>dans le sens des aiguilles d'une montre</strong> – y compris dans votre grenier, en sautant celui de l'adversaire.</li>
        <li>Si votre dernière graine tombe dans votre grenier, vous <strong>rejouez</strong>.</li>
        <li>Si votre dernière graine tombe dans un trou vide de votre côté et que le trou opposé contient des graines, vous les <strong>capturez</strong> toutes dans votre grenier.</li>
        <li>Quand un camp n'a plus de graines, la partie se termine : chacun ajoute les graines restant de son côté à son grenier. Le plus de graines l'emporte.</li>
      </ul>
      <h3>Mode Magie ✨</h3>
      <p>En mode Magie, chaque joueur reçoit une carte magique. Elle se joue une fois par partie, pendant votre tour et avant de déplacer les graines ; vous jouez ensuite votre coup normalement.</p>
      <ul>
        <li><strong>Blocage 🔒</strong> – verrouillez un trou de l'adversaire : il ne peut plus le jouer. Les graines continuent d'y être semées, et le blocage est levé lorsque la dernière graine d'un coup (de n'importe quel joueur) y tombe. Un joueur dont toutes les graines sont dans des trous bloqués passe son tour.</li>
        <li><strong>Miroir 🪞</strong> – chaque trou échange ses graines avec le trou d'en face. Les greniers ne changent pas.</li>
      </ul>
      <h3>Commandes</h3>
      <ul>
        <li>Touchez ou cliquez un trou en surbrillance, appuyez sur 1–6, ou utilisez les boutons des trous qui apparaissent avec Tab.</li>
        <li>Faites pivoter la caméra en glissant ou avec les flèches ; zoomez avec la molette, un pincement ou les touches + et −. La touche 0 réinitialise la caméra.</li>
        <li>Échap ferme les fenêtres et les menus.</li>
      </ul>`,
    terms: `
      <p>Ce jeu est gratuit et fourni <strong>« EN L'ÉTAT », sans aucune garantie</strong>, expresse ou implicite, notamment d'adéquation à un usage particulier, de disponibilité ou d'absence d'erreurs. Vous l'utilisez à vos propres risques ; nous déclinons toute responsabilité pour tout dommage direct ou indirect lié à l'utilisation du jeu ou à l'impossibilité de l'utiliser.</p>
      <h3>Tableau d'honneur</h3>
      <ul>
        <li>Le nom que vous choisissez est affiché publiquement au tableau d'honneur avec votre nombre de victoires.</li>
        <li>Les victoires contre l'ordinateur sont signalées par votre navigateur et ne sont pas vérifiées ; le classement est juste pour le plaisir.</li>
        <li><strong>Le tableau d'honneur peut être effacé, réinitialisé ou modifié à tout moment sans préavis</strong>, et nous ne nous engageons pas à le conserver.</li>
        <li>Nous pouvons retirer tout nom à notre discrétion, en particulier les noms offensants.</li>
      </ul>
      <h3>Confidentialité</h3>
      <ul>
        <li>Pas de publicité, pas de suivi, pas de cookies.</li>
        <li>En ligne, les noms et les coups transitent par le serveur de jeu et ne sont conservés qu'en mémoire pendant la partie (supprimés au plus tard quelques heures après la dernière activité).</li>
        <li>Le tableau d'honneur ne conserve que le nom, le nombre de victoires et la date de la dernière victoire.</li>
        <li>Votre appareil enregistre localement vos réglages, noms, langue, thème et préférences de son et d'animation.</li>
      </ul>
      <h3>Général</h3>
      <ul>
        <li>Merci de ne pas utiliser de noms offensants.</li>
        <li>Le service peut évoluer ou s'arrêter à tout moment sans préavis.</li>
      </ul>
      <p class="updated">Dernière mise à jour : ${UPDATED}</p>`,
    accessibility: `
      <p>Nous voulons que chacun puisse profiter du jeu. L'interface est conçue pour respecter les <strong>WCAG 2.2 niveau AAA</strong> partout où c'est applicable.</p>
      <h3>Ce qui est pris en charge</h3>
      <ul>
        <li><strong>Clavier seul :</strong> tout fonctionne au clavier – trous (1–6 ou boutons via Tab), cartes magiques, caméra (flèches, +/−, 0), menus et fenêtres. Le focus reste dans la fenêtre ouverte et Échap la ferme.</li>
        <li><strong>Lecteurs d'écran :</strong> les coups, captures, tours supplémentaires, cartes magiques, résultats et le joueur actif sont annoncés. Chaque bouton a un libellé et le plateau est aussi décrit en texte.</li>
        <li><strong>Contraste renforcé :</strong> au moins 7:1 pour tout le texte, en thème clair comme sombre. Les couleurs des joueurs sont toujours accompagnées de symboles (🔥/❄️) et de texte.</li>
        <li><strong>Thèmes clair et sombre</strong> selon le système, ou au choix.</li>
        <li><strong>Taille des cibles :</strong> chaque bouton mesure au moins 44×44 pixels.</li>
        <li><strong>Mouvement :</strong> l'option « Réduire les animations » (selon le système par défaut) supprime particules et confettis et raccourcit les animations. Rien ne clignote.</li>
        <li><strong>Son :</strong> musique et effets se désactivent séparément ; aucune information n'est transmise uniquement par le son.</li>
        <li><strong>Pas de limite de temps :</strong> aucun chronomètre, et les mises à jour ne rechargent jamais la page sans votre accord.</li>
        <li><strong>Langue et texte :</strong> six langues, dont l'hébreu et l'arabe de droite à gauche ; pages d'information à largeur et interligne confortables ; texte agrandissable jusqu'à 200 %.</li>
        <li><strong>Aide :</strong> une page « Comment jouer » et une explication intégrée pour chaque carte magique.</li>
      </ul>
      <h3>Limites connues</h3>
      <ul>
        <li>Le plateau 3D est visuel ; toutes ses informations sont aussi disponibles en texte et via les annonces du lecteur d'écran.</li>
        <li>Les noms des joueurs sont saisis par les utilisateurs et ne sont pas traduits.</li>
        <li>Les traductions autres que l'hébreu et l'anglais n'ont pas encore été relues par des locuteurs natifs.</li>
      </ul>
      <h3>Un problème ?</h3>
      <p>Dites-le-nous : ${link('ouvrir un ticket sur GitHub')}.</p>
      <p class="updated">Dernière mise à jour : ${UPDATED}</p>`,
  },
  es: {
    rules: `
      <h3>Objetivo</h3>
      <p>Reunir en tu almacén más semillas que tu rival.</p>
      <ul>
        <li>Cada jugador tiene 6 hoyos en su lado y un almacén (el hoyo grande) a su <strong>izquierda</strong>. Cada hoyo empieza con 4 semillas.</li>
        <li>En tu turno, elige uno de tus hoyos, toma todas sus semillas y siémbralas de una en una <strong>en el sentido de las agujas del reloj</strong>, incluido tu almacén y saltando el del rival.</li>
        <li>Si tu última semilla cae en tu almacén, tienes un <strong>turno extra</strong>.</li>
        <li>Si tu última semilla cae en un hoyo vacío de tu lado y el hoyo de enfrente tiene semillas, las <strong>capturas</strong> todas en tu almacén.</li>
        <li>Cuando un lado se queda sin semillas, la partida termina: cada jugador suma a su almacén las semillas que queden en su lado. Gana quien tenga más.</li>
      </ul>
      <h3>Modo Magia ✨</h3>
      <p>En el modo Magia cada jugador recibe una carta mágica. Se usa una vez por partida, en tu turno y antes de mover las semillas; después juegas tu turno como siempre.</p>
      <ul>
        <li><strong>Bloqueo 🔒</strong> – bloquea un hoyo del rival para que no pueda jugarlo. Se siguen sembrando semillas en él, y el bloqueo se rompe cuando la última semilla de cualquier jugada (de cualquier jugador) cae en él. Quien tenga todas sus semillas en hoyos bloqueados pierde el turno.</li>
        <li><strong>Espejo 🪞</strong> – cada hoyo intercambia sus semillas con el hoyo de enfrente. Los almacenes no cambian.</li>
      </ul>
      <h3>Controles</h3>
      <ul>
        <li>Toca o haz clic en un hoyo resaltado, pulsa 1–6 o usa los botones de los hoyos que aparecen al pulsar Tab.</li>
        <li>Gira la cámara arrastrando o con las flechas; haz zoom con la rueda, un pellizco o las teclas + y −. La tecla 0 restablece la cámara.</li>
        <li>Escape cierra ventanas y menús.</li>
      </ul>`,
    terms: `
      <p>Este juego es gratuito y se ofrece <strong>«TAL CUAL», sin garantía de ningún tipo</strong>, expresa o implícita, incluida la idoneidad para un fin concreto, la disponibilidad o la ausencia de errores. Lo usas bajo tu propia responsabilidad y no respondemos de ningún daño directo o indirecto derivado del uso del juego o de la imposibilidad de usarlo.</p>
      <h3>Muro de la fama</h3>
      <ul>
        <li>El nombre que elijas se muestra públicamente en el muro de la fama junto con tu número de victorias.</li>
        <li>Las victorias contra el ordenador las comunica tu navegador y no se verifican; la clasificación es solo por diversión.</li>
        <li><strong>El muro de la fama puede borrarse, reiniciarse o cambiar en cualquier momento sin previo aviso</strong>, y no nos comprometemos a conservarlo.</li>
        <li>Podemos eliminar cualquier nombre a nuestra discreción, en especial los ofensivos.</li>
      </ul>
      <h3>Privacidad</h3>
      <ul>
        <li>Sin anuncios, sin seguimiento, sin cookies.</li>
        <li>En las partidas en línea, los nombres y las jugadas pasan por el servidor del juego y solo se guardan en memoria durante la partida (se borran como máximo unas horas después de la última actividad).</li>
        <li>El muro de la fama guarda solo el nombre, el número de victorias y la fecha de la última victoria.</li>
        <li>Tu dispositivo guarda localmente tus ajustes, nombres, idioma, tema y preferencias de sonido y movimiento.</li>
      </ul>
      <h3>General</h3>
      <ul>
        <li>No uses nombres ofensivos.</li>
        <li>El servicio puede cambiar o interrumpirse en cualquier momento sin previo aviso.</li>
      </ul>
      <p class="updated">Última actualización: ${UPDATED}</p>`,
    accessibility: `
      <p>Queremos que todo el mundo pueda disfrutar del juego. La interfaz está diseñada para cumplir las <strong>WCAG 2.2 nivel AAA</strong> allí donde se aplican.</p>
      <h3>Qué admitimos</h3>
      <ul>
        <li><strong>Solo teclado:</strong> todo funciona con el teclado: hoyos (1–6 o botones con Tab), cartas mágicas, cámara (flechas, +/−, 0), menús y ventanas. El foco se queda dentro de la ventana abierta y Escape la cierra.</li>
        <li><strong>Lectores de pantalla:</strong> se anuncian las jugadas, capturas, turnos extra, cartas mágicas, resultados y de quién es el turno. Todos los botones tienen etiqueta y el tablero también se describe con texto.</li>
        <li><strong>Contraste mejorado:</strong> al menos 7:1 en todo el texto, en tema claro y oscuro. Los colores de los jugadores siempre van con símbolos (🔥/❄️) y texto.</li>
        <li><strong>Temas claro y oscuro</strong> según el sistema o a elección.</li>
        <li><strong>Tamaño de los objetivos:</strong> cada botón mide al menos 44×44 píxeles.</li>
        <li><strong>Movimiento:</strong> el interruptor «Reducir movimiento» (por defecto según el sistema) desactiva partículas y confeti y acorta las animaciones. Nada parpadea.</li>
        <li><strong>Sonido:</strong> la música y los efectos se desactivan por separado; ninguna información se da solo con sonido.</li>
        <li><strong>Sin límites de tiempo:</strong> no hay cronómetro de jugada y las actualizaciones nunca recargan la página sin tu permiso.</li>
        <li><strong>Idioma y texto:</strong> seis idiomas, incluidos hebreo y árabe de derecha a izquierda; páginas informativas con ancho e interlineado cómodos; el texto se puede ampliar hasta el 200 %.</li>
        <li><strong>Ayuda:</strong> una página «Cómo se juega» y una explicación integrada de cada carta mágica.</li>
      </ul>
      <h3>Limitaciones conocidas</h3>
      <ul>
        <li>El tablero 3D es visual; toda su información también está disponible como texto y en los anuncios del lector de pantalla.</li>
        <li>Los nombres de los jugadores los escriben los usuarios y no se traducen.</li>
        <li>Las traducciones distintas del hebreo y el inglés aún no han sido revisadas por hablantes nativos.</li>
      </ul>
      <h3>¿Algún problema?</h3>
      <p>Nos encantará saberlo: ${link('abre una incidencia en GitHub')}.</p>
      <p class="updated">Última actualización: ${UPDATED}</p>`,
  },
};
