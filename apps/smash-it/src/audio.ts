/**
 * Sound, all synthesised with Web Audio (no files, so it works offline):
 * - bug voices: a small formant synthesiser (a buzzy source through vowel filters) that makes cartoon
 *   gibberish – "ow-ie!", "wheee!", "oh no!", giggles – each kind in its own voice, kings deep and slow;
 * - juicy effects: rubbery slingshot twangs, crunches, wet splats, jelly boings, bell-like combos;
 * - bouncy marimba music, all through a soft room reverb.
 * Browsers only allow sound after a user gesture, so everything starts on the first tap or key press.
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
  | 'wind'
  | 'spit'
  | 'umbrella'
  | 'buy'
  | 'whoosh'
  | 'tink'
  | 'fanfare';

/** Who is talking. */
export type Voice = 'snail' | 'ladybug' | 'ant' | 'beetle' | 'butterfly' | 'fly' | 'golden' | 'king';
/** What they say. */
export type Phrase = 'ouch' | 'whee' | 'dizzy' | 'giggle' | 'hmph' | 'ohno' | 'eep';

/** menu: bouncy and relaxed; play: upbeat; hurry: the last seconds; boss: a king's march; quiet: nothing. */
export type Theme = 'menu' | 'play' | 'hurry' | 'boss' | 'quiet';

const KEY = 'smashIt.sound';
const MUSIC_VOLUME = 0.12;

