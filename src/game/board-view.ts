import { BoardModel, type Step } from "../core/board-model.ts";
import type { Cell } from "../core/shapes.ts";
import { alpha, mix, SKIN } from "./skin.ts";
import { ease, Tweens, type Seq } from "./tween.ts";

/** 보드 한 칸(보드 좌표 단위). 화면에서는 BOARD_SCALE 배로 그린다. */
export const CELL = 80;
export const BLOCK = 72;
/** 파괴가 찍은 칸에서 같은 색을 따라 번지는 속도(한 칸 거리당 초)와 전체 상한 */
const WAVE_STEP = 0.028;
const WAVE_MAX = 0.2;
/** 블록이 다 떨어진 뒤 다음 연쇄가 터지기까지 잠깐 멈추는 시간(무엇이 이어졌는지 보이게) */
const CHAIN_PAUSE = 0.14;
/** 연쇄 단계 색: 도장 / 연쇄 1 / 연쇄 2 / 연쇄 3+ (미리보기·글자·점수 조각이 같은 색) */
export const CHAIN_COLORS = ["#40f2ff", "#ffc733", "#ff8a3d", "#ff40d9"];
export const chainColor = (chains: number): string => CHAIN_COLORS[Math.min(chains, CHAIN_COLORS.length - 1)];

class BlockEnt {
  color: number;
  x: number;
  y: number;
  sx = 1;
  sy = 1;
  white = 0;
  bomb = false;
  seq: Seq | null = null;
  /** seq가 끝나는 시각(이번 찍기 연출 기준). 단계마다 이 뒤에 이어 붙인다. */
  planT = 0;

  constructor(color: number, x: number, y: number) {
    this.color = color;
    this.x = x;
    this.y = y;
  }
}

export interface Broken {
  x: number;
  y: number;
  color: number;
  /** 찍은 순간부터 이 블록이 터지기까지(초) */
  delay: number;
}

/** 한 단계(도장 또는 연쇄 하나)의 연출 정보. 화면 좌표. */
export interface StepEvent {
  chain: number;
  count: number;
  broken: Broken[];
  /** 터진 폭탄 자리와 시각 */
  bombs: { x: number; y: number; delay: number }[];
  /** 이 단계가 터지기 시작하는 시각 */
  at: number;
  /** 글자·점수 조각을 띄울 자리(터지는 칸들의 가운데) */
  cx: number;
  cy: number;
}

export interface BreakEvent {
  /** 전체 부순 칸 수 */
  count: number;
  counts: number[];
  bombCount: number;
  steps: StepEvent[];
  /** 찍은 칸(화면 좌표) */
  ax: number;
  ay: number;
  /** 첫 단계 번짐이 끝나는 시각 */
  waveTime: number;
  /** 마지막 블록이 자리 잡기까지(초). 그동안 다음 찍기를 막는다. */
  duration: number;
  /** 새로 생긴 폭탄(화면 좌표). 연출이 끝날 때 나타난다. */
  bomb: { x: number; y: number } | null;
}

export interface Preview {
  stamp: Cell[];
  /** 도장 단계에서 부서질 칸(지금 보드 위치) */
  all: Cell[];
  counts: number[];
  bombs: number;
  /** 피버 배율까지 넣은 예상 점수 */
  points: number;
  makesBomb: boolean;
}

