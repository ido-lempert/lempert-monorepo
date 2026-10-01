/**
 * Short tips that pop up while playing, at the moment they matter (the first hit on a new bug, the first
 * combo, a shot that fell short), instead of a wall of instructions up front. One at a time: they queue,
 * leave on their own after a few seconds and can be swiped away.
 */
import { Notice } from './notice';

export class Coach {
  private readonly notice: Notice;
  private readonly queue: { icon: string; text: string }[] = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly live: HTMLElement,
  ) {
    this.notice = new Notice(el, () => setTimeout(() => this.next(), 300));
  }

  say(icon: string, text: string) {
    if (this.queue.some((q) => q.text === text)) return;
    this.queue.push({ icon, text });
    // Tips are about now: drop ones that waited too long.
    while (this.queue.length > 2) this.queue.shift();
    if (!this.notice.shown) this.next();
  }

  private next() {
    const q = this.queue.shift();
    if (!q) return;
    this.el.replaceChildren(Object.assign(document.createElement('span'), { className: 'coach-icon', textContent: q.icon, ariaHidden: 'true' }), Object.assign(document.createElement('span'), { textContent: q.text }));
    this.live.textContent = q.text;
    this.notice.show(Math.min(5500, 2200 + q.text.length * 40));
  }

  /** Drops whatever is waiting (the scene changed). */
  clear() {
    this.queue.length = 0;
    this.notice.hide(true);
  }
}
