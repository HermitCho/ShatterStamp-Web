/**
 * 효과음과 배경 음악이 함께 쓰는 소리 합성 도구(순수 함수, 브라우저 밖에서도 돈다 → 소리 확인용 wav 만들기).
 * 네온 신스 느낌: 앨리어싱을 줄인 톱니·사각파, 여러 개를 살짝 어긋나게 겹친 두꺼운 소리,
 * 시간에 따라 닫히는 저역 필터(플럭), 메아리와 잔향.
 */
export const TAU = Math.PI * 2;
export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export type Osc = "saw" | "square" | "tri" | "sine" | "noise";

/** 한 소리 층. 시간 단위는 초. */
export interface Voice {
  osc: Osc;
  /** 시작 주파수와 (있으면) 다가갈 주파수, 다가가는 빠르기(지수, 초) */
  f: number;
  f1?: number;
  sweep?: number;
  /** 겹칠 음들의 어긋남(센트). 없으면 한 개 */
  detune?: number[];
  gain?: number;
  /** 사각파 폭 0~1 */
  duty?: number;
  /** 엔벨로프: 올라가는 시간, 줄어드는 빠르기(지수, 초), 남는 크기, 버티는 시간, 놓는 빠르기 */
  a?: number;
  d?: number;
  s?: number;
  hold?: number;
  r?: number;
  /** 저역 필터: 처음 → 나중 차단 주파수, 닫히는 빠르기, 공진(0.5~5) */
  lp?: number;
  lp1?: number;
  lpT?: number;
  q?: number;
  /** 고역 통과(이보다 낮은 소리 덜기) */
  hp?: number;
  /** 소리 안에서 이 층이 시작하는 시각 */
  at?: number;
  /** 비브라토(반음 단위 깊이, Hz) */
  vib?: [number, number];
}

export interface Sound {
  dur: number;
  voices: Voice[];
  gain?: number;
  /** 메아리·잔향 양(0이면 없음) */
  echo?: number;
  verb?: number;
}

let noiseSeed = 1234567;
function rnd(): number {
  noiseSeed = (noiseSeed * 16807) % 2147483647;
  return (noiseSeed / 2147483647) * 2 - 1;
}

/** 톱니·사각파의 꺾이는 곳을 부드럽게(높은 음에서 지지직거림 줄이기) */
function blep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** 한 층을 out의 start 표본부터 더한다. */
export function renderVoice(out: Float32Array, rate: number, v: Voice, start = 0, len = out.length - start, gain = 1): void {
  const n = Math.min(len, out.length - start);
  const dets = v.detune ?? [0];
  const phases = dets.map((_, i) => (dets.length > 1 ? (i * 0.37) % 1 : 0));
  const ratios = dets.map((c) => Math.pow(2, c / 1200));
  const nd = dets.length;
  const a = v.a ?? 0.002, d = v.d ?? 1e9, s = v.s ?? 0, hold = v.hold ?? 1e9, r = v.r ?? 0.05;
  const duty = v.duty ?? 0.5;
  const g = (v.gain ?? 1) * gain / Math.sqrt(dets.length);
  // 상태 변수 필터(저역·고역)
  let low = 0, band = 0, hpPrev = 0, hpOut = 0;
  const hpK = v.hp ? Math.exp((-TAU * v.hp) / rate) : 0;
  const q = 1 / (v.q ?? 0.8);
  const off = Math.floor((v.at ?? 0) * rate);
  const sweep = v.sweep ?? 0.05, lpT = v.lpT ?? 0.1, lpMoving = v.lp !== undefined && v.lp1 !== undefined;
  let fk = v.lp ? 2 * Math.sin((Math.PI * Math.min(v.lp, rate / 6)) / rate) : 0;
  for (let i = 0; i < n - off; i++) {
    const t = i / rate;
    let f = v.f1 !== undefined ? v.f1 + (v.f - v.f1) * Math.exp(-t / sweep) : v.f;
    if (v.vib) f *= Math.pow(2, (v.vib[0] * Math.sin(TAU * v.vib[1] * t) * Math.min(1, t * 3)) / 12);
    let x = 0;
    if (v.osc === "noise") x = rnd();
    else {
      for (let k = 0; k < nd; k++) {
        const dt = (f * ratios[k]) / rate;
        let p = phases[k] + dt;
        if (p >= 1) p -= 1;
        phases[k] = p;
        if (v.osc === "saw") x += 2 * p - 1 - blep(p, dt);
        else if (v.osc === "square") {
          let sq = p < duty ? 1 : -1;
          sq += blep(p, dt);
          let p2 = p - duty;
          if (p2 < 0) p2 += 1;
          sq -= blep(p2, dt);
          x += sq * 0.8;
        } else if (v.osc === "tri") x += 1 - 4 * Math.abs(p - 0.5);
        else x += Math.sin(TAU * p);
      }
    }
    // 엔벨로프
    let env = (t < a ? t / a : 1) * (d > 1e8 ? 1 : s + (1 - s) * Math.exp(-(t > a ? t - a : 0) / d));
    if (t > hold) env *= Math.exp(-(t - hold) / r);
    if (env < 1e-4 && t > a + 0.01) break;
    // 저역 필터(닫히는 플럭)
    if (v.lp) {
      // 차단 주파수가 움직일 때만 다시 계산(32표본마다)
      if (lpMoving && (i & 31) === 0) {
        const fc = v.lp1! + (v.lp - v.lp1!) * Math.exp(-t / lpT);
        fk = 2 * Math.sin((Math.PI * Math.min(fc, rate / 6)) / rate);
      }
      low += fk * band;
      const high = x - low - q * band;
      band += fk * high;
      x = low;
    }
    if (v.hp) {
      hpOut = hpK * (hpOut + x - hpPrev);
      hpPrev = x;
      x = hpOut;
    }
    out[start + off + i] += x * env * g;
  }
}