export class BoardView {
  model!: BoardModel;
  /** 화면에서 보드 왼쪽 위 위치와 배율 */
  readonly ox: number;
  readonly oy: number;
  readonly scale: number;
  offsets: Cell[] = [];
  nextOffsets: Cell[] = [];
  anchor: Cell | null = null;
  preview: Preview | null = null;
  /** 단계별 칸 수 → 단계별 점수(게임 규칙이 정한다: 연쇄·피버 배율) */
  scorer: (counts: number[]) => number[] = (c) => c;
  fever = false;
  /** 0~1: 배경 음악 박자(박 직후 1에서 빠르게 줄어든다). 판 테두리가 숨 쉬듯 밝아진다. */
  beat = 0;
  /** 0~1: 피버 색(판 바탕·빈 칸·테두리가 분홍·금색 쪽으로 바뀐다) */
  feverMix = 0;
  /** 미리보기 표시가 피해야 할 자리(화면 좌표, 떠 있는 점수 조각) */
  avoid: { x: number; y: number; w: number; h: number }[] = [];
  /** 연출이 끝나기까지 남은 시간. 그동안은 미리보기를 숨긴다(보드는 이미 결과 상태라서). */
  busy = 0;
  /** 판 바깥으로 퍼지는 테두리 빛 고리 */
  private frames: { t: number; max: number; grow: number; color: string }[] = [];
  private blocks: (BlockEnt | null)[] = [];
  private dying: BlockEnt[] = [];
  private tweens = new Tweens();
  private feverT = 0;
  private clock = 0;

  constructor(ox: number, oy: number, scale: number) {
    this.ox = ox;
    this.oy = oy;
    this.scale = scale;
  }

  setup(cols: number, rows: number, colors: number, seed = 0): void {
    const model = new BoardModel(cols, rows, colors, seed);
    model.fillInitial();
    this.setModel(model);
  }

