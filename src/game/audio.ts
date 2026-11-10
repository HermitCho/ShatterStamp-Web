/**
 * 효과음을 코드로 합성한다(외부 음원 없음). Godot 버전 sfx.gd와 같은 파라미터로 버퍼를 미리 만들어 둔다.
 * 브라우저는 사용자 입력이 있어야 소리를 낼 수 있으므로 첫 터치/클릭 때 unlock()을 부른다.
 */
type Wave = 0 | 1 | 2; // 0 사인, 1 사각, 2 삼각

/** dur, f0, f1, noise, decay, wave */
const DEFS: Record<string, [number, number, number, number, number, Wave]> = {
  break: [0.2, 260, 60, 0.55, 18, 2],
  pop: [0.13, 700, 1150, 0, 26, 0],
  big: [0.5, 140, 35, 0.75, 7, 2],
  tick: [0.05, 1500, 1500, 0, 70, 0],
  hold: [0.09, 500, 820, 0, 30, 2],
  start: [0.3, 380, 950, 0, 7, 2],
  fever: [0.7, 300, 1500, 0.05, 3.5, 1],
  end: [0.8, 640, 160, 0, 3, 1],
  miss: [0.28, 180, 90, 0.25, 9, 1],
  perfect: [0.35, 880, 1760, 0, 9, 0],
  bonus: [0.3, 600, 1200, 0, 8, 2],
  sparkle: [0.25, 2400, 3200, 0, 14, 0],
  count: [0.16, 660, 660, 0, 14, 2],
  go: [0.45, 990, 1320, 0, 5, 1],
  warn: [0.09, 1250, 1000, 0, 30, 1],
  fever_end: [0.55, 900, 220, 0, 4.5, 1],
};

export type SoundName = keyof typeof DEFS;

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
    this.ctx = new AudioContext();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(this.ctx.destination);
    for (const [name, d] of Object.entries(DEFS)) this.buffers.set(name, this.synth(...d));
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

  private synth(dur: number, f0: number, f1: number, noise: number, decay: number, wave: Wave): AudioBuffer {
    const rate = this.ctx!.sampleRate;
    const n = Math.floor(rate * dur);
    const buf = this.ctx!.createBuffer(1, n, rate);
    const data = buf.getChannelData(0);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      phase += (2 * Math.PI * (f0 + (f1 - f0) * (t / dur))) / rate;
      const s = Math.sin(phase);
      const tone = wave === 0 ? s : wave === 1 ? (s >= 0 ? 0.5 : -0.5) : (Math.asin(s) * 2) / Math.PI;
      const v = tone * (1 - noise) + rnd() * noise;
      const env = Math.min(1, t / 0.004) * Math.exp(-t * decay);
      data[i] = Math.max(-1, Math.min(1, v * env * 0.8));
    }
    return buf;
  }
}
