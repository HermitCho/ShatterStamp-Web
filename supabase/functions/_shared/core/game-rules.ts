/**
 * 점수, 연쇄, 시간 규칙. 화면과 분리되어 있어 게임, 테스트, 서버 검증, 밸런스 시뮬레이션이 같은 코드를 쓴다.
 *
 * 핵심: 막 찍기보다 「도장 하나로 여러 색 덩어리를 크게」 찍는 게 확실히 이득이어야 한다.
 * - 도장 단계 점수 = (n² + 10n) × 여러 색 배율(COLOR_MIN칸 이상 부순 색 가짓수 1/2/3/4/5 → ×1/1.5/2.2/3/4).
 * - 연쇄(떨어져 같은 색이 이어지면 저절로 터짐)는 운이 크므로 보너스로만: 연쇄 단계 점수 ×0.3.
 * - 시간 보너스: 3색 +0.25초, 4색 이상 +0.5초, 크리스탈 하나 깰 때마다 +0.5초.
 * - 크리스탈(보드 규칙은 board-model.ts): 크게 부수면 가로줄, 4색 이상이면 십자 크리스탈이 생기고,
 *   옆에서 터지면 줄을 지운다.
 * - 피버: 연쇄·크리스탈이 게이지를 채우면 FEVER_TIME초 동안 도장이 3×3(FEVER_SHAPE)이 되고 아무 데나 찍힌다.
 *   피버 중에는 게이지·시간 보너스가 쌓이지 않고 크리스탈도 생기지 않는다.
 */
export const GAME_TIME = 100;
export const MAX_TIME = 180;
/** 한 번 찍은 뒤 다음 찍기까지 막아 두는 시간(연타 방지). 게임은 연쇄 연출이 끝날 때까지 더 오래 막는다. */
export const STAMP_COOLDOWN = 0.35;
/** 홀드는 언제든 바꿀 수 있지만, 바꾼 뒤 이 시간(초)은 다시 못 바꾼다(실수로 연타해도 괜찮게) */
export const HOLD_COOLDOWN = 0.5;
/** 여러 색 배율(색 가짓수 → 배율) */
export const COLOR_MULT = [1, 1, 1.5, 2.2, 3, 4];
/** 연쇄 단계 점수 배율 */
export const CHAIN_MULT = 0.3;
/** 시간 보너스(초): 색 가짓수 → 초, 크리스탈 하나 */
export const COLOR_TIME = [0, 0, 0, 0.25, 0.5, 0.5];
export const CRYSTAL_TIME = 0.5;
/** 한 번 찍을 때 도장 단계에서 이만큼 이상 부서져야 찍힌다(막 누르기 방지). 튜토리얼은 예외. */
export const MIN_BREAK = 9;
/** 너무 작아서 안 찍혔을 때 다음 찍기까지 막는 시간(초) */
export const FAIL_LOCK = 0.4;
/** 피버 게이지: 연쇄 1번·크리스탈 1개가 1씩 채운다 */
export const FEVER_NEED = 34;
/** 피버 길이(게임 시간, 초) */
export const FEVER_TIME = 6;
/** 피버 중 점수 배율 */
export const FEVER_MULT = 1;

export interface StampResult {
  /** 단계별 점수(0 = 도장, 1.. = 연쇄) */
  stepPoints: number[];
  points: number;
  /** 연쇄 횟수(단계 수 - 1) */
  chains: number;
  /** 여러 색 가짓수와 그 배율 */
  colors: number;
  mult: number;
  crystals: number;
  timeDelta: number;
  /** 이 찍기로 피버가 시작됨 */
  feverStarted: boolean;
  /** 피버 중에 찍은 것 */
  fever: boolean;
}

export function basePoints(n: number): number {
  return n * n + n * 10;
}

export function colorMult(colors: number): number {
  return COLOR_MULT[Math.min(colors, COLOR_MULT.length - 1)];
}

/** 단계별 부순 칸 수와 여러 색 가짓수로 단계별 점수를 계산한다. */
export function stepPoints(counts: number[], colors: number): number[] {
  return counts.map((n, chain) => Math.trunc(basePoints(n) * (chain === 0 ? colorMult(colors) : CHAIN_MULT)));
}

export class GameRules {
  score = 0;
  /** 한 번 찍어 낸 가장 긴 연쇄 */
  maxChain = 0;
  chainTotal = 0;
  crystalTotal = 0;
  /** 한 번에 낸 가장 많은 색 가짓수 */
  maxColors = 0;
  timeLeft = GAME_TIME;
  elapsed = 0;
  stamps = 0;
  totalBroken = 0;
  /** 한 번에(한 단계) 가장 많이 부순 칸 수 */
  biggest = 0;
  bonusTimeTotal = 0;
  feverGauge = 0;
  /** 피버가 끝나는 게임 시간(elapsed 기준). 이 시각 전까지 피버. */
  feverUntil = 0;
  feverCount = 0;

  reset(): void {
    this.feverGauge = 0;
    this.feverUntil = 0;
    this.feverCount = 0;
    this.score = 0;
    this.maxChain = 0;
    this.chainTotal = 0;
    this.crystalTotal = 0;
    this.maxColors = 0;
    this.timeLeft = GAME_TIME;
    this.elapsed = 0;
    this.stamps = 0;
    this.totalBroken = 0;
    this.biggest = 0;
    this.bonusTimeTotal = 0;
  }

  /** 시간을 흘린다. */
  tick(delta: number): void {
    this.timeLeft -= delta;
    this.elapsed += delta;
  }

  /** 게임 시간 t(기록에 남는 시각)에 피버 중인가. 게임과 서버가 같은 t로 판정한다. */
  feverAt(t: number): boolean {
    return t < this.feverUntil;
  }

  get inFever(): boolean {
    return this.feverAt(this.elapsed);
  }

  /** 남은 피버 시간 */
  get feverLeft(): number {
    return Math.max(0, this.feverUntil - this.elapsed);
  }

  isOver(): boolean {
    return this.timeLeft <= 0;
  }

  /** 한 번 찍은 결과를 반영한다. counts: 단계별 부순 칸 수, colors: 여러 색 가짓수, crystals: 깨진 크리스탈 수 */
  registerStamp(counts: number[], colors: number, crystals: number, at = this.elapsed): StampResult {
    const fever = this.feverAt(at);
    const steps = stepPoints(counts, colors).map((p) => (fever ? Math.trunc(p * FEVER_MULT) : p));
    const points = steps.reduce((a, b) => a + b, 0);
    const chains = counts.length - 1;
    this.stamps++;
    this.score += points;
    this.maxChain = Math.max(this.maxChain, chains);
    this.chainTotal += chains;
    this.crystalTotal += crystals;
    this.maxColors = Math.max(this.maxColors, colors);
    for (const n of counts) {
      this.totalBroken += n;
      this.biggest = Math.max(this.biggest, n);
    }
    const timeDelta = fever ? 0 : COLOR_TIME[Math.min(colors, COLOR_TIME.length - 1)] + crystals * CRYSTAL_TIME;
    this.bonusTimeTotal += timeDelta;
    this.timeLeft = Math.min(this.timeLeft + timeDelta, MAX_TIME);
    let feverStarted = false;
    if (!fever) {
      this.feverGauge += chains + crystals;
      if (this.feverGauge >= FEVER_NEED) {
        this.feverGauge = 0;
        this.feverUntil = at + FEVER_TIME;
        this.feverCount++;
        feverStarted = true;
      }
    }
    return { stepPoints: steps, points, chains, colors, mult: colorMult(colors), crystals, timeDelta, feverStarted, fever };
  }
}