  /** Load a board into the real renderer; illustrations can skip the entrance. */
  setModel(model: BoardModel, animate = true): void {
    this.model = model;
    const { cols, rows } = model;
    this.tweens.clear();
    this.dying = [];
    this.blocks = [];
    this.busy = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const b = new BlockEnt(this.model.get(x, y), (x + 0.5) * CELL, (y + 0.5) * CELL);
        b.bomb = model.isBomb(x, y);
        if (animate) {
          b.sx = b.sy = 0;
          b.seq = this.tweens.add().wait(0.025 * (x + y)).to(0.25, (k) => (b.sx = b.sy = k), ease.outBack);
        }
        this.blocks.push(b);
      }
    }
    this.anchor = null;
    this.preview = null;
  }

  get width(): number {
    return this.model.cols * CELL;
  }

  get height(): number {
    return this.model.rows * CELL;
  }

  /** 보드 칸 → 화면 좌표(칸 가운데) */
  toScreen(x: number, y: number): [number, number] {
    return [this.ox + (x + 0.5) * CELL * this.scale, this.oy + (y + 0.5) * CELL * this.scale];
  }

  /** 화면 좌표 → 보드 칸(밖이면 null) */
  cellAt(sx: number, sy: number): Cell | null {
    const x = Math.floor((sx - this.ox) / (CELL * this.scale));
    const y = Math.floor((sy - this.oy) / (CELL * this.scale));
    return this.model.inBounds(x, y) ? { x, y } : null;
  }

  setPiece(cells: Cell[]): void {
    this.offsets = cells;
    this.refreshPreview();
  }

  setAnchor(c: Cell | null): void {
    if (c?.x === this.anchor?.x && c?.y === this.anchor?.y) return;
    this.anchor = c;
    this.refreshPreview();
  }

  /** 미리보기: 보드 복사본에 실제로 찍어 본다(연쇄·폭탄까지). 난수도 복사하므로 결과가 실제와 같다. */
  refreshPreview(): void {
    if (!this.anchor || this.offsets.length === 0) {
      this.preview = null;
      return;
    }
    const { x, y } = this.anchor;
    const info = this.model.computeBreak(x, y, this.offsets);
    const res = info.stamp.length > 0 ? this.model.clone().resolve(x, y, this.offsets, this.nextOffsets) : null;
    const counts = res ? res.steps.map((st) => st.broken.length) : [];
    this.preview = {
      stamp: info.stamp,
      all: res ? res.steps[0].broken.map((p) => ({ x: p.x, y: p.y })) : [],
      counts,
      bombs: res ? res.steps.reduce((n, st) => n + st.bombs.length, 0) : 0,
      points: this.scorer(counts).reduce((n, v) => n + v, 0),
      makesBomb: !!res?.bomb,
    };
  }

  /** 찍는다(연쇄까지 끝까지). 찍을 블록이 없으면 null. 보드는 바로 결과 상태가 되고, 화면은 단계별로 따라간다. */
  placeAt(cx: number, cy: number): BreakEvent | null {
    const res = this.model.resolve(cx, cy, this.offsets, this.nextOffsets);
    if (!res) return null;
    const { cols } = this.model;
    // 지난 연출이 남아 있으면 끝 상태로 맞추고 새로 짠다
    this.blocks.forEach((b, i) => {
      if (!b) return;
      b.seq?.kill();
      b.seq = null;
      b.planT = 0;
      b.x = ((i % cols) + 0.5) * CELL;
      b.y = (Math.floor(i / cols) + 0.5) * CELL;
      b.sx = b.sy = 1;
      b.white = 0;
    });
    const steps: StepEvent[] = [];
    let at = 0, waveTime = 0;
    for (const st of res.steps) {
      const ev = this.playStep(st, at);
      steps.push(ev.event);
      if (st.chain === 0) waveTime = ev.waveEnd;
      at = ev.settle + CHAIN_PAUSE;
    }
    const duration = at - CHAIN_PAUSE;
    let bomb: BreakEvent["bomb"] = null;
    if (res.bomb) {
      const b = this.blocks[res.bomb.y * cols + res.bomb.x]!;
      const [bx, by] = this.toScreen(res.bomb.x, res.bomb.y);
      bomb = { x: bx, y: by };
      this.tweens.add().wait(duration).call(() => (b.bomb = true));
    }
    this.busy = duration;
    this.preview = null;
    const [ax, ay] = this.toScreen(cx, cy);
    const counts = res.steps.map((st) => st.broken.length);
    return {
      count: counts.reduce((n, v) => n + v, 0), counts, bombCount: steps.reduce((n, st) => n + st.bombs.length, 0),
      steps, ax, ay, waveTime, duration, bomb,
    };
  }

  /** 한 단계를 at초부터 연출한다: 시작 칸에서 번지며 터짐 → 위 블록 낙하 → 새 블록 낙하 */
  private playStep(st: Step, at: number): { event: StepEvent; waveEnd: number; settle: number } {
    const { cols } = this.model;
    const depth = waveDepth(st.seeds, st.broken, cols);
    let maxD = 0;
    for (const d of depth.values()) maxD = Math.max(maxD, d);
    const step = Math.min(WAVE_STEP, WAVE_MAX / Math.max(1, maxD));
    const broken: Broken[] = [];
    let sumX = 0, sumY = 0;
    for (const p of st.broken) {
      const i = p.y * cols + p.x;
      const b = this.blocks[i]!;
      const delay = at + (depth.get(i) ?? 0) * step;
      const [sx, sy] = this.toScreen(p.x, p.y);
      sumX += sx;
      sumY += sy;
      broken.push({ x: sx, y: sy, color: p.color, delay });
      this.pop(b, delay);
      this.blocks[i] = null;
    }
    const bombs = st.bombs.map((p) => {
      const [x, y] = this.toScreen(p.x, p.y);
      return { x, y, delay: at + (depth.get(p.y * cols + p.x) ?? 0) * step };
    });
    const waveEnd = at + maxD * step;
    let settle = waveEnd + 0.1;
    const moving = st.moves.map((m) => {
      const b = this.blocks[m.from.y * cols + m.from.x]!;
      this.blocks[m.from.y * cols + m.from.x] = null;
      return { b, m };
    });
    for (const { b, m } of moving) {
      this.blocks[m.to.y * cols + m.to.x] = b;
      settle = Math.max(settle, this.drop(b, waveEnd, m.from.y, m.to.y));
    }
    for (const sp of st.spawns) {
      const b = new BlockEnt(sp.color, (sp.to.x + 0.5) * CELL, (sp.fromY + 0.5) * CELL);
      this.blocks[sp.to.y * cols + sp.to.x] = b;
      settle = Math.max(settle, this.drop(b, waveEnd, sp.fromY, sp.to.y));
    }
    const n = Math.max(1, st.broken.length);
    return {
      event: { chain: st.chain, count: st.broken.length, broken, bombs, at, cx: sumX / n, cy: sumY / n },
      waveEnd,
      settle,
    };
  }

  /**
   * 판이 끝날 때: 판 가운데에서 충격파가 퍼지며, 가까운 블록부터 바깥쪽으로 살짝 밀렸다가 부서진다.
   * 보드 모델은 바꾸지 않는다(다음 판에 새 보드를 깐다). 블록마다 부서지는 시각과 충격파 중심(화면 좌표)을 돌려준다.
   */
  shockAll(at: number): { pieces: Broken[]; last: number; cx: number; cy: number } {
    const { cols, rows } = this.model;
    const pieces: Broken[] = [];
    this.busy = Number.POSITIVE_INFINITY;
    this.preview = null;
    const fx = (cols - 1) / 2, fy = (rows - 1) / 2;
    let last = at;
    this.blocks.forEach((b, i) => {
      if (!b) return;
      b.seq?.kill();
      b.seq = null;
      b.planT = 0;
      const x = i % cols, y = Math.floor(i / cols);
      b.x = (x + 0.5) * CELL;
      b.y = (y + 0.5) * CELL;
      b.sx = b.sy = 1;
      this.blocks[i] = null;
      // 멈춘 순간 하얗게 굳었다가 살짝 남는다
      this.tweens.add().to(0.1, (k) => (b.white = 0.7 * k)).to(0.3, (k) => (b.white = 0.7 - 0.5 * k));
      const dx = x - fx, dy = y - fy, d = Math.hypot(dx, dy);
      const delay = at + d * 0.07;
      const ox = d ? (dx / d) * 18 : 0, oy = d ? (dy / d) * 18 : 0, x0 = b.x, y0 = b.y;
      this.dying.push(b);
      this.seqAt(b, delay)
        .to(0.05, (k) => {
          b.x = x0 + ox * k;
          b.y = y0 + oy * k;
          b.white = 0.2 + 0.8 * k;
          b.sx = b.sy = 1 + 0.2 * k;
        })
        .to(0.07, (k) => (b.sx = b.sy = 1.2 * (1 - k)), ease.inQuad)
        .call(() => (this.dying = this.dying.filter((v) => v !== b)));
      const [sx, sy] = this.toScreen(x, y);
      pieces.push({ x: sx + ox * this.scale, y: sy + oy * this.scale, color: b.color, delay: delay + 0.05 });
      last = Math.max(last, delay + 0.05);
    });
    const [cx, cy] = this.toScreen(fx, fy);
    return { pieces, last, cx, cy };
  }

  /** b의 연출 줄에서 at초 자리를 연다(앞 단계 연출 뒤에 이어 붙인다). */
  private seqAt(b: BlockEnt, at: number): Seq {
    if (!b.seq || b.seq.dead) {
      b.seq = this.tweens.add();
      b.planT = 0;
    }
    b.seq.wait(at - b.planT);
    return b.seq;
  }

  private pop(b: BlockEnt, at: number): void {
    this.dying.push(b);
    this.seqAt(b, at)
      .to(0.03, (k) => {
        b.white = k;
        b.sx = b.sy = 1 + 0.18 * k;
      })
      .to(0.06, (k) => (b.sx = b.sy = 1.18 * (1 - k)), ease.inQuad)
      .call(() => (this.dying = this.dying.filter((d) => d !== b)));
    b.planT = at + 0.09;
  }

  /** fromRow → toRow 낙하를 at초에 시작한다. 자리 잡는 시각을 돌려준다. */
  private drop(b: BlockEnt, at: number, fromRow: number, toRow: number): number {
    const y0 = (fromRow + 0.5) * CELL, y1 = (toRow + 0.5) * CELL;
    const fall = 0.06 + 0.017 * (toRow - fromRow);
    this.seqAt(b, at)
      .to(fall, (k) => (b.y = y0 + (y1 - y0) * k), ease.inQuad) // 위 블록은 번지는 파괴가 끝난 뒤에 떨어진다
      .to(0.04, (k) => {
        b.sx = 1 + 0.1 * k;
        b.sy = 1 - 0.12 * k;
      })
      .to(0.08, (k) => {
        b.sx = 1.1 - 0.1 * k;
        b.sy = 0.88 + 0.12 * k;
      }, ease.outBack);
    b.planT = at + fall + 0.12;
    return at + fall + 0.04;
  }

  update(dt: number): void {
    this.tweens.update(dt);
    this.clock += dt;
    if (this.busy > 0) {
      this.busy = Math.max(0, this.busy - dt);
      if (this.busy === 0) this.refreshPreview();
    }
    if (this.fever) this.feverT += dt;
    for (const f of this.frames) f.t += dt;
    this.frames = this.frames.filter((f) => f.t < f.max);
  }

  /** 크게 부술 때·GO! 때: 판 테두리 모양 빛 고리가 바깥으로 한 번 퍼진다. */
  frameKick(color: string, grow = 60, max = 0.5): void {
    this.frames.push({ t: 0, max, grow, color });
  }

  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.translate(this.ox, this.oy);
    g.scale(this.scale, this.scale);
    const w = this.width, h = this.height;
    // 판과 칸
    const fm = this.feverMix, beat = this.beat;
    roundRect(g, -12, -12, w + 24, h + 24, 20);
    g.fillStyle = mix(SKIN.boardBg, "#1c0a24", fm);
    g.fill();
    // 테두리: 박자마다 살짝 밝아지고 번진다(피버 땐 분홍)
    const border = mix("#40d9ff", "#ff40d9", fm);
    g.save();
    g.lineWidth = 3 + beat * 1.5;
    g.strokeStyle = alpha(border, 0.45 + 0.35 * beat);
    g.shadowColor = border;
    g.shadowBlur = 4 + 16 * beat;
    g.stroke();
    g.restore();
    for (const f of this.frames) {
      const k = f.t / f.max, e = 1 - (1 - k) ** 3, grow = 6 + f.grow * e;
      roundRect(g, -12 - grow, -12 - grow, w + 24 + grow * 2, h + 24 + grow * 2, 20 + grow * 0.6);
      g.lineWidth = 6 * (1 - k) + 1;
      g.strokeStyle = f.color;
      g.globalAlpha = (1 - k) * 0.9;
      g.stroke();
      g.globalAlpha = 1;
    }
    if (this.fever) {
      // 테두리를 따라 색이 흐르는 피버 빛
      for (let i = 0; i < 2; i++) {
        const hue = ((this.feverT * 0.6 + i * 0.08) % 1) * 360;
        const grow = 3 + i * 4 + Math.sin(this.feverT * 8);
        roundRect(g, -12 - grow, -12 - grow, w + 24 + grow * 2, h + 24 + grow * 2, 24);
        g.strokeStyle = `hsla(${hue},90%,70%,${0.5 - i * 0.25})`;
        g.lineWidth = 2.5 - i;
        g.stroke();
      }
    }
    g.fillStyle = fm > 0.01 ? alpha(mix("#40f2ff", "#ffc733", fm), 0.05 + 0.03 * fm) : SKIN.slot;
    for (let y = 0; y < this.model.rows; y++) {
      for (let x = 0; x < this.model.cols; x++) g.fillRect(x * CELL + 6, y * CELL + 6, CELL - 12, CELL - 12);
    }
    // 블록(보드 밖에서 떨어지는 블록은 잘라 낸다)
    g.save();
    g.beginPath();
    g.rect(-12, -12, w + 24, h + 24);
    g.clip();
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 6);
    for (const b of this.blocks) if (b) drawBlock(g, b, pulse);
    for (const b of this.dying) drawBlock(g, b, pulse);
    g.restore();
    this.drawPreview(g);
    g.restore();
  }

  /**
   * 미리보기: 부서질 영역은 블록이 제 색으로 은은히 밝아지고(숨 쉬듯) 얇은 회백색 윤곽, 찍는 칸(도장)은 굵고 밝은 흰 칸.
   * 점수·연쇄 표시는 없다(판정이 없어져 눈에 보이는 대로 부수면 된다).
   */
  /** 함께 터질 칸의 블록을 제 색으로 덧그려 은은히 밝힌다(약 1.9초 주기로 숨 쉬듯). 게임 방법 그림도 같이 쓴다. */
  glowCells(g: CanvasRenderingContext2D, cells: readonly Cell[]): void {
    const cols = this.model.cols;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.32 + 0.12 * Math.sin(this.clock * 3.3);
    for (const p of cells) {
      const blk = this.blocks[p.y * cols + p.x];
      if (blk) drawBlock(g, blk, 0);
    }
    g.restore();
  }

  private drawPreview(g: CanvasRenderingContext2D): void {
    const pv = this.preview;
    if (!pv || !this.anchor || this.busy > 0) return;
    const { cols, rows } = this.model;
    const inside = new Set(pv.all.map((p) => p.y * cols + p.x));
    const has = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && inside.has(y * cols + x);

    g.fillStyle = SKIN.dim;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!inside.has(y * cols + x)) g.fillRect(x * CELL, y * CELL, CELL, CELL);
    this.glowCells(g, pv.all);
    const outline = (path: () => void, w: number, c: string) => {
      g.lineWidth = w;
      g.strokeStyle = c;
      g.beginPath();
      path();
      g.stroke();
    };
    const edges = () => {
      for (const p of pv.all) {
        const x = p.x * CELL, y = p.y * CELL;
        if (!has(p.x, p.y - 1)) seg(g, x, y, x + CELL, y);
        if (!has(p.x, p.y + 1)) seg(g, x, y + CELL, x + CELL, y + CELL);
        if (!has(p.x - 1, p.y)) seg(g, x, y, x, y + CELL);
        if (!has(p.x + 1, p.y)) seg(g, x + CELL, y, x + CELL, y + CELL);
      }
    };
    g.lineCap = "square";
    outline(edges, 8, "rgba(0,0,8,0.8)");
    outline(edges, 3, "rgba(220,226,240,0.85)");
    // 찍는 칸: 흰 빛 칸 + 굵은 흰 테두리(보드 밖 칸은 흐린 점선)
    for (const o of this.offsets) {
      const x = this.anchor.x + o.x, y = this.anchor.y + o.y;
      const inBoard = this.model.inBounds(x, y);
      g.save();
      if (inBoard) {
        g.fillStyle = "rgba(255,255,255,0.22)";
        roundRect(g, x * CELL + 5, y * CELL + 5, CELL - 10, CELL - 10, 12);
        g.fill();
        g.shadowColor = "rgba(255,255,255,0.9)";
        g.shadowBlur = 14;
        g.lineWidth = 6;
        g.strokeStyle = "#ffffff";
        g.stroke();
      } else {
        g.setLineDash([8, 8]);
        g.lineWidth = 3;
        g.strokeStyle = "rgba(255,255,255,0.3)";
        roundRect(g, x * CELL + 8, y * CELL + 8, CELL - 16, CELL - 16, 10);
        g.stroke();
      }
      g.restore();
    }
  }
}

