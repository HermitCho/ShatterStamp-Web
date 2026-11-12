/**
 * 배경 음악을 코드로 합성한다(외부 음원 없음). Godot 버전 tools/make_bgm.gd와 같은 곡.
 * 웹 버전은 파일로 굽지 않고, 첫 사용자 입력 뒤 브라우저에서 바로 만들어 반복 재생한다.
 *   title : 96 BPM, 패드 + 느린 아르페지오(메아리) + 가벼운 킥
 *   game  : 128 BPM, 킥·스네어·하이햇 + 베이스 + 16분 아르페지오 + 패드
 *   fever : game과 길이가 같은 추가 층(멜로디 + 촘촘한 하이햇). 피버 때 같이 틀어 둔 채 소리만 올린다.
 * 세 곡 모두 꼬리 소리를 처음으로 감아 넣어 반복해도 끊김이 없다.
 */
const SR = 32000;
const TAU = Math.PI * 2;
// A단조: Am - F - C - G (코드당 2마디)
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
const BASS = [45, 41, 48, 43];
const MELODY: [number, number, number][][] = [
  [[0, 76, 4], [4, 74, 2], [6, 72, 2], [8, 74, 4], [12, 76, 4]],
  [[0, 79, 6], [6, 76, 2], [8, 74, 8]],
  [[0, 72, 4], [4, 74, 2], [6, 76, 2], [8, 77, 4], [12, 76, 4]],
  [[0, 74, 6], [6, 72, 2], [8, 69, 8]],
  [[0, 72, 4], [4, 76, 2], [6, 79, 2], [8, 84, 4], [12, 83, 4]],
  [[0, 79, 8], [8, 76, 8]],
  [[0, 74, 4], [4, 79, 2], [6, 83, 2], [8, 81, 4], [12, 79, 4]],
  [[0, 74, 6], [6, 76, 2], [8, 71, 8]],
];

let seed = 128;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = () => rnd() * 2 - 1;
const freq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const add = (b: Float32Array, i: number, v: number) => (b[i % b.length] += v);

function kick(b: Float32Array, t0: number, vol: number): void {
  let ph = 0;
  for (let i = 0; i < SR * 0.32; i++) {
    const t = i / SR;
    ph += (TAU * (45 + 95 * Math.exp(-t * 30))) / SR;
    add(b, t0 + i, Math.sin(ph) * Math.exp(-t * 8) * vol);
  }
}

function snare(b: Float32Array, t0: number, vol: number): void {
  let lp = 0;
  for (let i = 0; i < SR * 0.2; i++) {
    const t = i / SR;
    lp += (noise() - lp) * 0.5;
    add(b, t0 + i, (lp * Math.exp(-t * 18) + Math.sin(TAU * 190 * t) * 0.6 * Math.exp(-t * 35)) * vol);
  }
}

function clap(b: Float32Array, t0: number, vol: number): void {
  for (let burst = 0; burst < 3; burst++) {
    const o = t0 + burst * Math.floor(SR * 0.011);
    for (let i = 0; i < SR * 0.12; i++) add(b, o + i, noise() * Math.exp(-(i / SR) * (burst < 2 ? 40 : 14)) * vol * 0.6);
  }
}

function hat(b: Float32Array, t0: number, vol: number): void {
  let lp = 0;
  for (let i = 0; i < SR * 0.05; i++) {
    const nz = noise();
    lp += (nz - lp) * 0.35;
    add(b, t0 + i, (nz - lp) * Math.exp(-(i / SR) * 70) * vol); // 고역만 남긴 잡음
  }
}

function bass(b: Float32Array, t0: number, len: number, midi: number, vol: number): void {
  const f = freq(midi);
  let lp = 0, ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph = (ph + f / SR) % 1;
    lp += ((2 * ph - 1) * 0.6 + (ph < 0.5 ? 1 : -1) * 0.4 - lp) * 0.12;
    const env = Math.min(1, t * 300) * (1 - 0.35 * Math.min(1, t * 6));
    add(b, t0 + i, lp * env * Math.min(1, (len - i) / (SR * 0.01)) * vol);
  }
}

