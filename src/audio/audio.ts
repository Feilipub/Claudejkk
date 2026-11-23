/**
 * Procedural audio engine (Web Audio). Every sound is synthesised at runtime —
 * no external or copyrighted assets: hoofbeats per surface and gait, footsteps,
 * neighs and snorts, gunfire, wildlife calls, wind/rain/crickets ambience and
 * a generative western score (plucked Karplus-Strong guitar over a drone).
 */

type Surface = string;

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  amb!: GainNode;
  listenerX = 0;
  listenerY = 0;
  volume = { master: 0.8, sfx: 0.9, music: 0.45, amb: 0.6 };
  private noiseBuf: AudioBuffer | null = null;
  private windNode: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private rainNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private nightNode: { gain: GainNode } | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  musicMode: string = 'open';
  private enabled = false;

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.connect(this.master);
    this.amb = c.createGain();
    this.amb.connect(this.master);
    this.applyVolumes();
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
    this.enabled = true;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master;
    this.sfx.gain.value = this.volume.sfx;
    this.music.gain.value = this.volume.music;
    this.amb.gain.value = this.volume.amb;
  }

  private spatial(x: number, y: number, maxDist = 500): { gain: number; pan: number } {
    const dx = x - this.listenerX;
    const dy = y - this.listenerY;
    const d = Math.hypot(dx, dy);
    return { gain: Math.max(0, 1 - d / maxDist), pan: Math.max(-1, Math.min(1, dx / 250)) };
  }

  private out(gain: number, pan: number, dest?: AudioNode): GainNode {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = gain;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(dest ?? this.sfx);
    return g;
  }

  private noise(dur: number, filterType: BiquadFilterType, freq: number, q: number, gain: number, pan: number, attack = 0.002, dest?: AudioNode): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.out(0, pan, dest);
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, pan: number, slide = 0, dest?: AudioNode, delay = 0): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    const t = c.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.out(0, pan, dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hoof(x: number, y: number, surface: Surface, gait: string, ridden: boolean): void {
    if (!this.enabled) return;
    const s = this.spatial(x, y, 420);
    if (s.gain <= 0.02) return;
    const v = s.gain * (ridden ? 0.55 : 0.35) * (gait === 'gallop' ? 1.2 : 1);
    if (surface === 'water') this.noise(0.18, 'bandpass', 900, 0.8, v * 0.9, s.pan);
    else if (surface === 'rock' || surface === 'wood') {
      this.noise(0.05, 'bandpass', surface === 'wood' ? 700 : 1800, 3, v, s.pan);
      this.tone(surface === 'wood' ? 180 : 260, 0.06, 'triangle', v * 0.4, s.pan);
    } else if (surface === 'snow') this.noise(0.09, 'lowpass', 600, 0.5, v * 0.7, s.pan);
    else if (surface === 'sand') this.noise(0.07, 'lowpass', 900, 0.5, v * 0.6, s.pan);
    else {
      this.noise(0.07, 'lowpass', 500, 1, v, s.pan);
      this.tone(90, 0.07, 'sine', v * 0.6, s.pan);
    }
  }

  step(x: number, y: number, surface: Surface): void {
    if (!this.enabled) return;
    const s = this.spatial(x, y, 200);
    const v = s.gain * 0.18;
    if (surface === 'wood') this.noise(0.05, 'bandpass', 500, 2, v * 1.3, s.pan);
    else if (surface === 'water') this.noise(0.12, 'bandpass', 1000, 0.8, v, s.pan);
    else if (surface === 'snow') this.noise(0.08, 'lowpass', 700, 0.5, v, s.pan);
    else this.noise(0.05, 'lowpass', surface === 'grass' ? 1400 : 900, 0.7, v, s.pan);
  }

  neigh(x: number, y: number, alarmed: boolean): void {
    if (!this.enabled) return;
    const s = this.spatial(x, y, 600);
    if (s.gain <= 0.02) return;
    const c = this.ctx!;
    const t = c.currentTime;
    // Whinny: vibrato sawtooth through a formant filter, falling pitch.
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const base = alarmed ? 620 : 520;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.35, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.9);
    const lfo = c.createOscillator();
    lfo.frequency.value = 18;
    const lg = c.createGain();
    lg.gain.value = 35;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1200;
    f.Q.value = 2;
    const g = this.out(0, s.pan);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(s.gain * 0.18, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(f);
    f.connect(g);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.05);
    lfo.stop(t + 1.05);
    // Snort tail.
    this.noise(0.25, 'bandpass', 400, 1, s.gain * 0.2, s.pan);
  }

  snort(x: number, y: number): void {
    if (!this.enabled) return;
    const s = this.spatial(x, y, 300);
    this.noise(0.3, 'bandpass', 350, 1.2, s.gain * 0.3, s.pan, 0.02);
  }

  gunshot(x: number, y: number, kind: string): void {
    if (!this.enabled) return;
    const s = this.spatial(x, y, 1400);
    const big = kind === 'rifle' || kind === 'shotgun';
    this.noise(big ? 0.6 : 0.4, 'lowpass', big ? 2200 : 3000, 0.7, s.gain * (big ? 0.9 : 0.75), s.pan, 0.001);
    this.tone(big ? 70 : 110, 0.25, 'sine', s.gain * 0.6, s.pan, -50);
    // Echo off the hills.
    const c = this.ctx!;
    setTimeout(() => {
      if (this.ctx === c) this.noise(0.8, 'lowpass', 900, 0.5, s.gain * 0.15, -s.pan);
    }, 260);
  }

  play(name: string, x = this.listenerX, y = this.listenerY): void {
    if (!this.enabled) return;
    const s = this.spatial(x, y, 500);
    const v = Math.max(0.05, s.gain);
    switch (name) {
      case 'ui':
        this.tone(660, 0.06, 'triangle', 0.08, 0);
        break;
      case 'uiBack':
        this.tone(440, 0.07, 'triangle', 0.07, 0);
        break;
      case 'coin':
        this.tone(1320, 0.12, 'square', 0.05, 0);
        this.tone(1760, 0.2, 'square', 0.04, 0, 0, undefined, 0.06);
        break;
      case 'quest':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.08, 0, 0, undefined, i * 0.12));
        break;
      case 'bond':
        [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.7, 'sine', 0.07, 0, 0, undefined, i * 0.15));
        break;
      case 'reload':
        this.noise(0.04, 'highpass', 3000, 1, v * 0.3, s.pan);
        this.noise(0.04, 'highpass', 2500, 1, v * 0.3, s.pan);
        break;
      case 'dryfire':
        this.noise(0.03, 'highpass', 4000, 1, v * 0.3, s.pan);
        break;
      case 'mount':
        this.noise(0.25, 'bandpass', 600, 1, v * 0.25, s.pan, 0.02);
        break;
      case 'jump':
        this.noise(0.3, 'lowpass', 400, 1, v * 0.3, s.pan, 0.05);
        break;
      case 'crash':
        this.noise(0.4, 'lowpass', 800, 0.7, v * 0.6, s.pan);
        break;
      case 'whistle': {
        const c = this.ctx!;
        const o = c.createOscillator();
        o.type = 'sine';
        const t = c.currentTime;
        o.frequency.setValueAtTime(1800, t);
        o.frequency.linearRampToValueAtTime(2600, t + 0.18);
        o.frequency.setValueAtTime(1900, t + 0.25);
        o.frequency.linearRampToValueAtTime(2900, t + 0.5);
        const g = this.out(0, 0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.03);
        g.gain.setValueAtTime(0.12, t + 0.45);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.65);
        break;
      }
      case 'thunder':
        this.noise(2.5, 'lowpass', 180, 0.5, 0.7, 0, 0.1);
        break;
      case 'brush':
        this.noise(0.3, 'highpass', 2500, 0.5, 0.06, 0, 0.05);
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) setTimeout(() => this.ctx && this.noise(0.06, 'bandpass', 1200, 2, 0.08, 0), i * 120);
        break;
      case 'drink':
        this.noise(0.4, 'bandpass', 700, 3, 0.08, 0, 0.05);
        break;
      case 'fire':
        this.noise(0.5, 'bandpass', 2500, 0.6, v * 0.08, s.pan, 0.1);
        break;
      case 'hit':
        this.noise(0.08, 'lowpass', 600, 1, v * 0.5, s.pan);
        break;
      case 'howl': {
        this.tone(480, 1.6, 'sine', v * 0.12, s.pan, 220);
        break;
      }
      case 'growl':
        this.noise(0.6, 'lowpass', 220, 4, v * 0.4, s.pan, 0.05);
        break;
      case 'bird':
        this.tone(2600 + Math.random() * 800, 0.08, 'sine', v * 0.05, s.pan, 600);
        this.tone(3000 + Math.random() * 600, 0.07, 'sine', v * 0.04, s.pan, -500, undefined, 0.12);
        break;
      case 'hawk':
        this.tone(2400, 0.9, 'sawtooth', v * 0.02, s.pan, -1400);
        break;
      case 'rattle':
        this.noise(0.8, 'highpass', 5000, 1, v * 0.15, s.pan, 0.02);
        break;
      case 'bell':
        [880, 1320, 1760].forEach((f) => this.tone(f, 1.8, 'sine', 0.05, s.pan));
        break;
      case 'cards':
        this.noise(0.05, 'highpass', 3500, 1, 0.08, 0);
        break;
      case 'splash':
        this.noise(0.4, 'bandpass', 800, 0.7, v * 0.3, s.pan, 0.01);
        break;
    }
  }

  private loopNoise(filter: BiquadFilterType, freq: number, q: number, dest: AudioNode): { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start();
    return { src, gain: g, filter: f };
  }

  private startAmbience(): void {
    this.windNode = this.loopNoise('bandpass', 500, 0.4, this.amb);
    const r = this.loopNoise('highpass', 1800, 0.3, this.amb);
    this.rainNode = { src: r.src, gain: r.gain };
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(this.amb);
    this.nightNode = { gain: g };
  }

  private cricketT = 0;
  private birdT = 0;

  /** Per-frame ambience: wind, rain, crickets at night, birds by day, music. */
  update(dt: number, env: { wind: number; rain: number; night: boolean; daylight: number; inside: boolean; region: string; tension: number; music: string }): void {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const insideMul = env.inside ? 0.35 : 1;
    if (this.windNode) {
      this.windNode.gain.gain.setTargetAtTime((0.05 + env.wind * 0.25) * insideMul, t, 0.5);
      this.windNode.filter.frequency.setTargetAtTime(300 + env.wind * 500 + Math.sin(t * 0.3) * 120, t, 0.5);
    }
    if (this.rainNode) this.rainNode.gain.gain.setTargetAtTime(env.rain * 0.22 * insideMul, t, 0.5);
    this.cricketT -= dt;
    if (env.night && !env.inside && env.rain < 0.3 && this.cricketT <= 0) {
      this.cricketT = 0.4 + Math.random() * 0.6;
      const f = 4200 + Math.random() * 400;
      for (let i = 0; i < 3; i++) this.tone(f, 0.04, 'sine', 0.012, Math.random() * 2 - 1, 0, this.amb, i * 0.06);
    }
    this.birdT -= dt;
    if (!env.night && env.daylight > 0.7 && !env.inside && env.rain < 0.3 && this.birdT <= 0) {
      this.birdT = 2 + Math.random() * 6;
      const f = 2200 + Math.random() * 1500;
      this.tone(f, 0.1, 'sine', 0.02, Math.random() * 2 - 1, 500, this.amb);
      this.tone(f * 1.1, 0.08, 'sine', 0.015, 0, -400, this.amb, 0.15);
    }
    this.musicMode = env.music;
    this.updateMusic(dt, env.tension);
  }

  // --- Generative score ------------------------------------------------------------
  private pluck(freq: number, when: number, gain: number, bright = 0.5): void {
    const c = this.ctx!;
    // Karplus-Strong via a short noise burst into a feedback delay.
    const dur = 2.2;
    const delay = c.createDelay();
    delay.delayTime.value = 1 / freq;
    const fb = c.createGain();
    fb.gain.value = 0.985;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500 + bright * 3000;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const burst = c.createGain();
    burst.gain.setValueAtTime(gain, when);
    burst.gain.setValueAtTime(0, when + 1 / freq * 1.2);
    const out = c.createGain();
    out.gain.setValueAtTime(1, when);
    out.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(burst);
    burst.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(out);
    out.connect(this.music);
    src.start(when, Math.random());
    src.stop(when + 0.05);
    setTimeout(() => {
      try {
        out.disconnect();
        fb.disconnect();
      } catch {
        /* already gone */
      }
    }, (dur + 0.5) * 1000);
  }

  private updateMusic(dt: number, tension: number): void {
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const c = this.ctx!;
    const modes: Record<string, { root: number; scale: number[]; tempo: number; density: number }> = {
      open: { root: 196, scale: [0, 2, 4, 7, 9, 12, 14], tempo: 0.42, density: 0.55 },
      lonesome: { root: 174.6, scale: [0, 3, 5, 7, 10, 12], tempo: 0.55, density: 0.4 },
      tense: { root: 164.8, scale: [0, 1, 4, 5, 7, 8, 11, 12], tempo: 0.3, density: 0.7 },
      bustle: { root: 220, scale: [0, 2, 4, 5, 7, 9, 11, 12], tempo: 0.33, density: 0.65 },
      cold: { root: 146.8, scale: [0, 2, 3, 7, 8, 12], tempo: 0.6, density: 0.35 },
      forest: { root: 185, scale: [0, 2, 5, 7, 9, 12], tempo: 0.5, density: 0.45 },
      night: { root: 164.8, scale: [0, 3, 5, 7, 10, 12], tempo: 0.65, density: 0.3 },
      combat: { root: 146.8, scale: [0, 1, 3, 5, 7, 8, 10, 12], tempo: 0.18, density: 0.9 },
    };
    const m = modes[tension > 0.5 ? 'combat' : this.musicMode] ?? modes.open!;
    this.musicTimer = m.tempo;
    const step = this.musicStep++;
    const when = c.currentTime + 0.05;
    // Bass on the bar, chord tones and a wandering melody.
    if (step % 8 === 0) this.pluck(m.root / 2, when, 0.35, 0.2);
    if (step % 8 === 4) this.pluck((m.root / 2) * 1.5, when, 0.25, 0.2);
    if (Math.random() < m.density) {
      const deg = m.scale[Math.floor(Math.random() * m.scale.length)]!;
      this.pluck(m.root * Math.pow(2, deg / 12) * (Math.random() < 0.3 ? 2 : 1), when, 0.18, 0.6);
    }
    // Long phrase rests make it feel human.
    if (step % 32 === 31) this.musicTimer = m.tempo * 6;
  }
}
