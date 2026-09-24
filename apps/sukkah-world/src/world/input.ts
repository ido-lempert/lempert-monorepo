/**
 * Walking and camera input.
 *   Walking: arrow keys / WASD, or dragging with one finger anywhere on the scene (a floating joystick
 *   appears under the finger). Produces a move vector in screen terms: x right, y up, length 0..1.
 *   Running: Shift, or pushing the joystick well past its edge.
 *   Camera: two fingers (pinch to zoom, slide sideways or twist to turn, slide up/down to tilt), the mouse
 *   wheel to zoom and right-drag to turn and tilt, or the keys , . (turn), + − (zoom), PageUp/PageDown (tilt).
 */

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  KeyW: [0, 1],
  ArrowDown: [0, -1],
  KeyS: [0, -1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

const JOY_RADIUS = 56;
/** Radians of camera turn per pixel of sideways drag. */
const TURN_PER_PX = 0.008;
/** Camera height change per pixel of up/down drag. */
const TILT_PER_PX = 0.006;

interface Touch {
  x0: number;
  y0: number;
  x: number;
  y: number;
}

export class WalkInput {
  private held = new Set<string>();
  /** Every finger or mouse button currently down on the scene. */
  private touches = new Map<number, Touch>();
  /** The pointer driving the joystick (the first finger), if any. */
  private stick: number | null = null;
  /** Set while two fingers (or a right-drag) control the camera. */
  private gesture: { dist: number; angle: number; midX: number; midY: number } | null = null;
  private rightDrag: { x: number; y: number } | null = null;
  private knob: HTMLDivElement;
  private base: HTMLDivElement;
  /** Taps (short presses without dragging) are passed on, e.g. for placing decorations. */
  onTap: (x: number, y: number) => void = () => {};
  /** Horizontal drag in pixels while not walking, e.g. to turn the character in the creator. */
  onDrag: (dx: number) => void = () => {};
  /** Camera gestures: `turn` in radians, `zoom` as a factor (> 1 moves the camera further away), `tilt` up/down. */
  onCamera: (turn: number, zoom: number, tilt?: number) => void = () => {};
  /** While false the drag joystick is off and every press counts as a tap. */
  walking = true;
  private downAt = 0;
  private moved = false;
  private lastX = 0;

  constructor(surface: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'joystick hidden';
    this.base.setAttribute('aria-hidden', 'true');
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.append(this.knob);
    document.body.append(this.base);

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code in KEYS) {
        this.held.add(e.code);
        e.preventDefault();
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.held.add(e.code);
      if (e.key === ',') this.onCamera(-Math.PI / 8, 1);
      if (e.key === '.') this.onCamera(Math.PI / 8, 1);
      if (e.key === '+' || e.key === '=') this.onCamera(0, 0.85);
      if (e.key === '-') this.onCamera(0, 1.18);
      if (e.code === 'PageUp') this.onCamera(0, 1, 0.2);
      if (e.code === 'PageDown') this.onCamera(0, 1, -0.2);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());

    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.onCamera(0, Math.exp(e.deltaY * 0.0015));
      },
      { passive: false },
    );

    surface.addEventListener('pointerdown', (e) => {
      surface.setPointerCapture(e.pointerId);
      this.touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
      if (e.pointerType === 'mouse' && e.button === 2) {
        this.rightDrag = { x: e.clientX, y: e.clientY };
        return;
      }
      if (this.touches.size === 2) {
        // A second finger turns the walk into a camera gesture.
        this.stick = null;
        this.base.classList.add('hidden');
        this.gesture = this.measure();
        return;
      }
      if (this.touches.size > 2 || this.stick !== null) return;
      this.stick = e.pointerId;
      this.downAt = performance.now();
      this.moved = false;
      this.lastX = e.clientX;
    });

    surface.addEventListener('pointermove', (e) => {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      t.x = e.clientX;
      t.y = e.clientY;
      if (this.rightDrag) {
        this.onCamera((e.clientX - this.rightDrag.x) * TURN_PER_PX, 1, (e.clientY - this.rightDrag.y) * TILT_PER_PX);
        this.rightDrag = { x: e.clientX, y: e.clientY };
        return;
      }
      if (this.gesture) {
        const now = this.measure();
        if (!now) return;
        let twist = now.angle - this.gesture.angle;
        twist = Math.atan2(Math.sin(twist), Math.cos(twist));
        this.onCamera((now.midX - this.gesture.midX) * TURN_PER_PX - twist, this.gesture.dist / Math.max(now.dist, 1), (now.midY - this.gesture.midY) * TILT_PER_PX);
        this.gesture = now;
        return;
      }
      if (e.pointerId !== this.stick) return;
      if (!this.moved && Math.hypot(t.x - t.x0, t.y - t.y0) > 10) {
        this.moved = true;
        if (this.walking) this.showJoystick(t.x0, t.y0);
      }
      if (this.moved && this.walking) this.moveKnob();
      if (this.moved && !this.walking) this.onDrag(e.clientX - this.lastX);
      this.lastX = e.clientX;
    });

    const end = (e: PointerEvent) => {
      const t = this.touches.get(e.pointerId);
      this.touches.delete(e.pointerId);
      if (this.rightDrag && e.pointerType === 'mouse') this.rightDrag = null;
      if (this.gesture) {
        // Stay in gesture mode until every finger is lifted, so the leftover finger doesn't start walking.
        if (this.touches.size === 0) this.gesture = null;
        return;
      }
      if (e.pointerId !== this.stick || !t) return;
      if (!this.moved && performance.now() - this.downAt < 400) this.onTap(t.x, t.y);
      this.stick = null;
      this.base.classList.add('hidden');
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
  }

  /** Distance, angle and horizontal midpoint of the first two fingers. */
  private measure() {
    const [a, b] = [...this.touches.values()];
    if (!a || !b) return null;
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  }

  private showJoystick(x: number, y: number) {
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.base.classList.remove('hidden');
  }

  private moveKnob() {
    const [dx, dy] = this.dragVector();
    this.knob.style.transform = `translate(${dx * JOY_RADIUS}px, ${-dy * JOY_RADIUS}px)`;
  }

  private dragVector(): [number, number] {
    const t = this.stick !== null ? this.touches.get(this.stick) : undefined;
    if (!t || !this.moved) return [0, 0];
    const dx = (t.x - t.x0) / JOY_RADIUS;
    const dy = -(t.y - t.y0) / JOY_RADIUS;
    const len = Math.hypot(dx, dy);
    return len > 1 ? [dx / len, dy / len] : [dx, dy];
  }

  /** Running: Shift held, or the joystick pushed well past its edge. */
  running(): boolean {
    if (this.held.has('ShiftLeft') || this.held.has('ShiftRight')) return true;
    const t = this.stick !== null ? this.touches.get(this.stick) : undefined;
    return !!t && this.moved && Math.hypot(t.x - t.x0, t.y - t.y0) > JOY_RADIUS * 1.25;
  }

  /** Current direction, x right / y up (away from the camera), length 0..1. */
  vector(): [number, number] {
    if (!this.walking) return [0, 0];
    let x = 0;
    let y = 0;
    for (const k of this.held) {
      if (!(k in KEYS)) continue;
      x += KEYS[k][0];
      y += KEYS[k][1];
    }
    const len = Math.hypot(x, y);
    if (len > 0) return [x / len, y / len];
    return this.dragVector();
  }

  /** Forgets any pressed keys and ongoing drag, e.g. when a dialog opens. */
  reset() {
    this.held.clear();
    this.touches.clear();
    this.stick = null;
    this.gesture = null;
    this.rightDrag = null;
    this.base.classList.add('hidden');
  }
}
