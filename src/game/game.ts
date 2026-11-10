import { bestMove } from "../core/bot.ts";
import { GAME_TIME, GameRules, Grade, GRADE_NAMES, STAMP_COOLDOWN, tierFor, type BreakResult } from "../core/game-rules.ts";
import { ShapeQueue } from "../core/shape-queue.ts";
import type { Cell, Shape } from "../core/shapes.ts";
import { Sfx } from "./audio.ts";
import { BoardView, CELL, BLOCK, roundRect, type BreakEvent } from "./board-view.ts";
import { Fx } from "./fx.ts";
import { t } from "./i18n.ts";
import { alpha, font, mix, SKIN } from "./skin.ts";
import { ease, Tweens } from "./tween.ts";

export const W = 720;
export const H = 1280;
const COLS = 8, ROWS = 9, COLORS = 5;
const BOARD_X = 24, BOARD_Y = 400, BOARD_SCALE = 0.8;
const SIDE_X = 552, SIDE_W = 148;
const NEXT_COUNT = 4;

type State = "title" | "play" | "result";

interface Rect { x: number; y: number; w: number; h: number }

/** 오른쪽 세로 줄의 모양 칸(HOLD / NOW / NEXT) */
interface Slot extends Rect {
  title: string;
  cellPx: number;
  cells: Cell[];
  highlight: boolean;
  dimmed: boolean;
  cooldown: number;
  /** 미끄러져 들어오는 중의 남은 위치 차이 */
  oy: number;
  alpha: number;
  hint?: string;
}

