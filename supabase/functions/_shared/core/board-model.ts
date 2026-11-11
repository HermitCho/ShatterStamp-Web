import { bestMove } from "./bot.ts";
import { Rng } from "./rng.ts";
import type { Cell } from "./shapes.ts";

/** 보드의 순수 로직. 화면과 분리되어 있어 테스트와 봇 시뮬레이션에 그대로 쓸 수 있다. */
export const EMPTY = -1;
const DIRS: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export interface BreakInfo {
  /** 모양 영역 안의 블록 */
  stamp: Cell[];
  /** stamp + 각 블록과 같은 색으로 연결된 블록 전체 */
  all: Cell[];
}

export interface Move {
  from: Cell;
  to: Cell;
}

export interface Spawn {
  to: Cell;
  color: number;
  /** 화면 밖에서 떨어지기 시작하는 줄(음수) */
  fromY: number;
}

export class BoardModel {
  readonly cols: number;
  readonly rows: number;
  readonly numColors: number;
  /** 새 블록이 이웃 블록 색을 따라갈 확률. 높을수록 같은 색 덩어리가 커진다. */
  clusterBias = 0.35;
  /** 보충 조정: 다음 모양의 최대 파괴 수 목표와 시도 횟수(1이면 조정 안 함) */
  steerTarget = 15;
  steerTrials = 10;
  cells: Int32Array;
  rng: Rng;

