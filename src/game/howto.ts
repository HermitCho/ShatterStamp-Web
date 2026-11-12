import { BoardModel } from "../core/board-model.ts";
import { BLOCK, BoardView, CELL } from "./board-view.ts";
import { fitText, text, wrapText } from "./draw.ts";
import { Fx } from "./fx.ts";
import { GRADE_KEYS, t, type TextKey } from "./i18n.ts";
import { alpha, mix, SKIN } from "./skin.ts";
import { Tweens } from "./tween.ts";

interface Box { x: number; y: number; w: number; h: number }

const STAMP_AT = 1.2, RESTORE_AT = 2.7, LOOP = 3.2, FADE = 0.25;
// Use gameplay coordinates for both BoardView and Fx, then scale the whole scene.
const BOARD_SCALE = 0.8;
const stamp = [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];

function exampleBoard(): BoardModel {
  const model = new BoardModel(5, 4, 5, 1);
  ["00422", "00311", "40312", "23040"].forEach((row, y) =>
    [...row].forEach((ch, x) => model.set(x, y, Number(ch))));
  return model;
}

// Pink, cyan and gold all break; disconnected blocks of those colors survive.
const example = exampleBoard();
const spread = example.computeBreak(2, 2, stamp);
const hit = new Set(spread.all.map((p) => p.y * example.cols + p.x));

/** Menu-owned demo: the actual board's wave, white pop, gravity and refill. */
export class Howto {
  private readonly board = new BoardView(0, 0, BOARD_SCALE);
  private readonly tweens = new Tweens();
  private fx = new Fx();
  private time = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.time = 0;
    this.restoreBoard();
  }

  private restoreBoard(): void {
    this.tweens.clear();
    this.fx = new Fx();
    this.board.setModel(exampleBoard(), false);
    this.board.setPiece(stamp);
  }

  update(dt: number): void {
    // Split at phase boundaries so opening, looping and debug time steps agree.
    while (dt > 0) {
      const boundary = this.time < STAMP_AT ? STAMP_AT : this.time < RESTORE_AT ? RESTORE_AT : LOOP;
      const step = Math.min(dt, 1 / 120, boundary - this.time);
      this.tweens.update(step);
      this.board.update(step);
      this.fx.update(step);
      this.time += step;
      dt -= step;
      if (this.time >= boundary) {
        if (boundary === STAMP_AT) this.landStamp();
        else if (boundary === RESTORE_AT) this.restoreBoard();
        else this.time = 0;
      }
    }
  }

  private landStamp(): void {
    const ev = this.board.placeAt(2, 2)!;
    // Same tier-0 effects and per-block delays as Game.juice. The demo owns its
    // own model, tweens and Fx, so it never changes the live board or score.
    for (const b of ev.broken) {
      const col = SKIN.blocks[b.color];
      this.tweens.add().wait(b.delay).call(() => {
        this.fx.burst(b.x, b.y, col, 4, 280);
        this.fx.flash(b.x, b.y, BLOCK * BOARD_SCALE, mix(col, "#ffffff", 0.75));
      });
    }
    this.fx.ring(ev.ax, ev.ay, 70 + ev.count * 6, SKIN.ring);
  }

  /** Three open sections; only 01 has a running illustration. */
  drawSection(g: CanvasRenderingContext2D, kind: 0 | 1 | 2, x: number, y: number, w: number): void {
    if (kind > 0) {
      g.fillStyle = alpha(SKIN.muted, 0.22);
      g.fillRect(x, y - 16, w, 1);
    }
    const n = kind + 1;
    text(g, t("HOWTO_STEP_FMT", String(n).padStart(2, "0")), x, y + 34, 28, SKIN.accent, "left");
    fitText(g, t(`HOWTO_C${n}_T` as TextKey), x + 64, y + 34, 34, w - 64, SKIN.text);
    if (kind === 0) {
      wrapText(g, t("HOWTO_C1_B"), x, y + 82, w, 28, 36, "#d0cddd");
      this.drawSpread(g, x, y + 156, w);
      return;
    }
    const pic = { x, y: y + 62, w: 194, h: 120 };
    if (kind === 1) drawGrades(g, pic);
    else drawCombo(g, pic);
    wrapText(g, t(`HOWTO_C${n}_B` as TextKey), x + 224, y + 80, w - 224, 27, 35, "#d0cddd");
  }

  private drawSpread(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
    const cs = 52, boardW = example.cols * cs, boardH = example.rows * cs;
    const ready = this.time < STAMP_AT || this.time >= RESTORE_AT;
    const opacity = this.time >= RESTORE_AT
      ? Math.min(1, (this.time - RESTORE_AT) / FADE)
      : Math.min(1, (RESTORE_AT - this.time) / FADE);
    const outline = ready ? 1 : Math.max(0, 1 - (this.time - STAMP_AT) / 0.2);
    g.save();
    // Particles and rings stay in the illustration, away from the copy and 02.
    g.beginPath(); g.rect(x, y - 12, boardW + 24, boardH + 30); g.clip();
    g.globalAlpha *= opacity;
    g.translate(x + 12, y);
    const scale = cs / (CELL * BOARD_SCALE);
    g.scale(scale, scale);
    this.board.draw(g);
    g.save();
    g.scale(BOARD_SCALE, BOARD_SCALE);
    g.globalAlpha *= outline;
    this.drawFootprint(g);
    g.restore();
    this.fx.draw(g);
    g.restore();

    const tx = x + boardW + 44, tw = w - boardW - 44;
    fitText(g, t("HOWTO_STAMP_FMT", spread.stamp.length), tx, y + 40, 27, tw, SKIN.text);
    fitText(g, t("HOWTO_STAMP_LEGEND"), tx, y + 76, 25, tw, SKIN.muted);
    const cx = tx + tw / 2;
    g.save();
    g.strokeStyle = SKIN.accent; g.lineWidth = 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(cx, y + 95); g.lineTo(cx, y + 119);
    g.moveTo(cx - 8, y + 111); g.lineTo(cx, y + 119); g.lineTo(cx + 8, y + 111); g.stroke();
    g.restore();
    fitText(g, t("HOWTO_BREAK_FMT", hit.size), tx, y + 158, 28, tw, ready ? SKIN.text : SKIN.accent);
    fitText(g, t("HOWTO_BREAK_LEGEND"), tx, y + 194, 25, tw, SKIN.muted);
  }

  /** Teaching overlays only; every block and break is drawn by BoardView/Fx. */
  private drawFootprint(g: CanvasRenderingContext2D): void {
    g.fillStyle = SKIN.dim;
    for (let y = 0; y < example.rows; y++) for (let x = 0; x < example.cols; x++) {
      if (!hit.has(y * example.cols + x)) g.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    for (const p of spread.all) {
      const color = example.get(p.x, p.y);
      const has = (x: number, y: number) => example.inBounds(x, y)
        && hit.has(y * example.cols + x) && example.get(x, y) === color;
      const px = p.x * CELL, py = p.y * CELL;
      g.beginPath();
      if (!has(p.x, p.y - 1)) { g.moveTo(px, py); g.lineTo(px + CELL, py); }
      if (!has(p.x, p.y + 1)) { g.moveTo(px, py + CELL); g.lineTo(px + CELL, py + CELL); }
      if (!has(p.x - 1, p.y)) { g.moveTo(px, py); g.lineTo(px, py + CELL); }
      if (!has(p.x + 1, p.y)) { g.moveTo(px + CELL, py); g.lineTo(px + CELL, py + CELL); }
      g.strokeStyle = SKIN.blocks[color]; g.lineWidth = 3; g.stroke();
    }
    // One continuous white outline spans three different colors throughout the hold.
    g.lineWidth = 5; g.strokeStyle = SKIN.text;
    g.strokeRect(CELL + 3, 2 * CELL + 3, 3 * CELL - 6, CELL - 6);
  }
}

