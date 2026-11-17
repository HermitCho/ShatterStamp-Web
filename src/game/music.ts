/**
 * 배경 음악을 코드로 합성한다(외부 음원 없음). 효과음(audio.ts)과 같은 신스 도구(synth.ts)와 같은 C장조라
 * 부서지는 소리가 곡 위에서 어울린다. 첫 사용자 입력 뒤 브라우저에서 한 곡씩 만들어 둔다.
 *   title : 96 BPM, 넓은 패드 + 메아리 아르페지오 + 가벼운 킥(8마디 반복)
 *   game  : 112 BPM, 킥·스네어·하이햇 + 8분 옥타브 베이스 + 16분 아르페지오 + 패드, 뒤 절반에 부드러운 멜로디(16마디 반복)
 *   fever : 160 BPM 딱 4마디 = 6.0초(피버 시간과 같다). 한 번만 재생: 3마디 신나는 훅 → 4마디째 C 화음 '쾅' + 스네어
 *           몰아치기와 올라가는 바람 소리 → 6.0초에 뚝 끊기고, 그 박에 게임 곡이 처음부터 다시 들어온다.
 * 반복 곡은 꼬리 소리를 처음으로 감아 넣어 이음매가 없다.
 */
import { bakeFx, midiHz, renderVoice, type Voice } from "./synth.ts";

const SR = 32000;
export const GAME_BPM = 112;
export const FEVER_BPM = 160;
const TITLE_BPM = 96;
/** 피버 곡 길이(초) = 160 BPM 16박. game-rules의 FEVER_TIME과 같아야 한다. */
export const FEVER_SONG = (16 * 60) / FEVER_BPM;

// C장조 신스웨이브 진행: Fmaj7 - G - Em7 - Am
const CHORDS = [[53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 62], [57, 60, 64, 69]];
const ROOTS = [41, 43, 40, 45];
const WIDE = [-18, -9, 0, 9, 18];

type Buf = Float32Array;
const at = (b: Buf, v: Voice, t0: number, len?: number, gain = 1) => renderVoice(b, SR, v, Math.floor(t0), len !== undefined ? Math.floor(len) : undefined, gain);

function kick(b: Buf, t: number, vol: number): void {
  at(b, { osc: "sine", f: 160, f1: 45, sweep: 0.03, d: 0.17 }, t, SR * 0.4, vol);
  at(b, { osc: "noise", f: 0, d: 0.004, hp: 3000, gain: 0.5 }, t, SR * 0.03, vol);
}
function snare(b: Buf, t: number, vol: number): void {
  at(b, { osc: "noise", f: 0, d: 0.08, lp: 8000, lp1: 3000, lpT: 0.05, hp: 500 }, t, SR * 0.3, vol);
  at(b, { osc: "tri", f: 220, f1: 170, sweep: 0.02, d: 0.04, gain: 0.7 }, t, SR * 0.15, vol);
}
function hat(b: Buf, t: number, vol: number, open = false): void {
  at(b, { osc: "noise", f: 0, d: open ? 0.07 : 0.015, hp: 7500 }, t, SR * (open ? 0.25 : 0.06), vol);
}
function bass(b: Buf, t: number, len: number, m: number, vol: number): void {
  const f = midiHz(m);
  at(b, { osc: "saw", f, detune: [-6, 6], d: 0.18, s: 0.45, hold: len / SR - 0.02, r: 0.02, lp: 2200, lp1: 380, lpT: 0.07, q: 1.3 }, t, len + SR * 0.1, vol);
  at(b, { osc: "square", f: f / 2, d: 0.3, s: 0.6, hold: len / SR - 0.02, r: 0.02, lp: 300, gain: 0.5 }, t, len + SR * 0.1, vol);
}
function pad(b: Buf, t: number, len: number, notes: number[], vol: number, cut = 1500): void {
  for (const m of notes) at(b, { osc: "saw", f: midiHz(m), detune: WIDE, a: 0.25, s: 1, hold: len / SR, r: 0.35, lp: cut, q: 0.9, gain: 0.4 }, t, len + SR * 1.5, vol);
}
function pluck(b: Buf, t: number, m: number, vol: number, bright = 5000): void {
  at(b, { osc: "saw", f: midiHz(m), detune: [-7, 7], d: 0.11, lp: bright, lp1: 500, lpT: 0.05, q: 1.2 }, t, SR * 0.5, vol);
}
function lead(b: Buf, t: number, len: number, m: number, vol: number): void {
  at(b, { osc: "saw", f: midiHz(m), detune: [-10, 0, 10], a: 0.008, d: 0.25, s: 0.7, hold: len / SR - 0.01, r: 0.06, lp: 5200, lp1: 3000, lpT: 0.2, vib: [0.12, 5.5], gain: 0.8 }, t, len + SR * 0.4, vol);
  at(b, { osc: "square", f: midiHz(m + 12), duty: 0.3, a: 0.008, d: 0.15, s: 0.4, hold: len / SR - 0.01, r: 0.05, lp: 4000, gain: 0.25 }, t, len + SR * 0.3, vol);
}
function riser(b: Buf, t: number, len: number, vol: number): void {
  at(b, { osc: "noise", f: 0, a: len / SR, s: 1, hold: len / SR, r: 0.003, lp: 600, lp1: 12000, lpT: (len / SR) * 0.6, q: 2.5 }, t, len, vol);
}

