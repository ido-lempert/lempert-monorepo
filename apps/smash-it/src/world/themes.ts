/**
 * The look of each of the 10 worlds: the same little round world dressed differently – ground colours, the
 * grass (or sand, or snow), what grows around the rim, and the light (the night world is lit by fireflies).
 */
import * as THREE from 'three';
import type { Theme } from '../game/levels';
import { canvasTexture } from './look';

export type Decor = 'flowers' | 'shells' | 'leaves' | 'candy' | 'pinecones' | 'cactus' | 'snow' | 'glow' | 'stones';

export interface ThemeLook {
  /** Ground colours: base, light patches, dark patches. */
  ground: [string, string, string];
  /** Grass blades: hue, saturation and lightness ranges (0..1), how many (0..1), and how tall. */
  blades: { h: [number, number]; s: [number, number]; l: [number, number]; amount: number; height: number };
  lip: string;
  soil: [string, string, string];
  decor: Decor;
  colors: string[];
  /** Darker, bluish light. */
  night?: boolean;
}

export const THEMES: Record<Theme, ThemeLook> = {
  garden: {
    ground: ['#5fbf45', '#aae66e', '#2f8a37'], blades: { h: [0.26, 0.32], s: [0.42, 0.57], l: [0.36, 0.48], amount: 1, height: 1 },
    lip: '#2f6f26', soil: ['#8a5530', '#6e4024', '#9c6a42'], decor: 'flowers', colors: ['#ff6fa8', '#ffd23f', '#ffffff', '#b98cff', '#ff9a3c'],
  },
  meadow: {
    ground: ['#7fcf4f', '#c8f07a', '#4f9a37'], blades: { h: [0.2, 0.3], s: [0.5, 0.65], l: [0.42, 0.55], amount: 1, height: 1.3 },
    lip: '#3f7f2a', soil: ['#8a5a30', '#704426', '#a0703f'], decor: 'flowers', colors: ['#ffffff', '#ffe14d', '#ff8fb3', '#8fd3ff'],
  },
  beach: {
    ground: ['#f3d9a4', '#fff0c8', '#d9b77a'], blades: { h: [0.22, 0.28], s: [0.35, 0.45], l: [0.45, 0.55], amount: 0.12, height: 1.6 },
    lip: '#e0c08a', soil: ['#d9b77a', '#c69d5c', '#e6c995'], decor: 'shells', colors: ['#ffb6c9', '#fff3e0', '#ffcf9a', '#a8e6ff'],
  },
  autumn: {
    ground: ['#c9a04a', '#e8c46a', '#9a6a2a'], blades: { h: [0.06, 0.13], s: [0.6, 0.75], l: [0.42, 0.55], amount: 0.8, height: 0.9 },
    lip: '#8a5a20', soil: ['#7a4a26', '#5e381c', '#8e5c32'], decor: 'leaves', colors: ['#ff7a2f', '#ffb000', '#d63a2f', '#a0522d'],
  },
  candy: {
    ground: ['#ffb3d9', '#ffe0f0', '#ff7ec0'], blades: { h: [0.85, 0.98], s: [0.55, 0.75], l: [0.7, 0.82], amount: 0.6, height: 0.8 },
    lip: '#ff6fb0', soil: ['#8a4a2a', '#ffffff', '#b06a3a'], decor: 'candy', colors: ['#ff4d8d', '#4dd0ff', '#ffe14d', '#7dff8a', '#b98cff'],
  },
  forest: {
    ground: ['#3f8f3a', '#6fbf4f', '#1f5f2a'], blades: { h: [0.28, 0.36], s: [0.45, 0.6], l: [0.25, 0.38], amount: 1, height: 1.2 },
    lip: '#1f4f1f', soil: ['#5e3a1c', '#4a2c14', '#6e4626'], decor: 'pinecones', colors: ['#8a5530', '#ff6f6f', '#ffd166'],
  },
  desert: {
    ground: ['#f0c47a', '#ffe0a0', '#d49a4a'], blades: { h: [0.12, 0.16], s: [0.4, 0.5], l: [0.5, 0.6], amount: 0.1, height: 0.8 },
    lip: '#c98a3a', soil: ['#c98a4a', '#a8682e', '#dca060'], decor: 'cactus', colors: ['#4fae4a', '#ff6fa8', '#ffd23f'],
  },
  snow: {
    ground: ['#d6e4f2', '#eaf2fb', '#b4c8de'], blades: { h: [0.55, 0.6], s: [0.2, 0.35], l: [0.7, 0.82], amount: 0.25, height: 0.7 },
    lip: '#d0e4f8', soil: ['#8aa0b8', '#6e84a0', '#a8bcd0'], decor: 'snow', colors: ['#ffffff', '#ff6f6f', '#4dd0ff'],
  },
  night: {
    ground: ['#2f6a5a', '#4f9a7a', '#1a3f3a'], blades: { h: [0.4, 0.5], s: [0.35, 0.5], l: [0.22, 0.34], amount: 1, height: 1 },
    lip: '#173a33', soil: ['#3a2a4a', '#2a1e3a', '#4a3a5a'], decor: 'glow', colors: ['#7dfff0', '#ffe066', '#ff8fd8'], night: true,
  },
  castle: {
    ground: ['#b8b0c8', '#d8d2e4', '#8a82a0'], blades: { h: [0.25, 0.32], s: [0.4, 0.55], l: [0.35, 0.45], amount: 0.3, height: 0.8 },
    lip: '#7a7090', soil: ['#8a8098', '#6a6078', '#9a90a8'], decor: 'stones', colors: ['#ff4d6d', '#ffd23f', '#4d8dff'],
  },
};

const groundCache = new Map<Theme, THREE.CanvasTexture>();

/** The ground: soft patches of lighter and darker colour, with little strokes (grass, sand grains, snow). */
export function groundTexture(theme: Theme): THREE.CanvasTexture {
  let tex = groundCache.get(theme);
  if (tex) return tex;
  const [base, light, dark] = THEMES[theme].ground;
  tex = canvasTexture(512, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const tint = (hex: string, a: number) => {
      const c = new THREE.Color(hex);
      return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
    };
    for (let i = 0; i < 40; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 30 + rnd() * 70;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, tint(rnd() < 0.5 ? light : dark, 0.4));
      grad.addColorStop(1, tint(base, 0));
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (theme === 'castle') {
      // Flagstones.
      g.strokeStyle = tint(dark, 0.7);
      g.lineWidth = 3;
      for (let y = 0; y < s; y += 64)
        for (let x = (y / 64) % 2 ? 32 : 0; x < s; x += 64) {
          g.beginPath();
          g.roundRect(x + 2, y + 2, 60, 60, 8);
          g.stroke();
        }
    }
    for (let i = 0; i < 5000; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      g.strokeStyle = tint(rnd() < 0.5 ? light : dark, 0.45);
      g.lineWidth = 1 + rnd();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 4, y - 2 - rnd() * 5);
      g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  groundCache.set(theme, tex);
  return tex;
}
