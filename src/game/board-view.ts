import { BoardModel, CRYSTAL, CRYSTAL_COL, CRYSTAL_CROSS, type Resolution, type Step } from "../core/board-model.ts";
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
  /** 크리스탈 종류(0 = 보통 블록) */
  crystal = 0;
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
  /** 깨진 크리스탈 자리·시각·종류(화면 좌표). 줄 지우기 빛줄기를 그린다. */
  crystals: { x: number; y: number; delay: number; kind: number }[];
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
  /** 여러 색 가짓수(도장과 색 덩어리로 3칸 이상 부순 색)와 그 색들 */
  colors: number;
  colorSet: number[];
  crystalCount: number;
  steps: StepEvent[];
  /** 찍은 칸(화면 좌표) */
  ax: number;
  ay: number;
  /** 첫 단계 번짐이 끝나는 시각 */
  waveTime: number;
  /** 마지막 블록이 자리 잡기까지(초). 그동안 다음 찍기를 막는다. */
  duration: number;
  /** 새로 생긴 크리스탈(화면 좌표와 종류). 연출이 끝날 때 나타난다. */
  crystal: { x: number; y: number; kind: number } | null;
}

export interface Preview {
  stamp: Cell[];
  /** 도장 단계에서 부서질 칸(지금 보드 위치) */
  all: Cell[];
  counts: number[];
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
  fever = false;
  /** 0~1: 배경 음악 박자(박 직후 1에서 빠르게 줄어든다). 판 테두리가 숨 쉬듯 밝아진다. */
  beat = 0;
  /** 0~1: 피버 색(판 바탕·빈 칸·테두리가 분홍·금색 쪽으로 바뀐다) */
  feverMix = 0;
  /** 미리보기 표시가 피해야 할 자리(화면 좌표, 떠 있는 점수 조각) */
  avoid: { x: number; y: number; w: number; h: number }[] = [];
  /** 이 칸 수보다 적게 부서지는 자리는 미리보기를 흐리게(안 찍히는 자리). 0이면 제한 없음(튜토리얼·그림). */
  minBreak = 0;
  /**
   * 미리보기 도장 칸 색: "#rrggbb" 고정 색, 또는
   * "own" 그 칸 블록 제 색 / "own-light" 제 색을 밝게 / "complement" 제 색의 반대색 / "rainbow" 천천히 도는 무지개 /
   * "own-gold" 제 색 + 안쪽 얇은 금빛 고리
   */
  stampColor = "own-light";
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
        b.crystal = model.crystalKind(x, y);
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

  /** 미리보기: 보드 복사본에 실제로 찍어 본다(크리스탈이 지울 줄까지). 난수도 복사하므로 결과가 실제와 같다. */
  refreshPreview(): void {
    if (!this.anchor || this.offsets.length === 0) {
      this.preview = null;
      return;
    }
    const { x, y } = this.anchor;
    const info = this.model.computeBreak(x, y, this.offsets);
    const res = info.stamp.length > 0 ? this.model.clone().resolve(x, y, this.offsets, this.nextOffsets, !this.fever) : null;
    const counts = res ? res.steps.map((st) => st.broken.length) : [];
    this.preview = {
      stamp: info.stamp,
      all: res ? res.steps[0].broken.map((p) => ({ x: p.x, y: p.y })) : [],
      counts,
    };
  }

  /** 찍는다(연쇄까지 끝까지). 찍을 블록이 없으면 null. 보드는 바로 결과 상태가 되고, 화면은 단계별로 따라간다. */
  placeAt(cx: number, cy: number): BreakEvent | null {
    const res = this.model.resolve(cx, cy, this.offsets, this.nextOffsets, !this.fever);
    return res ? this.play(res, cx, cy) : null;
  }

  /** 자동 부수기(색마다 가장 큰 덩어리). 글자는 판 가운데에 띄운다. */
  autoBreak(): BreakEvent | null {
    const res = this.model.autoBreak(this.nextOffsets);
    return res ? this.play(res, (this.model.cols - 1) / 2, (this.model.rows - 1) / 2) : null;
  }

