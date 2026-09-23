import type { Lang } from './index';

export type PageId = 'rules' | 'terms' | 'accessibility';

const ISSUES = 'https://github.com/ido-lempert/lempert-monorepo/issues';
const link = (text: string) => `<a href="${ISSUES}" target="_blank" rel="noopener">${text}</a>`;
const UPDATED = '2026-09-23';

/** Long-form page content per language (trusted, static HTML). */
export const PAGES: Record<Lang, Record<PageId, string>> = {
  he: {
    rules: `
      <ul>
        <li>לכל שחקן 6 גומות בצד שלו וקופה (הגומה הגדולה) <strong>משמאלו</strong>. בתחילת המשחק יש 4 אבנים בכל גומה.</li>
        <li>בתורך בוחרים אחת הגומות שלך, לוקחים את כל האבנים שבה ומפזרים אבן אחת בכל גומה <strong>עם כיוון השעון</strong> – כולל הקופה שלך, ומדלגים על הקופה של היריב.</li>
        <li>אם האבן האחרונה נוחתת בקופה שלך – <strong>תור נוסף</strong>.</li>
        <li>אם האבן האחרונה נוחתת בגומה ריקה בצד שלך, והגומה שממול אינה ריקה – <strong>לכידה</strong>: האבן שלך וכל האבנים שממול עוברות לקופה שלך.</li>
        <li>כשלאחד השחקנים לא נשארו אבנים בגומות, המשחק נגמר: כל שחקן מוסיף לקופה שלו את האבנים שנשארו בצד שלו. מי שבקופה שלו יותר אבנים – מנצח.</li>
      </ul>
      <h3>שליטה</h3>
      <ul>
        <li>לחיצה על גומה מסומנת כדי לשחק. אפשר גם להשתמש במקשים 1–6 או בכפתורי הגומות (Tab).</li>
        <li>גרירה מסובבת את המצלמה; גלגלת או צביטה – זום.</li>
      </ul>`,
    terms: `
      <p>המשחק ניתן לשימוש חופשי ו<strong>"כמות שהוא" (AS IS), ללא אחריות מכל סוג</strong>, מפורשת או משתמעת – לרבות התאמה למטרה מסוימת, זמינות, רציפות או היעדר תקלות. השימוש הוא על אחריותך בלבד, ולא נהיה אחראים לכל נזק ישיר או עקיף הנובע מהשימוש במשחק או מחוסר האפשרות להשתמש בו.</p>
      <h3>פרטיות</h3>
      <ul>
        <li>אין פרסומות, אין מעקב, אין עוגיות.</li>
        <li>במשחק מרחוק, השמות והמהלכים עוברים דרך שרת המשחק ונשמרים בזיכרון בלבד למשך המשחק (נמחקים לכל המאוחר כמה שעות אחרי הפעילות האחרונה).</li>
        <li>על המכשיר שלך נשמרים מקומית: הגדרות, שמות, שפה והעדפות צליל.</li>
      </ul>
      <h3>כללי</h3>
      <ul>
        <li>אין להשתמש בשמות פוגעניים.</li>
        <li>השירות עשוי להשתנות או להיפסק בכל עת וללא הודעה מוקדמת.</li>
      </ul>
      <p class="updated">עודכן לאחרונה: ${UPDATED}</p>`,
    accessibility: `
      <p>אנחנו רוצים שכל אחד יוכל ליהנות מהמשחק, ופועלים להנגיש אותו בהתאם להנחיות WCAG 2.1 ברמה AA ולתקן הישראלי 5568.</p>
      <h3>מה נעשה</h3>
      <ul>
        <li>ניתן לשחק במקלדת בלבד: מקשים 1–6 או כפתורי הגומות, שמופיעים במעבר עם Tab.</li>
        <li>הודעות על מהלכים, תוצאה ותור מוקראות לקוראי מסך.</li>
        <li>לכל הכפתורים יש תוויות נגישות, והממשק זמין בשש שפות, כולל כיוון ימין-לשמאל.</li>
        <li>ניגודיות צבעים גבוהה, צבעי השחקנים מלווים גם בסמלים (🔥/❄️).</li>
        <li>אפשר לכבות מוזיקה וצלילים. בהגדרת "הפחתת תנועה" במערכת, אנימציות החגיגה מבוטלות.</li>
      </ul>
      <h3>מגבלות ידועות</h3>
      <ul>
        <li>הלוח התלת-ממדי עצמו הוא חזותי; המידע שבו זמין גם בכיתוב הטקסטואלי ובהודעות לקורא המסך.</li>
      </ul>
      <h3>נתקלתם בבעיה?</h3>
      <p>נשמח לשמוע ולתקן: ${link('פתיחת פנייה ב-GitHub')}.</p>
      <p class="updated">עודכן לאחרונה: ${UPDATED}</p>`,
  },
  en: {
    rules: `
      <ul>
        <li>Each player has 6 pits on their side and a store (the big pit) on their <strong>left</strong>. Every pit starts with 4 stones.</li>
        <li>On your turn, pick one of your pits, take all its stones and sow them one by one <strong>clockwise</strong> – including your own store, skipping your opponent's.</li>
        <li>If your last stone lands in your store, you get an <strong>extra turn</strong>.</li>
        <li>If your last stone lands in an empty pit on your side and the opposite pit has stones, you <strong>capture</strong> both into your store.</li>
        <li>When one side runs out of stones, the game ends: each player adds the stones left on their side to their store. Most stones wins.</li>
      </ul>
      <h3>Controls</h3>
      <ul>
        <li>Tap or click a highlighted pit. You can also use keys 1–6 or the pit buttons (Tab).</li>
        <li>Drag to rotate the camera; scroll or pinch to zoom.</li>
      </ul>`,
    terms: `
      <p>This game is free to use and is provided <strong>"AS IS", without warranty of any kind</strong>, express or implied, including fitness for a particular purpose, availability, or freedom from errors. You use it at your own risk, and we are not liable for any direct or indirect damage arising from using, or being unable to use, the game.</p>
      <h3>Privacy</h3>
      <ul>
        <li>No ads, no tracking, no cookies.</li>
        <li>In online games, names and moves pass through the game server and are kept in memory only for the duration of the game (deleted at most a few hours after the last activity).</li>
        <li>Your device stores your settings, names, language and sound preferences locally.</li>
      </ul>
      <h3>General</h3>
      <ul>
        <li>Please don't use offensive names.</li>
        <li>The service may change or stop at any time without notice.</li>
      </ul>
      <p class="updated">Last updated: ${UPDATED}</p>`,
    accessibility: `
      <p>We want everyone to be able to enjoy the game, and aim to meet WCAG 2.1 level AA.</p>
      <h3>What we support</h3>
      <ul>
        <li>Keyboard-only play: keys 1–6 or the pit buttons, which appear when tabbing.</li>
        <li>Moves, turns and results are announced to screen readers.</li>
        <li>All buttons have accessible labels; the interface is available in six languages, including right-to-left.</li>
        <li>High colour contrast; player colours are paired with symbols (🔥/❄️).</li>
        <li>Music and sound can be turned off. With your system's "reduce motion" setting, celebration animations are skipped.</li>
      </ul>
      <h3>Known limitations</h3>
      <ul>
        <li>The 3D board itself is visual; its information is also available as text and screen-reader announcements.</li>
      </ul>
      <h3>Found a problem?</h3>
      <p>We'd love to hear about it: ${link('open an issue on GitHub')}.</p>
      <p class="updated">Last updated: ${UPDATED}</p>`,
  },
  ar: {
    rules: `
      <ul>
        <li>لكل لاعب 6 حفر في جهته ومخزن (الحفرة الكبيرة) على <strong>يساره</strong>. تبدأ كل حفرة بـ 4 حصى.</li>
        <li>في دورك اختر إحدى حفرك، وخذ كل ما فيها ووزّعه حصاةً حصاةً <strong>باتجاه عقارب الساعة</strong> – بما في ذلك مخزنك، مع تخطي مخزن الخصم.</li>
        <li>إذا وقعت الحصاة الأخيرة في مخزنك تحصل على <strong>دور إضافي</strong>.</li>
        <li>إذا وقعت الحصاة الأخيرة في حفرة فارغة في جهتك وكانت الحفرة المقابلة غير فارغة، <strong>تستولي</strong> على الحصى كلها إلى مخزنك.</li>
        <li>عندما تفرغ حفر أحد اللاعبين تنتهي اللعبة: يضيف كل لاعب الحصى المتبقية في جهته إلى مخزنه. الفائز صاحب الحصى الأكثر.</li>
      </ul>
      <h3>التحكم</h3>
      <ul>
        <li>اضغط على حفرة مميزة للعب، أو استخدم المفاتيح 1–6 أو أزرار الحفر (Tab).</li>
        <li>اسحب لتدوير الكاميرا؛ استخدم العجلة أو القرص للتكبير.</li>
      </ul>`,
    terms: `
      <p>اللعبة مجانية وتُقدَّم <strong>"كما هي" دون أي ضمان</strong> صريح أو ضمني، بما في ذلك الملاءمة لغرض معين أو التوفر أو الخلو من الأخطاء. الاستخدام على مسؤوليتك وحدك، ولسنا مسؤولين عن أي ضرر مباشر أو غير مباشر ناتج عن استخدام اللعبة أو تعذر استخدامها.</p>
      <h3>الخصوصية</h3>
      <ul>
        <li>لا إعلانات ولا تتبع ولا ملفات تعريف ارتباط.</li>
        <li>في اللعب عن بُعد تمر الأسماء والحركات عبر خادم اللعبة وتُحفظ في الذاكرة فقط طوال مدة اللعبة (وتُحذف خلال بضع ساعات على الأكثر بعد آخر نشاط).</li>
        <li>يحفظ جهازك محليًا إعداداتك والأسماء واللغة وتفضيلات الصوت.</li>
      </ul>
      <h3>عام</h3>
      <ul>
        <li>يُرجى عدم استخدام أسماء مسيئة.</li>
        <li>قد تتغير الخدمة أو تتوقف في أي وقت دون إشعار.</li>
      </ul>
      <p class="updated">آخر تحديث: ${UPDATED}</p>`,
    accessibility: `
      <p>نريد أن يستمتع الجميع باللعبة، ونسعى إلى الالتزام بإرشادات WCAG 2.1 بمستوى AA.</p>
      <h3>ما ندعمه</h3>
      <ul>
        <li>اللعب بلوحة المفاتيح فقط: المفاتيح 1–6 أو أزرار الحفر التي تظهر عند التنقل بـ Tab.</li>
        <li>تُعلَن الحركات والأدوار والنتائج لقارئات الشاشة.</li>
        <li>لكل الأزرار تسميات وصول، والواجهة متاحة بست لغات منها العربية والعبرية.</li>
        <li>تباين ألوان عالٍ، وألوان اللاعبين مصحوبة برموز (🔥/❄️).</li>
        <li>يمكن إيقاف الموسيقى والأصوات. مع إعداد "تقليل الحركة" في النظام تُلغى رسوم الاحتفال.</li>
      </ul>
      <h3>قيود معروفة</h3>
      <ul>
        <li>اللوح ثلاثي الأبعاد مرئي بطبيعته؛ ومعلوماته متاحة أيضًا نصيًا وعبر إعلانات قارئ الشاشة.</li>
      </ul>
      <h3>واجهت مشكلة؟</h3>
      <p>يسعدنا أن نسمع منك: ${link('افتح بلاغًا على GitHub')}.</p>
      <p class="updated">آخر تحديث: ${UPDATED}</p>`,
  },
  ru: {
    rules: `
      <ul>
        <li>У каждого игрока 6 лунок на своей стороне и амбар (большая лунка) <strong>слева</strong> от него. В начале в каждой лунке 4 камня.</li>
        <li>В свой ход выберите одну из своих лунок, возьмите все камни и раскладывайте по одному <strong>по часовой стрелке</strong> – включая свой амбар и пропуская амбар соперника.</li>
        <li>Если последний камень попал в ваш амбар – <strong>ещё один ход</strong>.</li>
        <li>Если последний камень попал в пустую лунку на вашей стороне, а напротив есть камни, вы <strong>захватываете</strong> их вместе со своим камнем в амбар.</li>
        <li>Когда у одного из игроков заканчиваются камни в лунках, игра завершается: каждый добавляет оставшиеся на своей стороне камни в свой амбар. Побеждает тот, у кого больше.</li>
      </ul>
      <h3>Управление</h3>
      <ul>
        <li>Нажмите на подсвеченную лунку. Можно также использовать клавиши 1–6 или кнопки лунок (Tab).</li>
        <li>Потяните, чтобы повернуть камеру; колесо или щипок – масштаб.</li>
      </ul>`,
    terms: `
      <p>Игра бесплатна и предоставляется <strong>«КАК ЕСТЬ», без каких-либо гарантий</strong>, явных или подразумеваемых, включая пригодность для определённой цели, доступность и отсутствие ошибок. Вы используете её на свой риск; мы не несём ответственности за прямой или косвенный ущерб от использования игры или невозможности её использовать.</p>
      <h3>Конфиденциальность</h3>
      <ul>
        <li>Без рекламы, отслеживания и cookie.</li>
        <li>В онлайн-играх имена и ходы проходят через игровой сервер и хранятся только в памяти на время игры (удаляются не позднее чем через несколько часов после последней активности).</li>
        <li>На вашем устройстве локально хранятся настройки, имена, язык и параметры звука.</li>
      </ul>
      <h3>Общее</h3>
      <ul>
        <li>Пожалуйста, не используйте оскорбительные имена.</li>
        <li>Сервис может измениться или прекратить работу в любое время без уведомления.</li>
      </ul>
      <p class="updated">Последнее обновление: ${UPDATED}</p>`,
    accessibility: `
      <p>Мы хотим, чтобы игрой могли наслаждаться все, и стремимся соответствовать WCAG 2.1 уровня AA.</p>
      <h3>Что поддерживается</h3>
      <ul>
        <li>Игра только с клавиатуры: клавиши 1–6 или кнопки лунок, появляющиеся при переходе по Tab.</li>
        <li>Ходы, очередь и результаты озвучиваются программами чтения с экрана.</li>
        <li>У всех кнопок есть доступные подписи; интерфейс доступен на шести языках, включая языки с письмом справа налево.</li>
        <li>Высокий контраст; цвета игроков дополнены символами (🔥/❄️).</li>
        <li>Музыку и звуки можно отключить. При системной настройке «уменьшить движение» праздничная анимация не показывается.</li>
      </ul>
      <h3>Известные ограничения</h3>
      <ul>
        <li>Сама трёхмерная доска визуальна; её информация доступна также в текстовом виде и в объявлениях для экранных чтецов.</li>
      </ul>
      <h3>Нашли проблему?</h3>
      <p>Будем рады узнать: ${link('создайте обращение на GitHub')}.</p>
      <p class="updated">Последнее обновление: ${UPDATED}</p>`,
  },
  fr: {
    rules: `
      <ul>
        <li>Chaque joueur a 6 trous de son côté et un grenier (le grand trou) à sa <strong>gauche</strong>. Chaque trou commence avec 4 graines.</li>
        <li>À votre tour, choisissez un de vos trous, prenez toutes ses graines et semez-les une par une <strong>dans le sens des aiguilles d'une montre</strong> – y compris dans votre grenier, en sautant celui de l'adversaire.</li>
        <li>Si votre dernière graine tombe dans votre grenier, vous <strong>rejouez</strong>.</li>
        <li>Si votre dernière graine tombe dans un trou vide de votre côté et que le trou opposé contient des graines, vous les <strong>capturez</strong> toutes dans votre grenier.</li>
        <li>Quand un camp n'a plus de graines, la partie se termine : chacun ajoute les graines restant de son côté à son grenier. Le plus de graines l'emporte.</li>
      </ul>
      <h3>Commandes</h3>
      <ul>
        <li>Touchez ou cliquez un trou en surbrillance. Vous pouvez aussi utiliser les touches 1–6 ou les boutons des trous (Tab).</li>
        <li>Glissez pour pivoter la caméra ; molette ou pincement pour zoomer.</li>
      </ul>`,
    terms: `
      <p>Ce jeu est gratuit et fourni <strong>« EN L'ÉTAT », sans aucune garantie</strong>, expresse ou implicite, notamment d'adéquation à un usage particulier, de disponibilité ou d'absence d'erreurs. Vous l'utilisez à vos propres risques ; nous déclinons toute responsabilité pour tout dommage direct ou indirect lié à l'utilisation du jeu ou à l'impossibilité de l'utiliser.</p>
      <h3>Confidentialité</h3>
      <ul>
        <li>Pas de publicité, pas de suivi, pas de cookies.</li>
        <li>En ligne, les noms et les coups transitent par le serveur de jeu et ne sont conservés qu'en mémoire pendant la partie (supprimés au plus tard quelques heures après la dernière activité).</li>
        <li>Votre appareil enregistre localement vos réglages, noms, langue et préférences sonores.</li>
      </ul>
      <h3>Général</h3>
      <ul>
        <li>Merci de ne pas utiliser de noms offensants.</li>
        <li>Le service peut évoluer ou s'arrêter à tout moment sans préavis.</li>
      </ul>
      <p class="updated">Dernière mise à jour : ${UPDATED}</p>`,
    accessibility: `
      <p>Nous voulons que chacun puisse profiter du jeu et visons la conformité WCAG 2.1 niveau AA.</p>
      <h3>Ce qui est pris en charge</h3>
      <ul>
        <li>Jeu au clavier seul : touches 1–6 ou boutons des trous, qui apparaissent avec Tab.</li>
        <li>Les coups, les tours et les résultats sont annoncés aux lecteurs d'écran.</li>
        <li>Tous les boutons ont des libellés accessibles ; l'interface existe en six langues, y compris de droite à gauche.</li>
        <li>Contraste élevé ; les couleurs des joueurs sont accompagnées de symboles (🔥/❄️).</li>
        <li>Musique et sons désactivables. Avec le réglage système « réduire les animations », les animations de célébration sont supprimées.</li>
      </ul>
      <h3>Limites connues</h3>
      <ul>
        <li>Le plateau 3D est visuel ; ses informations sont aussi disponibles en texte et via les annonces du lecteur d'écran.</li>
      </ul>
      <h3>Un problème ?</h3>
      <p>Dites-le-nous : ${link('ouvrir un ticket sur GitHub')}.</p>
      <p class="updated">Dernière mise à jour : ${UPDATED}</p>`,
  },
  es: {
    rules: `
      <ul>
        <li>Cada jugador tiene 6 hoyos en su lado y un almacén (el hoyo grande) a su <strong>izquierda</strong>. Cada hoyo empieza con 4 semillas.</li>
        <li>En tu turno, elige uno de tus hoyos, toma todas sus semillas y siémbralas de una en una <strong>en el sentido de las agujas del reloj</strong>, incluido tu almacén y saltando el del rival.</li>
        <li>Si tu última semilla cae en tu almacén, tienes un <strong>turno extra</strong>.</li>
        <li>Si tu última semilla cae en un hoyo vacío de tu lado y el hoyo de enfrente tiene semillas, las <strong>capturas</strong> todas en tu almacén.</li>
        <li>Cuando un lado se queda sin semillas, la partida termina: cada jugador suma a su almacén las semillas que queden en su lado. Gana quien tenga más.</li>
      </ul>
      <h3>Controles</h3>
      <ul>
        <li>Toca o haz clic en un hoyo resaltado. También puedes usar las teclas 1–6 o los botones de los hoyos (Tab).</li>
        <li>Arrastra para girar la cámara; rueda o pellizco para hacer zoom.</li>
      </ul>`,
    terms: `
      <p>Este juego es gratuito y se ofrece <strong>«TAL CUAL», sin garantía de ningún tipo</strong>, expresa o implícita, incluida la idoneidad para un fin concreto, la disponibilidad o la ausencia de errores. Lo usas bajo tu propia responsabilidad y no respondemos de ningún daño directo o indirecto derivado del uso del juego o de la imposibilidad de usarlo.</p>
      <h3>Privacidad</h3>
      <ul>
        <li>Sin anuncios, sin seguimiento, sin cookies.</li>
        <li>En las partidas en línea, los nombres y las jugadas pasan por el servidor del juego y solo se guardan en memoria durante la partida (se borran como máximo unas horas después de la última actividad).</li>
        <li>Tu dispositivo guarda localmente tus ajustes, nombres, idioma y preferencias de sonido.</li>
      </ul>
      <h3>General</h3>
      <ul>
        <li>No uses nombres ofensivos.</li>
        <li>El servicio puede cambiar o interrumpirse en cualquier momento sin previo aviso.</li>
      </ul>
      <p class="updated">Última actualización: ${UPDATED}</p>`,
    accessibility: `
      <p>Queremos que todo el mundo pueda disfrutar del juego y aspiramos a cumplir las WCAG 2.1 nivel AA.</p>
      <h3>Qué admitimos</h3>
      <ul>
        <li>Juego solo con teclado: teclas 1–6 o los botones de los hoyos, que aparecen al tabular.</li>
        <li>Las jugadas, los turnos y los resultados se anuncian a los lectores de pantalla.</li>
        <li>Todos los botones tienen etiquetas accesibles; la interfaz está en seis idiomas, incluidos de derecha a izquierda.</li>
        <li>Alto contraste; los colores de los jugadores van acompañados de símbolos (🔥/❄️).</li>
        <li>La música y los sonidos se pueden desactivar. Con el ajuste del sistema «reducir movimiento», se omiten las animaciones de celebración.</li>
      </ul>
      <h3>Limitaciones conocidas</h3>
      <ul>
        <li>El tablero 3D es visual; su información también está disponible como texto y en los anuncios del lector de pantalla.</li>
      </ul>
      <h3>¿Algún problema?</h3>
      <p>Nos encantará saberlo: ${link('abre una incidencia en GitHub')}.</p>
      <p class="updated">Última actualización: ${UPDATED}</p>`,
  },
};