/** Color-coded grade examples, without pill outlines. */
function drawGrades(g: CanvasRenderingContext2D, pic: Box): void {
  const items: [number, number][] = [[15, 0], [12, 1], [9, 2], [4, 3]];
  items.forEach(([n, gi], i) => {
    const col = SKIN.grades[gi], y = pic.y + 21 + i * 30;
    g.fillStyle = col; g.fillRect(pic.x, y - 18, 3, 20);
    text(g, t("POINTS_FMT", n), pic.x + 14, y, 25, SKIN.text, "left");
    text(g, t(GRADE_KEYS[gi]), pic.x + 66, y, 24, col, "left");
  });
}

/** 콤보 글자 + 줄어드는 막대 + FEVER x3 + 시간 +1초 */
function drawCombo(g: CanvasRenderingContext2D, pic: Box): void {
  const cx = pic.x + pic.w / 2;
  const y = pic.y + 24;
  text(g, t("COMBO_FMT", 10), cx, y, 28, SKIN.tiers[3], "center");
  g.fillStyle = "rgba(255,255,255,0.15)";
  g.fillRect(cx - 80, y + 14, 160, 6);
  g.fillStyle = SKIN.tiers[3];
  g.fillRect(cx - 50, y + 14, 100, 6);
  text(g, t("FEVER"), cx, y + 60, 26, SKIN.grades[0], "center");
  text(g, t("SEC_FMT", 1), cx, y + 96, 28, "#66ff99", "center");
}
