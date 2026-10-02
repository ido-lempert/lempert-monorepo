/**
 * The look of each of the 10 worlds: the same little round world dressed differently – ground colours, the
 * grass (or sand, or snow), what grows around the rim, and the light (the night world is lit by fireflies).
 */
import * as THREE from 'three';
import type { Theme } from '../game/levels';
import { canvasTexture } from './look';

export type Decor = 'flowers' | 'shells' | 'leaves' | 'candy' | 'pinecones' | 'cactus' | 'snow' | 'glow' | 'stones' | 'cherries' | 'veggies' | 'reeds' | 'crumbs';

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
  /** A pattern drawn on the ground instead of plain patches (a picnic cloth, wood grain, icing, a lily pad). */
  pattern?: 'checks' | 'wood' | 'icing' | 'lily';
  /** Shiny ground (icing, a lily pad). */
  gloss?: boolean;
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
    // A golden sand with a turquoise sea rim, so the world reads against the pale counter.
    ground: ['#e8bd76', '#f5d796', '#cc9a4f'], blades: { h: [0.2, 0.26], s: [0.4, 0.5], l: [0.4, 0.5], amount: 0.12, height: 1.6 },
    lip: '#27aebf', soil: ['#c4924f', '#a1743a', '#d6a96b'], decor: 'shells', colors: ['#ffb6c9', '#fff3e0', '#ffcf9a', '#a8e6ff'],
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
    // Deeper terracotta sand, so the world stands out from the pale wooden counter instead of blending into it.
    ground: ['#dc9150', '#efb272', '#b9672f'], blades: { h: [0.1, 0.14], s: [0.45, 0.55], l: [0.42, 0.52], amount: 0.1, height: 0.8 },
    lip: '#7c401c', soil: ['#a3562a', '#7c401c', '#c07038'], decor: 'cactus', colors: ['#4fae4a', '#ff6fa8', '#ffd23f'],
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
  picnic: {
    ground: ['#ffffff', '#ff6b6b', '#e04848'], blades: { h: [0, 0], s: [0, 0], l: [0, 0], amount: 0, height: 1 },
    lip: '#e04848', soil: ['#ff6b6b', '#ffffff', '#e04848'], decor: 'crumbs', colors: ['#ffd166', '#ff6b6b', '#7ed957'], pattern: 'checks',
  },
  board: {
    ground: ['#e3b57a', '#f0c993', '#c99355'], blades: { h: [0, 0], s: [0, 0], l: [0, 0], amount: 0, height: 1 },
    lip: '#b47a3e', soil: ['#c98a4b', '#a86f36', '#d29a5c'], decor: 'veggies', colors: ['#ff4d4d', '#7ed957', '#ffd23f', '#ffffff'], pattern: 'wood',
  },
  cake: {
    ground: ['#f7c6da', '#ffe0ec', '#ef9fc0'], blades: { h: [0, 0], s: [0, 0], l: [0, 0], amount: 0, height: 1 },
    lip: '#f2a6c6', soil: ['#e8b46e', '#fff1df', '#d99e58'], decor: 'cherries', colors: ['#e0002a', '#ff4d8d', '#4dd0ff', '#ffe14d'], pattern: 'icing',
  },
  lily: {
    ground: ['#58b94a', '#8ad46a', '#3f9a3a'], blades: { h: [0.25, 0.3], s: [0.5, 0.6], l: [0.4, 0.5], amount: 0.08, height: 1.4 },
    lip: '#3f8a34', soil: ['#3f8a34', '#2f6f2a', '#4a9a3e'], decor: 'reeds', colors: ['#ffb3d9', '#ffffff', '#ffe14d'], pattern: 'lily', gloss: true,
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
    const pattern = THEMES[theme].pattern;
    if (pattern === 'checks') {
      // A gingham picnic cloth.
      // Cream, not pure white: white under the sun would flare in the glow pass and wash the cloth out.
      g.fillStyle = '#f1e6d6';
      g.fillRect(0, 0, s, s);
      const n = 8;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          g.fillStyle = x % 2 && y % 2 ? '#d23c3c' : x % 2 || y % 2 ? 'rgba(210, 60, 60, 0.5)' : '#f1e6d6';
          g.fillRect((x * s) / n, (y * s) / n, s / n, s / n);
        }
      return;
    }
    if (pattern === 'wood') {
      for (let y = 0; y < s; y += 3) {
        g.strokeStyle = tint(rnd() < 0.5 ? light : dark, 0.35);
        g.lineWidth = 1 + rnd() * 2;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + rnd() * 6 - 3, s * 0.7, y + rnd() * 6 - 3, s, y);
        g.stroke();
      }
      g.fillStyle = tint(dark, 0.5);
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.ellipse(rnd() * s, rnd() * s, 10, 5, 0, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    if (pattern === 'icing') {
      // Swirls of icing and sprinkles.
      g.strokeStyle = tint(light, 0.8);
      g.lineWidth = 6;
      for (let i = 0; i < 26; i++) {
        g.beginPath();
        g.arc(rnd() * s, rnd() * s, 10 + rnd() * 26, rnd() * 6, rnd() * 6 + 3);
        g.stroke();
      }
      const sprinkles = ['#ff4d8d', '#4dd0ff', '#ffe14d', '#7dff8a', '#b98cff'];
      for (let i = 0; i < 260; i++) {
        g.save();
        g.translate(rnd() * s, rnd() * s);
        g.rotate(rnd() * 6);
        g.fillStyle = sprinkles[i % sprinkles.length];
        g.beginPath();
        g.roundRect(-5, -1.5, 10, 3, 1.5);
        g.fill();
        g.restore();
      }
      return;
    }
    if (pattern === 'lily') {
      // Veins of a lily pad.
      g.strokeStyle = tint(light, 0.7);
      g.lineWidth = 3;
      for (let i = 0; i < 30; i++) {
        const x = rnd() * s;
        const y = rnd() * s;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 20, y + rnd() * 40 - 20, x + 50, y + rnd() * 40 - 20);
        g.stroke();
      }
      return;
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