function pluck(b: Float32Array, t0: number, len: number, midi: number, vol: number, duty: number): void {
  const f = freq(midi);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph = (ph + f / SR) % 1;
    const v = (ph < duty ? 1 : -1) * 0.6 + Math.sin(ph * TAU) * 0.4;
    add(b, t0 + i, v * Math.exp(-t * 14) * Math.min(1, t * 800) * vol);
  }
}

function pad(b: Float32Array, t0: number, len: number, tones: number[], vol: number): void {
  for (const m of tones) {
    for (const det of [-0.07, 0.07]) {
      const f = freq(m + det);
      let ph = rnd(), lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        ph = (ph + f / SR) % 1;
        lp += (2 * ph - 1 - lp) * 0.04;
        add(b, t0 + i, lp * Math.min(1, t / 0.35) * Math.min(1, (len - i) / (SR * 0.3)) * vol);
      }
    }
  }
}

function lead(b: Float32Array, t0: number, len: number, midi: number, vol: number): void {
  const f = freq(midi);
  let ph = 0, ph2 = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const vib = 1 + 0.006 * Math.sin(TAU * 5.5 * t) * Math.min(1, Math.max(0, t - 0.15) * 4);
    ph = (ph + (f * vib) / SR) % 1;
    ph2 = (ph2 + (f * vib * 1.005) / SR) % 1;
    lp += ((2 * ph - 1 + (2 * ph2 - 1)) * 0.5 - lp) * 0.2;
    const env = Math.min(1, t * 200) * (0.75 + 0.25 * Math.exp(-t * 6)) * Math.min(1, (len - i) / (SR * 0.02));
    add(b, t0 + i, lp * env * vol);
  }
}

/** 박마다 소리를 눌렀다 놓는다(킥이 또렷하고 "펌핑"되는 느낌). */
function sidechain(b: Float32Array, beat: number): void {
  for (let i = 0; i < b.length; i++) b[i] *= 1 - 0.6 * Math.exp(-((i % beat) / SR) * 9);
}

function lowpass(b: Float32Array, k: number): Float32Array {
  const out = new Float32Array(b.length);
  let lp = 0;
  for (let lap = 0; lap < 2; lap++) {
    // 두 바퀴 돌려 처음과 끝의 필터 상태를 잇는다
    for (let i = 0; i < b.length; i++) {
      lp += (b[i] - lp) * k;
      if (lap === 1) out[i] = lp;
    }
  }
  return out;
}

function echo(b: Float32Array, delay: number, fb: number): Float32Array {
  const out = b.slice(), n = b.length;
  for (let rep = 1; rep <= 3; rep++) {
    const gain = Math.pow(fb, rep);
    for (let i = 0; i < n; i++) out[(i + delay * rep) % n] += b[i] * gain;
  }
  return out;
}

function mixdown(layers: Float32Array[], n: number): Float32Array {
  const out = new Float32Array(n);
  for (const l of layers) for (let i = 0; i < n; i++) out[i] += l[i];
  let peak = 0.001;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const norm = 0.9 / peak, d = Math.tanh(1.1);
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * norm * 1.1) / d;
  return out;
}

