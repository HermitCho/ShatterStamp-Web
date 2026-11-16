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

/** 떨어진 뒤 같은 색이 이만큼 이어지면 저절로 터진다(연쇄) */
export const CHAIN_MIN = 5;
/** 한 번 찍어 연쇄까지 합쳐 이만큼 부수면 찍은 자리에 폭탄이 생긴다 */
export const BOMB_MIN = 40;
/** 폭탄은 주변 3×3을 함께 터뜨린다 */
export const BOMB_RADIUS = 1;
/** 무한 연쇄 방지 */
export const MAX_CHAIN = 30;

export interface BrokenCell {
  x: number;
  y: number;
  color: number;
}

/** 한 단계: 도장(chain 0) 또는 연쇄(chain 1, 2, …) 하나가 터지고 블록이 떨어지기까지 */
export interface Step {
  chain: number;
  broken: BrokenCell[];
  /** 이 단계에서 터진 폭탄 자리 */
  bombs: Cell[];
  /** 터지기 시작하는 칸(도장 칸 / 연쇄 덩어리에서 떨어져 이어 준 칸) */
  seeds: Cell[];
  moves: Move[];
  spawns: Spawn[];
}

export interface Resolution {
  steps: Step[];
  /** 이번에 새로 생긴 폭탄 자리 (없으면 null) */
  bomb: Cell | null;
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
  /** 이번 도장 때 새로 채워진 블록(1). 연쇄를 일으키지 않는다 → 보이는 블록만으로 연쇄를 읽을 수 있다. */
  fresh: Uint8Array;
  /** 폭탄 블록(1). 색은 그대로이고, 터질 때 주변 3×3도 터뜨린다. */
  bombs: Uint8Array;
  rng: Rng;

  constructor(cols: number, rows: number, colors: number, seed = 0) {
    this.cols = cols;
    this.rows = rows;
    this.numColors = colors;
    this.rng = new Rng(seed);
    this.cells = new Int32Array(cols * rows).fill(EMPTY);
    this.fresh = new Uint8Array(cols * rows);
    this.bombs = new Uint8Array(cols * rows);
  }

  /** 똑같은 보드(난수 상태 포함). 미리보기가 실제와 같은 결과를 미리 계산한다. */
  clone(): BoardModel {
    const m = new BoardModel(this.cols, this.rows, this.numColors, 1);
    m.cells.set(this.cells);
    m.fresh.set(this.fresh);
    m.bombs.set(this.bombs);
    m.rng = this.rng.clone();
    m.clusterBias = this.clusterBias;
    m.steerTarget = this.steerTarget;
    m.steerTrials = this.steerTrials;
    return m;
  }