/** 박마다 소리를 눌렀다 놓는다(킥이 또렷하고 출렁이는 느낌) */
function sidechain(b: Buf, beat: number, depth: number, from = 0, to = b.length): void {
  for (let i = from; i < to; i++) b[i] *= 1 - depth * Math.exp(-(((i - from) % beat) / SR) * 8);
}
/** 반복 곡: 끝을 넘친 꼬리를 처음에 더한다 */
function fold(b: Buf, n: number): Buf {
  const out = b.slice(0, n);
  for (let i = n; i < b.length; i++) out[i % n] += b[i];
  return out;
}
function mixdown(layers: Buf[], n: number, level = 0.9): Buf {
  const out = new Float32Array(n);
  for (const l of layers) for (let i = 0; i < n && i < l.length; i++) out[i] += l[i];
  let peak = 0.001;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const norm = level / peak, d = Math.tanh(1.2);
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * norm * 1.2) / d;
  return out;
}

export function makeGame(): Buf {
  const beat = (SR * 60) / GAME_BPM, n = Math.round(beat * 64), ext = n + SR * 3;
  const drums = new Float32Array(ext), low = new Float32Array(ext), arp = new Float32Array(ext), mel = new Float32Array(ext), sn = new Float32Array(ext);
  for (let b = 0; b < 64; b++) {
    kick(drums, b * beat, 0.55);
    if (b % 2 === 1) snare(sn, b * beat, 0.22);
    hat(drums, b * beat + beat / 2, 0.05, b % 8 === 7);
    if (b >= 32) hat(drums, b * beat + beat / 4, 0.02), hat(drums, b * beat + (beat * 3) / 4, 0.02);
  }
  const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
  for (let bar = 0; bar < 16; bar++) {
    const ci = (bar >> 1) % 4, bar0 = bar * beat * 4, tones = CHORDS[ci];
    for (let e = 0; e < 8; e++) bass(low, bar0 + (e * beat) / 2, beat / 2 - SR * 0.01, ROOTS[ci] + (e % 2 ? 12 : 0), 0.3);
    if (bar % 2 === 0) pad(low, bar0, beat * 8, tones, 0.05, 1300);
    for (let s = 0; s < 16; s++) pluck(arp, bar0 + (s * beat) / 4, tones[pattern[s % 8]] + 12, s % 4 === 0 ? 0.09 : 0.06, 3500);
  }
  // 뒤 8마디: 부드러운 멜로디(박 단위 [시작 박, 음, 길이 박])
  const MEL: [number, number, number][] = [
    [0, 76, 1.5], [1.5, 77, 0.5], [2, 76, 2], [4, 74, 1.5], [5.5, 72, 0.5], [6, 74, 2],
    [8, 71, 1.5], [9.5, 72, 0.5], [10, 74, 2], [12, 76, 3], [15, 72, 1],
    [16, 76, 1.5], [17.5, 77, 0.5], [18, 79, 2], [20, 81, 1.5], [21.5, 79, 0.5], [22, 77, 2],
    [24, 76, 1.5], [25.5, 74, 0.5], [26, 72, 2], [28, 76, 4],
  ];
  for (const [st, m, len] of MEL) lead(mel, beat * 32 + st * beat, len * beat, m, 0.07);
  sidechain(low, beat, 0.55);
  const snW = bakeFx(sn, SR, 0, 0.5, 0);
  return mixdown([fold(drums, n), fold(snW, n), fold(low, n), fold(bakeFx(arp, SR, 0.35, 0.2, 0), n), fold(bakeFx(mel, SR, 0.3, 0.3, 0), n)], n, 0.85);
}

