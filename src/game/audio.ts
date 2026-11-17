/**
 * 효과음을 코드로 합성한다(외부 음원 없음). 네온 신스 톤: 예전처럼 단순한 전자음 계열이지만,
 * 여러 겹으로 두껍게, 필터가 닫히는 플럭, 메아리·잔향을 입혀 더 매끈하게(synth.ts).
 * 배경 음악(music.ts)과 같은 C장조 음계를 써서 부서지는 소리가 곡 위에서 어울리게 한다.
 * 브라우저는 사용자 입력이 있어야 소리를 낼 수 있으므로 첫 터치/클릭 때 unlock()을 부른다.
 */
import { midiHz, renderSound, type Sound } from "./synth.ts";

const C6 = midiHz(84), C5 = midiHz(72), C2 = midiHz(36);
/** 두껍게 겹칠 때의 어긋남(센트) */
const WIDE = [-14, -5, 5, 14];

export const SOUNDS: Record<string, Sound> = {
  // ---- 부수기
  /** 블록 하나: 짧은 신스 플럭(번지는 파괴를 따라 음계로 울린다). 기준음 C6 */
  blip: { dur: 0.2, echo: 0.22, verb: 0.12, voices: [
    { osc: "square", f: C6, duty: 0.25, detune: [-6, 6], d: 0.055, lp: 7000, lp1: 1400, lpT: 0.05, gain: 0.55 },
    { osc: "saw", f: C6 * 2, detune: [-8, 8], d: 0.03, lp: 9000, lp1: 2500, lpT: 0.03, gain: 0.25 },
  ] },
  /** 찍는 순간: 떨어지는 사인 킥 + 짧은 잡음 딸깍 + 낮은 톱니 */
  thump: { dur: 0.4, verb: 0.08, voices: [
    { osc: "sine", f: 190, f1: 48, sweep: 0.035, d: 0.14, gain: 0.95 },
    { osc: "noise", f: 0, d: 0.012, hp: 2500, gain: 0.35 },
    { osc: "saw", f: C2, detune: [-10, 10], d: 0.09, lp: 900, lp1: 150, lpT: 0.06, gain: 0.45 },
  ] },
  /** 한 단계가 터질 때: 거친 잡음 + 내려가는 사각파 */
  break: { dur: 0.25, verb: 0.1, voices: [
    { osc: "noise", f: 0, d: 0.05, lp: 6000, lp1: 900, lpT: 0.06, hp: 300, gain: 0.55 },
    { osc: "square", f: 330, f1: 90, sweep: 0.05, d: 0.07, lp: 2500, gain: 0.3 },
  ] },
  /** 단계 시작 '톡' */
  pop: { dur: 0.15, voices: [{ osc: "tri", f: 700, f1: 1250, sweep: 0.03, d: 0.04, gain: 0.6 }] },
  /** 연쇄·여러 색: 넓게 겹친 톱니 화음 스탭(C-E-G), 필터가 닫히며 반짝 */
  stab: { dur: 0.7, echo: 0.3, verb: 0.2, voices: [72, 76, 79].map((m) => (
    { osc: "saw" as const, f: midiHz(m), detune: WIDE, d: 0.22, lp: 6500, lp1: 900, lpT: 0.12, q: 1.4, gain: 0.42 })) },
  /** 크게 부술 때: 열렸다 닫히는 잡음 휩쓸림 + 낮은 울림 */
  whoosh: { dur: 0.75, verb: 0.25, voices: [
    { osc: "noise", f: 0, a: 0.01, d: 0.25, lp: 9000, lp1: 300, lpT: 0.18, q: 2, gain: 0.7 },
    { osc: "sine", f: 90, f1: 38, sweep: 0.15, d: 0.3, gain: 0.7 },
  ] },
  /** 아주 크게: 묵직한 저음 타격 */
  big: { dur: 0.6, verb: 0.15, voices: [
    { osc: "sine", f: 140, f1: 40, sweep: 0.07, d: 0.3, gain: 1 },
    { osc: "noise", f: 0, d: 0.08, lp: 3000, gain: 0.4 },
  ] },
  /** 크리스탈: 레이저처럼 내려가는 사각파 + 높은 반짝임 */
  zap: { dur: 0.55, echo: 0.25, verb: 0.2, voices: [
    { osc: "square", f: 2600, f1: 140, sweep: 0.09, duty: 0.3, d: 0.2, lp: 5000, gain: 0.5 },
    { osc: "saw", f: midiHz(96), detune: [-9, 9], d: 0.12, lp: 8000, lp1: 2000, lpT: 0.1, gain: 0.25, at: 0.02 },
  ] },
  // ---- 알림
  /** 안 찍힘: '어-오' 두 음 내려가는 사각파 */
  miss: { dur: 0.3, verb: 0.08, voices: [
    { osc: "square", f: midiHz(55), duty: 0.5, d: 0.06, lp: 1600, gain: 0.45 },
    { osc: "square", f: midiHz(50), duty: 0.5, d: 0.08, lp: 1300, gain: 0.45, at: 0.09 },
  ] },
  /** 시간 보너스: 위로 두 음 */
  bonus: { dur: 0.35, echo: 0.25, verb: 0.12, voices: [
    { osc: "square", f: midiHz(88), duty: 0.25, d: 0.06, lp: 6000, gain: 0.35 },
    { osc: "square", f: midiHz(93), duty: 0.25, d: 0.09, lp: 6000, gain: 0.35, at: 0.07 },
  ] },
  /** 반짝: 높은 세 음 빠른 아르페지오 */
  sparkle: { dur: 0.35, echo: 0.3, verb: 0.2, voices: [96, 100, 103].map((m, i) => (
    { osc: "tri" as const, f: midiHz(m), d: 0.05, gain: 0.4, at: i * 0.04 })) },
  /** 맑은 확인음(여러 색 등) */
  perfect: { dur: 0.4, echo: 0.25, verb: 0.15, voices: [
    { osc: "square", f: C5 * 2, duty: 0.25, detune: [-7, 7], d: 0.12, lp: 6000, lp1: 1800, lpT: 0.1, gain: 0.45 },
  ] },
  hold: { dur: 0.15, verb: 0.08, voices: [{ osc: "tri", f: 520, f1: 840, sweep: 0.03, d: 0.05, gain: 0.6 }] },
  tick: { dur: 0.06, voices: [{ osc: "square", f: 1500, duty: 0.3, d: 0.012, lp: 5000, gain: 0.4 }] },
  warn: { dur: 0.12, verb: 0.06, voices: [{ osc: "square", f: 1250, f1: 1000, sweep: 0.05, d: 0.035, lp: 4500, gain: 0.45 }] },
  count: { dur: 0.25, verb: 0.12, voices: [{ osc: "square", f: midiHz(76), duty: 0.25, detune: [-6, 6], d: 0.08, lp: 5000, lp1: 1500, lpT: 0.08, gain: 0.5 }] },
  go: { dur: 0.7, echo: 0.3, verb: 0.25, voices: [79, 84, 88].map((m) => (
    { osc: "saw" as const, f: midiHz(m), detune: WIDE, d: 0.3, lp: 8000, lp1: 1500, lpT: 0.2, gain: 0.35 })) },
  start: { dur: 0.4, verb: 0.15, voices: [{ osc: "saw", f: 380, f1: 950, sweep: 0.08, detune: [-8, 8], d: 0.12, lp: 6000, gain: 0.45 }] },
  /** 피버 시작: 넓은 톱니가 위로 쓸려 올라가며 열린다 */
  fever: { dur: 0.9, echo: 0.25, verb: 0.3, voices: [
    { osc: "saw", f: 180, f1: 1400, sweep: 0.25, detune: WIDE, a: 0.02, d: 0.35, lp: 600, lp1: 9000, lpT: 0.2, q: 2, gain: 0.5 },
    { osc: "noise", f: 0, a: 0.15, d: 0.2, lp: 1500, lp1: 9000, lpT: 0.2, gain: 0.25 },
  ] },
  /** 피버 끝: 아래로 내려가며 닫힌다 */
  fever_end: { dur: 0.7, verb: 0.25, voices: [
    { osc: "saw", f: 900, f1: 200, sweep: 0.2, detune: WIDE, d: 0.25, lp: 6000, lp1: 400, lpT: 0.2, gain: 0.45 },
  ] },
  /** 판 끝 */
  end: { dur: 1, verb: 0.3, voices: [
    { osc: "saw", f: 640, f1: 150, sweep: 0.35, detune: WIDE, d: 0.4, lp: 5000, lp1: 500, lpT: 0.3, gain: 0.45 },
  ] },
};