  isBomb(x: number, y: number): boolean {
    return this.bombs[y * this.cols + x] === 1;
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

  /** 터질 칸에 폭탄이 있으면 주변 3×3을 더한다(그 안의 폭탄도 이어서 터진다). 터진 폭탄 자리를 돌려준다. */
  expandBombs(cells: Cell[]): { cells: Cell[]; bombs: Cell[] } {
    const { cols } = this;
    const inside = new Set(cells.map((p) => p.y * cols + p.x));
    const out = cells.slice();
    const bombs: Cell[] = [];
    for (let head = 0; head < out.length; head++) {
      const p = out[head];
      if (!this.bombs[p.y * cols + p.x]) continue;
      bombs.push(p);
      for (let dy = -BOMB_RADIUS; dy <= BOMB_RADIUS; dy++) {
        for (let dx = -BOMB_RADIUS; dx <= BOMB_RADIUS; dx++) {
          const x = p.x + dx, y = p.y + dy;
          if (!this.inBounds(x, y) || this.get(x, y) === EMPTY || inside.has(y * cols + x)) continue;
          inside.add(y * cols + x);
          out.push({ x, y });
        }
      }
    }
    return { cells: out, bombs };
  }

  /**
   * 떨어진 블록이 만든 연쇄: 새로 채운 블록을 빼고 같은 색으로 CHAIN_MIN칸 이상 이어진 덩어리 중
   * 이번에 떨어진 블록이 들어 있는 것. 덩어리마다 떨어진 블록 칸을 seeds로 준다.
   */
  chainGroups(moved: Uint8Array): { cells: Cell[]; seeds: Cell[] } {
    const { cols, rows, cells, fresh } = this;
    const seen = new Uint8Array(cols * rows);
    const out: Cell[] = [];
    const seeds: Cell[] = [];
    const group: number[] = [];
    for (let start = 0; start < cols * rows; start++) {
      if (seen[start] || cells[start] === EMPTY || fresh[start]) continue;
      const color = cells[start];
      group.length = 0;
      seen[start] = 1;
      group.push(start);
      let hasMoved = false;
      for (let head = 0; head < group.length; head++) {
        const i = group[head];
        if (moved[i]) hasMoved = true;
        const x = i % cols;
        for (const j of [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, i >= cols ? i - cols : -1, i + cols < cols * rows ? i + cols : -1]) {
          if (j >= 0 && !seen[j] && !fresh[j] && cells[j] === color) {
            seen[j] = 1;
            group.push(j);
          }
        }
      }
      if (group.length < CHAIN_MIN || !hasMoved) continue;
      for (const i of group) {
        const c = { x: i % cols, y: (i / cols) | 0 };
        out.push(c);
        if (moved[i]) seeds.push(c);
      }
    }
    return { cells: out, seeds };
  }

  /**
   * 한 번 찍은 결과 전체: 도장 → 낙하 → 연쇄 → 낙하 … 연쇄가 멈출 때까지 보드에 적용한다.
   * 찍을 블록이 없으면 null(보드는 그대로). 미리보기는 clone()한 보드에 부른다.
   */
  resolve(ax: number, ay: number, offsets: Cell[], nextOffsets: Cell[] = []): Resolution | null {
    const info = this.computeBreak(ax, ay, offsets);
    if (info.stamp.length === 0) return null;
    this.fresh.fill(0);
    const n = this.cols * this.rows;
    let burst = this.expandBombs(info.all);
    let seeds = info.stamp;
    const steps: Step[] = [];
    for (let chain = 0; ; chain++) {
      const broken = burst.cells.map((p) => ({ x: p.x, y: p.y, color: this.get(p.x, p.y) }));
      const moved = new Uint8Array(n);
      const { moves, spawns } = this.applyBreak(burst.cells, nextOffsets, moved);
      steps.push({ chain, broken, bombs: burst.bombs, seeds, moves, spawns });
      if (chain >= MAX_CHAIN) break;
      const next = this.chainGroups(moved);
      if (next.cells.length === 0) break;
      burst = this.expandBombs(next.cells);
      seeds = next.seeds;
    }
    let bomb: Cell | null = null;
    if (steps.reduce((a, s) => a + s.broken.length, 0) >= BOMB_MIN) {
      bomb = { x: ax, y: ay };
      this.bombs[ay * this.cols + ax] = 1;
    }
    return { steps, bomb };
  }

  /**
   * 블록을 제거하고 중력 낙하와 보충을 적용한다.
   * nextOffsets(다음에 쓸 모양)를 주면 "보충 조정": 새 블록 색 조합을 여러 번 뽑아 보고,
   * 그 모양으로 낼 수 있는 최대 파괴 수가 steerTarget에 가장 가까운 조합을 고른다.
   * → 보이는 NEXT 모양은 그대로, 아직 안 보인 새 블록 색만 골라 매 차례 최대치를 고르게 유지한다.
   */
  applyBreak(targets: Cell[], nextOffsets: Cell[] = [], moved?: Uint8Array): { moves: Move[]; spawns: Spawn[] } {
    for (const p of targets) {
      this.set(p.x, p.y, EMPTY);
      this.bombs[p.y * this.cols + p.x] = 0;
      this.fresh[p.y * this.cols + p.x] = 0;
    }
    const moves: Move[] = [];
    // 보충할 칸(왼쪽 열부터, 각 열은 아래에서 위로) + 화면 밖 시작 줄
    const empties: { x: number; y: number; fromY: number }[] = [];
    for (let x = 0; x < this.cols; x++) {
      let write = this.rows - 1;
      for (let y = this.rows - 1; y >= 0; y--) {
        const v = this.get(x, y);
        if (v === EMPTY) continue;
        if (y !== write) {
          const from = y * this.cols + x, to = write * this.cols + x;
          this.set(x, write, v);
          this.set(x, y, EMPTY);
          this.bombs[to] = this.bombs[from];
          this.fresh[to] = this.fresh[from];
          this.bombs[from] = 0;
          this.fresh[from] = 0;
          if (moved) moved[to] = 1;
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
    for (const e of empties) this.fresh[e.y * this.cols + e.x] = 1;
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