/** 피버 곡: 한 번만, 6.0초 + 잔향 꼬리 */
export function makeFever(): Buf {
  const beat = (SR * 60) / FEVER_BPM, n = Math.round(beat * 16), ext = n + SR * 2;
  const drums = new Float32Array(ext), low = new Float32Array(ext), ld = new Float32Array(ext), sn = new Float32Array(ext), fx = new Float32Array(ext);
  const BAR_CHORD = [CHORDS[0], CHORDS[1], CHORDS[3]];
  const BAR_ROOT = [ROOTS[0], ROOTS[1], ROOTS[3]];
  // 1~3마디: 꽉 찬 박자
  for (let b = 0; b < 12; b++) {
    kick(drums, b * beat, 0.7);
    if (b % 2 === 1) snare(sn, b * beat, 0.35);
    for (let s = 0; s < 4; s++) hat(drums, b * beat + (s * beat) / 4, s === 2 ? 0.07 : 0.035, s === 2);
  }
  for (let bar = 0; bar < 3; bar++) {
    const bar0 = bar * beat * 4;
    for (let e = 0; e < 8; e++) bass(low, bar0 + (e * beat) / 2, beat / 2 - SR * 0.008, BAR_ROOT[bar] + (e % 2 ? 12 : 0), 0.35);
    pad(low, bar0, beat * 4, BAR_CHORD[bar], 0.07, 2600);
  }
  // 훅: 8분음표로 올라가는 멜로디
  const HOOK = [
    [76, 79, 81, 84, 81, 79, 76, 79],
    [74, 79, 83, 86, 83, 79, 86, 88],
    [88, 86, 84, 81, 84, 86, 88, 91],
  ];
  HOOK.forEach((bar, bi) => bar.forEach((m, i) => lead(ld, bi * beat * 4 + (i * beat) / 2, beat / 2 - SR * 0.01, m, 0.11)));
  // 4마디: 1박에 C 화음 '쾅'(길게 울림) → 스네어 몰아치기 + 바람 소리 → 6.0초에 끊김
  const b4 = beat * 12;
  kick(drums, b4, 0.9);
  hat(drums, b4, 0.12, true);
  pad(ld, b4, beat * 1.2, [60, 64, 67, 72, 76], 0.12, 5000);
  lead(ld, b4, beat * 1.5, 84, 0.12);
  bass(low, b4, beat, 36, 0.45);
  for (let s = 4; s < 16; s++) snare(sn, b4 + (s * beat) / 4, 0.08 + 0.3 * ((s - 4) / 11) ** 1.5);
  riser(fx, b4 + beat, beat * 3, 0.12);
  sidechain(low, beat, 0.6, 0, Math.floor(beat * 12));
  const parts = [drums, bakeFx(sn, SR, 0, 0.35, 0), low, bakeFx(ld, SR, 0.3, 0.25, 0), fx];
  // 6.0초에서 꼬리만 남기고 끊는다(잔향 성분 빼고 마른 소리는 끝 직전 짧게 줄인다)
  const cut = n - Math.floor(SR * 0.004);
  for (const p of [drums, low, fx]) for (let i = cut; i < p.length; i++) p[i] *= i < n ? (n - i) / (n - cut) : 0;
  return mixdown(parts, ext, 0.9);
}

