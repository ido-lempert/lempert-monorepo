import type { Player } from '../game/kalah';

const PREFS_KEY = 'mancala.sound';

interface Prefs {
  music: boolean;
  sfx: boolean;
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/**
 * All game audio, synthesised with Web Audio (no asset files). Effects follow each player's element:
 * player 1 (fire) gets warm wooden knocks with crackle, player 2 (ice) gets glassy chimes.
 * Background music is a generative kalimba-and-pad loop.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private noise!: AudioBuffer;
  private lastDrop = 0;
  private musicTimer = 0;
  private nextBeat = 0;
  private beat = 0;
  prefs: Prefs;

  constructor() {
    let saved: Partial<Prefs> = {};
    try {
      saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    } catch {
      /* defaults */
    }
    this.prefs = { music: true, sfx: true, ...saved };
    // Browsers only allow audio after a user gesture, so start on the first interaction.
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  setMusic(on: boolean) {
    this.prefs.music = on;
    this.save();
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.3);
    if (on) this.startMusic();
  }

  setSfx(on: boolean) {
    this.prefs.sfx = on;
    this.save();
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  private save() {
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
  }

  private unlock() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createDynamicsCompressor();
    master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.prefs.sfx ? 0.9 : 0;
    this.sfxBus.connect(master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Small room reverb from decaying noise.
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(master);

    if (this.prefs.music) this.setMusic(true);
  }

  // --- building blocks -----------------------------------------------------

  private tone(
    freq: number,
    at: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; attack?: number; to?: number; bus?: AudioNode; wet?: number } = {},
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, at);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
    const peak = opts.gain ?? 0.3;
    const attack = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + dur);
    osc.connect(g).connect(opts.bus ?? this.sfxBus);
    if (opts.wet) {
      const send = ctx.createGain();
      send.gain.value = opts.wet;
      g.connect(send).connect(this.reverb);
    }
    osc.start(at);
    osc.stop(at + attack + dur + 0.05);
  }

  private noiseBurst(at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, at);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(g).connect(this.sfxBus);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  private ready(): number | null {
    if (!this.ctx || !this.prefs.sfx || this.ctx.state !== 'running') return null;
    return this.ctx.currentTime;
  }

  // --- game effects --------------------------------------------------------

  /** A stone lands in a pit or store. */
  drop(player: Player, store: boolean) {
    const now = this.ready();
    if (now === null) return;
    // Many stones can land at once (captures); don't stack dozens of clicks.
    if (now - this.lastDrop < 0.03) return;
    this.lastDrop = now;
    const v = 0.85 + Math.random() * 0.3;
    // Shared "clack" of stone on wood.
    this.noiseBurst(now, 0.035, (store ? 1800 : 2800) * v, 4, 0.5);
    if (player === 0) {
      this.tone((store ? 110 : 170) * v, now, 0.12, { gain: 0.5, to: 60 });
      for (let i = 0; i < 3; i++) this.noiseBurst(now + 0.02 + Math.random() * 0.15, 0.012, 4000 + Math.random() * 3000, 8, 0.12);
    } else {
      const f = (store ? 1400 : 2300) * v;
      this.tone(f, now, 0.35, { gain: 0.3, wet: 0.6 });
      this.tone(f * 2.76, now, 0.18, { gain: 0.1, wet: 0.6 });
    }
  }

  /** Stones picked up from a pit. */
  lift() {
    const now = this.ready();
    if (now === null) return;
    this.noiseBurst(now, 0.22, 500, 1.2, 0.18, 'bandpass', 2200);
  }

  capture(player: Player) {
    const now = this.ready();
    if (now === null) return;
    if (player === 0) {
      // Roar of flame.
      this.noiseBurst(now, 0.7, 300, 0.8, 0.5, 'lowpass', 2500);
      this.tone(80, now, 0.6, { gain: 0.35, to: 45 });
    } else {
      // Shatter of ice.
      this.noiseBurst(now, 0.5, 6000, 1, 0.25, 'highpass');
      [72, 79, 84, 91].forEach((n, i) => this.tone(midi(n + 12), now + i * 0.045, 0.6, { gain: 0.07, wet: 0.8 }));
    }
    [60, 64, 67].forEach((n, i) => this.tone(midi(n + (player === 0 ? 0 : 12)), now + 0.1 + i * 0.07, 0.35, { type: 'triangle', gain: 0.1 }));
  }

  extraTurn() {
    const now = this.ready();
    if (now === null) return;
    [72, 76, 79, 84].forEach((n, i) => this.tone(midi(n), now + i * 0.07, 0.25, { type: 'triangle', gain: 0.12, wet: 0.3 }));
  }

  /** Gentle chime when it's your turn again after waiting for the other side. */
  yourTurn() {
    const now = this.ready();
    if (now === null) return;
    this.tone(midi(81), now, 0.4, { gain: 0.08, wet: 0.5 });
    this.tone(midi(88), now + 0.12, 0.5, { gain: 0.07, wet: 0.5 });
  }

  win() {
    const now = this.ready();
    if (now === null) return;
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) =>
      this.tone(midi(n), now + i * 0.09, i === 6 ? 1.2 : 0.3, { type: 'triangle', gain: 0.14, wet: 0.4 }),
    );
  }

  lose() {
    const now = this.ready();
    if (now === null) return;
    [67, 63, 60, 55].forEach((n, i) => this.tone(midi(n), now + i * 0.22, 0.5, { type: 'triangle', gain: 0.12, wet: 0.4 }));
  }

  // --- background music ----------------------------------------------------

  /** Slow i–VI–III–VII progression in D minor: soft pad, bass, and a sparse kalimba melody. */
  private static readonly CHORDS = [
    [50, 53, 57], // Dm
    [46, 50, 53], // Bb
    [53, 57, 60], // F
    [48, 52, 55], // C
  ];
  private static readonly SCALE = [62, 65, 67, 69, 72, 74, 77, 79, 81]; // D minor pentatonic
  private static readonly BEAT = 60 / 76 / 2; // eighth notes at 76 bpm

  private startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextBeat = this.ctx.currentTime + 0.1;
    // Look-ahead scheduler: queue notes slightly ahead so timing stays tight even if the main thread is busy.
    this.musicTimer = window.setInterval(() => {
      const ctx = this.ctx!;
      if (!this.prefs.music) {
        clearInterval(this.musicTimer);
        this.musicTimer = 0;
        return;
      }
      while (this.nextBeat < ctx.currentTime + 0.25) {
        this.scheduleBeat(this.beat, this.nextBeat);
        this.nextBeat += Sound.BEAT;
        this.beat++;
      }
    }, 80);
  }

  private scheduleBeat(beat: number, at: number) {
    const bar = Math.floor(beat / 8);
    const chord = Sound.CHORDS[Math.floor(bar / 2) % Sound.CHORDS.length];
    const bus = this.musicBus;
    const step = beat % 16;
    if (step === 0) {
      const len = Sound.BEAT * 16;
      for (const n of chord) {
        this.tone(midi(n), at, len, { type: 'triangle', gain: 0.035, attack: 1.2, bus, wet: 0.5 });
        this.tone(midi(n) * 1.004, at, len, { type: 'sine', gain: 0.03, attack: 1.5, bus });
      }
    }
    if (step % 8 === 0) this.tone(midi(chord[0] - 12), at, Sound.BEAT * 6, { gain: 0.12, attack: 0.02, bus });
    // Kalimba: pentatonic notes, favouring chord tones, with a gentle rhythm.
    const density = step % 4 === 0 ? 0.7 : step % 2 === 0 ? 0.35 : 0.15;
    if (Math.random() < density) {
      const pool = Math.random() < 0.6 ? chord.map((n) => n + 12 + (Math.random() < 0.5 ? 12 : 0)) : Sound.SCALE;
      const f = midi(pool[Math.floor(Math.random() * pool.length)]);
      this.tone(f, at, 0.9, { gain: 0.07, attack: 0.003, bus, wet: 0.6 });
      this.tone(f * 3.01, at, 0.15, { gain: 0.015, attack: 0.002, bus });
    }
  }
}
