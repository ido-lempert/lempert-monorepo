/**
 * Sound effects and background music, all synthesised with Web Audio (no files, so it works offline).
 * Browsers only allow sound after a user gesture, so everything starts on the first tap or key press.
 */

export type Sfx =
  | 'click'
  | 'pickup'
  | 'coin'
  | 'chime'
  | 'fail'
  | 'baa'
  | 'fanfare'
  | 'achievement'
  | 'buy'
  | 'pop'
  | 'blip'
  | 'lose';

const KEY = 'sukkahWorld.sound';

interface Prefs {
  music: boolean;
  sfx: boolean;
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export class Sound {
  prefs: Prefs = { music: true, sfx: true };
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
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
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    // A gentle compressor keeps sudden fanfares from clipping.
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.prefs.music ? 0.16 : 0;
    this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.prefs.sfx ? 0.55 : 0;
    this.sfxBus.connect(this.master);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.nextNote = this.ctx.currentTime + 0.2;
    setInterval(() => this.schedule(), 90);
  }

  setMusic(on: boolean) {
    this.prefs.music = on;
    this.save();
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.2);
  }

  setSfx(on: boolean) {
    this.prefs.sfx = on;
    this.save();
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  private save() {
    localStorage.setItem(KEY, JSON.stringify(this.prefs));
  }

  // --- Instruments ----------------------------------------------------------------------------------

  /** A soft marimba-like pluck. */
  private pluck(freq: number, at: number, len: number, gain: number, bus: GainNode) {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    env.connect(bus);
    for (const [mult, level] of [
      [1, 1],
      [4, 0.12],
    ]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = level;
      o.frequency.value = freq * mult;
      o.connect(g).connect(env);
      o.start(at);
      o.stop(at + len + 0.05);
    }
  }

  private tone(type: OscillatorType, from: number, to: number, at: number, len: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const env = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + len);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(env).connect(this.sfxBus);
    o.start(at);
    o.stop(at + len + 0.05);
  }

  private shaker(at: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(hp).connect(env).connect(this.musicBus);
    src.start(at, Math.random() * 0.4, 0.06);
  }

  // --- Music ------------------------------------------------------------------------------------------

  /** A cheerful loop in D major: eight bars of melody over a bouncing bass, with a soft shaker. */
  private static readonly MELODY: (number | null)[] = [
    0, 4, 7, 4, 9, 7, 4, 2, 0, 2, 4, 7, 4, null, 2, null, 5, 4, 2, 4, 7, 9, 7, null, 4, 2, 0, 2, 4, null, null, null,
    7, 9, 12, 9, 7, 4, 7, null, 5, 7, 9, 7, 5, 4, 2, null, 4, 5, 7, 4, 2, 0, 2, 4, 0, null, -3, null, 0, null, null, null,
  ];
  private static readonly BASS = [0, 0, 5, 7, 0, 5, 7, 0];

  private schedule() {
    const ctx = this.ctx!;
    const eighth = 60 / 104 / 2;
    while (this.nextNote < ctx.currentTime + 0.25) {
      const i = this.step % Sound.MELODY.length;
      const note = Sound.MELODY[i];
      if (this.prefs.music) {
        if (note !== null) this.pluck(midi(74 + note), this.nextNote, 0.45, 0.5, this.musicBus);
        if (i % 4 === 0) this.pluck(midi(50 + Sound.BASS[Math.floor(i / 8)]), this.nextNote, 0.6, 0.7, this.musicBus);
        if (i % 4 === 2) this.pluck(midi(57 + Sound.BASS[Math.floor(i / 8)]), this.nextNote, 0.3, 0.3, this.musicBus);
        this.shaker(this.nextNote, i % 2 ? 0.08 : 0.16);
      }
      this.nextNote += eighth;
      this.step++;
    }
  }

  // --- Effects ------------------------------------------------------------------------------------------

  play(name: Sfx) {
    if (!this.ctx || !this.prefs.sfx) return;
    const t = this.ctx.currentTime + 0.01;
    const bus = this.sfxBus;
    const arp = (notes: number[], gap: number, len = 0.35, gain = 0.6) => notes.forEach((n, i) => this.pluck(midi(n), t + i * gap, len, gain, bus));
    switch (name) {
      case 'click':
        this.tone('sine', 900, 600, t, 0.06, 0.25);
        break;
      case 'pop':
        this.tone('sine', 400, 900, t, 0.12, 0.35);
        break;
      case 'pickup':
        arp([79, 83, 86, 91], 0.06);
        break;
      case 'coin':
        this.tone('square', midi(88), midi(88), t, 0.08, 0.12);
        this.tone('square', midi(93), midi(93), t + 0.07, 0.25, 0.12);
        break;
      case 'chime':
        arp([81, 88, 93], 0.09, 0.9, 0.5);
        break;
      case 'fail':
        arp([67, 64, 60], 0.14, 0.4, 0.5);
        break;
      case 'lose':
        arp([72, 71, 69, 67], 0.16, 0.45, 0.45);
        break;
      case 'blip':
        this.tone('triangle', 300, 220, t, 0.12, 0.25);
        break;
      case 'buy':
        arp([84, 88, 91, 96], 0.05, 0.3, 0.45);
        this.tone('square', midi(96), midi(96), t + 0.22, 0.2, 0.08);
        break;
      case 'achievement':
        arp([76, 79, 84, 88, 91, 96], 0.05, 0.5, 0.45);
        break;
      case 'fanfare':
        arp([72, 76, 79, 84], 0.11, 0.3, 0.6);
        [72, 76, 79, 84, 88].forEach((n) => this.pluck(midi(n), t + 0.5, 1.4, 0.32, bus));
        break;
      case 'baa': {
        // A little bleat: a buzzy tone with a fast wobble, through a vowel-like filter.
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(520, t);
        o.frequency.linearRampToValueAtTime(440, t + 0.45);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 28;
        const depth = ctx.createGain();
        depth.gain.value = 25;
        lfo.connect(depth).connect(o.frequency);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1100;
        bp.Q.value = 2;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.35, t + 0.04);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(bp).connect(env).connect(bus);
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.55);
        lfo.stop(t + 0.55);
        break;
      }
    }
  }
}