export function makeTitle(): Buf {
  const beat = (SR * 60) / TITLE_BPM, n = Math.round(beat * 32), ext = n + SR * 3;
  const drums = new Float32Array(ext), pd = new Float32Array(ext), arp = new Float32Array(ext);
  for (let b = 0; b < 32; b++) {
    if (b % 2 === 0) kick(drums, b * beat, 0.3);
    hat(drums, b * beat + beat / 2, 0.025);
  }
  const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
  for (let bar = 0; bar < 8; bar++) {
    const ci = (bar >> 1) % 4, bar0 = bar * beat * 4, tones = CHORDS[ci];
    if (bar % 2 === 0) {
      pad(pd, bar0, beat * 8, tones, 0.07, 1100);
      bass(pd, bar0, beat * 8 - SR * 0.05, ROOTS[ci] - 12, 0.14);
    }
    for (let s = 0; s < 8; s++) pluck(arp, bar0 + (s * beat) / 2, tones[pattern[s]] + 12, 0.08, 2600);
  }
  return mixdown([fold(drums, n), fold(pd, n), fold(bakeFx(arp, SR, 0.45, 0.3, 0), n)], n, 0.8);
}

type Track = "title" | "game" | "fever";
const TRACK_GAIN: Record<Track, number> = { title: 0.63, game: 0.7, fever: 0.72 };

/**
 * 재생기. title·game은 반복, fever는 한 번만.
 * 피버가 시작되면 게임 곡을 멈추고 피버 곡을 처음부터, 피버가 끝나면(6초) 게임 곡을 처음부터 다시 튼다.
 * 일시정지 중엔 피버 곡을 멈췄다가 그 자리부터 이어 튼다(게임 시간과 맞추려고).
 */
