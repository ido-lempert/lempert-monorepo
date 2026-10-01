/**
 * Sound effects and music, all synthesised with Web Audio (no files, so it works offline). Browsers only
 * allow sound after a user gesture, so everything starts on the first tap or key press.
 */

export type Sfx =
  | 'click'
  | 'stretch'
  | 'launch'
  | 'crunch'
  | 'pop'
  | 'splat'
  | 'boing'
  | 'smash'
  | 'squeak'
  | 'combo'
  | 'mega'
  | 'coin'
  | 'tick'
  | 'buzzer'
  | 'win'
  | 'lose'
  | 'swish'
  | 'gurgle'
  | 'buy'
  | 'whoosh';

/** menu: bouncy and relaxed; play: upbeat; hurry: the last seconds; quiet: nothing. */
export type Theme = 'menu' | 'play' | 'hurry' | 'quiet';

const KEY = 'smashIt.sound';
const MUSIC_VOLUME = 0.1;

interface Prefs {
  music: boolean;
  sfx: boolean;
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Melodies as MIDI notes per eighth (0 = rest). */
const TUNES: Record<Exclude<Theme, 'quiet'>, { tempo: number; lead: number[]; bass: number[] }> = {
  menu: {
    tempo: 112,
    lead: [72, 0, 76, 79, 76, 0, 72, 74, 76, 0, 74, 72, 69, 0, 0, 0, 72, 0, 76, 79, 81, 79, 76, 74, 72, 74, 76, 74, 72, 0, 0, 0],
    bass: [48, 0, 55, 0, 53, 0, 55, 0, 45, 0, 52, 0, 50, 0, 55, 0, 48, 0, 55, 0, 53, 0, 57, 0, 55, 0, 50, 0, 48, 0, 55, 0],
  },
  play: {
    tempo: 132,
    lead: [76, 79, 81, 79, 76, 0, 74, 76, 72, 0, 74, 0, 76, 74, 72, 0, 76, 79, 81, 84, 81, 79, 76, 0, 74, 76, 74, 72, 74, 0, 0, 0],
    bass: [45, 0, 52, 45, 48, 0, 52, 0, 41, 0, 48, 41, 43, 0, 50, 0, 45, 0, 52, 45, 48, 0, 52, 0, 43, 0, 50, 43, 45, 0, 52, 0],
  },
  hurry: {
    tempo: 168,
    lead: [76, 76, 79, 76, 81, 79, 76, 74, 76, 76, 79, 76, 83, 81, 79, 76],
    bass: [45, 52, 45, 52, 48, 55, 48, 55, 43, 50, 43, 50, 45, 52, 40, 47],
  },
};

export class Sound {
  prefs: Prefs = { music: true, sfx: true };
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private theme: Theme = 'menu';
  private nextNote = 0;
  private step = 0;

  constructor() {
    try {
      this.prefs = { ...this.prefs, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      /* defaults */
    }
    const unlock = () => {
      this.start();
      removeEventListener('pointerdown', unlock);
      removeEventListener('keydown', unlock);
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private start() {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    this.musicBus.connect(lp).connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyPrefs();
    this.nextNote = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 50);
  }

  setMusic(on: boolean) {
    this.prefs.music = on;
    this.save();
  }

  setSfx(on: boolean) {
    this.prefs.sfx = on;
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs));
    } catch {
      /* ignore */
    }
    this.applyPrefs();
  }

