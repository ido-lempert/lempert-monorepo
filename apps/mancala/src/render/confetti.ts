const COLORS = ['#f5a524', '#ff5a1f', '#ffe066', '#3fb8ff', '#bdf4ff', '#a8e063', '#ff6fb5', '#ffffff'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  w: number;
  h: number;
  color: string;
  wobble: number;
}

/** Celebration burst on a full-screen 2D canvas. Skipped for users who prefer reduced motion. */
export function confetti(durationMs = 4500) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const dpr = Math.min(devicePixelRatio, 2);
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();
  addEventListener('resize', resize);
  const g = canvas.getContext('2d')!;

  const pieces: Piece[] = [];
  const burst = (fromX: number, dir: number) => {
    for (let i = 0; i < 110; i++) {
      const speed = 9 + Math.random() * 11;
      const a = -Math.PI / 2 + dir * (0.25 + Math.random() * 0.55);
      pieces.push({
        x: fromX,
        y: innerHeight + 10,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 1.35,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.4,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        wobble: Math.random() * Math.PI * 2,
      });
    }
  };
  burst(innerWidth * 0.05, 1);
  burst(innerWidth * 0.95, -1);
  setTimeout(() => burst(innerWidth * 0.5, Math.random() < 0.5 ? 0.3 : -0.3), 350);

  const start = performance.now();
  let last = start;
  const frame = (now: number) => {
    const dt = Math.min(2, (now - last) / 16.7);
    last = now;
    const fade = Math.max(0, Math.min(1, (start + durationMs - now) / 800));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pieces) {
      p.vy += 0.32 * dt;
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.wobble += 0.12 * dt;
      p.x += (p.vx + Math.sin(p.wobble) * 1.2) * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      g.save();
      g.globalAlpha = fade;
      g.translate(p.x, p.y);
      g.rotate(p.angle);
      g.scale(1, Math.cos(p.wobble)); // flutter
      g.fillStyle = p.color;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    if (now - start < durationMs) requestAnimationFrame(frame);
    else {
      removeEventListener('resize', resize);
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}
