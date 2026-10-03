import { enUS } from './en-US';
import type { Dict } from './strings';

/**
 * British English: the American text with British spelling and words ("ladybird", "doughnut", "mum") and
 * UK teen slang ("mint", "gutted", "gassed", "proper", "absolute scenes", "sorted"), still clean and short.
 * Only the lines that differ are listed here.
 */
export const enGB: Dict = {
  ...enUS,
  tagline: 'Fling food at bugs and blast the whole world into crumbs. Absolute scenes!',
  metaDescription: 'Smash It! – a 3D catapult game for kids: fling food at daft bugs, build combos and unlock new snacks.',
  updateAvailable: 'New version’s here 🔥',
  coachLong: 'Miles too far! Ease off a bit',
  coachGuide: 'Top tip: the white dots show exactly where the food flies',
  coachCombo: 'Combo! Hit again quick and your points multiply 🔥',
  coachHide: 'Someone’s hiding under the mushroom 👀 Wait for them to come out',
  coachTip: 'Top tip: on this level, {food} is the one to throw',
  bugAbout_snail: 'Slow as anything. Easy hit.',
  bugAbout_ladybug: 'No stress, she’s slow.',
  bugAbout_ant: 'Tiny and speedy. Aim a bit ahead of her.',
  bugAbout_beetle: 'Hide-and-seek champion under the mushrooms.',
  bugAbout_butterfly: 'Changes direction every second. Proper annoying!',
  bugAbout_golden: 'Rare and legs it, but it stretches your combo!',
  king_ladybug: 'King Dotty',
  coachKing: '{name} is here! {n} hits and you’ve won',
  coachKingShell: 'It’s in a bubble shield. Wait for it to pop, then smash it!',
  coachFence: 'Fence in the way! Walk round it, or throw something that flies high over it',
  rotateCcw: 'Turn anticlockwise',
  allStars: 'Three stars! Mental!',
  shareText: 'I got {score} on level {n} in Smash It! {stars} Think you can beat me? 😎',
  prizeSkinText: 'You’ve unlocked a new colour with {n} stars. Mint!',
  joinLead: 'Pick a nickname (not your real name!) and jump on the board. You can leave whenever you like.',
  randomNicks: 'Flying Ant|Fire Beetle|Pro Moth|Turbo Fly|Chill Snail|Boom Bug|Biscuit Jet|Melon Boom|Popcorn Pro|Jelly Jump|Pizza Boss|Donut Don',
  turnBackTitle: 'Oops, the phone’s lying down!',
  gfxLostText: 'Your phone’s too overloaded to draw it. Close other tabs and apps and try again.',
  goldenEscaped: 'Gutted, it got away!',
  goalDone: 'Yes! Another mission sorted!',
  coachGoo: 'Urgh, goo on your screen! You can’t see properly or shoot for a sec. Next time: umbrella in time!',
  coachSpit: 'Watch the green circle on the ground! A bug’s about to spit acid. Step aside or open your umbrella 🌂',
  coachFire: 'Fire in the grass! A bug that runs through flames panics and sprints much faster, so aim a bit ahead 🔥',
  coachKingCharge: 'The king’s kicking up dust, he’s about to charge! Wait for him to stop, then aim 🐎',
  allDone: 'You smashed it!',
  success: 'You smashed it!',
  tryAgain: 'So close! Have another go',
  coachShop: 'You’ve got enough coins for an upgrade! The shop’s open',
  bug_ladybug: 'Ladybird',
  bugs_ladybug: 'ladybirds',
  food_donut: 'Doughnut',
  food_jelly: 'Jelly',
  foodInfo_donut: 'Splits into three rings that roll off every which way.',
  foodInfo_pie: 'Slow, but splats cream over a huge area.',
  privacyBody:
    'The game doesn’t collect personal information, doesn’t ask you to register and doesn’t show adverts. Your progress, coins and settings are saved only on your device (in the browser’s storage), and you can delete them from the menu at any time. If you choose to appear on the leaderboard, only a nickname (not a full name), a random device ID, your stars, your level and your daily challenge score are sent to the server. You can leave the leaderboard at any time, and then everything is deleted from the server. The web version uses anonymous visit counting (Umami): no cookies, no personal ID and no tracking of people across sites, just general numbers on how many people play. There are no purchases and no links out of the game, and the mobile apps have no counting at all. In the mobile apps, the nickname is picked from a list of daft names, so nobody types free text.',
  termsBody:
    'The game is free and made for fun. The bugs in the game are cartoons and nobody gets really hurt: they just spin round dizzy, and then the mop sweeps them off the screen. In the real world, we don’t throw food at anyone 🙂 The game is provided as it is, and we may change it from time to time. Some of the food and kitchen models: Kenney (www.kenney.nl), licensed CC0.',
};
