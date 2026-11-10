import type { BoardModel } from "./board-model.ts";
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