function seg(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
}

/** 찍은 칸들에서 시작하는 너비 우선 거리(부서질 칸끼리 상하좌우로만 이어짐). 키 = y*cols+x */
function waveDepth(stamp: Cell[], all: Cell[], cols: number): Map<number, number> {
  // 폭탄 3×3 칸은 같은 색이 아니어도 이웃이라 번짐에 함께 들어간다
  const inside = new Set(all.map((p) => p.y * cols + p.x));
  const depth = new Map<number, number>();
  const q: number[] = [];
  for (const p of stamp) {
    const i = p.y * cols + p.x;
    depth.set(i, 0);
    q.push(i);
  }
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    const x = i % cols;
    for (const j of [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
      if (j >= 0 && inside.has(j) && !depth.has(j)) {
        depth.set(j, depth.get(i)! + 1);
        q.push(j);
      }
    }
  }
  return depth;
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

// ---------------------------------------------------------------- 블록 그림(색마다 미리 그려 둔다)

const SPRITE_RES = 2;
const PAD = 16;
const sprites = new Map<number, HTMLCanvasElement>();

function blockSprite(color: number): HTMLCanvasElement {
  let c = sprites.get(color);
  if (c) return c;
  c = document.createElement("canvas");
  const size = (BLOCK + PAD * 2) * SPRITE_RES;
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.scale(SPRITE_RES, SPRITE_RES);
  g.translate(PAD + BLOCK / 2, PAD + BLOCK / 2);
  const col = SKIN.blocks[color];
  const half = BLOCK / 2 - 3;
  // 네온: 어두운 속 + 빛나는 테두리(바깥으로 번지는 빛)
  g.shadowColor = alpha(col, 0.6);
  g.shadowBlur = 8;
  roundRect(g, -half, -half, half * 2, half * 2, 12);
  const fill = g.createLinearGradient(0, -half, 0, half);
  fill.addColorStop(0, mix(col, "#090715", 0.76));
  fill.addColorStop(1, mix(col, "#090715", 0.9));
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = col;
  g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = alpha(mix(col, "#ffffff", 0.25), 0.95);
  symbol(g, color);
  sprites.set(color, c);
  return c;
}

/** 색마다 다른 기호 → 색약 플레이어도 구분할 수 있다. */
function symbol(g: CanvasRenderingContext2D, color: number): void {
  g.beginPath();
  switch (color) {
    case 0:
      g.arc(0, 0, 13, 0, Math.PI * 2);
      break;
    case 1:
      g.moveTo(0, -15);
      g.lineTo(15, 12);
      g.lineTo(-15, 12);
      break;
    case 2:
      g.moveTo(0, -16);
      g.lineTo(16, 0);
      g.lineTo(0, 16);
      g.lineTo(-16, 0);
      break;
    case 3:
      g.rect(-12, -12, 24, 24);
      break;
    default:
      g.rect(-15, -5, 30, 10);
      g.rect(-5, -15, 10, 30);
  }
  g.fill();
}

/** 폭탄 표시: 흰 빛 고리 + 네 방향 불꽃. pulse 0~1로 숨 쉰다. */
export function drawBombMark(g: CanvasRenderingContext2D, x: number, y: number, r: number, pulse: number): void {
  g.save();
  g.translate(x, y);
  g.shadowColor = "rgba(255,255,255,0.9)";
  g.shadowBlur = 6 + 10 * pulse;
  g.strokeStyle = "#ffffff";
  g.lineWidth = r * 0.22;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#ffffff";
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(-r * 0.2, -r * 1.1);
    g.lineTo(0, -r * (1.55 + 0.2 * pulse));
    g.lineTo(r * 0.2, -r * 1.1);
    g.fill();
  }
  g.restore();
}

function drawBlock(g: CanvasRenderingContext2D, b: BlockEnt, pulse: number): void {
  if (b.sx <= 0.001) return;
  const spr = blockSprite(b.color);
  const s = BLOCK + PAD * 2;
  g.save();
  g.translate(b.x, b.y);
  g.scale(b.sx, b.sy);
  g.drawImage(spr, -s / 2, -s / 2, s, s);
  if (b.bomb) drawBombMark(g, 0, 0, 22, pulse);
  if (b.white > 0) {
    g.globalAlpha = b.white * 0.8;
    g.fillStyle = "#fff";
    roundRect(g, -BLOCK / 2 + 3, -BLOCK / 2 + 3, BLOCK - 6, BLOCK - 6, 12);
    g.fill();
  }
  g.restore();
}
