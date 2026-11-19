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
export const CHAIN_MIN = 6;
/** 크리스탈 칸의 값(색 0..numColors-1과 겹치지 않는다). 어떤 색과도 이어지지 않는다. */
export const CRYSTAL = 7;
/** 크리스탈 종류: 깨질 때 가로 한 줄 / 가로+세로 십자 / 세로 한 줄을 함께 지운다 */
export const CRYSTAL_ROW = 1;
export const CRYSTAL_CROSS = 2;
export const CRYSTAL_COL = 3;
/**
 * 도장과 색 덩어리로 이만큼 부수면 찍은 자리에 줄 크리스탈이 생긴다.
 * 부순 모양이 옆으로 길면 가로줄, 위아래로 길면 세로줄(같으면 찍은 칸 자리로 번갈아).
 */
export const CRYSTAL_MIN = 13;
/** 한 번에 이 칸 수 이상 부순 색만 「여러 색」 가짓수에 센다 */
export const COLOR_MIN = 3;
/** 여러 색이 이 가짓수 이상이거나, 한 번에 CROSS_MIN칸 이상 부수면 십자 크리스탈 */
export const CROSS_COLORS = 4;
export const CROSS_MIN = 15;
/** 무한 연쇄 방지 */
export const MAX_CHAIN = 30;

export interface CrystalCell extends Cell {
  kind: number;
}

export interface BrokenCell {
  x: number;
  y: number;
  color: number;
}

/** 한 단계: 도장(chain 0) 또는 연쇄(chain 1, 2, …) 하나가 터지고 블록이 떨어지기까지 */
export interface Step {
  chain: number;
  broken: BrokenCell[];
  /** 이 단계에서 깨진 크리스탈 자리와 종류 */
  crystals: CrystalCell[];
  /** 터지기 시작하는 칸(도장 칸 / 연쇄 덩어리에서 떨어져 이어 준 칸) */
  seeds: Cell[];
  moves: Move[];
  spawns: Spawn[];
}

export interface Resolution {
  steps: Step[];
  /** 도장과 색 덩어리로 COLOR_MIN칸 이상 부순 색의 가짓수(크리스탈이 지운 칸은 빼고) */
  colors: number;
  /** 그 색들 */
  colorSet: number[];
  /** 이번에 새로 생긴 크리스탈 (없으면 null) */
  crystal: CrystalCell | null;
}

export class BoardModel {
  readonly cols: number;
  readonly rows: number;
  readonly numColors: number;
  /** 새 블록이 이웃 블록 색을 따라갈 확률. 높을수록 같은 색 덩어리가 커진다. */
  clusterBias = 0.3;
  /** 보충 조정: 다음 모양의 최대 파괴 수 목표와 시도 횟수(1이면 조정 안 함) */
  steerTarget = 15;
  steerTrials = 10;
  /**
   * 새로 채워진 블록과 연쇄: 0 = 빠진다(이어 주지도 않음), 1 = 덩어리를 이어 주고 칸 수에 들지만 연쇄를 시작하지는 않는다
   * (떨어진 기존 블록이 덩어리에 있어야 터짐), 2 = 보통 블록처럼 연쇄를 시작한다.
   */
  chainFresh: 0 | 1 | 2 = 1;
  /** 연쇄가 터지는 최소 칸 수 */
  chainMin = CHAIN_MIN;
  /** 가로줄·십자 크리스탈 조건(실험용으로 바꿀 수 있게) */
  crystalMin = CRYSTAL_MIN;
  crossColors = CROSS_COLORS;
  crossMin = CROSS_MIN;
  cells: Int32Array;
  /** 이번 도장 때 새로 채워진 블록(1). 연쇄를 일으키지 않는다 → 보이는 블록만으로 연쇄를 읽을 수 있다. */
  fresh: Uint8Array;
  /** 크리스탈 종류(0 = 크리스탈 아님, CRYSTAL_ROW, CRYSTAL_CROSS). 크리스탈 칸의 값은 CRYSTAL. */
  crystals: Uint8Array;
  rng: Rng;