export class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buffers: Partial<Record<Track, AudioBuffer>> = {};
  private sources: Partial<Record<Track, AudioBufferSourceNode>> = {};
  private gains: Partial<Record<Track, GainNode>> = {};
  private wanted: "title" | "game" | null = null;
  private feverOn = false;
  private paused = false;
  /** 곡이 처음부터 시작된(것으로 치는) AudioContext 시각 */
  private gameT0 = -1;
  private feverT0 = -1;
  /** 일시정지 때 피버 곡이 어디까지 갔는지(초) */
  private feverPos = 0;
  volume = 0.6;

  /** 지금 나오는 곡의 박 안 위치 0~1(피버 땐 피버 곡). 곡이 없으면 -1. */
  beatPhase(): number {
    if (!this.ctx) return -1;
    let b: number;
    if (this.feverOn && this.sources.fever && !this.paused) b = ((this.ctx.currentTime - this.feverT0) * FEVER_BPM) / 60;
    else if (this.sources.game && this.gameT0 >= 0) b = ((this.ctx.currentTime - this.gameT0) * GAME_BPM) / 60;
    else return -1;
    return ((b % 1) + 1) % 1;
  }

  /** Sfx와 같은 AudioContext를 받아 곡을 만든다(한 곡씩 나눠 만들어 화면이 멈추지 않게). */
  attach(ctx: AudioContext): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(ctx.destination);
    const take = (name: Track, data: Float32Array) => {
      const buf = ctx.createBuffer(1, data.length, SR);
      buf.getChannelData(0).set(data);
      this.buffers[name] = buf;
      this.apply(0.6);
    };
    // 곡 만들기는 1~2초 걸려서 백그라운드 스레드(워커)에서. 워커를 못 쓰면 화면 스레드에서 한 곡씩.
    try {
      const w = new Worker(new URL("./music-worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ name: Track; data: Float32Array }>) => take(e.data.name, e.data.data);
      w.onerror = () => this.buildHere(take);
      w.postMessage(0);
    } catch {
      this.buildHere(take);
    }
  }

  private builtHere = false;
  private buildHere(take: (name: Track, data: Float32Array) => void): void {
    if (this.builtHere) return;
    this.builtHere = true;
    const makers: [Track, () => Float32Array][] = [["title", makeTitle], ["game", makeGame], ["fever", makeFever]];
    const next = () => {
      const m = makers.shift();
      if (!m) return;
      if (!this.buffers[m[0]]) take(m[0], m[1]());
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
    this.stop("fever");
    this.apply(0.8);
  }

  /** 게임 곡을 처음부터 */
  playGame(): void {
    this.wanted = "game";
    this.feverOn = false;
    this.paused = false;
    this.stop("game");
    this.stop("fever");
    this.apply(0.3);
  }

  /** 피버 시작·끝. 같은 상태로 다시 불러도 아무것도 안 한다. */
  setFever(on: boolean): void {
    if (on === this.feverOn || this.wanted !== "game") return;
    this.feverOn = on;
    if (!this.ctx) return;
    if (on) {
      this.fadeStop("game", 0.06);
      this.feverPos = 0;
      if (!this.paused) this.startFever(0);
    } else {
      // 피버 곡은 6초에 스스로 끊기고 잔향만 남는다. 남은 꼬리는 그대로 두고 게임 곡을 첫 박부터.
      const src = this.sources.fever;
      if (src) this.fadeStop("fever", 0.6);
      this.stop("game");
      this.apply(0.02);
    }
  }

  setPaused(on: boolean): void {
    if (on === this.paused) return;
    this.paused = on;
    if (this.ctx && this.feverOn) {
      if (on) {
        this.feverPos = Math.max(0, this.ctx.currentTime - this.feverT0);
        this.stop("fever");
      } else this.startFever(this.feverPos);
    }
    this.apply(0.25);
  }

  endGame(): void {
    this.wanted = null;
    this.feverOn = false;
    this.fadeStop("fever", 0.4);
    this.apply(1.2);
  }

  private startFever(pos: number): void {
    const ctx = this.ctx!, buf = this.buffers.fever;
    if (!buf) return;
    this.stop("fever");
    const g = ctx.createGain();
    g.gain.value = TRACK_GAIN.fever;
    g.connect(this.out!);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    const t = ctx.currentTime + 0.01;
    src.start(t, Math.min(pos, buf.duration));
    this.feverT0 = t - pos;
    this.sources.fever = src;
    this.gains.fever = g;
    src.onended = () => {
      if (this.sources.fever === src) this.stop("fever");
    };
  }

  private fadeStop(tr: Track, fade: number): void {
    const gn = this.gains[tr], src = this.sources[tr];
    if (!gn || !src || !this.ctx) return;
    const now = this.ctx.currentTime;
    gn.gain.cancelScheduledValues(now);
    gn.gain.setValueAtTime(gn.gain.value, now);
    gn.gain.linearRampToValueAtTime(0, now + fade);
    delete this.sources[tr];
    delete this.gains[tr];
    setTimeout(() => {
      try {
        src.stop();
      } catch {
        /* 이미 멈춤 */
      }
      src.disconnect();
      gn.disconnect();
    }, fade * 1000 + 60);
  }

  /** title·game 반복 곡의 음량을 지금 상태에 맞게 서서히 옮긴다(아직 안 만든 곡은 만들어지면 다시 부른다). */
  private apply(fade: number): void {
    if (!this.ctx) return;
    const target: Record<"title" | "game", number> = {
      title: this.wanted === "title" ? 1 : 0,
      game: this.wanted === "game" && !this.feverOn ? (this.paused ? 0.16 : 1) : 0,
    };
    for (const tr of ["title", "game"] as const) {
      const want = target[tr] * TRACK_GAIN[tr];
      if (want > 0 && !this.sources[tr] && this.buffers[tr]) this.start(tr);
      const gn = this.gains[tr];
      if (!gn) continue;
      const now = this.ctx.currentTime;
      gn.gain.cancelScheduledValues(now);
      gn.gain.setValueAtTime(gn.gain.value, now);
      gn.gain.linearRampToValueAtTime(want, now + fade);
      if (want === 0) this.fadeStop(tr, fade);
    }
  }

  private start(tr: "title" | "game"): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.out!);
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[tr]!;
    src.loop = true;
    src.connect(g);
    const t = ctx.currentTime + 0.01;
    src.start(t);
    if (tr === "game") this.gameT0 = t;
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
