/**
 * Walking input: arrow keys / WASD, or dragging anywhere on the scene (a floating joystick appears
 * under the finger). Produces a move vector in screen terms: x right, y up, length 0..1.
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

export class WalkInput {
  private held = new Set<string>();
  private pointer: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  private knob: HTMLDivElement;
  private base: HTMLDivElement;
  /** Taps (short presses without dragging) are passed on, e.g. for placing decorations. */
  onTap: (x: number, y: number) => void = () => {};
  /** Horizontal drag in pixels while not walking, e.g. to turn the character in the creator. */
  onDrag: (dx: number) => void = () => {};
  private lastX = 0;
  /** While false the drag joystick is off and every press counts as a tap. */
  walking = true;
  private downAt = 0;
  private moved = false;

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
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());

    surface.addEventListener('pointerdown', (e) => {
      if (this.pointer) return;
      surface.setPointerCapture(e.pointerId);
      this.pointer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      this.downAt = performance.now();
      this.moved = false;
      this.lastX = e.clientX;
    });
    surface.addEventListener('pointermove', (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (!this.moved && Math.hypot(p.x - p.x0, p.y - p.y0) > 10) {
        this.moved = true;
        if (this.walking) this.showJoystick(p.x0, p.y0);
      }
      if (this.moved && this.walking) this.moveKnob();
      if (this.moved && !this.walking) this.onDrag(e.clientX - this.lastX);
      this.lastX = e.clientX;
    });
    const end = (e: PointerEvent) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      if (!this.moved && performance.now() - this.downAt < 400) this.onTap(p.x, p.y);
      this.pointer = null;
      this.base.classList.add('hidden');
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
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
    const p = this.pointer;
    if (!p || !this.moved) return [0, 0];
    const dx = (p.x - p.x0) / JOY_RADIUS;
    const dy = -(p.y - p.y0) / JOY_RADIUS;
    const len = Math.hypot(dx, dy);
    return len > 1 ? [dx / len, dy / len] : [dx, dy];
  }

  /** Current direction, x right / y up (away from the camera), length 0..1. */
  vector(): [number, number] {
    if (!this.walking) return [0, 0];
    let x = 0;
    let y = 0;
    for (const k of this.held) {
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
    this.pointer = null;
    this.base.classList.add('hidden');
  }
}