function makeGame(): Float32Array {
  const beat = (SR * 60) / 128, n = beat * 32;
  const drums = new Float32Array(n), duck = new Float32Array(n), arp = new Float32Array(n);
  for (let b = 0; b < 32; b++) {
    kick(drums, b * beat, 0.6);
    if (b % 4 === 1 || b % 4 === 3) snare(drums, b * beat, 0.32);
    hat(drums, b * beat + beat / 2, 0.09);
  }
  const pattern = [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 2, 3, 2, 1];
  for (let bar = 0; bar < 8; bar++) {
    const ci = bar >> 1, bar0 = bar * beat * 4, tones = CHORDS[ci];
    for (let e = 0; e < 8; e++) bass(duck, bar0 + (e * beat) / 2, beat / 2, BASS[ci] + (e % 4 === 3 ? 12 : 0), 0.26);
    for (let s = 0; s < 16; s++) {
      const k = pattern[s];
      pluck(arp, bar0 + (s * beat) / 4, beat / 2, k === 3 ? tones[0] + 24 : tones[k] + 12, 0.11, 0.25);
    }
    if (bar % 2 === 0) pad(duck, bar0, beat * 8, tones, 0.05);
  }
  sidechain(duck, beat);
  return mixdown([drums, duck, lowpass(arp, 0.35)], n);
}

function makeFever(): Float32Array {
  const beat = (SR * 60) / 128, n = beat * 32;
  const ld = new Float32Array(n), drums = new Float32Array(n);
  for (let bar = 0; bar < 8; bar++) {
    const bar0 = bar * beat * 4;
    for (const [st, m, len] of MELODY[bar]) lead(ld, bar0 + (st * beat) / 4, (len * beat) / 4, m, 0.13);
    for (let s = 1; s < 16; s += 2) hat(drums, bar0 + (s * beat) / 4, 0.05);
    clap(drums, bar0 + beat * 2, 0.12);
  }
  return mixdown([echo(ld, (beat * 3) / 4, 0.3), drums], n);
}

function makeTitle(): Float32Array {
  const beat = (SR * 60) / 96, n = beat * 32;
  const drums = new Float32Array(n), pd = new Float32Array(n), arp = new Float32Array(n);
  for (let b = 0; b < 32; b++) {
    if (b % 2 === 0) kick(drums, b * beat, 0.32);
    hat(drums, b * beat + beat / 2, 0.035);
  }
  const pattern = [0, 2, 1, 2, 3, 2, 1, 2];
  for (let bar = 0; bar < 8; bar++) {
    const ci = bar >> 1, bar0 = bar * beat * 4, tones = CHORDS[ci];
    if (bar % 2 === 0) {
      pad(pd, bar0, beat * 8, tones, 0.08);
      bass(pd, bar0, beat * 8, BASS[ci] - 12, 0.12);
    }
    for (let s = 0; s < 8; s++) {
      const k = pattern[s];
      pluck(arp, bar0 + (s * beat) / 2, beat, k === 3 ? tones[0] + 24 : tones[k] + 12, 0.1, 0.5);
    }
  }
  return mixdown([drums, pd, echo(lowpass(arp, 0.25), (beat * 3) / 4, 0.45)], n);
}

type Track = "title" | "game" | "fever";
const TRACK_GAIN: Record<Track, number> = { title: 0.63, game: 0.7, fever: 0.7 };