export type SoundName = keyof typeof SOUNDS;

/** C장조 5음계(반음 수). 번지는 파괴·연쇄가 이 음계를 따라 올라간다(배경 음악과 같은 조). */
const PENTA = [0, 2, 4, 7, 9];
export function scalePitch(step: number): number {
  const oct = Math.floor(step / PENTA.length), i = ((step % PENTA.length) + PENTA.length) % PENTA.length;
  return Math.pow(2, (oct * 12 + PENTA[i]) / 12);
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  volume = 0.8;

  /** 배경 음악도 같은 AudioContext를 쓴다(unlock 뒤에만 있음). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** 첫 사용자 입력에서 부른다. 이미 열려 있으면 아무것도 안 한다. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new AudioContext());
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    // 여러 소리가 한꺼번에 겹쳐도 찢어지지 않게 마지막에 리미터(소리를 눌러 담는다)
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -8;
    lim.knee.value = 6;
    lim.ratio.value = 12;
    lim.attack.value = 0.002;
    lim.release.value = 0.15;
    this.out.connect(lim).connect(ctx.destination);
    // 소리를 하나씩 나눠 만들어 화면이 멈추지 않게(자주 쓰는 것부터)
    const names = Object.keys(SOUNDS);
    const next = () => {
      const name = names.shift();
      if (!name) return;
      const data = renderSound(ctx.sampleRate, SOUNDS[name]);
      const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.getChannelData(0).set(data);
      this.buffers.set(name, buf);
      setTimeout(next, 0);
    };
    next();
  }

  /** 탭·앱을 벗어났을 때 소리(효과음·배경 음악 모두)를 멈추고, 돌아오면 다시 켠다. */
  setSuspended(on: boolean): void {
    if (!this.ctx) return;
    if (on && this.ctx.state === "running") void this.ctx.suspend();
    else if (!on && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.out) this.out.gain.value = v;
  }

  play(name: SoundName, pitch = 1, volumeDb = 0): void {
    if (!this.ctx || !this.out) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.min(4, Math.max(0.1, pitch));
    const g = this.ctx.createGain();
    g.gain.value = Math.pow(10, volumeDb / 20);
    src.connect(g).connect(this.out);
    src.start();
  }
}
