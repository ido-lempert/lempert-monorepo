/** Every sound is synthesised with Web Audio, so there is nothing to download. */

export type Sfx = 'tap' | 'place' | 'remove' | 'connect' | 'disconnect' | 'run' | 'hop' | 'deliver' | 'return' | 'fail' | 'zap' | 'alarm' | 'win' | 'card';

class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private musicOut: GainNode | null = null;
  private musicTimer = 0;
  private nextBeat = 0;
  private beat = 0;
  on = true;
  private musicOn = true;

  /** Browsers only allow audio after a gesture, so this is called from the first tap. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.35;
      this.out.connect(this.ctx.destination);
      this.musicOut = this.ctx.createGain();
      this.musicOut.gain.value = 0.16;
      this.musicOut.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.setMusic(this.musicOn);
  }

  get music() {
    return this.musicOn;
  }

  /** A calm marimba loop, made up as it plays (a chord a bar, a pentatonic tune on top). */
  setMusic(on: boolean) {
    this.musicOn = on;
    if (!this.ctx) return;
    clearInterval(this.musicTimer);
    this.musicTimer = 0;
    if (!on) return;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 100);
  }

  private schedule() {
    const c = this.ctx!;
    const step = 60 / 84 / 2;
    // C, Am, F, G – roots and a gentle tune from the major pentatonic.
    const roots = [130.81, 110, 87.31, 98];
    const scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
    while (this.nextBeat < c.currentTime + 0.3) {
      const bar = Math.floor(this.beat / 8) % 4;
      const pos = this.beat % 8;
      const at = this.nextBeat;
      if (pos === 0 || pos === 4) this.mallet(roots[bar], at, 1.2, 0.5);
      if (pos === 2 || pos === 6) this.mallet(roots[bar] * 1.5, at, 0.6, 0.25);
      // A seeded wander so the tune repeats now and then without looping exactly.
      const r = Math.sin(this.beat * 12.9898 + bar * 78.233) * 43758.5453;
      const roll = r - Math.floor(r);
      if (roll > 0.45) this.mallet(scale[Math.floor(roll * 997) % scale.length], at, 0.5, 0.3);
      this.beat++;
      this.nextBeat += step;
    }
  }

  private mallet(freq: number, at: number, len: number, vol: number) {
    const c = this.ctx!;
    for (const [mul, v] of [
      [1, vol],
      [4, vol * 0.12],
    ]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = freq * mul;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(v, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, at + len / mul);
      o.connect(g).connect(this.musicOut!);
      o.start(at);
      o.stop(at + len + 0.05);
    }
  }

  private tone(freq: number, at: number, len: number, type: OscillatorType = 'sine', vol = 0.5, slide = 0) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), at + len);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    o.connect(g).connect(this.out!);
    o.start(at);
    o.stop(at + len + 0.05);
  }

  play(name: Sfx) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = (fs: number[], step: number, len: number, type: OscillatorType = 'triangle', vol = 0.4) =>
      fs.forEach((f, i) => this.tone(f, t + i * step, len, type, vol));
    switch (name) {
      case 'tap':
        return this.tone(880, t, 0.06, 'sine', 0.25);
      case 'place':
        this.tone(220, t, 0.18, 'sine', 0.6, 0.5);
        return this.tone(660, t + 0.05, 0.12, 'triangle', 0.3);
      case 'remove':
        return this.tone(500, t, 0.2, 'triangle', 0.3, 0.4);
      case 'connect':
        return this.tone(420, t, 0.18, 'sine', 0.4, 2.2);
      case 'disconnect':
        return this.tone(700, t, 0.16, 'sine', 0.35, 0.45);
      case 'run':
        return notes([392, 523, 659], 0.07, 0.15, 'triangle', 0.3);
      case 'hop':
        return this.tone(600 + Math.random() * 200, t, 0.07, 'sine', 0.12, 1.6);
      case 'deliver':
        return notes([784, 1047], 0.08, 0.18, 'sine', 0.35);
      case 'return':
        return notes([659, 880, 1175], 0.07, 0.2, 'sine', 0.3);
      case 'fail':
        return notes([330, 247], 0.14, 0.22, 'square', 0.12);
      case 'zap':
        for (let i = 0; i < 5; i++) this.tone(1200 + Math.random() * 1500, t + i * 0.04, 0.05, 'sawtooth', 0.12);
        return;
      case 'alarm':
        for (let i = 0; i < 4; i++) this.tone(i % 2 ? 660 : 880, t + i * 0.18, 0.17, 'square', 0.12);
        return;
      case 'win':
        return notes([523, 659, 784, 1047, 1319], 0.09, 0.35, 'triangle', 0.35);
      case 'card':
        return notes([1047, 1319, 1568], 0.06, 0.4, 'sine', 0.25);
    }
  }
}

export const sfx = new Sound();
