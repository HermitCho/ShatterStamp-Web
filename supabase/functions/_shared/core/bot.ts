import type { BoardModel } from "./board-model.ts";
import { basePoints, chainMult } from "./game-rules.ts";
import type { Cell } from "./shapes.ts";

/**
 * 최대 파괴 자리 계산. 판정 기준, 자동 플레이, 보충 조정, 밸런스 시뮬레이션에 쓴다.
 * 빠른 계산: 같은 색 덩어리를 한 번만 번호 매기고, 각 자리는
 * "모양이 닿는 서로 다른 덩어리 크기의 합"으로 센다. computeBreak와 결과가 같다(테스트로 확인).
 */
export interface MoveResult {
  x: number;
  y: number;
  count: number;
}

export function bestMove(model: BoardModel, offsets: Cell[]): MoveResult {
  const { ids, sizes } = model.components();
  const { cols, rows } = model;
  let best: MoveResult = { x: -1, y: -1, count: 0 };
  const seen: number[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      seen.length = 0;
      let n = 0;
      for (const o of offsets) {
        const px = x + o.x, py = y + o.y;
        if (px < 0 || py < 0 || px >= cols || py >= rows) continue;
        const id = ids[py * cols + px];
        if (id >= 0 && !seen.includes(id)) {
          seen.push(id);
          n += sizes[id];
        }
      }
      if (n > best.count) best = { x, y, count: n };
    }
  }
  return best;
}

/** 모든 자리의 파괴 수를 많은 순으로 정렬해 돌려준다. */
export function allMoves(model: BoardModel, offsets: Cell[]): MoveResult[] {
  const out: MoveResult[] = [];
  for (let y = 0; y < model.rows; y++) {
    for (let x = 0; x < model.cols; x++) {
      out.push({ x, y, count: model.computeBreak(x, y, offsets).all.length });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

export interface PlanResult {
  x: number;
  y: number;
  /** 단계별 부순 칸 수(0 = 도장, 1.. = 연쇄) */
  counts: number[];
  bombs: number;
  /** 배율(연쇄)을 넣은 점수 (피버 배율은 빼고) */
  points: number;
}

/**
 * 모든 자리를 실제로 찍어 본(보드 복사본에서 연쇄까지) 결과를 점수 높은 순으로 돌려준다.
 * 같은 점수면 위·왼쪽 자리가 먼저다(결과가 늘 같다). 튜토리얼 화살표, 자동 플레이, 시뮬레이션에 쓴다.
 */
export function planMoves(model: BoardModel, offsets: Cell[], nextOffsets: Cell[] = []): PlanResult[] {
  const out: PlanResult[] = [];
  for (let y = 0; y < model.rows; y++) {
    for (let x = 0; x < model.cols; x++) {
      const res = model.clone().resolve(x, y, offsets, nextOffsets);
      if (!res) continue;
      const counts = res.steps.map((s) => s.broken.length);
      const bombs = res.steps.reduce((a, s) => a + s.bombs.length, 0);
      const points = counts.reduce((a, n, c) => a + basePoints(n) * chainMult(c), 0);
      out.push({ x, y, counts, bombs, points });
    }
  }
  return out.sort((a, b) => b.points - a.points);
}
