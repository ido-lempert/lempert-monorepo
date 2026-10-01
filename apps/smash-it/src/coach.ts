/**
 * The one channel for messages while playing: tips at the moment they matter (the first hit on a new
 * bug, the first combo, a short shot) and game events ("Golden beetle!"). One at a time, so they never
 * pile up: events jump the queue, old tips are dropped, and everything waits while a big banner is up.
 * Each message leaves on its own after a few seconds and can be swiped away.
 */
import { Notice } from './notice';

interface Message {
  icon: string;
  text: string;
}

export class Coach {
  private readonly notice: Notice;
  private readonly queue: Message[] = [];
  private heldUntil = 0;
  private holdTimer = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly live: HTMLElement,
  ) {
    this.notice = new Notice(el, () => setTimeout(() => this.next(), 300));
  }

  /** `urgent`: a game event, shown before any waiting tips (and replacing the current one). */
  say(icon: string, text: string, urgent = false) {
    if (this.queue.some((q) => q.text === text)) return;
    if (urgent) this.queue.unshift({ icon, text });
    else this.queue.push({ icon, text });
    // Tips are about now: drop ones that waited too long.
    while (this.queue.length > 2) this.queue.splice(1, 1);
    if (urgent && this.notice.shown) this.notice.hide(true);
    if (!this.notice.shown) this.next();
  }

  /** Steps aside for `ms` (a big banner is showing). */
  hold(ms: number) {
    this.heldUntil = performance.now() + ms;
    if (this.notice.shown) {
      // Put it back in line to show again afterwards.
      const text = this.el.lastElementChild?.textContent ?? '';
      const icon = this.el.firstElementChild?.textContent ?? '';
      if (text && !this.queue.some((q) => q.text === text)) this.queue.unshift({ icon, text });
      this.notice.hide(true);
    }
    clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(() => this.next(), ms + 50);
  }

  private next() {
    if (this.notice.shown || performance.now() < this.heldUntil) return;
    const q = this.queue.shift();
    if (!q) return;
    this.el.replaceChildren(
      Object.assign(document.createElement('span'), { className: 'coach-icon', textContent: q.icon, ariaHidden: 'true' }),
      Object.assign(document.createElement('span'), { textContent: q.text }),
    );
    this.live.textContent = q.text;
    this.notice.show(Math.min(5000, 2000 + q.text.length * 38));
  }

  /** Drops whatever is waiting (the scene changed). */
  clear() {
    this.queue.length = 0;
    clearTimeout(this.holdTimer);
    this.notice.hide(true);
  }
}
