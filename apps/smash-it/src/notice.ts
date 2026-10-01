/**
 * Pop-up notices (toasts, hints, the side-quest pill, banners): they appear, leave on their own after a
 * while, and can be flicked away in any direction with a finger or the mouse. Shown means not `.hidden`.
 */

/** How far (px) a notice has to be dragged before letting go throws it away. */
const THROW = 50;
/** Movement (px) below which a press is still a tap, so the buttons inside keep working. */
const TAP = 8;
/** Matches the `.leaving` transition in style.css. */
const LEAVE_MS = 260;

export class Notice {
  private timer = 0;
  private leaveTimer = 0;
  private dragging = false;

  /** `onGone`: called when it leaves by itself or is swiped away (not when hidden with `hide(true)`). */
  constructor(
    readonly el: HTMLElement,
    private readonly onGone?: () => void,
  ) {
    el.classList.add('notice');
    this.swipeable();
  }

  get shown(): boolean {
    return !this.el.classList.contains('hidden') && !this.el.classList.contains('leaving');
  }

  /** Shows it (again) for `ms` milliseconds; 0 keeps it until hidden. */
  show(ms: number) {
    clearTimeout(this.leaveTimer);
    this.el.classList.remove('hidden', 'leaving');
    this.el.style.transform = '';
    // Restart the entrance animation, also when it was already on screen.
    this.el.style.animation = 'none';
    void this.el.offsetWidth;
    this.el.style.animation = '';
    this.wait(ms);
  }

  /** `instant`: just gone, without the exit animation or `onGone` (the scene changed underneath it). */
  hide(instant = false) {
    clearTimeout(this.timer);
    if (this.el.classList.contains('hidden')) return;
    if (instant) {
      clearTimeout(this.leaveTimer);
      this.el.classList.add('hidden');
      this.el.classList.remove('leaving');
      this.el.style.transform = '';
      return;
    }
    if (this.el.classList.contains('leaving')) return;
    this.el.classList.add('leaving');
    this.leaveTimer = window.setTimeout(() => {
      this.el.classList.add('hidden');
      this.el.classList.remove('leaving');
      this.el.style.transform = '';
    }, LEAVE_MS);
    this.onGone?.();
  }

  private wait(ms: number) {
    clearTimeout(this.timer);
    if (ms > 0) this.timer = window.setTimeout(() => (this.dragging ? this.wait(1000) : this.hide()), ms);
  }

  private swipeable() {
    const el = this.el;
    let start: { x: number; y: number; id: number } | null = null;
    let swiped = false;
    el.addEventListener('pointerdown', (e) => {
      if (!this.shown) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      swiped = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!this.dragging && Math.hypot(dx, dy) < TAP) return;
      if (!this.dragging) {
        // Only now take the pointer, so a plain tap still reaches the button that was pressed.
        this.dragging = true;
        el.classList.add('dragging');
        el.setPointerCapture(e.pointerId);
      }
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (!this.dragging) return;
      this.dragging = false;
      el.classList.remove('dragging');
      swiped = true;
      const d = Math.hypot(dx, dy);
      if (e.type === 'pointerup' && d >= THROW) {
        // Carry on in the direction it was thrown.
        const k = (d + 160) / d;
        el.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        this.hide();
      } else el.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // A drag that ends over a button is not a press of it.
    el.addEventListener(
      'click',
      (e) => {
        if (!swiped) return;
        swiped = false;
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
  }
}
