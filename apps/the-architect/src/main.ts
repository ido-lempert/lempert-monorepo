/** Wires the screens to the world. */
import '@fontsource-variable/rubik';
import { registerSW } from 'virtual:pwa-register';
import { t } from './i18n/strings';
import './style.css';
import { restaurant } from './world/restaurant';
import { World } from './world/world';

const $ = (id: string) => document.getElementById(id)!;

const stageEl = $('stage');
stageEl.setAttribute('aria-label', t.stage);
const world = new World(stageEl);
world.stage.add(restaurant());
world.controls.autoRotate = true;
world.controls.autoRotateSpeed = 0.6;

$('title-name').textContent = t.title;
$('title-tag').textContent = t.tagline;
$('play').textContent = t.play;

$('play').onclick = () => {
  $('title').classList.add('hidden');
  world.controls.autoRotate = false;
  $('note').textContent = t.soon;
  $('note').classList.remove('hidden');
  setTimeout(() => $('note').classList.add('hidden'), 5000);
};

const updateSW = registerSW({
  onNeedRefresh() {
    $('update-text').textContent = t.update;
    $('update-btn').textContent = t.updateNow;
    $('update-btn').onclick = () => updateSW(true);
    $('update').classList.remove('hidden');
    setTimeout(() => $('update').classList.add('hidden'), 8000);
  },
});

requestAnimationFrame(() => $('splash').classList.add('done'));

if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { world };
