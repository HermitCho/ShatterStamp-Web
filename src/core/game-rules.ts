/**
 * 점수, 연쇄, 피버, 시간 규칙. 화면과 분리되어 있어 게임, 테스트, 서버 검증, 밸런스 시뮬레이션이 같은 코드를 쓴다.
 *
 * 핵심: 빨리 누르기보다 "어디를 찍어야 크게 무너지는가"를 읽는 게 이득이어야 한다.
 * - 판정(PERFECT/MISS)은 없다. 어디를 찍든 부순 만큼 점수를 받는다.
 * - 찍은 뒤 블록이 떨어져 같은 색이 이어지면 저절로 터진다(연쇄). 연쇄 단계마다 배율이 ×2, ×3 … 으로 오른다.
 * - 크게 부수면 폭탄이 생기고, 폭탄은 주변 3×3을 함께 터뜨린다(보드 규칙은 board-model.ts).
 * - 연쇄·폭탄이 피버 게이지를 채운다. 가득 차면 몇 초 동안 점수 ×2.
 * - 시간 보너스는 한 번 찍어 얻은 점수가 "목표 점수"를 넘을 때만 주며, 목표 점수는 시간이 지날수록 오른다.
 */
export const GAME_TIME = 60;
export const MAX_TIME = 99;
/** 한 번 찍은 뒤 다음 찍기까지 막아 두는 시간(연타 방지). 게임은 연쇄 연출이 끝날 때까지 더 오래 막는다. */
export const STAMP_COOLDOWN = 0.35;
/** 피버 게이지: 연쇄 한 단계·폭탄 하나마다 1칸 */
export const FEVER_NEED = 24;
export const FEVER_TIME = 6;
export const FEVER_MULT = 2;

export interface StampResult {
  /** 단계별 점수(0 = 도장, 1.. = 연쇄) */
  stepPoints: number[];
  points: number;
  /** 연쇄 횟수(단계 수 - 1) */
  chains: number;
  bombs: number;
  timeDelta: number;
  target: number;
  /** 이번에 피버가 시작됐는지 */
  feverStarted: boolean;
}

export function basePoints(n: number): number {
  return n * n + n * 10;
}

/** 단계 배율: 도장 ×1, 첫 연쇄 ×2, 두 번째 ×3 … */
export function chainMult(chain: number): number {
  return 1 + chain;
}

export class GameRules {
  /** 시간 보너스 목표 점수 = targetBase + targetGrowth * 경과 초 */
  targetBase = 1000;
  targetGrowth = 90;

  score = 0;
  /** 한 번 찍어 낸 가장 긴 연쇄 */
  maxChain = 0;
  chainTotal = 0;
  bombTotal = 0;
  feverGauge = 0;
  /** 남은 피버 시간(0이면 피버 아님) */
  feverLeft = 0;
  timeLeft = GAME_TIME;
  elapsed = 0;
  stamps = 0;
  totalBroken = 0;
  /** 한 번에(한 단계) 가장 많이 부순 칸 수 */
  biggest = 0;
  bonusTimeTotal = 0;

  reset(): void {
    this.score = 0;
    this.maxChain = 0;
    this.chainTotal = 0;
    this.bombTotal = 0;
    this.feverGauge = 0;
    this.feverLeft = 0;
    this.timeLeft = GAME_TIME;
    this.elapsed = 0;
    this.stamps = 0;
    this.totalBroken = 0;
    this.biggest = 0;
    this.bonusTimeTotal = 0;
  }

  get inFever(): boolean {
    return this.feverLeft > 0;
  }

  /** 시간을 흘린다. 피버가 끝나면 true. */
  tick(delta: number): boolean {
    this.timeLeft -= delta;
    this.elapsed += delta;
    if (this.feverLeft > 0) {
      this.feverLeft -= delta;
      if (this.feverLeft <= 0) {
        this.feverLeft = 0;
        return true;
      }
    }
    return false;
  }

  isOver(): boolean {
    return this.timeLeft <= 0;
  }

  /** 지금 시간 보너스를 받기 위한 1회 획득 점수 기준 */
  timeTarget(): number {
    return Math.trunc(this.targetBase + this.targetGrowth * this.elapsed);
  }

  /** 단계별 부순 칸 수로 점수를 계산한다(보드·점수는 바꾸지 않는다. 미리보기용). */
  pointsFor(counts: number[]): number[] {
    const fever = this.inFever ? FEVER_MULT : 1;
    return counts.map((n, chain) => Math.trunc(basePoints(n) * chainMult(chain) * fever));
  }

  /** 한 번 찍은 결과를 반영한다. counts: 단계별 부순 칸 수, bombs: 터진 폭탄 수 */
  registerStamp(counts: number[], bombs: number): StampResult {
    const stepPoints = this.pointsFor(counts);
    const points = stepPoints.reduce((a, b) => a + b, 0);
    const chains = counts.length - 1;
    this.stamps++;
    this.score += points;
    this.maxChain = Math.max(this.maxChain, chains);
    this.chainTotal += chains;
    this.bombTotal += bombs;
    for (const n of counts) {
      this.totalBroken += n;
      this.biggest = Math.max(this.biggest, n);
    }

    let feverStarted = false;
    if (!this.inFever) {
      this.feverGauge += chains + bombs;
      if (this.feverGauge >= FEVER_NEED) {
        this.feverGauge = 0;
        this.feverLeft = FEVER_TIME;
        feverStarted = true;
      }
    }

    const target = this.timeTarget();
    let timeDelta = 0;
    if (points >= target * 2) timeDelta = 2;
    else if (points >= target) timeDelta = 1;
    this.bonusTimeTotal += timeDelta;
    this.timeLeft = Math.min(this.timeLeft + timeDelta, MAX_TIME);
    return { stepPoints, points, chains, bombs, timeDelta, target, feverStarted };
  }
}