interface FloatText {
  lines: { text: string; size: number; color: string }[];
  x: number;
  y: number;
  scale: number;
  alpha: number;
  dx: number;
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export class Game {
  state: State = "title";
  readonly rules = new GameRules();
  readonly board = new BoardView(BOARD_X, BOARD_Y, BOARD_SCALE);
  readonly fx = new Fx();
  readonly sfx = new Sfx();
  private tweens = new Tweens();
  private queue = new ShapeQueue();
  private current!: Shape;
  private held: Shape | null = null;
  private holdUsed = false;
  private stampLock = 0;
  private best = 0;
  private trauma = 0;
  private hitstop = 0;
  private flash = { color: "#ffffff", a: 0 };
  private inFever = false;
  private bgMix = 0;
  private perfectStreak = 0;
  private floats: FloatText[] = [];
  private gradeFloat: FloatText | null = null;
  private comboText = { text: "", color: SKIN.text, scale: 1, alpha: 0 };
  private timePulse = 1;
  private lastTick = -1;
  private pressing = false;
  private resultReadyAt = 0;
  private newBest = false;
  private clock = 0;
  private autoplay = false;
  private autoTimer = 0;

  private hold: Slot;
  private now: Slot;
  private nexts: Slot[] = [];

  /** 디버그: 시작 시간(초). 결과 화면을 빨리 보려고 쓴다. */
  private startTime = GAME_TIME;

  constructor(opts: { autoplay?: boolean; seed?: number; time?: number } = {}) {
    this.autoplay = !!opts.autoplay;
    if (opts.time) this.startTime = opts.time;
    try {
      this.best = Number(localStorage.getItem("ss.best") ?? 0) || 0;
    } catch {
      this.best = 0;
    }
    let y = BOARD_Y;
    this.hold = this.slot("HOLD", y, 118, 20, false);
    this.hold.hint = t("HOLD_HINT");
    y += 128;
    this.now = this.slot("NOW", y, 170, 30, true);
    y += 178 + 28;
    for (let i = 0; i < NEXT_COUNT; i++) {
      const h = i === 0 ? 104 : 56;
      const s = this.slot("", y, h, i === 0 ? 20 : 11, false);
      s.alpha = 1 - 0.15 * i;
      this.nexts.push(s);
      y += h + 6;
    }
    this.board.setup(COLS, ROWS, COLORS, opts.seed ?? 0);
    if (this.autoplay) this.start();
  }

  private slot(title: string, y: number, h: number, cellPx: number, highlight: boolean): Slot {
    return { x: SIDE_X, y, w: SIDE_W, h, title, cellPx, cells: [], highlight, dimmed: false, cooldown: 0, oy: 0, alpha: 1 };
  }

  // ---------------------------------------------------------------- 흐름

  start(): void {
    this.rules.reset();
    this.rules.timeLeft = this.startTime;
    this.board.setup(COLS, ROWS, COLORS);
    this.queue = new ShapeQueue();
    this.held = null;
    this.holdUsed = false;
    this.stampLock = 0;
    this.perfectStreak = 0;
    this.inFever = false;
    this.board.fever = false;
    this.comboText.alpha = 0;
    this.lastTick = -1;
    this.current = this.queue.pop();
    this.refreshPieces();
    this.state = "play";
    this.sfx.play("start");
  }

  private end(): void {
    this.state = "result";
    this.board.setAnchor(null);
    this.breakCombo();
    this.sfx.play("end");
    this.sfx.play("big", 0.8);
    this.trauma = Math.min(1, this.trauma + 0.5);
    this.newBest = this.rules.score > this.best && !this.autoplay;
    if (this.newBest) {
      this.best = this.rules.score;
      try {
        localStorage.setItem("ss.best", String(this.best));
      } catch {
        /* 저장 못 해도 진행 */
      }
    }
    this.resultReadyAt = this.clock + 0.9;
  }

  private refreshPieces(): void {
    this.board.setPiece(this.current.cells);
    this.board.nextOffsets = this.queue.peek(1)[0].cells;
    this.now.cells = this.current.cells;
    const nexts = this.queue.peek(NEXT_COUNT);
    this.nexts.forEach((s, i) => (s.cells = nexts[i].cells));
    this.hold.dimmed = this.holdUsed;
    this.hold.cells = this.held?.cells ?? [];
  }

  private doHold(): void {
    if (this.state !== "play" || this.holdUsed) return;
    const fromQueue = !this.held;
    if (fromQueue) {
      this.held = this.current;
      this.current = this.queue.pop();
    } else {
      [this.held, this.current] = [this.current, this.held!];
    }
    this.holdUsed = true;
    this.sfx.play("hold");
    this.refreshPieces();
    if (fromQueue) this.slideQueue();
    else this.slideIn(this.now, -130);
    this.slideIn(this.hold, 130);
  }

  /** 큐가 한 칸 당겨질 때: 모든 모양이 아래 칸 자리에서 위로 미끄러져 올라온다. */
  private slideQueue(): void {
    this.slideIn(this.now, this.nexts[0].y - this.now.y);
    this.nexts.forEach((s, i) => this.slideIn(s, i === NEXT_COUNT - 1 ? 70 : this.nexts[i + 1].y - s.y));
  }

  private slideIn(s: Slot, dy: number): void {
    s.oy = dy;
    this.tweens.add().to(0.22, (k) => (s.oy = dy * (1 - k)), ease.outCubic);
  }

  // ---------------------------------------------------------------- 찍기

  private tryPlace(c: Cell): void {
    if (this.state !== "play") return;
    if (this.stampLock > 0) {
      this.onBlocked();
      return;
    }
    const bestN = this.board.bestN;
    const ev = this.board.placeAt(c.x, c.y);
    if (ev) this.onBroke(ev, bestN);
  }

  private onBroke(ev: BreakEvent, bestN: number): void {
    const r = this.rules.registerBreak(ev.count, bestN);
    this.stampLock = STAMP_COOLDOWN;
    this.perfectStreak = r.grade === Grade.PERFECT ? this.perfectStreak + 1 : 0;
    this.juice(ev, r);
    this.gradeText(r, ev);
    if (r.timeDelta > 0) {
      this.float([{ text: `+${r.timeDelta}s`, size: 44, color: "#66ff99" }], 610, 250);
      this.sfx.play("bonus");
      this.timePulse = 1.25;
    } else if (r.timeDelta < 0) {
      this.float([{ text: `${r.timeDelta}s`, size: 44, color: "#ff5959" }], 610, 250);
    }
    if (r.grade === Grade.MISS) this.breakCombo();
    this.current = this.queue.pop();
    this.holdUsed = false;
    this.refreshPieces();
    this.slideQueue();
  }

  /** 쿨다운 중에 찍으려 하면 NOW 칸을 살짝 흔들어 "아직"이라고 알려 준다. */
  private onBlocked(): void {
    this.sfx.play("tick", 0.6, -8);
    const s = this.now;
    this.tweens.add().to(0.12, (k) => (s.oy = Math.sin(k * Math.PI * 3) * 6 * (1 - k)));
  }

  private breakCombo(): void {
    this.tweens.add().to(0.25, (k) => (this.comboText.alpha = 1 - k));
    if (this.inFever) {
      this.inFever = false;
      this.board.fever = false;
    }
  }

  // ---------------------------------------------------------------- 타격감

  private juice(ev: BreakEvent, r: BreakResult): void {
    const n = ev.count, tier = r.tier;
    const power = 280 + tier * 110;
    let amount = 4 + tier * 2;
    if (ev.broken.length > 35) amount = Math.max(2, amount - 2);
    for (const b of ev.broken) {
      const col = SKIN.blocks[b.color];
      // 번지는 파괴에 맞춰 블록마다 차례로 터뜨린다
      this.tweens.add().wait(b.delay).call(() => {
        this.fx.burst(b.x, b.y, col, amount, power);
        this.fx.flash(b.x, b.y, BLOCK * BOARD_SCALE, mix(col, "#ffffff", 0.75));
      });
    }
    this.fx.ring(ev.ax, ev.ay, 70 + n * 6 + tier * 40, SKIN.ring);

    if (r.grade === Grade.MISS) {
      // 실수는 약하고 둔탁하게: 짧은 흔들림 + 낮은 소리 + 붉은 섬광
      this.trauma = Math.min(1, this.trauma + 0.25);
      this.sfx.play("break", 0.7, -6);
      this.sfx.play("miss");
      this.flashScreen("#ff1a1a", 0.18);
      return;
    }
    const perfect = r.grade === Grade.PERFECT;
    this.trauma = Math.min(1, this.trauma + 0.12 + n * 0.012 + tier * 0.08 + (perfect ? 0.1 : 0));
    if (n >= 12 || tier >= 1 || perfect) this.hitstop = 0.025 + Math.min(n, 40) * 0.0012 + tier * 0.015;
    this.sfx.play("break", (0.9 + Math.random() * 0.2) * (n >= 15 ? 0.85 : 1));
    this.sfx.play("pop", 1 + Math.min(this.rules.combo - 1, 24) * 0.055, -4);
    if (perfect) {
      // PERFECT 보상: 금빛 별 + 겹 링 + 연속 PERFECT마다 한 음씩 올라가는 차임
      const gold = SKIN.grades[Grade.PERFECT];
      const s = Math.min(this.perfectStreak, 8);
      this.fx.sparkle(ev.ax, ev.ay, gold, 10 + s * 3, 420 + s * 40);
      this.fx.ring(ev.ax, ev.ay, 110 + n * 7 + s * 12, gold);
      const pitch = Math.pow(2, ((s - 1) * 2) / 12);
      this.sfx.play("perfect", pitch, -3);
      this.sfx.play("sparkle", 0.95 + Math.random() * 0.13, -8);
      if (s >= 3) this.sfx.play("perfect", pitch * 1.5, -10);
      if (tier < 2) this.flashScreen("#ffffff", 0.06 + s * 0.015);
    }
    if (n >= 15) this.sfx.play("big");
    if (tier >= 2) this.flashScreen("#ffffff", 0.1 + (tier - 2) * 0.08);
    if (tier >= 3 && !this.inFever) this.enterFever();
    this.comboPop(tier);
  }

  private comboPop(tier: number): void {
    if (this.rules.combo < 2) {
      this.comboText.alpha = 0;
      return;
    }
    const c = this.comboText;
    c.text = `${this.rules.combo} COMBO`;
    c.color = SKIN.tiers[tier];
    c.alpha = 1;
    const from = 1.3 + tier * 0.15;
    this.tweens.add().to(0.2, (k) => (c.scale = from + (1 - from) * k), ease.outBack);
  }

  private enterFever(): void {
    this.inFever = true;
    this.board.fever = true;
    this.sfx.play("fever");
    this.sfx.play("big", 1.2, -2);
    this.flashScreen("#ffffff", 0.5);
    this.trauma = Math.min(1, this.trauma + 0.35);
    const cx = BOARD_X + (COLS * CELL * BOARD_SCALE) / 2, cy = BOARD_Y + (ROWS * CELL * BOARD_SCALE) / 2;
    this.fx.ring(cx, cy, 520, SKIN.tiers[3]);
    this.fx.ring(cx, cy, 340, "rgba(255,255,255,0.8)");
    this.float([{ text: "FEVER!", size: 84, color: SKIN.tiers[3] }], W / 2, 640, true);
  }

  private flashScreen(color: string, a: number): void {
    this.flash.color = color;
    this.flash.a = a;
  }

  /** 판정 글자 묶음: [판정] / [+점수] / [N개 / 최고 M개(PERFECT 아닐 때)]가 한 덩어리로 움직인다. */
  private gradeText(r: BreakResult, ev: BreakEvent): void {
    let size = [62, 50, 40, 44][r.grade];
    let text: string = GRADE_NAMES[r.grade];
    if (r.grade === Grade.PERFECT) {
      size += Math.min(this.perfectStreak - 1, 4) * 3;
      text += this.perfectStreak >= 2 ? ` x${this.perfectStreak}!` : "!";
    }
    const lines = [
      { text, size, color: SKIN.grades[r.grade] },
      { text: `+${r.points}`, size: 34, color: SKIN.tiers[r.tier] },
    ];
    if (r.grade !== Grade.PERFECT && r.bestN > 0) lines.push({ text: t("GRADE_SUB", ev.count, r.bestN), size: 26, color: SKIN.text });
    if (this.gradeFloat) this.gradeFloat.alpha = 0;
    const f = this.float(lines, Math.min(Math.max(ev.ax, 230), 490), ev.ay - 10, false, r.grade);
    this.gradeFloat = f;
  }

  /** 떠오르는 글자. kind: 판정마다 움직임이 다르다(PERFECT 쾅 / GREAT 튀어나옴 / MISS 흔들리다 떨어짐). */
  private float(lines: FloatText["lines"], x: number, y: number, big = false, kind: number = Grade.GOOD): FloatText {
    const f: FloatText = { lines, x, y, scale: 1, alpha: 1, dx: 0 };
    this.floats.push(f);
    const tw = this.tweens.add();
    if (big || kind === Grade.PERFECT) {
      f.scale = 1.6;
      f.alpha = 0;
      tw.to(0.12, (k) => {
        f.scale = 1.6 - 0.6 * k;
        f.alpha = Math.min(1, k * 2);
      }, ease.inQuad)
        .wait(big ? 0.5 : 0.28)
        .to(0.45, (k) => {
          f.y = y - 70 * k;
          f.alpha = 1 - k;
        }, ease.outCubic);
    } else if (kind === Grade.GREAT) {
      f.scale = 1.6;
      tw.to(0.18, (k) => (f.scale = 1.6 - 0.6 * k), ease.outBack)
        .wait(0.12)
        .to(0.5, (k) => {
          f.y = y - 80 * k;
          f.alpha = 1 - Math.max(0, (k - 0.2) / 0.8);
        }, ease.outCubic);
    } else if (kind === Grade.MISS) {
      tw.to(0.2, (k) => (f.dx = Math.sin(k * Math.PI * 5) * 12 * (1 - k)))
        .to(0.45, (k) => {
          f.y = y + 50 * k;
          f.alpha = 1 - k;
        }, ease.inQuad);
    } else {
      tw.to(0.7, (k) => {
        f.y = y - 90 * k;
        f.alpha = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
      }, ease.outCubic);
    }
    tw.call(() => (this.floats = this.floats.filter((o) => o !== f)));
    return f;
  }

  // ---------------------------------------------------------------- 입력

  pointerDown(x: number, y: number, button: number): void {
    this.sfx.unlock();
    if (this.state === "title") {
      this.start();
      return;
    }
    if (this.state === "result") {
      if (this.clock >= this.resultReadyAt) this.start();
      return;
    }
    if (button === 2 || inRect(this.hold, x, y)) {
      this.doHold();
      return;
    }
    this.pressing = true;
    this.board.setAnchor(this.board.cellAt(x, y));
  }

  pointerMove(x: number, y: number, touch: boolean): void {
    if (this.state !== "play" || (touch && !this.pressing)) return;
    this.board.setAnchor(this.board.cellAt(x, y));
  }

  pointerUp(x: number, y: number, touch: boolean): void {
    if (!this.pressing) return;
    this.pressing = false;
    const c = this.board.cellAt(x, y);
    if (c) this.tryPlace(c);
    // 터치는 손가락을 떼면 미리보기를 숨긴다(마우스는 커서 위치에 계속 표시)
    if (touch) this.board.setAnchor(null);
    else {
      this.board.setAnchor(null);
      this.board.setAnchor(c);
    }
  }

  key(code: string): void {
    this.sfx.unlock();
    if (["Space", "ShiftLeft", "ShiftRight", "KeyC"].includes(code)) {
      if (this.state === "play") this.doHold();
      else if (this.state === "title" || (this.state === "result" && this.clock >= this.resultReadyAt)) this.start();
    } else if (code === "Enter" && this.state !== "play") {
      if (this.state === "title" || this.clock >= this.resultReadyAt) this.start();
    }
  }

  // ---------------------------------------------------------------- 프레임

  update(realDt: number): void {
    this.clock += realDt;
    let dt = realDt;
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      dt = realDt * 0.05;
    }
    this.trauma = Math.max(0, this.trauma - realDt * 1.8);
    this.flash.a = Math.max(0, this.flash.a - realDt * (this.flash.a / 0.25 + 0.5));
    this.timePulse += (1 - this.timePulse) * Math.min(1, realDt * 10);
    this.bgMix += ((this.inFever ? 1 : 0) - this.bgMix) * Math.min(1, realDt * 6);
    this.tweens.update(dt);
    this.board.update(dt);
    this.fx.update(dt);

    if (this.state !== "play") return;
    if (this.rules.tick(dt)) this.breakCombo();
    if (this.stampLock > 0) this.stampLock = Math.max(0, this.stampLock - dt);
    this.now.cooldown = this.stampLock / STAMP_COOLDOWN;

    const sec = Math.ceil(this.rules.timeLeft);
    if (this.rules.timeLeft <= 10 && this.rules.timeLeft > 0 && sec !== this.lastTick) {
      this.lastTick = sec;
      this.sfx.play("tick");
    }
    if (this.autoplay) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0 && this.stampLock <= 0) {
        this.autoTimer = 0.35 + Math.random() * 0.55;
        const mv = bestMove(this.board.model, this.current.cells);
        this.board.setAnchor({ x: mv.x, y: mv.y });
        this.tryPlace({ x: mv.x, y: mv.y });
      }
    }
    if (this.rules.isOver()) {
      this.rules.timeLeft = 0;
      this.end();
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    g.fillStyle = mix(SKIN.bg, SKIN.bgFever, this.bgMix);
    g.fillRect(0, 0, W, H);
    const s = 26 * this.trauma * this.trauma;
    g.save();
    g.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
    this.board.draw(g);
    this.fx.draw(g);
    g.restore();
    this.drawHud(g);
    this.drawSlots(g);
    for (const f of this.floats) this.drawFloat(g, f);
    if (this.flash.a > 0.001) {
      g.globalAlpha = this.flash.a;
      g.fillStyle = this.flash.color;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (this.state === "title") this.drawTitle(g);
    else if (this.state === "result" && this.clock >= this.resultReadyAt - 0.4) this.drawResult(g);
  }

  private drawHud(g: CanvasRenderingContext2D): void {
    const r = this.rules;
    text(g, t("SCORE"), 40, 50, 22, alpha(SKIN.score, 0.7), "left");
    text(g, String(r.score), 40, 112, 56, SKIN.score, "left", SKIN.scoreGlow);
    text(g, t("BEST_FMT", Math.max(this.best, 0)), 40, 150, 20, "rgba(235,250,255,0.55)", "left");
    text(g, t("TIME"), 680, 50, 22, alpha(SKIN.timeText, 0.7), "right");
    // 남은 시간 60·30·10초 기준: 숫자 노랑→주황→빨강, 막대 하늘→보라→빨강
    const tl = Math.max(0, r.timeLeft);
    const danger = tl >= 60 ? 0 : tl >= 30 ? (60 - tl) / 60 : tl >= 10 ? 0.5 + (30 - tl) / 40 : 1;
    const timeCol = danger < 0.5 ? mix(SKIN.timeText, "#ff8c1a", danger * 2) : mix("#ff8c1a", SKIN.warn, (danger - 0.5) * 2);
    const barCol = danger < 0.5 ? mix(SKIN.time, "#b866ff", danger * 2) : mix("#b866ff", SKIN.warn, (danger - 0.5) * 2);
    g.save();
    g.translate(680, 92);
    g.scale(this.timePulse, this.timePulse);
    text(g, tl.toFixed(1), 0, 20, 56, timeCol, "right", SKIN.timeGlow);
    g.restore();
    if (this.state === "play") text(g, t("TARGET_FMT", r.timeTarget()), 680, 150, 20, "rgba(102,255,153,0.8)", "right");
    g.fillStyle = SKIN.track;
    g.fillRect(40, 168, 640, 12);
    g.fillStyle = barCol;
    g.fillRect(40, 168, 640 * Math.min(1, tl / GAME_TIME), 12);

    // 콤보 글자와 콤보 막대(보드 위 빈 공간)
    const c = this.comboText;
    if (c.alpha > 0.01 && c.text) {
      g.save();
      g.globalAlpha = c.alpha;
      g.translate(W / 2, BOARD_Y - 62);
      g.scale(c.scale, c.scale);
      text(g, c.text, 0, 18, 50, c.color, "center", alpha(c.color === SKIN.text ? "#40d9ff" : c.color, 0.6));
      g.restore();
      const k = r.combo > 0 ? Math.min(1, r.comboTimer / r.comboWindow) : 0;
      g.fillStyle = SKIN.tiers[tierFor(r.combo)];
      g.globalAlpha = c.alpha;
      g.fillRect(W / 2 - 160 * k, BOARD_Y - 28, 320 * k, 6);
      g.globalAlpha = 1;
    }
    text(g, t("FOOTER"), W / 2, 1252, 17, "rgba(235,250,255,0.35)", "center");
  }

  private drawSlots(g: CanvasRenderingContext2D): void {
    for (const s of [this.hold, this.now, ...this.nexts]) {
      g.save();
      g.globalAlpha = s.alpha;
      roundRect(g, s.x, s.y, s.w, s.h, 18);
      g.fillStyle = s.highlight ? SKIN.panelHi : SKIN.panel;
      g.fill();
      g.lineWidth = s.highlight ? 3 : 2;
      g.strokeStyle = s.highlight ? SKIN.panelBorderHi : SKIN.panelBorder;
      g.stroke();
      let top = 0;
      if (s.title) {
        text(g, t(s.title as "HOLD" | "NOW"), s.x + 14, s.y + 30, s.title === "HOLD" ? 18 : 20, "rgba(235,250,255,0.55)", "left");
        top = 30;
      }
      if (s.hint && s.cells.length === 0) text(g, s.hint, s.x + s.w / 2, s.y + s.h - 16, 14, "rgba(235,250,255,0.4)", "center");
      g.beginPath();
      g.rect(s.x, s.y, s.w, s.h);
      g.clip();
      this.drawPiece(g, s, top);
      if (s.cooldown > 0) {
        const w = (s.w - 40) * s.cooldown;
        g.fillStyle = "rgba(255,255,255,0.6)";
        g.fillRect(s.x + (s.w - w) / 2, s.y + s.h - 18, w, 6);
      }
      g.restore();
    }
    text(g, `▲ ${t("NEXT")}`, SIDE_X + 10, this.nexts[0].y - 8, 18, "rgba(235,250,255,0.55)", "left");
  }

  private drawPiece(g: CanvasRenderingContext2D, s: Slot, top: number): void {
    if (s.cells.length === 0) return;
    let mnx = 99, mny = 99, mxx = -99, mxy = -99;
    for (const c of s.cells) {
      mnx = Math.min(mnx, c.x);
      mny = Math.min(mny, c.y);
      mxx = Math.max(mxx, c.x);
      mxy = Math.max(mxy, c.y);
    }
    const p = s.cellPx;
    const dw = (mxx - mnx + 1) * p, dh = (mxy - mny + 1) * p;
    const ox = s.x + (s.w - dw) / 2, oy = s.y + top + (s.h - top - dh) / 2 + s.oy;
    const inset = Math.max(2, p * 0.08);
    const dim = s.dimmed || s.cooldown > 0;
    g.fillStyle = dim ? SKIN.pieceDim : SKIN.piece;
    if (!dim) {
      g.shadowColor = alpha(SKIN.piece, 0.7);
      g.shadowBlur = 10;
    }
    for (const c of s.cells) g.fillRect(ox + (c.x - mnx) * p + inset, oy + (c.y - mny) * p + inset, p - inset * 2, p - inset * 2);
    g.shadowBlur = 0;
  }

  private drawFloat(g: CanvasRenderingContext2D, f: FloatText): void {
    if (f.alpha <= 0.01) return;
    // 긴 글자(PERFECT x12! 등)가 화면 밖으로 나가지 않게 가로 위치를 안쪽으로 당긴다.
    let half = 0;
    for (const l of f.lines) {
      g.font = font(l.size);
      half = Math.max(half, (g.measureText(l.text).width / 2 + l.size * 0.2) * f.scale);
    }
    const x = half * 2 >= W - 20 ? W / 2 : Math.min(Math.max(f.x + f.dx, half + 10), W - half - 10);
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, f.alpha));
    g.translate(x, f.y);
    g.scale(f.scale, f.scale);
    let y = 0;
    for (const [i, l] of f.lines.entries()) {
      if (i > 0) y += l.size * 1.25;
      outlined(g, l.text, 0, y + l.size * 0.35, l.size, l.color);
    }
    g.restore();
  }

  private drawTitle(g: CanvasRenderingContext2D): void {
    g.fillStyle = "rgba(5,2,13,0.86)";
    g.fillRect(0, 0, W, H);
    text(g, "SHATTER", W / 2, 300, 104, SKIN.timeText, "center", SKIN.timeGlow);
    text(g, "STAMP", W / 2, 430, 104, SKIN.score, "center", SKIN.scoreGlow);
    text(g, t("SUBTITLE"), W / 2, 510, 26, "rgba(235,250,255,0.7)", "center");
    if (this.best > 0) text(g, t("BEST_FMT", this.best), W / 2, 570, 30, SKIN.accent, "center");
    g.globalAlpha = 0.55 + 0.45 * Math.sin(this.clock * 5);
    text(g, t("TAP_START"), W / 2, 820, 40, SKIN.text, "center", "rgba(64,217,255,0.6)");
    g.globalAlpha = 1;
  }

  private drawResult(g: CanvasRenderingContext2D): void {
    const k = Math.min(1, (this.clock - (this.resultReadyAt - 0.4)) / 0.3);
    g.globalAlpha = k;
    g.fillStyle = "rgba(5,2,13,0.86)";
    g.fillRect(0, 0, W, H);
    const r = this.rules;
    text(g, t("TIME_UP"), W / 2, 250, 70, SKIN.accent, "center", "rgba(64,217,255,0.5)");
    text(g, t("SCORE"), W / 2, 330, 28, "rgba(235,250,255,0.55)", "center");
    text(g, String(r.score), W / 2, 440, 92, SKIN.score, "center", SKIN.scoreGlow);
    text(g, this.newBest ? t("NEW_BEST") : t("BEST_FMT", this.best), W / 2, 510, 32, SKIN.timeText, "center");
    const gc = r.gradeCounts;
    const rows: [string, string][] = [
      [t("R_MAX_COMBO"), String(r.maxCombo)],
      ["PERFECT / GREAT / GOOD / MISS", `${gc[0]} / ${gc[1]} / ${gc[2]} / ${gc[3]}`],
      [t("R_TIME"), t("SEC_FMT", Math.round(r.bonusTimeTotal))],
      [t("R_BIGGEST"), String(r.biggest)],
    ];
    rows.forEach(([a, b], i) => {
      text(g, a, W / 2, 600 + i * 70, 22, "rgba(235,250,255,0.55)", "center");
      text(g, b, W / 2, 634 + i * 70, 30, SKIN.text, "center");
    });
    if (this.clock >= this.resultReadyAt) {
      g.globalAlpha = k * (0.55 + 0.45 * Math.sin(this.clock * 5));
      text(g, t("TAP_RETRY"), W / 2, 1000, 38, SKIN.text, "center", "rgba(64,217,255,0.6)");
    }
    g.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- 글자 도우미

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign, glow?: string): void {
  g.font = font(size);
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = size * 0.35;
  }
  g.fillStyle = color;
  g.fillText(s, x, y);
  g.shadowBlur = 0;
}

/** 보드 위에 잠깐 뜨는 글자: 블록 색에 묻히지 않게 굵고 어두운 테두리 + 그림자 */
function outlined(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string): void {
  g.font = font(size);
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.lineJoin = "round";
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowOffsetY = 3;
  g.lineWidth = Math.max(8, size / 4);
  g.strokeStyle = "rgba(5,3,15,0.96)";
  g.strokeText(s, x, y);
  g.shadowColor = "transparent";
  g.shadowOffsetY = 0;
  g.fillStyle = color;
  g.fillText(s, x, y);
}