  private applyPrefs() {
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(this.prefs.music ? MUSIC_VOLUME : 0, this.ctx.currentTime, 0.2);
    this.sfxBus.gain.setTargetAtTime(this.prefs.sfx ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  setTheme(theme: Theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    this.step = 0;
  }

  // --- Music -----------------------------------------------------------------------------------------

  private schedule() {
    const ctx = this.ctx!;
    if (this.theme === 'quiet') {
      this.nextNote = ctx.currentTime + 0.1;
      return;
    }
    const tune = TUNES[this.theme];
    const eighth = 30 / tune.tempo;
    while (this.nextNote < ctx.currentTime + 0.2) {
      const i = this.step % tune.lead.length;
      const lead = tune.lead[i];
      const bass = tune.bass[i % tune.bass.length];
      if (lead) this.note(this.musicBus, midi(lead), this.nextNote, eighth * 0.9, 'square', 0.18);
      if (bass) this.note(this.musicBus, midi(bass), this.nextNote, eighth * 0.8, 'triangle', 0.5);
      // A soft shaker on the off-beats.
      if (i % 2 === 1) this.hiss(this.musicBus, this.nextNote, 0.04, 6000, 0.12);
      this.nextNote += eighth;
      this.step++;
    }
  }

  private note(bus: AudioNode, freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(bus);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private hiss(bus: AudioNode, at: number, dur: number, freq: number, vol: number, q = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  /** A tone gliding from one pitch to another. */
  private glide(from: number, to: number, at: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  // --- Effects ---------------------------------------------------------------------------------------

  /** `level`: pitch step for climbing sounds (combo) or pull strength (stretch). */
  play(sfx: Sfx, level = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.prefs.sfx) return;
    const t = ctx.currentTime;
    const bus = this.sfxBus;
    switch (sfx) {
      case 'click':
        this.note(bus, 880, t, 0.06, 'square', 0.12);
        break;
      case 'stretch':
        this.glide(180 + level * 220, 200 + level * 260, t, 0.08, 'sawtooth', 0.05);
        break;
      case 'launch':
        this.glide(320, 900, t, 0.18, 'triangle', 0.35);
        this.hiss(bus, t, 0.25, 1500, 0.25);
        break;
      case 'whoosh':
        this.hiss(bus, t, 0.5, 900, 0.2, 0.7);
        break;
      case 'crunch':
        for (let i = 0; i < 4; i++) this.hiss(bus, t + i * 0.03, 0.06, 2500 + i * 600, 0.6, 2);
        break;
      case 'pop':
        for (let i = 0; i < 8; i++) this.glide(900 + Math.random() * 900, 300, t + i * 0.025 + Math.random() * 0.02, 0.05, 'square', 0.12);
        break;
      case 'splat':
        this.hiss(bus, t, 0.35, 400, 0.9, 0.8);
        this.glide(220, 60, t, 0.25, 'sine', 0.5);
        break;
      case 'smash':
        this.hiss(bus, t, 0.5, 700, 1, 0.6);
        this.glide(160, 40, t, 0.4, 'sine', 0.7);
        break;
      case 'boing':
        this.glide(150, 520, t, 0.25, 'sine', 0.45);
        this.glide(520, 300, t + 0.12, 0.2, 'sine', 0.25);
        break;
      case 'squeak': {
        // A cartoon "eep!" – a little higher each time so crowds sound like a choir.
        const base = 900 + (level % 5) * 120 + Math.random() * 80;
        this.glide(base, base * 1.8, t, 0.12, 'sine', 0.3);
        this.glide(base * 1.8, base * 1.2, t + 0.1, 0.15, 'sine', 0.2);
        break;
      }
      case 'combo': {
        const notes = [72, 76, 79, 84, 88];
        const n = notes[Math.min(notes.length - 1, Math.max(0, level - 2))];
        this.note(bus, midi(n), t, 0.12, 'square', 0.2);
        this.note(bus, midi(n + 7), t + 0.08, 0.18, 'square', 0.18);
        break;
      }
      case 'mega':
        [72, 76, 79, 84, 88, 91].forEach((n, i) => this.note(bus, midi(n), t + i * 0.07, 0.25, 'square', 0.2));
        this.hiss(bus, t + 0.4, 0.6, 5000, 0.3);
        break;
      case 'coin':
        this.note(bus, midi(88), t, 0.08, 'square', 0.15);
        this.note(bus, midi(95), t + 0.07, 0.18, 'square', 0.15);
        break;
      case 'tick':
        this.note(bus, 1200, t, 0.04, 'square', 0.12);
        break;
      case 'buzzer':
        this.note(bus, 220, t, 0.5, 'sawtooth', 0.25);
        this.note(bus, 233, t, 0.5, 'square', 0.15);
        break;
      case 'win':
        [60, 64, 67, 72, 67, 72, 76, 79].forEach((n, i) => this.note(bus, midi(n + 12), t + i * 0.1, 0.22, 'square', 0.18));
        break;
      case 'lose':
        [67, 66, 65, 64].forEach((n, i) => this.note(bus, midi(n), t + i * 0.22, i === 3 ? 0.6 : 0.2, 'triangle', 0.4));
        break;
      case 'swish':
        this.hiss(bus, t, 0.35, 1200, 0.35, 0.5);
        break;
      case 'gurgle':
        for (let i = 0; i < 6; i++) this.glide(200 + Math.random() * 300, 600 + Math.random() * 400, t + i * 0.07, 0.07, 'sine', 0.2);
        break;
      case 'buy':
        [76, 79, 84].forEach((n, i) => this.note(bus, midi(n), t + i * 0.08, 0.15, 'square', 0.18));
        break;
    }
  }
}