  private play(res: Resolution, cx: number, cy: number): BreakEvent {
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
    let crystal: BreakEvent["crystal"] = null;
    if (res.crystal) {
      const { x, y, kind } = res.crystal;
      const b = this.blocks[y * cols + x]!;
      const [bx, by] = this.toScreen(x, y);
      crystal = { x: bx, y: by, kind };
      // 연출이 끝날 때 찍은 자리의 블록이 크리스탈로 바뀐다(살짝 튀어 오르며)
      this.tweens.add().wait(duration).call(() => {
        b.color = CRYSTAL;
        b.crystal = kind;
        b.white = 1;
      }).to(0.25, (k) => {
        b.white = 1 - k;
        b.sx = b.sy = 1 + 0.25 * Math.sin(k * Math.PI);
      });
    }
    this.busy = duration;
    // 피버 땐 연출 중에도 다음 3×3 자리를 바로 보여 준다(연달아 찍으라고)
    if (this.fever) this.refreshPreview();
    else this.preview = null;
    const [ax, ay] = this.toScreen(cx, cy);
    const counts = res.steps.map((st) => st.broken.length);
    return {
      count: counts.reduce((n, v) => n + v, 0), counts, colors: res.colors, colorSet: res.colorSet,
      crystalCount: steps.reduce((n, st) => n + st.crystals.length, 0),
      steps, ax, ay, waveTime, duration, crystal,
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
    const crystals = st.crystals.map((p) => {
      const [x, y] = this.toScreen(p.x, p.y);
      return { x, y, delay: at + (depth.get(p.y * cols + p.x) ?? 0) * step, kind: p.kind };
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
      event: { chain: st.chain, count: st.broken.length, broken, crystals, at, cx: sumX / n, cy: sumY / n },
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
    for (const b of this.blocks) if (b) drawBlock(g, b, this.clock);
    for (const b of this.dying) drawBlock(g, b, this.clock);
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
    g.globalAlpha = 0.46 + 0.16 * Math.sin(this.clock * 3.3);
    for (const p of cells) {
      const blk = this.blocks[p.y * cols + p.x];
      if (blk) drawBlock(g, blk, this.clock);
    }
    g.restore();
  }

  private drawPreview(g: CanvasRenderingContext2D): void {
    const pv = this.preview;
    if (!pv || !this.anchor || (this.busy > 0 && !this.fever)) return;
    this.drawBreakArea(g, pv.all, this.anchor, this.offsets, pv.all.length < this.minBreak);
  }

  /**
   * 부서질 자리 표시(게임 미리보기와 게임 방법 그림이 함께 쓴다):
   * 밖은 어둡게, 이어져 함께 부서질 칸은 색 덩어리마다 제 색 윤곽선만, 도장 칸은 제 색을 밝게 + 빛줄기·별빛.
   * weak(너무 작아 안 찍히는 자리)면 흐린 회색 점선만.
   */
  drawBreakArea(g: CanvasRenderingContext2D, all: readonly Cell[], anchor: Cell, offsets: readonly Cell[], weak: boolean): void {
    const { cols, rows } = this.model;
    const inside = new Set(all.map((p) => p.y * cols + p.x));
    const has = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && inside.has(y * cols + x);

    // 너무 작은 자리: 빛나지 않고, 흐린 회색 점선 윤곽만
    g.fillStyle = SKIN.dim;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!inside.has(y * cols + x)) g.fillRect(x * CELL, y * CELL, CELL, CELL);
    if (weak) {
      g.save();
      g.lineCap = "square";
      g.setLineDash([10, 8]);
      g.lineWidth = 3;
      g.strokeStyle = "rgba(160,160,185,0.6)";
      g.beginPath();
      for (const p of all) {
        const x = p.x * CELL, y = p.y * CELL;
        if (!has(p.x, p.y - 1)) seg(g, x, y, x + CELL, y);
        if (!has(p.x, p.y + 1)) seg(g, x, y + CELL, x + CELL, y + CELL);
        if (!has(p.x - 1, p.y)) seg(g, x, y, x, y + CELL);
        if (!has(p.x + 1, p.y)) seg(g, x + CELL, y, x + CELL, y + CELL);
      }
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 3;
      g.strokeStyle = "rgba(255,255,255,0.3)";
      for (const o of offsets) {
        const x = anchor.x + o.x, y = anchor.y + o.y;
        if (!this.model.inBounds(x, y)) continue;
        roundRect(g, x * CELL + 8, y * CELL + 8, CELL - 16, CELL - 16, 10);
        g.stroke();
      }
      g.restore();
      return;
    }
    // 이어져서 함께 부서질 칸은 빛내지 않는다(도장 칸이 묻히지 않게): 색 윤곽선만
    // 윤곽: 색 덩어리마다 그 색의 선(같은 색끼리만 한 덩어리로 묶는다)
    const colorAt = (x: number, y: number) => this.blocks[y * cols + x]?.color ?? -1;
    const same = (x: number, y: number, c: number) => has(x, y) && colorAt(x, y) === c;
    const edgesOf = (c: number) => {
      for (const p of all) {
        if (colorAt(p.x, p.y) !== c) continue;
        const x = p.x * CELL, y = p.y * CELL;
        if (!same(p.x, p.y - 1, c)) seg(g, x, y, x + CELL, y);
        if (!same(p.x, p.y + 1, c)) seg(g, x, y + CELL, x + CELL, y + CELL);
        if (!same(p.x - 1, p.y, c)) seg(g, x, y, x, y + CELL);
        if (!same(p.x + 1, p.y, c)) seg(g, x + CELL, y, x + CELL, y + CELL);
      }
    };
    const groupColors = [...new Set(all.map((p) => colorAt(p.x, p.y)))].filter((c) => c >= 0);
    const pulse = 0.75 + 0.25 * Math.sin(this.clock * 3.3);
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const c of groupColors) {
      const col = blockColor(c);
      g.beginPath();
      edgesOf(c);
      g.lineWidth = 8;
      g.strokeStyle = "rgba(0,0,8,0.75)";
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = alpha(col, 0.85);
      g.stroke();
    }
    g.restore();
    // 찍는 칸: 흰 빛 칸 + 굵은 흰 테두리(보드 밖 칸은 흐린 점선)
    for (const o of offsets) {
      const x = anchor.x + o.x, y = anchor.y + o.y;
      const inBoard = this.model.inBounds(x, y);
      g.save();
      if (inBoard) {
        // 도장 칸: 흰색 대신 색 빛 칸 + 굵은 네온 테두리(숨쉬기에 맞춰 빛 번짐)
        const blk = this.blocks[y * cols + x];
        const own = blk ? blockColor(blk.color) : "#ff47d9";
        const mode = this.stampColor;
        const sc = mode === "own" || mode === "own-gold" ? own
          : mode === "own-light" ? mix(own, "#ffffff", 0.45)
          : mode === "complement" ? complement(own)
          : mode === "rainbow" ? hsl(((this.clock * 0.25 + (x + y) * 0.08) % 1) * 360, 95, 66)
          : mode;
        g.fillStyle = alpha(sc, 0.2);
        roundRect(g, x * CELL + 5, y * CELL + 5, CELL - 10, CELL - 10, 12);
        g.fill();
        g.shadowColor = sc;
        g.shadowBlur = 12 + 6 * pulse;
        g.lineWidth = 6;
        g.strokeStyle = mix(sc, "#ffffff", 0.15);
        g.stroke();
        // 반짝: 비스듬한 빛줄기가 도장 칸을 차례로 훑고(1.4초마다, 칸마다 조금씩 늦게), 작은 별빛이 자주 켜진다
        {
          const i = offsets.indexOf(o);
          const ph = (this.clock / 1.4 - i * 0.09) % 1, k = ph < 0 ? ph + 1 : ph;
          if (k < 0.35) {
            const t = k / 0.35, cx0 = x * CELL, cy0 = y * CELL;
            g.save();
            roundRect(g, cx0 + 5, cy0 + 5, CELL - 10, CELL - 10, 12);
            g.clip();
            g.globalCompositeOperation = "lighter";
            g.shadowBlur = 0;
            const bx = cx0 - CELL * 0.6 + CELL * 2.2 * t;
            const grad = g.createLinearGradient(bx - 22, cy0, bx + 22, cy0 + 10);
            grad.addColorStop(0, "rgba(255,255,255,0)");
            grad.addColorStop(0.5, alpha(mix(sc, "#ffffff", 0.6), 0.75 * Math.sin(t * Math.PI)));
            grad.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = grad;
            g.beginPath();
            g.moveTo(bx - 16, cy0); g.lineTo(bx + 30, cy0); g.lineTo(bx + 4, cy0 + CELL); g.lineTo(bx - 42, cy0 + CELL);
            g.fill();
            g.restore();
          }
          const tw = (this.clock / 0.9 + cellHash(x + 7, y + 3)) % 1;
          if (tw < 0.3) {
            const kk = Math.sin((tw / 0.3) * Math.PI), r = 11 * kk;
            const sx = x * CELL + CELL * 0.72, sy = y * CELL + CELL * 0.28;
            g.save();
            g.globalCompositeOperation = "lighter";
            g.globalAlpha = kk;
            g.fillStyle = mix(sc, "#ffffff", 0.7);
            g.shadowColor = sc;
            g.shadowBlur = 10;
            g.beginPath();
            g.moveTo(sx, sy - r);
            g.quadraticCurveTo(sx, sy, sx + r, sy);
            g.quadraticCurveTo(sx, sy, sx, sy + r);
            g.quadraticCurveTo(sx, sy, sx - r, sy);
            g.quadraticCurveTo(sx, sy, sx, sy - r);
            g.fill();
            g.restore();
          }
        }
        if (mode === "own-gold") {
          g.shadowColor = "#ffc733";
          g.shadowBlur = 8;
          g.lineWidth = 2.5;
          g.strokeStyle = "#ffd866";
          roundRect(g, x * CELL + 14, y * CELL + 14, CELL - 28, CELL - 28, 8);
          g.stroke();
        }
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

/** 반대색(색상환에서 180도) */
function complement(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
  return "#" + [r, gg, b].map((v) => (mx + mn - v).toString(16).padStart(2, "0")).join("");
}

function hsl(h: number, s: number, l: number): string {
  // #rrggbb로(mix·alpha가 #색만 받는다)
  const k = (n: number) => (n + h / 30) % 12, a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** 칸마다 정해진 0~1 값(반짝임이 칸마다 다른 때에 뜨게) */
function cellHash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
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

/** 블록 그림 하나를 (x, y)에 size 크기로 그린다(화면 위쪽 색 줄 같은 작은 표시용). */
export function drawBlockIcon(g: CanvasRenderingContext2D, color: number, x: number, y: number, size: number): void {
  const s = (size * (BLOCK + PAD * 2)) / BLOCK;
  g.drawImage(blockSprite(color), x - s / 2, y - s / 2, s, s);
}

/** 블록 색(크리스탈은 흰빛). 조각·빛 효과 색에 쓴다. */
export function blockColor(color: number): string {
  return color === CRYSTAL ? "#e8f6ff" : SKIN.blocks[color];
}

/**
 * 크리스탈: 어두운 칸 + 무지개빛으로 도는 테두리 + 가운데 흰 보석, 지울 방향 화살표(가로줄 ◀▶, 십자는 네 방향).
 * half: 칸 반지름, t: 시계(초)
 */
export function drawCrystal(g: CanvasRenderingContext2D, x: number, y: number, half: number, kind: number, t: number): void {
  g.save();
  g.translate(x, y);
  const hue = (t * 70) % 360;
  roundRect(g, -half, -half, half * 2, half * 2, half * 0.3);
  // 속: 무지개빛이 은은히 도는 유리
  const glass = g.createRadialGradient(0, -half * 0.3, half * 0.1, 0, 0, half * 1.2);
  glass.addColorStop(0, `hsla(${(hue + 180) % 360},90%,70%,0.45)`);
  glass.addColorStop(1, "rgba(20,18,42,0.95)");
  g.fillStyle = glass;
  g.fill();
  const edge = g.createLinearGradient(-half, -half, half, half);
  edge.addColorStop(0, `hsl(${hue},95%,72%)`);
  edge.addColorStop(0.5, `hsl(${(hue + 120) % 360},95%,72%)`);
  edge.addColorStop(1, `hsl(${(hue + 240) % 360},95%,72%)`);
  g.shadowColor = `hsla(${hue},95%,75%,0.8)`;
  g.shadowBlur = 14;
  g.lineWidth = half * 0.14;
  g.strokeStyle = edge;
  g.stroke();
  g.shadowBlur = 0;
  // 가운데 보석(마름모, 위쪽이 밝게)
  const r = half * 0.55;
  const gem = g.createLinearGradient(0, -r, 0, r);
  gem.addColorStop(0, "#ffffff");
  gem.addColorStop(1, `hsl(${(hue + 60) % 360},80%,78%)`);
  g.fillStyle = gem;
  g.shadowColor = "rgba(255,255,255,0.9)";
  g.shadowBlur = 8 + 4 * Math.sin(t * 5);
  g.beginPath();
  g.moveTo(0, -r);
  g.lineTo(r * 0.8, 0);
  g.lineTo(0, r);
  g.lineTo(-r * 0.8, 0);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  // 지울 방향 화살표
  g.fillStyle = "rgba(255,255,255,0.9)";
  // 가로줄: 좌우, 세로줄: 위아래, 십자: 네 방향
  const angles = kind === CRYSTAL_CROSS ? [0, 1, 2, 3] : kind === CRYSTAL_COL ? [1, 3] : [0, 2];
  for (const q of angles) {
    g.save();
    g.rotate((q * Math.PI) / 2);
    const ax = half * 0.62 + Math.sin(t * 4) * half * 0.05;
    g.beginPath();
    g.moveTo(ax + half * 0.26, 0);
    g.lineTo(ax, -half * 0.2);
    g.lineTo(ax, half * 0.2);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.restore();
}

function drawBlock(g: CanvasRenderingContext2D, b: BlockEnt, t: number): void {
  if (b.sx <= 0.001) return;
  g.save();
  g.translate(b.x, b.y);
  g.scale(b.sx, b.sy);
  if (b.crystal) drawCrystal(g, 0, 0, BLOCK / 2 - 3, b.crystal, t);
  else {
    const s = BLOCK + PAD * 2;
    g.drawImage(blockSprite(b.color), -s / 2, -s / 2, s, s);
  }
  if (b.white > 0) {
    g.globalAlpha = b.white * 0.8;
    g.fillStyle = "#fff";
    roundRect(g, -BLOCK / 2 + 3, -BLOCK / 2 + 3, BLOCK - 6, BLOCK - 6, 12);
    g.fill();
  }
  g.restore();
}