/** 메아리(점 8분 느낌의 짧은 반복) + 잔향(Schroeder: 빗살 4개 + 올패스 2개). 꼬리만큼 길어진 새 배열. */
export function bakeFx(dry: Float32Array, rate: number, echo: number, verb: number, tail = 0.9): Float32Array {
  const n = dry.length + Math.floor(tail * rate);
  const out = new Float32Array(n);
  out.set(dry);
  if (echo > 0) {
    const dl = Math.floor(0.19 * rate);
    for (let rep = 1; rep <= 4; rep++) {
      const gn = echo * Math.pow(0.45, rep - 1);
      for (let i = 0; i < dry.length && i + dl * rep < n; i++) out[i + dl * rep] += dry[i] * gn * (rep % 2 ? 0.9 : 1);
    }
  }
  if (verb > 0) {
    const src = out.slice();
    const wet = new Float32Array(n);
    const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((s) => Math.floor(s * rate));
    for (const L of combs) {
      const buf = new Float32Array(L);
      let idx = 0, lp = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[idx];
        lp = y * 0.7 + lp * 0.3;
        buf[idx] = src[i] + lp * 0.8;
        wet[i] += y * 0.25;
        idx = (idx + 1) % L;
      }
    }
    for (const s of [0.005, 0.0017]) {
      const L = Math.floor(s * rate), buf = new Float32Array(L);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[idx], x = wet[i];
        const y = -x + b;
        buf[idx] = x + b * 0.5;
        wet[i] = y;
        idx = (idx + 1) % L;
      }
    }
    for (let i = 0; i < n; i++) out[i] += wet[i] * verb;
  }
  // 끝의 조용한 부분 자르기
  let end = n;
  while (end > dry.length && Math.abs(out[end - 1]) < 2e-4) end--;
  return out.subarray(0, end);
}

/** 효과음 하나를 만든다(메아리·잔향 포함, 부드러운 상한). */
export function renderSound(rate: number, s: Sound): Float32Array {
  noiseSeed = 1234567;
  const dry = new Float32Array(Math.floor(s.dur * rate));
  for (const v of s.voices) renderVoice(dry, rate, v, 0, dry.length, s.gain ?? 1);
  const wet = s.echo || s.verb ? bakeFx(dry, rate, s.echo ?? 0, s.verb ?? 0) : dry;
  const out = new Float32Array(wet.length);
  for (let i = 0; i < wet.length; i++) out[i] = Math.tanh(wet[i] * 1.2) / Math.tanh(1.2);
  // 끝 3ms를 줄여 '틱' 소리 막기
  const fade = Math.min(out.length, Math.floor(rate * 0.003));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}
