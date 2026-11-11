import { BoardModel } from "../core/board-model.ts";
import { bestMove } from "../core/bot.ts";
import { Grade, gradeFor } from "../core/game-rules.ts";
import { GRADE_KEYS, t } from "./i18n.ts";
import type { Cell } from "../core/shapes.ts";
import { alpha, font, mix, SKIN } from "./skin.ts";
import { ease, Tweens, type Seq } from "./tween.ts";

/** 보드 한 칸(보드 좌표 단위). 화면에서는 BOARD_SCALE 배로 그린다. */
export const CELL = 80;
export const BLOCK = 72;
/** 파괴가 찍은 칸에서 같은 색을 따라 번지는 속도(한 칸 거리당 초)와 전체 상한 */
const WAVE_STEP = 0.028;
const WAVE_MAX = 0.2;

class BlockEnt {
  color: number;
  x: number;
  y: number;
  sx = 1;
  sy = 1;
  white = 0;
  seq: Seq | null = null;

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
  delay: number;
}

export interface BreakEvent {
  count: number;
  broken: Broken[];
  /** 화면 좌표 */
  ax: number;
  ay: number;
  waveTime: number;
}

export interface Preview {
  stamp: Cell[];
  all: Cell[];
  grade: Grade;
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
  /** 지금 모양으로 가능한 최대 파괴 수(판정 기준) */
  bestN = 0;
  fever = false;
  private blocks: (BlockEnt | null)[] = [];
  private dying: BlockEnt[] = [];
  private tweens = new Tweens();
  private feverT = 0;

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
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const b = new BlockEnt(this.model.get(x, y), (x + 0.5) * CELL, (y + 0.5) * CELL);
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
    this.bestN = cells.length > 0 ? bestMove(this.model, cells).count : 0;
    this.refreshPreview();
  }

  setAnchor(c: Cell | null): void {
    if (c?.x === this.anchor?.x && c?.y === this.anchor?.y) return;
    this.anchor = c;
    this.refreshPreview();
  }

  refreshPreview(): void {
    if (!this.anchor || this.offsets.length === 0) {
      this.preview = null;
      return;
    }
    const info = this.model.computeBreak(this.anchor.x, this.anchor.y, this.offsets);
    this.preview = { ...info, grade: gradeFor(info.all.length, this.bestN) };
  }

  /** 찍는다. 찍을 블록이 없으면 null. */
  placeAt(cx: number, cy: number): BreakEvent | null {
    const info = this.model.computeBreak(cx, cy, this.offsets);
    if (info.stamp.length === 0) return null;
    const { cols } = this.model;
    // 찍은 칸(거리 0)에서 같은 색 이웃을 따라 번지며 차례로 터진다.
    const depth = waveDepth(info.stamp, info.all, cols);
    let maxD = 0;
    for (const d of depth.values()) maxD = Math.max(maxD, d);
    const step = Math.min(WAVE_STEP, WAVE_MAX / Math.max(1, maxD));
    const broken: Broken[] = [];
    for (const p of info.all) {
      const i = p.y * cols + p.x;
      const b = this.blocks[i]!;
      const delay = (depth.get(i) ?? 0) * step;
      const [sx, sy] = this.toScreen(p.x, p.y);
      broken.push({ x: sx, y: sy, color: b.color, delay });
      this.pop(b, delay);
      this.blocks[i] = null;
    }
    const waveTime = maxD * step;

    const res = this.model.applyBreak(info.all, this.nextOffsets);
    const moving = res.moves.map((m) => {
      const b = this.blocks[m.from.y * cols + m.from.x]!;
      this.blocks[m.from.y * cols + m.from.x] = null;
      return { b, m };
    });
    for (const { b, m } of moving) {
      this.blocks[m.to.y * cols + m.to.x] = b;
      this.drop(b, m.to.y, m.to.y - m.from.y, waveTime);
    }
    for (const s of res.spawns) {
      const b = new BlockEnt(s.color, (s.to.x + 0.5) * CELL, (s.fromY + 0.5) * CELL);
      this.blocks[s.to.y * cols + s.to.x] = b;
      this.drop(b, s.to.y, s.to.y - s.fromY, waveTime);
    }
    const [ax, ay] = this.toScreen(cx, cy);
    return { count: info.all.length, broken, ax, ay, waveTime };
  }

  private pop(b: BlockEnt, delay: number): void {
    b.seq?.kill();
    this.dying.push(b);
    b.seq = this.tweens
      .add()
      .wait(delay)
      .to(0.03, (k) => {
        b.white = k;
        b.sx = b.sy = 1 + 0.18 * k;
      })
      .to(0.06, (k) => (b.sx = b.sy = 1.18 * (1 - k)), ease.inQuad)
      .call(() => (this.dying = this.dying.filter((d) => d !== b)));
  }

  private drop(b: BlockEnt, toRow: number, dist: number, delay: number): void {
    b.seq?.kill();
    b.sx = b.sy = 1;
    const y0 = b.y, y1 = (toRow + 0.5) * CELL;
    b.seq = this.tweens
      .add()
      .wait(delay) // 위 블록은 번지는 파괴가 끝난 뒤에 떨어진다
      .to(0.06 + 0.017 * dist, (k) => (b.y = y0 + (y1 - y0) * k), ease.inQuad)
      .to(0.04, (k) => {
        b.sx = 1 + 0.1 * k;
        b.sy = 1 - 0.12 * k;
      })
      .to(0.08, (k) => {
        b.sx = 1.1 - 0.1 * k;
        b.sy = 0.88 + 0.12 * k;
      }, ease.outBack);
  }

  update(dt: number): void {
    this.tweens.update(dt);
    if (this.fever) this.feverT += dt;
  }

  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.translate(this.ox, this.oy);
    g.scale(this.scale, this.scale);
    const w = this.width, h = this.height;
    // 판과 칸
    roundRect(g, -12, -12, w + 24, h + 24, 20);
    g.fillStyle = SKIN.boardBg;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = SKIN.boardBorder;
    g.stroke();
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
    g.fillStyle = SKIN.slot;
    for (let y = 0; y < this.model.rows; y++) {
      for (let x = 0; x < this.model.cols; x++) g.fillRect(x * CELL + 6, y * CELL + 6, CELL - 12, CELL - 12);
    }
    // 블록(보드 밖에서 떨어지는 블록은 잘라 낸다)
    g.save();
    g.beginPath();
    g.rect(-12, -12, w + 24, h + 24);
    g.clip();
    for (const b of this.blocks) if (b) drawBlock(g, b);
    for (const b of this.dying) drawBlock(g, b);
    g.restore();
    this.drawPreview(g);
    g.restore();
  }

  /** 미리보기: 판정 색 하나로 통일. 부서질 영역 바깥 윤곽 + "+N 판정" 알약, 찍는 칸은 얇은 흰 선. */
  private drawPreview(g: CanvasRenderingContext2D): void {
    const pv = this.preview;
    if (!pv || !this.anchor) return;
    const col = SKIN.grades[pv.grade];
    const { cols, rows } = this.model;
    const inside = new Set(pv.all.map((p) => p.y * cols + p.x));
    const has = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && inside.has(y * cols + x);

    g.fillStyle = SKIN.dim;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!inside.has(y * cols + x)) g.fillRect(x * CELL, y * CELL, CELL, CELL);
    g.fillStyle = alpha(col, 0.14);
    for (const p of pv.all) g.fillRect(p.x * CELL, p.y * CELL, CELL, CELL);

    g.lineCap = "square";
    for (const [w, c] of [[11, "rgba(0,0,8,0.85)"], [5, col]] as const) {
      g.lineWidth = w;
      g.strokeStyle = c;
      g.beginPath();
      for (const p of pv.all) {
        const x = p.x * CELL, y = p.y * CELL;
        if (!has(p.x, p.y - 1)) seg(g, x, y, x + CELL, y);
        if (!has(p.x, p.y + 1)) seg(g, x, y + CELL, x + CELL, y + CELL);
        if (!has(p.x - 1, p.y)) seg(g, x, y, x, y + CELL);
        if (!has(p.x + 1, p.y)) seg(g, x + CELL, y, x + CELL, y + CELL);
      }
      g.stroke();
    }
    g.lineWidth = 3;
    for (const o of this.offsets) {
      const x = this.anchor.x + o.x, y = this.anchor.y + o.y;
      g.strokeStyle = this.model.inBounds(x, y) ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)";
      g.strokeRect(x * CELL + 12, y * CELL + 12, CELL - 24, CELL - 24);
    }
    if (pv.all.length > 0) this.drawPill(g, pv, col);
  }

  private drawPill(g: CanvasRenderingContext2D, pv: Preview, col: string): void {
    const countText = t("POINTS_FMT", pv.all.length);
    const gradeText = t(GRADE_KEYS[pv.grade]);
    g.font = font(34);
    const cw = g.measureText(countText).width;
    g.font = font(28);
    const gw = g.measureText(gradeText).width;
    const w = cw + gw + 52, h = 54;
    let top = 99, bottom = -1, sumX = 0;
    for (const p of pv.all) {
      top = Math.min(top, p.y);
      bottom = Math.max(bottom, p.y);
      sumX += p.x;
    }
    let cx = (sumX / pv.all.length + 0.5) * CELL;
    cx = Math.min(Math.max(cx, w / 2), this.width - w / 2);
    let y = top * CELL - h - 8;
    if (top === 0) {
      y = (bottom + 1) * CELL + 8;
      if (bottom === this.model.rows - 1) y = this.anchor!.y * CELL - h / 2;
    }
    g.save();
    if (pv.grade === Grade.PERFECT) {
      g.shadowColor = alpha(col, 0.7);
      g.shadowBlur = 18;
    }
    roundRect(g, cx - w / 2, y, w, h, 27);
    g.fillStyle = "rgba(5,3,15,0.94)";
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 4;
    g.strokeStyle = col;
    g.stroke();
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    g.font = font(34);
    g.fillStyle = "#fff";
    const x0 = cx - w / 2 + 20;
    g.fillText(countText, x0, y + 39);
    g.font = font(28);
    g.fillStyle = col;
    g.fillText(gradeText, x0 + cw + 12, y + 37);
    g.restore();
  }
}

function seg(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
}

/** 찍은 칸들에서 시작하는 너비 우선 거리(부서질 칸끼리 상하좌우로만 이어짐). 키 = y*cols+x */
function waveDepth(stamp: Cell[], all: Cell[], cols: number): Map<number, number> {
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

function drawBlock(g: CanvasRenderingContext2D, b: BlockEnt): void {
  if (b.sx <= 0.001) return;
  const spr = blockSprite(b.color);
  const s = BLOCK + PAD * 2;
  g.save();
  g.translate(b.x, b.y);
  g.scale(b.sx, b.sy);
  g.drawImage(spr, -s / 2, -s / 2, s, s);
  if (b.white > 0) {
    g.globalAlpha = b.white * 0.8;
    g.fillStyle = "#fff";
    roundRect(g, -BLOCK / 2 + 3, -BLOCK / 2 + 3, BLOCK - 6, BLOCK - 6, 12);
    g.fill();
  }
  g.restore();
}
