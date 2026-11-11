/**
 * 점수, 판정, 콤보, 시간 규칙. 화면과 분리되어 있어 게임, 테스트, 밸런스 시뮬레이션이 같은 코드를 쓴다.
 *
 * 핵심: 막 누르기보다 "지금 모양으로 가장 많이 부수는 자리"를 찾는 게 이득이어야 한다.
 * - 판정: 찍은 자리의 파괴 수 / 현재 모양으로 가능한 최대 파괴 수 → PERFECT / GREAT / GOOD / MISS
 * - MISS는 콤보를 끊고 시간을 깎는다.
 * - 점수는 파괴 수의 제곱에 가깝게 늘고, 판정 배율과 콤보 배율이 곱해진다.
 * - 시간 보너스는 1회 획득 점수가 "목표 점수"를 넘을 때만 주며, 목표 점수는 시간이 지날수록 오른다.
 */
export const Grade = { PERFECT: 0, GREAT: 1, GOOD: 2, MISS: 3 } as const;
export type Grade = (typeof Grade)[keyof typeof Grade];

export const GRADE_NAMES = ["PERFECT", "GREAT", "GOOD", "MISS"] as const;
/** 최대 파괴 수 대비 비율 기준 */
export const GRADE_RATIO = [1.0, 0.8, 0.6];
export const GRADE_MULT = [2.0, 1.5, 1.0, 0.5];

export const GAME_TIME = 60;
export const MAX_TIME = 99;
export const MISS_PENALTY = 1;
/** 한 번 찍은 뒤 다음 찍기까지 막아 두는 시간(연타 방지) */
export const STAMP_COOLDOWN = 0.35;
export const COMBO_WINDOW = 2.4;
export const FEVER_BONUS_WINDOW = 0.4;
/** 콤보 단계: 0 = 1~2, 1 = 3~5, 2 = 6~9, 3 = 10+(피버) */
export const TIER_START = [0, 3, 6, 10];
export const TIER_MULT = [1.0, 1.5, 2.0, 3.0];

export interface BreakResult {
  grade: Grade;
  points: number;
  tier: number;
  combo: number;
  comboLost: boolean;
  timeDelta: number;
  target: number;
  bestN: number;
}

export function gradeFor(n: number, bestN: number): Grade {
  if (bestN <= 0 || n >= bestN) return Grade.PERFECT;
  const ratio = n / bestN;
  for (let g = 0; g < GRADE_RATIO.length; g++) {
    if (ratio >= GRADE_RATIO[g]) return g as Grade;
  }
  return Grade.MISS;
}

export function tierFor(combo: number): number {
  for (let t = TIER_START.length - 1; t >= 0; t--) if (combo >= TIER_START[t]) return t;
  return 0;
}

export function basePoints(n: number): number {
  return n * n + n * 10;
}

export class GameRules {
  /** 시간 보너스 목표 점수 = targetBase + targetGrowth * 경과 초 */
  targetBase = 1000;
  targetGrowth = 90;

  score = 0;
  combo = 0;
  maxCombo = 0;
  comboTimer = 0;
  comboWindow = COMBO_WINDOW;
  timeLeft = GAME_TIME;
  elapsed = 0;
  totalBroken = 0;
  biggest = 0;
  bonusTimeTotal = 0;
  gradeCounts = [0, 0, 0, 0];

  reset(): void {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.comboWindow = COMBO_WINDOW;
    this.timeLeft = GAME_TIME;
    this.elapsed = 0;
    this.totalBroken = 0;
    this.biggest = 0;
    this.bonusTimeTotal = 0;
    this.gradeCounts = [0, 0, 0, 0];
  }

  /** 시간을 흘린다. 콤보가 끊기면 true. */
  tick(delta: number): boolean {
    this.timeLeft -= delta;
    this.elapsed += delta;
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
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

  /** 한 번 찍은 결과를 반영한다. n: 부순 블록 수, bestN: 현재 모양으로 가능했던 최대 파괴 수 */
  registerBreak(n: number, bestN: number): BreakResult {
    const grade = gradeFor(n, bestN);
    this.gradeCounts[grade]++;
    this.totalBroken += n;
    this.biggest = Math.max(this.biggest, n);

    let comboLost = false;
    if (grade === Grade.MISS) {
      comboLost = this.combo > 0;
      this.combo = 0;
      this.comboTimer = 0;
    } else {
      this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    const tier = tierFor(this.combo);
    const points = Math.trunc(basePoints(n) * GRADE_MULT[grade] * TIER_MULT[tier]);
    this.score += points;

    const target = this.timeTarget();
    let timeDelta = 0;
    if (grade === Grade.MISS) timeDelta = -MISS_PENALTY;
    else if (points >= target * 2) timeDelta = 2;
    else if (points >= target) timeDelta = 1;
    if (timeDelta > 0) this.bonusTimeTotal += timeDelta;
    this.timeLeft = Math.min(this.timeLeft + timeDelta, MAX_TIME);

    if (grade !== Grade.MISS) {
      this.comboWindow = COMBO_WINDOW + (tier >= 3 ? FEVER_BONUS_WINDOW : 0);
      this.comboTimer = this.comboWindow;
    }
    return { grade, points, tier, combo: this.combo, comboLost, timeDelta, target, bestN };
  }
}