  constructor(cols: number, rows: number, colors: number, seed = 0) {
    this.cols = cols;
    this.rows = rows;
    this.numColors = colors;
    this.rng = new Rng(seed);
    this.cells = new Int32Array(cols * rows).fill(EMPTY);
    this.fresh = new Uint8Array(cols * rows);
    this.crystals = new Uint8Array(cols * rows);
  }

  /** 똑같은 보드(난수 상태 포함). 미리보기가 실제와 같은 결과를 미리 계산한다. */
  clone(): BoardModel {
    const m = new BoardModel(this.cols, this.rows, this.numColors, 1);
    m.cells.set(this.cells);
    m.fresh.set(this.fresh);
    m.crystals.set(this.crystals);
    m.rng = this.rng.clone();
    m.clusterBias = this.clusterBias;
    m.steerTarget = this.steerTarget;
    m.steerTrials = this.steerTrials;
    m.chainFresh = this.chainFresh;
    m.chainMin = this.chainMin;
    m.crystalMin = this.crystalMin;
    m.crossColors = this.crossColors;
    m.crossMin = this.crossMin;
    return m;
  }

  /** 크리스탈 종류(0 = 아님) */
  crystalKind(x: number, y: number): number {
    return this.crystals[y * this.cols + x];
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
      for (const [nx, ny] of [[x, y + 1], [x - 1, y]]) {
        if (!this.inBounds(nx, ny)) continue;
        const v = this.get(nx, ny);
        if (v !== EMPTY && v !== CRYSTAL) cand.push(v);
      }
      if (cand.length > 0) return cand[this.rng.int(0, cand.length - 1)];
    }
    return this.rng.int(0, this.numColors - 1);
  }

  /** 모양을 anchor에 찍었을 때 부서질 칸(크리스탈은 직접 찍으면 깨지지만 이어지지 않는다). 보드는 바꾸지 않는다. */
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
      if (color === CRYSTAL) continue;
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
   * 부서질 칸 바로 옆(상하좌우)의 크리스탈을 더하고, 깨지는 크리스탈마다 가로 줄(십자면 세로 줄도)을 더한다.
   * 더해진 칸 옆의 크리스탈도 이어서 깨진다. 깨진 크리스탈 자리를 돌려준다.
   */
  expandCrystals(cells: Cell[]): { cells: Cell[]; crystals: CrystalCell[] } {
    const { cols, rows } = this;
    const inside = new Set(cells.map((p) => p.y * cols + p.x));
    const out = cells.slice();
    const crystals: CrystalCell[] = [];
    const add = (x: number, y: number) => {
      if (!this.inBounds(x, y) || this.get(x, y) === EMPTY || inside.has(y * cols + x)) return;
      inside.add(y * cols + x);
      out.push({ x, y });
    };
    for (let head = 0; head < out.length; head++) {
      const p = out[head];
      for (const d of DIRS) {
        const x = p.x + d.x, y = p.y + d.y;
        if (this.inBounds(x, y) && this.get(x, y) === CRYSTAL) add(x, y);
      }
      if (this.get(p.x, p.y) !== CRYSTAL) continue;
      const kind = this.crystals[p.y * cols + p.x];
      crystals.push({ x: p.x, y: p.y, kind });
      if (kind !== CRYSTAL_COL) for (let x = 0; x < cols; x++) add(x, p.y);
      if (kind !== CRYSTAL_ROW) for (let y = 0; y < rows; y++) add(p.x, y);
    }
    return { cells: out, crystals };
  }

  /** 도장과 색 덩어리로 부순 칸에서 COLOR_MIN칸 이상인 색들(작은 번호부터) */
  colorSet(cells: Cell[]): number[] {
    const per = new Map<number, number>();
    for (const p of cells) {
      const c = this.get(p.x, p.y);
      if (c !== CRYSTAL && c !== EMPTY) per.set(c, (per.get(c) ?? 0) + 1);
    }
    return [...per].filter(([, v]) => v >= COLOR_MIN).map(([c]) => c).sort((a, b) => a - b);
  }

  /**
   * 떨어진 블록이 만든 연쇄: 같은 색으로 CHAIN_MIN칸 이상 이어진 덩어리 중 이번에 떨어진 기존 블록이 들어 있는 것.
   * 새로 채운 블록은 chainFresh에 따라 덩어리를 이어 주기만 하거나(1, 기본) 빠지거나(0) 연쇄를 시작한다(2). 덩어리마다 떨어진 블록 칸을 seeds로 준다.
   */
  chainGroups(moved: Uint8Array): { cells: Cell[]; seeds: Cell[] } {
    const { cols, rows, cells } = this;
    // chainFresh면 새 블록도 보통 블록처럼 이어지고, 떨어진 블록과 마찬가지로 연쇄를 시작한다
    const fresh = this.chainFresh ? new Uint8Array(cols * rows) : this.fresh;
    const changed = this.chainFresh === 2 ? this.fresh : null;
    const seen = new Uint8Array(cols * rows);
    const out: Cell[] = [];
    const seeds: Cell[] = [];
    const group: number[] = [];
    for (let start = 0; start < cols * rows; start++) {
      if (seen[start] || cells[start] === EMPTY || cells[start] === CRYSTAL || fresh[start]) continue;
      const color = cells[start];
      group.length = 0;
      seen[start] = 1;
      group.push(start);
      let hasMoved = false;
      for (let head = 0; head < group.length; head++) {
        const i = group[head];
        if (moved[i] || changed?.[i]) hasMoved = true;
        const x = i % cols;
        for (const j of [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, i >= cols ? i - cols : -1, i + cols < cols * rows ? i + cols : -1]) {
          if (j >= 0 && !seen[j] && !fresh[j] && cells[j] === color) {
            seen[j] = 1;
            group.push(j);
          }
        }
      }
      if (group.length < this.chainMin || !hasMoved) continue;
      for (const i of group) {
        const c = { x: i % cols, y: (i / cols) | 0 };
        out.push(c);
        if (moved[i] || changed?.[i]) seeds.push(c);
      }
    }
    return { cells: out, seeds };
  }

  /** 찍으면 도장 단계에서 부서질 칸 수(크리스탈이 지울 줄 포함, 연쇄 제외). 보드는 바꾸지 않는다. */
  stampCount(ax: number, ay: number, offsets: Cell[]): number {
    const info = this.computeBreak(ax, ay, offsets);
    return info.stamp.length ? this.expandCrystals(info.all).cells.length : 0;
  }

  /** 이 모양으로 min칸 이상 부서지는 자리가 판에 하나라도 있나 */
  hasBreak(offsets: Cell[], min: number): boolean {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) if (this.stampCount(x, y, offsets) >= min) return true;
    }
    return false;
  }

  /** 색마다 가장 크게 뭉친 덩어리(크기가 같으면 왼쪽 위에서 먼저 만난 것). 자동 부수기가 부술 칸. */
  biggestGroups(): Cell[] {
    const { ids, sizes } = this.components();
    const best = new Map<number, number>();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id < 0) continue;
      const c = this.cells[i];
      const cur = best.get(c);
      if (cur === undefined || sizes[id] > sizes[cur]) best.set(c, id);
    }
    const keep = new Set(best.values());
    const out: Cell[] = [];
    for (let i = 0; i < ids.length; i++) if (keep.has(ids[i])) out.push({ x: i % this.cols, y: (i / this.cols) | 0 });
    return out;
  }

  /**
   * 자동 부수기: 판 어디에도 MIN_BREAK칸 자리가 없을 때 색마다 가장 큰 덩어리를 한꺼번에 부순다(연쇄까지).
   * 점수는 받지만 여러 색 배율·시간 보너스는 없고(colors 1) 크리스탈도 생기지 않는다.
   */
  autoBreak(nextOffsets: Cell[] = []): Resolution | null {
    const targets = this.biggestGroups();
    if (targets.length === 0) return null;
    this.fresh.fill(0);
    return { steps: this.chainFrom(targets, targets, nextOffsets), colors: 1, colorSet: [], crystal: null };
  }

  /**
   * 한 번 찍은 결과 전체: 도장 → 낙하 → 연쇄 → 낙하 … 연쇄가 멈출 때까지 보드에 적용한다.
   * 찍을 블록이 없으면 null(보드는 그대로). 미리보기는 clone()한 보드에 부른다.
   */
  resolve(ax: number, ay: number, offsets: Cell[], nextOffsets: Cell[] = [], makeCrystal = true): Resolution | null {
    const info = this.computeBreak(ax, ay, offsets);
    if (info.stamp.length === 0) return null;
    this.fresh.fill(0);
    // 여러 색·크리스탈 조건은 도장과 색 덩어리로 부순 칸만 센다(크리스탈이 지운 줄은 빼서 크리스탈이 크리스탈을 낳지 않게)
    const colorSet = this.colorSet(info.all);
    const colors = colorSet.length;
    const own = info.all.filter((p) => this.get(p.x, p.y) !== CRYSTAL).length;
    const steps = this.chainFrom(info.all, info.stamp, nextOffsets);
    // 여러 색(CROSS_COLORS가지 이상)이면 십자, 크게(CRYSTAL_MIN칸 이상) 부수면 부순 모양 방향의 줄 크리스탈을 찍은 자리에
    const kind = !makeCrystal ? 0 : colors >= this.crossColors || own >= this.crossMin ? CRYSTAL_CROSS : own >= this.crystalMin ? lineKind(info.all, ax, ay) : 0;
    let crystal: Resolution["crystal"] = null;
    if (kind) {
      const i = ay * this.cols + ax;
      this.cells[i] = CRYSTAL;
      this.crystals[i] = kind;
      this.fresh[i] = 0;
      crystal = { x: ax, y: ay, kind };
    }
    return { steps, colors, colorSet, crystal };
  }

  /** cells(옆 크리스탈 포함)를 부수고 연쇄가 멈출 때까지 단계를 쌓는다. seeds는 터지기 시작하는 칸. */
  private chainFrom(cells: Cell[], seeds: Cell[], nextOffsets: Cell[]): Step[] {
    const n = this.cols * this.rows;
    let burst = this.expandCrystals(cells);
    const steps: Step[] = [];
    for (let chain = 0; ; chain++) {
      const broken = burst.cells.map((p) => ({ x: p.x, y: p.y, color: this.get(p.x, p.y) }));
      const moved = new Uint8Array(n);
      const { moves, spawns } = this.applyBreak(burst.cells, nextOffsets, moved);
      steps.push({ chain, broken, crystals: burst.crystals, seeds, moves, spawns });
      if (chain >= MAX_CHAIN) break;
      const next = this.chainGroups(moved);
      if (next.cells.length === 0) break;
      burst = this.expandCrystals(next.cells);
      seeds = next.seeds;
    }
    return steps;
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
      this.crystals[p.y * this.cols + p.x] = 0;
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
          this.crystals[to] = this.crystals[from];
          this.fresh[to] = this.fresh[from];
          this.crystals[from] = 0;
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
      if (ids[start] >= 0 || cells[start] === EMPTY || cells[start] === CRYSTAL) continue;
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

/** 부순 칸들이 옆으로 길면 가로줄, 위아래로 길면 세로줄. 같으면 찍은 칸 자리로 번갈아(서버도 같은 답). */
function lineKind(cells: Cell[], ax: number, ay: number): number {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of cells) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const w = x1 - x0, h = y1 - y0;
  if (w !== h) return w > h ? CRYSTAL_ROW : CRYSTAL_COL;
  return (ax + ay) % 2 ? CRYSTAL_COL : CRYSTAL_ROW;
}