interface Prefs {
  music: boolean;
  sfx: boolean;
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// --- Voices -------------------------------------------------------------------------------------------

type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';
/** Formants (Hz) of a child-like voice. */
const FORMANTS: Record<Vowel, [number, number, number]> = {
  a: [950, 1500, 2900],
  e: [600, 2300, 3200],
  i: [380, 2950, 3700],
  o: [620, 1050, 2800],
  u: [420, 950, 2600],
};

interface Syllable {
  v: Vowel;
  /** Start and end pitch, as multiples of the voice's pitch. */
  p: number;
  to: number;
  d: number;
  /** A consonant before the vowel. */
  c?: 'h' | 'w' | 'n' | 'p';
  /** Wobble (Hz) for warbly sounds. */
  wob?: number;
  gap?: number;
}

const PHRASES: Record<Phrase, Syllable[]> = {
  ouch: [
    { v: 'a', p: 1.7, to: 1.45, d: 0.1 },
    { v: 'u', p: 1.45, to: 1.25, d: 0.07 },
    { v: 'i', p: 1.9, to: 1.5, d: 0.16 },
  ],
  whee: [{ c: 'w', v: 'i', p: 1.1, to: 2.4, d: 0.55, wob: 7 }],
  dizzy: [{ c: 'w', v: 'u', p: 1.2, to: 0.75, d: 0.5, wob: 9 }],
  giggle: [
    { c: 'h', v: 'i', p: 1.9, to: 1.8, d: 0.07, gap: 0.04 },
    { c: 'h', v: 'i', p: 1.8, to: 1.7, d: 0.07, gap: 0.04 },
    { c: 'h', v: 'e', p: 1.7, to: 1.55, d: 0.07, gap: 0.04 },
    { c: 'h', v: 'i', p: 1.6, to: 1.4, d: 0.1 },
  ],
  hmph: [{ c: 'h', v: 'u', p: 0.9, to: 0.75, d: 0.2 }],
  ohno: [
    { v: 'o', p: 1.35, to: 1.3, d: 0.16 },
    { c: 'n', v: 'o', p: 1.15, to: 0.6, d: 0.45, wob: 5 },
  ],
  eep: [{ v: 'i', p: 2.1, to: 2.6, d: 0.12 }],
};

/** Pitch (Hz), formant scale (small bugs sound smaller) and speed of each voice. */
const VOICES: Record<Voice, { f0: number; f: number; speed: number }> = {
  fly: { f0: 640, f: 1.35, speed: 1.3 },
  golden: { f0: 560, f: 1.3, speed: 1.15 },
  butterfly: { f0: 520, f: 1.25, speed: 1 },
  ant: { f0: 470, f: 1.25, speed: 1.15 },
  ladybug: { f0: 400, f: 1.15, speed: 1 },
  beetle: { f0: 300, f: 1.05, speed: 0.95 },
  snail: { f0: 250, f: 1, speed: 0.75 },
  king: { f0: 140, f: 0.85, speed: 0.8 },
};

// --- Music --------------------------------------------------------------------------------------------

/** Melodies as MIDI notes per eighth (0 = rest). */
const TUNES: Record<Exclude<Theme, 'quiet'>, { tempo: number; lead: number[]; bass: number[] }> = {
  menu: {
    tempo: 108,
    lead: [72, 0, 76, 79, 76, 0, 72, 74, 76, 0, 74, 72, 69, 0, 0, 0, 72, 0, 76, 79, 81, 79, 76, 74, 72, 74, 76, 74, 72, 0, 0, 0],
    bass: [48, 0, 55, 0, 53, 0, 55, 0, 45, 0, 52, 0, 50, 0, 55, 0, 48, 0, 55, 0, 53, 0, 57, 0, 55, 0, 50, 0, 48, 0, 55, 0],
  },
  play: {
    tempo: 128,
    lead: [76, 79, 81, 79, 76, 0, 74, 76, 72, 0, 74, 0, 76, 74, 72, 0, 76, 79, 81, 84, 81, 79, 76, 0, 74, 76, 74, 72, 74, 0, 0, 0],
    bass: [45, 0, 52, 45, 48, 0, 52, 0, 41, 0, 48, 41, 43, 0, 50, 0, 45, 0, 52, 45, 48, 0, 52, 0, 43, 0, 50, 43, 45, 0, 52, 0],
  },
  hurry: {
    tempo: 160,
    lead: [76, 76, 79, 76, 81, 79, 76, 74, 76, 76, 79, 76, 83, 81, 79, 76],
    bass: [45, 52, 45, 52, 48, 55, 48, 55, 43, 50, 43, 50, 45, 52, 40, 47],
  },
  boss: {
    tempo: 118,
    lead: [69, 0, 69, 72, 71, 0, 69, 0, 67, 0, 67, 71, 69, 0, 0, 0, 69, 0, 69, 72, 74, 0, 72, 71, 69, 71, 72, 71, 69, 0, 0, 0],
    bass: [45, 45, 0, 45, 45, 0, 45, 0, 43, 43, 0, 43, 45, 0, 40, 0, 45, 45, 0, 45, 50, 0, 50, 0, 45, 0, 47, 0, 45, 0, 40, 0],
  },
};

export class Sound {
  prefs: Prefs = { music: true, sfx: true };
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: GainNode;
  private noise!: AudioBuffer;
  private theme: Theme = 'menu';
  private nextNote = 0;
  private step = 0;
  /** When each voice slot frees up (a crowd shouldn't all talk at once). */
  private talking: number[] = [];

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
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    this.master.connect(comp).connect(ctx.destination);
    // A soft room, shared by everything.
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(1.4);
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.35;
    this.reverb.connect(conv).connect(this.master);
    this.musicBus = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    this.musicBus.connect(lp);
    lp.connect(this.master);
    lp.connect(this.reverb);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.45;
    this.sfxBus.connect(send).connect(this.reverb);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyPrefs();
    this.nextNote = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 50);
  }

  /** A decaying noise tail: the room's echo. */
  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
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

  // --- Building blocks -------------------------------------------------------------------------------

  /** A marimba-like pluck (FM): a bright attack that mellows quickly. */
  private pluck(bus: AudioNode, freq: number, at: number, dur: number, vol: number, ratio = 4, index = 2.5) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const g = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * ratio;
    modGain.gain.setValueAtTime(freq * index, at);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, at + dur * 0.5);
    mod.connect(modGain).connect(car.frequency);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    car.connect(g).connect(bus);
    car.start(at);
    mod.start(at);
    car.stop(at + dur + 0.05);
    mod.stop(at + dur + 0.05);
  }

  private tone(bus: AudioNode, type: OscillatorType, from: number, to: number, at: number, dur: number, vol: number, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(bus);
    o.start(at);
    o.stop(at + dur + 0.05);
    return o;
  }

  /** Filtered noise; `sweepTo` moves the filter (a whoosh or a wet splat). */
  private hiss(bus: AudioNode, at: number, dur: number, freq: number, vol: number, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  /** A springy "boing": a tone whose pitch wobbles and settles. */
  private spring(bus: AudioNode, from: number, to: number, at: number, dur: number, vol: number, wobble = 14) {
    const ctx = this.ctx!;
    const o = this.tone(bus, 'sine', from, to, at, dur, vol);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = wobble;
    depth.gain.setValueAtTime(from * 0.25, at);
    depth.gain.exponentialRampToValueAtTime(1, at + dur);
    lfo.connect(depth).connect(o.frequency);
    lfo.start(at);
    lfo.stop(at + dur + 0.05);
  }

  // --- Voices ----------------------------------------------------------------------------------------

  /** A bug says something. `n` varies the pitch a little, so a crowd sounds like a choir. */
  voice(who: Voice, phrase: Phrase, n = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.prefs.sfx) return;
    const now = ctx.currentTime;
    this.talking = this.talking.filter((t) => t > now);
    if (this.talking.length >= 3) return;
    const v = VOICES[who];
    const sylls = PHRASES[phrase];
    const pitch = v.f0 * (1 + ((n % 5) - 2) * 0.04) * (0.97 + Math.random() * 0.06);
    let at = now + 0.01;

    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    // A gentle vibrato makes it sound alive.
    const vib = ctx.createOscillator();
    const vibDepth = ctx.createGain();
    vib.frequency.value = 6;
    vibDepth.gain.value = pitch * 0.025;
    vib.connect(vibDepth).connect(src.frequency);
    const out = ctx.createGain();
    out.gain.value = 0;
    const filters = [0, 1, 2].map((i) => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = [7, 11, 13][i];
      const g = ctx.createGain();
      g.gain.value = [1.6, 0.9, 0.45][i];
      src.connect(f).connect(g).connect(out);
      return f;
    });
    // A little body underneath, so it isn't only buzz.
    const body = ctx.createGain();
    body.gain.value = 0.12;
    src.connect(body).connect(out);
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.6;
    out.connect(pan).connect(this.sfxBus);

    for (const s of sylls) {
      const d = s.d / v.speed;
      const start = at;
      const [f1, f2, f3] = FORMANTS[s.v];
      if (s.c === 'w') {
        // Start rounded (like "u") and open into the vowel.
        FORMANTS.u.forEach((f, i) => filters[i].frequency.setValueAtTime(f * v.f, start));
        [f1, f2, f3].forEach((f, i) => filters[i].frequency.linearRampToValueAtTime(f * v.f, start + d * 0.35));
      } else [f1, f2, f3].forEach((f, i) => filters[i].frequency.setTargetAtTime(f * v.f, start, 0.015));
      if (s.c === 'h') this.hiss(this.sfxBus, start - 0.03, 0.05, 2200 * v.f, 0.25, 1.5);
      if (s.c === 'p') this.hiss(this.sfxBus, start - 0.01, 0.015, 1500, 0.4, 0.8);
      if (s.c === 'n') {
        filters[0].frequency.setValueAtTime(280 * v.f, start);
        filters[0].frequency.linearRampToValueAtTime(f1 * v.f, start + 0.06);
      }
      src.frequency.setValueAtTime(pitch * s.p, start);
      if (s.wob) {
        // Warble: step the pitch up and down.
        const steps = Math.floor(d * s.wob * 2);
        for (let k = 1; k <= steps; k++) {
          const tt = start + (k / steps) * d;
          const base = s.p + (s.to - s.p) * (k / steps);
          src.frequency.linearRampToValueAtTime(pitch * base * (k % 2 ? 1.08 : 0.94), tt);
        }
      } else src.frequency.exponentialRampToValueAtTime(pitch * s.to, start + d);
      out.gain.setTargetAtTime(0.55, start, 0.012);
      out.gain.setTargetAtTime(0, start + d - 0.03, 0.025);
      at = start + d + (s.gap ?? 0.015);
    }
    src.start(now);
    vib.start(now);
    src.stop(at + 0.2);
    vib.stop(at + 0.2);
    this.talking.push(at);
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
      const at = this.nextNote;
      // Marimba lead, a soft echo an octave up, a round plucked bass.
      if (lead) {
        this.pluck(this.musicBus, midi(lead), at, eighth * 2.2, 0.5, 4, 2);
        if (i % 4 === 0) this.pluck(this.musicBus, midi(lead + 12), at + eighth * 0.5, eighth * 1.5, 0.12, 3, 1);
      }
      if (bass) this.pluck(this.musicBus, midi(bass), at, eighth * 1.6, 0.6, 1, 0.8);
      // Shaker on the off-beats, a woodblock on 2 and 4.
      if (i % 2 === 1) this.hiss(this.musicBus, at, 0.05, 7000, 0.12, 1, 'highpass');
      if (i % 4 === 2) this.tone(this.musicBus, 'sine', 1300, 900, at, 0.05, 0.18);
      if (this.theme === 'boss' && i % 4 === 0) this.tone(this.musicBus, 'sine', 120, 50, at, 0.25, 0.7);
      this.nextNote += eighth;
      this.step++;
    }
  }

  // --- Effects ---------------------------------------------------------------------------------------

  /** `level`: pitch step for climbing sounds (combo) or pull strength (stretch). */
  play(sfx: Sfx, level = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.prefs.sfx) return;
    const t = ctx.currentTime;
    const bus = this.sfxBus;
    const r = Math.random;
    switch (sfx) {
      case 'click':
        this.tone(bus, 'sine', 900, 600, t, 0.06, 0.25);
        break;
      case 'stretch':
        // A rubbery creak that rises with the pull.
        this.tone(bus, 'triangle', 300 + level * 500, 340 + level * 560, t, 0.09, 0.08);
        this.hiss(bus, t, 0.06, 1500 + level * 2000, 0.05, 6);
        break;
      case 'launch':
        // Thwip! and a springy band.
        this.hiss(bus, t, 0.22, 600, 0.5, 1, 'bandpass', 4000);
        this.spring(bus, 240, 110, t + 0.01, 0.35, 0.35, 22);
        this.tone(bus, 'sine', 900, 300, t, 0.08, 0.3);
        break;
      case 'whoosh':
        this.hiss(bus, t, 0.45, 400, 0.3, 0.8, 'bandpass', 2200);
        break;
      case 'crunch':
        for (let i = 0; i < 7; i++) this.hiss(bus, t + r() * 0.12, 0.03 + r() * 0.03, 1500 + r() * 3000, 0.7, 3);
        this.tone(bus, 'sine', 140, 55, t, 0.15, 0.6);
        break;
      case 'pop':
        for (let i = 0; i < 10; i++) {
          const at = t + i * 0.028 + r() * 0.02;
          this.tone(bus, 'sine', 900 + r() * 900, 250, at, 0.045, 0.22);
          this.hiss(bus, at, 0.012, 3000, 0.2, 2);
        }
        break;
      case 'splat':
        // Wet: noise closing down, a bloop, and drips.
        this.hiss(bus, t, 0.3, 3500, 1, 0.7, 'lowpass', 250);
        this.tone(bus, 'sine', 320, 70, t, 0.25, 0.6);
        for (let i = 0; i < 3; i++) this.tone(bus, 'sine', 1200 + r() * 800, 2200, t + 0.15 + i * 0.07 + r() * 0.04, 0.04, 0.12);
        break;
      case 'smash':
        this.tone(bus, 'sine', 110, 40, t, 0.35, 0.9);
        this.hiss(bus, t, 0.12, 2500, 0.8, 1.5);
        this.hiss(bus, t + 0.02, 0.45, 2800, 1, 0.7, 'lowpass', 200);
        for (let i = 0; i < 4; i++) this.tone(bus, 'sine', 900 + r() * 900, 1800, t + 0.2 + i * 0.06, 0.04, 0.12);
        break;
      case 'boing':
        this.spring(bus, 160, 460, t, 0.5, 0.5, 13);
        this.spring(bus, 320, 900, t, 0.35, 0.12, 13);
        break;
      case 'squeak':
        this.tone(bus, 'sine', 1100 + (level % 5) * 120, 2000, t, 0.12, 0.25);
        break;
      case 'tink':
        this.pluck(bus, 2300, t, 0.5, 0.35, 2.76, 3);
        this.pluck(bus, 3400, t + 0.01, 0.35, 0.15, 2.76, 2);
        break;
      case 'combo': {
        const notes = [72, 76, 79, 84, 88];
        const n = notes[Math.min(notes.length - 1, Math.max(0, level - 2))];
        this.pluck(bus, midi(n), t, 0.35, 0.4, 3.5, 2);
        this.pluck(bus, midi(n + 7), t + 0.07, 0.4, 0.35, 3.5, 2);
        this.pluck(bus, midi(n + 12), t + 0.14, 0.5, 0.3, 3.5, 2);
        break;
      }
      case 'mega':
        [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => this.pluck(bus, midi(n), t + i * 0.06, 0.6, 0.35, 3.5, 2.5));
        this.hiss(bus, t + 0.4, 0.9, 6000, 0.3, 0.5, 'highpass');
        break;
      case 'coin':
        this.pluck(bus, midi(95), t, 0.3, 0.3, 1.4, 3);
        this.pluck(bus, midi(100), t + 0.08, 0.5, 0.3, 1.4, 3);
        break;
      case 'tick':
        this.tone(bus, 'sine', 1500, 1100, t, 0.04, 0.3);
        this.hiss(bus, t, 0.02, 2500, 0.15, 4);
        break;
      case 'buzzer':
        // A cartoon "bwomp".
        this.tone(bus, 'sawtooth', 260, 110, t, 0.55, 0.18, 0.02);
        this.tone(bus, 'square', 262, 112, t, 0.55, 0.08, 0.02);
        break;
      case 'win':
        [60, 64, 67, 72, 67, 72, 76, 79, 84].forEach((n, i) => this.pluck(bus, midi(n + 12), t + i * 0.09, 0.5, 0.35, 3.5, 2));
        [60, 64, 67].forEach((n) => this.tone(bus, 'triangle', midi(n + 12), midi(n + 12), t + 0.85, 0.9, 0.12, 0.05));
        break;
      case 'lose':
        // Wah wah wah waaah.
        [67, 66, 65, 64].forEach((n, i) => {
          const at = t + i * 0.3;
          const o = this.tone(bus, 'sawtooth', midi(n - 12), midi(n - 12) * (i === 3 ? 0.97 : 1), at, i === 3 ? 0.9 : 0.26, 0.14, 0.04);
          if (i === 3) {
            const lfo = ctx.createOscillator();
            const dep = ctx.createGain();
            lfo.frequency.value = 6;
            dep.gain.value = 6;
            lfo.connect(dep).connect(o.frequency);
            lfo.start(at);
            lfo.stop(at + 1);
          }
        });
        break;
      case 'swish':
        this.hiss(bus, t, 0.35, 500, 0.4, 0.6, 'bandpass', 2500);
        break;
      case 'wind':
        // A bubbling gurgle that rises: something is about to be spat.
        this.tone(bus, 'sine', 140, 420, t, 0.85, 0.12, 0.05);
        this.hiss(bus, t, 0.8, 900, 0.18, 3, 'bandpass', 1800);
        break;
      case 'spit':
        this.hiss(bus, t, 0.18, 1800, 0.4, 1.2, 'bandpass', 600);
        this.tone(bus, 'sine', 600, 220, t, 0.2, 0.14);
        break;
      case 'umbrella':
        this.hiss(bus, t, 0.14, 1400, 0.3, 0.8, 'bandpass', 3200);
        this.pluck(bus, midi(79), t + 0.06, 0.3, 0.25, 2, 2);
        break;
      case 'buy':
        this.pluck(bus, midi(88), t, 0.3, 0.3, 1.4, 3);
        this.pluck(bus, midi(91), t + 0.08, 0.3, 0.3, 1.4, 3);
        this.pluck(bus, midi(96), t + 0.16, 0.6, 0.3, 1.4, 3);
        break;
      case 'fanfare':
        [[60, 64, 67], [62, 65, 69], [64, 67, 72]].forEach((chord, i) =>
          chord.forEach((n) => this.tone(bus, 'sawtooth', midi(n), midi(n), t + i * 0.22, i === 2 ? 1.1 : 0.2, 0.06, 0.02)),
        );
        [72, 76, 79, 84].forEach((n, i) => this.pluck(bus, midi(n + 12), t + 0.66 + i * 0.07, 0.6, 0.3, 3.5, 2));
        break;
    }
  }
}