  constructor(cols: number, rows: number, colors: number, seed = 0) {
    this.cols = cols;
    this.rows = rows;
    this.numColors = colors;
    this.rng = new Rng(seed);
    this.cells = new Int32Array(cols * rows).fill(EMPTY);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  get(x: number, y: number): number {
    return this.cells[y * this.cols + x];
  }

  set(x: number, y: number, v: number): void {
    this.cells[y * this.cols + x] = v;
  }

  fillInitial(): void {
    // 아래에서 위로 채워야 "아래 이웃" 색을 참고할 수 있다.
    for (let y = this.rows - 1; y >= 0; y--) {
      for (let x = 0; x < this.cols; x++) this.set(x, y, this.pickColor(x, y));
    }
  }

  /** 새 블록 색 결정. 일정 확률로 아래/왼쪽 이웃 색을 따라가 덩어리를 만든다. */
  pickColor(x: number, y: number): number {
    if (this.rng.next() < this.clusterBias) {
      const cand: number[] = [];
      if (this.inBounds(x, y + 1) && this.get(x, y + 1) !== EMPTY) cand.push(this.get(x, y + 1));
      if (this.inBounds(x - 1, y) && this.get(x - 1, y) !== EMPTY) cand.push(this.get(x - 1, y));
      if (cand.length > 0) return cand[this.rng.int(0, cand.length - 1)];
    }
    return this.rng.int(0, this.numColors - 1);
  }

  /** 모양을 anchor에 찍었을 때 부서질 칸. 보드는 바꾸지 않는다(미리보기용). */
  computeBreak(ax: number, ay: number, offsets: Cell[]): BreakInfo {
    const stamp: Cell[] = [];
    const visited = new Uint8Array(this.cols * this.rows);
    for (const o of offsets) {
      const x = ax + o.x, y = ay + o.y;
      if (!this.inBounds(x, y) || this.get(x, y) === EMPTY) continue;
      const i = y * this.cols + x;
      if (visited[i]) continue;
      visited[i] = 1;
      stamp.push({ x, y });
    }
    const all = stamp.slice();
    for (let head = 0; head < all.length; head++) {
      const cur = all[head];
      const color = this.get(cur.x, cur.y);
      for (const d of DIRS) {
        const x = cur.x + d.x, y = cur.y + d.y;
        if (!this.inBounds(x, y)) continue;
        const i = y * this.cols + x;
        if (!visited[i] && this.cells[i] === color) {
          visited[i] = 1;
          all.push({ x, y });
        }
      }
    }
    return { stamp, all };
  }

  /**
   * 블록을 제거하고 중력 낙하와 보충을 적용한다.
   * nextOffsets(다음에 쓸 모양)를 주면 "보충 조정": 새 블록 색 조합을 여러 번 뽑아 보고,
   * 그 모양으로 낼 수 있는 최대 파괴 수가 steerTarget에 가장 가까운 조합을 고른다.
   * → 보이는 NEXT 모양은 그대로, 아직 안 보인 새 블록 색만 골라 매 차례 최대치를 고르게 유지한다.
   */
  applyBreak(targets: Cell[], nextOffsets: Cell[] = []): { moves: Move[]; spawns: Spawn[] } {
    for (const p of targets) this.set(p.x, p.y, EMPTY);
    const moves: Move[] = [];
    // 보충할 칸(왼쪽 열부터, 각 열은 아래에서 위로) + 화면 밖 시작 줄
    const empties: { x: number; y: number; fromY: number }[] = [];
    for (let x = 0; x < this.cols; x++) {
      let write = this.rows - 1;
      for (let y = this.rows - 1; y >= 0; y--) {
        const v = this.get(x, y);
        if (v === EMPTY) continue;
        if (y !== write) {
          this.set(x, write, v);
          this.set(x, y, EMPTY);
          moves.push({ from: { x, y }, to: { x, y: write } });
        }
        write--;
      }
      const missing = write + 1;
      for (let y = write; y >= 0; y--) empties.push({ x, y, fromY: y - missing });
    }

    let colors = this.fill(empties);
    if (nextOffsets.length > 0 && empties.length > 0 && this.steerTrials > 1) {
      let bestErr = Math.abs(bestMove(this, nextOffsets).count - this.steerTarget);
      for (let i = 0; i < this.steerTrials - 1 && bestErr > 0; i++) {
        for (const e of empties) this.set(e.x, e.y, EMPTY);
        const trial = this.fill(empties);
        const err = Math.abs(bestMove(this, nextOffsets).count - this.steerTarget);
        if (err < bestErr) {
          bestErr = err;
          colors = trial;
        }
      }
      empties.forEach((e, i) => this.set(e.x, e.y, colors[i]));
    }
    const spawns = empties.map((e, i) => ({ to: { x: e.x, y: e.y }, color: colors[i], fromY: e.fromY }));
    return { moves, spawns };
  }

  private fill(empties: { x: number; y: number }[]): number[] {
    return empties.map((e) => {
      const color = this.pickColor(e.x, e.y);
      this.set(e.x, e.y, color);
      return color;
    });
  }

  /** 같은 색으로 상하좌우 이어진 덩어리 번호. ids(칸마다 번호, 빈 칸 -1), sizes(번호 → 칸 수) */
  components(): { ids: Int32Array; sizes: number[] } {
    const { cols, rows, cells } = this;
    const ids = new Int32Array(cols * rows).fill(-1);
    const sizes: number[] = [];
    const stack: number[] = [];
    for (let start = 0; start < cols * rows; start++) {
      if (ids[start] >= 0 || cells[start] === EMPTY) continue;
      const id = sizes.length;
      const color = cells[start];
      let count = 0;
      ids[start] = id;
      stack.push(start);
      while (stack.length > 0) {
        const i = stack.pop()!;
        count++;
        const x = i % cols, y = (i / cols) | 0;
        const tryPush = (j: number) => {
          if (ids[j] < 0 && cells[j] === color) {
            ids[j] = id;
            stack.push(j);
          }
        };
        if (x > 0) tryPush(i - 1);
        if (x < cols - 1) tryPush(i + 1);
        if (y > 0) tryPush(i - cols);
        if (y < rows - 1) tryPush(i + cols);
      }
      sizes.push(count);
    }
    return { ids, sizes };
  }

  isFull(): boolean {
    return this.cells.every((v) => v !== EMPTY);
  }
}