/** 재생기: 곡마다 반복 재생 소스 + 음량(Gain). 음량을 서서히 바꿔 곡을 오간다. */
export class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buffers: Partial<Record<Track, AudioBuffer>> = {};
  private sources: Partial<Record<Track, AudioBufferSourceNode>> = {};
  private gains: Partial<Record<Track, GainNode>> = {};
  private wanted: "title" | "game" | null = null;
  private feverOn = false;
  private paused = false;
  /** 게임 곡이 시작된 AudioContext 시각(박자 계산용) */
  private gameT0 = -1;
  volume = 0.6;

  /** 게임 곡(128 BPM)의 지금 박 안 위치 0~1. 게임 곡이 안 나오면 -1. */
  beatPhase(): number {
    if (!this.ctx || !this.sources.game || this.gameT0 < 0) return -1;
    const b = ((this.ctx.currentTime - this.gameT0) * 128) / 60;
    return ((b % 1) + 1) % 1;
  }

  /** Sfx와 같은 AudioContext를 받아 곡을 만든다(한 곡씩 나눠 만들어 화면이 멈추지 않게). */
  attach(ctx: AudioContext): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(ctx.destination);
    const makers: [Track, () => Float32Array][] = [["title", makeTitle], ["game", makeGame], ["fever", makeFever]];
    const next = () => {
      const m = makers.shift();
      if (!m) return;
      const data = m[1]();
      const buf = ctx.createBuffer(1, data.length, SR);
      buf.getChannelData(0).set(data);
      this.buffers[m[0]] = buf;
      this.apply(0.6);
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  playTitle(): void {
    this.wanted = "title";
    this.feverOn = false;
    this.paused = false;
    this.apply(0.8);
  }

  /** 게임 곡과 피버 층을 같은 순간에 다시 시작해 박자를 맞춘다. */
  playGame(): void {
    this.wanted = "game";
    this.feverOn = false;
    this.paused = false;
    this.stop("game");
    this.stop("fever");
    this.apply(0.3);
  }

  setFever(on: boolean): void {
    this.feverOn = on;
    this.apply(on ? 0.5 : 1.0);
  }

  setPaused(on: boolean): void {
    this.paused = on;
    this.apply(0.25);
  }

  endGame(): void {
    this.wanted = null;
    this.feverOn = false;
    this.apply(1.2);
  }

  /** 지금 상태에 맞게 각 곡의 목표 음량으로 서서히 옮긴다(아직 안 만든 곡은 만들어지면 다시 부른다). */
  private apply(fade: number): void {
    if (!this.ctx) return;
    const target: Record<Track, number> = {
      title: this.wanted === "title" ? 1 : 0,
      game: this.wanted === "game" ? (this.paused ? 0.16 : 1) : 0,
      fever: this.wanted === "game" && this.feverOn && !this.paused ? 1 : 0,
    };
    const startGameLayers = this.wanted === "game" && this.buffers.game && this.buffers.fever && !this.sources.game;
    for (const tr of ["title", "game", "fever"] as Track[]) {
      const want = target[tr] * TRACK_GAIN[tr];
      if (want > 0 && !this.sources[tr] && this.buffers[tr] && (tr === "title" || startGameLayers)) this.start(tr);
      const gn = this.gains[tr];
      if (!gn) continue;
      const now = this.ctx.currentTime;
      gn.gain.cancelScheduledValues(now);
      gn.gain.setValueAtTime(gn.gain.value, now);
      gn.gain.linearRampToValueAtTime(want, now + fade);
      if (want === 0 && tr !== "fever") {
        const src = this.sources[tr];
        setTimeout(() => {
          if (this.sources[tr] === src && this.gains[tr]!.gain.value < 0.01) this.stop(tr);
        }, fade * 1000 + 50);
      }
    }
    if (this.wanted !== "game" && this.sources.fever && target.fever === 0) {
      const src = this.sources.fever;
      setTimeout(() => this.sources.fever === src && this.stop("fever"), fade * 1000 + 50);
    }
  }

  private start(tr: Track): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.out!);
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[tr]!;
    src.loop = true;
    src.connect(g);
    // 게임 곡과 피버 층은 같은 시각에 시작해 박자를 맞춘다
    const at = ctx.currentTime + 0.02;
    src.start(at);
    if (tr === "game") this.gameT0 = at;
    if (tr === "game" && this.buffers.fever && !this.sources.fever) {
      this.sources[tr] = src;
      this.gains[tr] = g;
      this.startAt("fever", at);
      return;
    }
    this.sources[tr] = src;
    this.gains[tr] = g;
  }

  private startAt(tr: Track, at: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.out!);
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[tr]!;
    src.loop = true;
    src.connect(g);
    src.start(at);
    this.sources[tr] = src;
    this.gains[tr] = g;
  }

  private stop(tr: Track): void {
    try {
      this.sources[tr]?.stop();
    } catch {
      /* 이미 멈춤 */
    }
    this.sources[tr]?.disconnect();
    this.gains[tr]?.disconnect();
    delete this.sources[tr];
    delete this.gains[tr];
  }
}
