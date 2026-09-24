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
  | 'lose'
  | 'firework';

/**
 * What the music is doing: the calm village tunes, a quest's own faster tune (while it is on), the etrog
 * hunt, the grand finale, or nothing (during David's memory game, so the notes to remember stand out).
 */
export type Theme = 'village' | 'quiet' | 'hunt' | 'finale' | 'abraham' | 'isaac' | 'jacob' | 'moses' | 'aaron' | 'joseph' | 'david';

const KEY = 'sukkahWorld.sound';
/** Quiet enough to play under the game without getting in the way. */
const MUSIC_VOLUME = 0.11;

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
  private theme: Theme = 'village';
  private pending: Theme | null = null;

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
    // Music is kept soft and in the background: rounded off by a low-pass filter, with a light echo.
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.prefs.music ? MUSIC_VOLUME : 0;
    const soft = this.ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 2200;
    const echo = this.ctx.createDelay();
    echo.delayTime.value = 0.33;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.25;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.22;
    this.musicBus.connect(soft);
    soft.connect(this.master);
    soft.connect(echo);
    echo.connect(feedback).connect(echo);
    echo.connect(wet).connect(this.master);
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
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? MUSIC_VOLUME : 0, this.ctx.currentTime, 0.2);
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

  /**
   * Original, gentle tunes in a festive Sukkot mood, played in turn with a short breath between them.
   * Melodies are semitones above D5 (null = rest), one entry per eighth note; bass is one root per bar.
   */
  private static readonly TUNES: { melody: (number | null)[]; bass: number[] }[] = [
    {
      melody: [
        0, 4, 7, 4, 9, 7, 4, 2, 0, 2, 4, 7, 4, null, 2, null, 5, 4, 2, 4, 7, 9, 7, null, 4, 2, 0, 2, 4, null, null, null,
        7, 9, 12, 9, 7, 4, 7, null, 5, 7, 9, 7, 5, 4, 2, null, 4, 5, 7, 4, 2, 0, 2, 4, 0, null, -3, null, 0, null, null, null,
      ],
      bass: [0, 0, 5, 7, 0, 5, 7, 0],
    },
    {
      melody: [
        7, null, 5, 4, 2, null, 4, null, 5, 4, 2, 0, 2, null, null, null, 7, 9, 10, 9, 7, 5, 4, 5, 7, null, null, null, 5, null, 4, null,
        2, 4, 5, 7, 9, 7, 5, 4, 5, null, 4, 2, 0, null, 2, null, 4, 5, 7, 5, 4, 2, 0, 2, 0, null, null, null, null, null, null, null,
      ],
      bass: [0, -5, -2, 0, 5, -2, -5, 0],
    },
    {
      melody: [
        0, 2, 4, null, 7, null, 4, 2, 0, null, -3, null, 0, null, null, null, 4, 7, 9, null, 7, 4, 2, 4, 7, null, null, null, null, null, null, null,
        9, 7, 4, 7, 9, 12, 9, 7, 4, null, 2, 4, 7, null, null, null, 4, 2, 0, 2, 4, 7, 4, 2, 0, null, null, null, null, null, null, null,
      ],
      bass: [0, -3, 5, 7, 5, 0, 7, 0],
    },
    {
      // Freygish (D–Eb–F#–G–A–Bb–C), the scale of many festive Jewish tunes, kept slow and soft.
      melody: [
        0, null, 1, 4, 5, null, 4, null, 1, 0, 1, 4, 0, null, null, null, 7, null, 8, 7, 5, 4, 5, null, 4, null, null, null, 1, null, 0, null,
        4, 5, 7, 8, 10, 8, 7, null, 5, 7, 5, 4, 1, null, 4, null, 5, 4, 1, 4, 1, 0, -2, null, 0, null, null, null, null, null, null, null,
      ],
      bass: [0, 0, 5, 0, -2, 5, -2, 0],
    },
    {
      melody: [
        7, null, 4, null, 5, 4, 2, null, 0, null, 4, null, 7, null, null, null, 9, null, 7, 5, 4, null, 5, null, 7, null, null, null, null, null, null, null,
        7, null, 9, null, 12, null, 9, 7, 5, null, 4, null, 2, null, null, null, 4, 5, 7, null, 2, null, -1, null, 0, null, null, null, null, null, null, null,
      ],
      bass: [0, -3, 5, 0, 5, -2, -5, 0],
    },
  ];
  /** Eighth notes of silence between tunes. */
  private static readonly BREATH = 16;
  private tune = 0;

  /**
   * Upbeat loops for the quests, the hunt and the finale: quicker, with an oom-pah bass, a soft kick, claps
   * and a shaker. Each has its own character, so every quest sounds different. Same notation as above.
   */
  private static readonly THEMES: Record<Exclude<Theme, 'village' | 'quiet'>, { bpm: number; melody: (number | null)[]; bass: number[] }> = {
    // Abraham: a bright garden walk.
    abraham: {
      bpm: 128,
      melody: [
        0, 4, 7, 4, 9, 7, 4, 7, 5, 4, 2, 4, 0, null, 0, null, 2, 4, 5, 7, 9, 7, 5, 4, 2, null, 7, null, 2, null, null, null,
        0, 4, 7, 4, 9, 7, 4, 7, 12, 11, 9, 7, 9, null, 7, null, 5, 4, 2, 5, 4, 2, 0, 4, 2, null, -1, null, 0, null, null, null,
      ],
      bass: [0, 5, 5, 7, 0, 0, 7, 0],
    },
    // Isaac: racing the lantern clock, in D minor.
    isaac: {
      bpm: 144,
      melody: [
        0, 0, 3, 0, 7, 0, 3, 0, 5, 5, 8, 5, 10, 8, 7, 5, 3, 3, 7, 3, 10, 3, 7, 3, 2, 3, 5, 7, 5, 3, 2, null,
        0, 0, 3, 0, 7, 0, 3, 0, 5, 5, 8, 5, 12, 10, 8, 7, 8, 7, 5, 3, 5, 3, 2, 3, 0, null, 7, null, 0, null, null, null,
      ],
      bass: [0, 5, 3, 7, 0, -4, 5, 0],
    },
    // Jacob: tiptoeing through the maze.
    jacob: {
      bpm: 126,
      melody: [
        7, null, 4, 5, 7, null, 4, 5, 7, 9, 7, 5, 4, null, 2, null, 5, null, 2, 4, 5, null, 2, 4, 5, 7, 5, 4, 2, null, 0, null,
        7, null, 4, 5, 7, null, 12, 11, 9, null, 7, 9, 10, 9, 7, 5, 4, 5, 7, 4, 2, 4, 5, 2, 0, null, -5, null, 0, null, null, null,
      ],
      bass: [0, 0, 5, 7, 0, -2, 7, 0],
    },
    // Moses: sailing down the river.
    moses: {
      bpm: 132,
      melody: [
        0, 2, 4, 7, 9, 7, 4, 2, 4, null, null, 2, 0, null, null, null, 5, 7, 9, 12, 14, 12, 9, 7, 9, null, null, 7, 4, null, null, null,
        0, 2, 4, 7, 9, 7, 4, 2, 4, null, null, 7, 9, null, null, null, 12, 11, 9, 7, 5, 4, 2, 4, 0, null, null, null, null, null, null, null,
      ],
      bass: [0, 0, 5, -3, 0, -3, 7, 0],
    },
    // Aaron: warm and bouncy, for helping friends.
    aaron: {
      bpm: 124,
      melody: [
        7, null, 7, 9, 7, 4, null, 4, 5, 4, 2, 4, 0, null, null, null, 2, null, 2, 4, 5, 7, null, 5, 4, 2, 0, 2, 4, null, null, null,
        7, null, 7, 9, 12, 9, null, 7, 9, 7, 5, 4, 2, null, null, null, 5, 5, 4, 4, 2, 2, 4, 2, 0, null, null, null, null, null, null, null,
      ],
      bass: [0, 0, 7, 0, 5, 7, 7, 0],
    },
    // Joseph: a mysterious treasure hunt, in freygish.
    joseph: {
      bpm: 126,
      melody: [
        0, null, 4, 5, 7, null, 8, 7, 5, 4, 1, 0, 1, null, null, null, 0, null, 4, 5, 7, null, 10, 8, 7, 5, 4, 5, 7, null, null, null,
        12, null, 10, 8, 7, null, 8, 10, 8, 7, 5, 4, 5, null, 7, null, 4, 5, 4, 1, 4, 5, 7, 4, 0, null, null, null, null, null, null, null,
      ],
      bass: [0, -7, 0, 0, -2, -7, -2, 0],
    },
    // David: a dance tune.
    david: {
      bpm: 138,
      melody: [
        0, 4, 7, 4, 0, 4, 7, 4, 5, 9, 12, 9, 5, 9, 12, 9, 7, 9, 7, 5, 4, 5, 4, 2, 0, 2, 4, null, 0, null, null, null,
        12, 12, 11, 9, 11, 11, 9, 7, 9, 9, 7, 5, 7, null, 4, null, 5, 7, 5, 4, 2, 4, 2, -1, 0, null, 7, null, 0, null, null, null,
      ],
      bass: [0, 5, 7, 0, 7, 5, 7, 0],
    },
    // Shoshi's etrog hunt: a one-minute race.
    hunt: {
      bpm: 152,
      melody: [
        0, 3, 7, 3, 0, 3, 7, 3, -2, 2, 5, 2, -2, 2, 5, 2, -4, 0, 3, 0, -4, 0, 3, 0, -5, -1, 2, 5, 7, null, null, null,
        12, 7, 3, 7, 12, 7, 3, 7, 10, 5, 2, 5, 10, 5, 2, 5, 8, 3, 0, 3, 8, 3, 0, 3, 7, 11, 14, 11, 7, null, null, null,
      ],
      bass: [0, -2, -4, -5, 0, -2, -4, -5],
    },
    // The grand finale: David's dance, a little faster – everyone dances the hora.
    finale: {
      bpm: 150,
      melody: [
        0, 4, 7, 4, 0, 4, 7, 4, 5, 9, 12, 9, 5, 9, 12, 9, 7, 9, 7, 5, 4, 5, 4, 2, 0, 2, 4, null, 0, null, null, null,
        12, 12, 11, 9, 11, 11, 9, 7, 9, 9, 7, 5, 7, null, 4, null, 5, 7, 5, 4, 2, 4, 2, -1, 0, null, 7, null, 0, null, null, null,
      ],
      bass: [0, 5, 7, 0, 7, 5, 7, 0],
    },
  };

  /** Changes the music; the new tune comes in on the next beat. */
  setTheme(theme: Theme) {
    if (theme === (this.pending ?? this.theme)) return;
    this.pending = theme;
  }

  /** A soft kick drum. */
  private kick(at: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const env = ctx.createGain();
    o.frequency.setValueAtTime(140, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    env.gain.setValueAtTime(0.55, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    o.connect(env).connect(this.musicBus);
    o.start(at);
    o.stop(at + 0.2);
  }

  /** A light hand clap. */
  private clap(at: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.16, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    src.connect(bp).connect(env).connect(this.musicBus);
    src.start(at, Math.random() * 0.4, 0.12);
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.nextNote < ctx.currentTime + 0.25) {
      // A new theme starts on a beat, from its beginning.
      if (this.pending && this.step % 2 === 0) {
        this.theme = this.pending;
        this.pending = null;
        this.step = 0;
      }
      const theme = this.theme;
      const i = this.step;
      if (theme === 'village') {
        const { melody, bass } = Sound.TUNES[this.tune];
        if (this.prefs.music && i < melody.length) {
          const note = melody[i];
          const root = bass[Math.floor(i / 8)];
          if (note !== null) this.pluck(midi(74 + note), this.nextNote, 0.7, 0.34, this.musicBus);
          if (i % 8 === 0) this.pluck(midi(50 + root), this.nextNote, 1.2, 0.5, this.musicBus);
          if (i % 8 === 4) this.pluck(midi(57 + root), this.nextNote, 0.6, 0.2, this.musicBus);
          if (i % 4 === 2) this.shaker(this.nextNote, 0.035);
        }
        this.nextNote += 60 / 92 / 2;
        this.step++;
        if (this.step >= melody.length + Sound.BREATH) {
          this.step = 0;
          this.tune = (this.tune + 1) % Sound.TUNES.length;
        }
        continue;
      }
      if (theme === 'quiet') {
        this.nextNote += 0.25;
        this.step++;
        continue;
      }
      const { bpm, melody, bass } = Sound.THEMES[theme];
      const at = this.nextNote;
      if (this.prefs.music) {
        const note = melody[i];
        const root = bass[Math.floor(i / 8)];
        if (note !== null) this.pluck(midi(74 + note), at, 0.4, 0.32, this.musicBus);
        // Oom-pah: the root on the beat, the fifth in between.
        if (i % 4 === 0) this.pluck(midi(50 + root), at, 0.45, 0.5, this.musicBus);
        if (i % 4 === 2) this.pluck(midi(57 + root), at, 0.3, 0.26, this.musicBus);
        if (i % 8 === 0 || i % 8 === 4) this.kick(at);
        if (i % 8 === 2 || i % 8 === 6) this.clap(at);
        if (i % 2 === 1) this.shaker(at, 0.03);
      }
      this.nextNote += 60 / bpm / 2;
      this.step = (i + 1) % melody.length;
    }
  }

  /** One of the four notes of David's harp (D, F#, A, D), for the memory game. */
  note(i: number) {
    if (!this.ctx || !this.prefs.sfx) return;
    this.pluck(midi([62, 66, 69, 74][i]), this.ctx.currentTime + 0.01, 0.9, 0.7, this.sfxBus);
    this.pluck(midi([74, 78, 81, 86][i]), this.ctx.currentTime + 0.01, 0.5, 0.15, this.sfxBus);
  }

  // --- Effects ------------------------------------------------------------------------------------------

  /**
   * Plays an effect. `lift` raises it by that many semitones: quest finds climb higher and higher as the
   * quest fills up.
   */
  play(name: Sfx, lift = 0) {
    if (!this.ctx || !this.prefs.sfx) return;
    const t = this.ctx.currentTime + 0.01;
    const bus = this.sfxBus;
    const k = 2 ** (lift / 12);
    const midi = (n: number) => 440 * 2 ** ((n + lift - 69) / 12);
    const arp = (notes: number[], gap: number, len = 0.35, gain = 0.6) => notes.forEach((n, i) => this.pluck(midi(n), t + i * gap, len, gain, bus));
    switch (name) {
      case 'click':
        this.tone('sine', 900 * k, 600 * k, t, 0.06, 0.25);
        break;
      case 'pop':
        this.tone('sine', 400 * k, 900 * k, t, 0.12, 0.35);
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
        this.tone('triangle', 300 * k, 220 * k, t, 0.12, 0.25);
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
      case 'firework': {
        // A soft thump and crackle, never loud.
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.3, t);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        src.connect(lp).connect(env).connect(bus);
        src.start(t, Math.random() * 0.3, 0.6);
        arp([96, 100, 103], 0.04, 0.2, 0.12);
        break;
      }
      case 'baa': {
        // A little bleat: a buzzy tone with a fast wobble, through a vowel-like filter.
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(520 * k, t);
        o.frequency.linearRampToValueAtTime(440 * k, t + 0.45);
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
