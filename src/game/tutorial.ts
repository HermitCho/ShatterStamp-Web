import { roundRect } from "./board-view.ts";
import { text } from "./draw.ts";
import { t, type TextKey } from "./i18n.ts";
import { alpha, SKIN } from "./skin.ts";

/**
 * 첫 판 안내 상자 + "여기 찍어 보세요" 표시 + 건너뛰기 버튼.
 * 진행(언제 다음 단계로 갈지)은 Game이 정하고, 여기서는 그리기와 건너뛰기 버튼 판정만 한다.
 */
const BOX = { x: 24, y: 1036, w: 672, h: 176 };
const SKIP = { x: BOX.x + BOX.w - 150, y: BOX.y + 8, w: 140, h: 40 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Tutorial {
  visible = false;
  /** 금색으로 깜빡일 칸(화면 좌표) */
  cells: Rect[] = [];
  /** HOLD 칸 강조 */
  holdRect: Rect | null = null;
  private step = 0;
  private total = 4;
  private key: TextKey = "TUT_1";
  private t = 0;
  private pop = 1;
  private nudgeT = 0;

  show(step: number, total: number, key: TextKey, cells: Rect[], holdRect: Rect | null = null): void {
    this.visible = true;
    this.step = step;
    this.total = total;
    this.key = key;
    this.cells = cells;
    this.holdRect = holdRect;
    this.pop = 0;
  }

  close(): void {
    this.visible = false;
    this.cells = [];
    this.holdRect = null;
  }

  /** 잘못 찍었을 때 안내 상자를 좌우로 살짝 흔든다. */
  nudge(): void {
    this.nudgeT = 0.2;
  }

  /** 건너뛰기 버튼을 눌렀는지 */
  hitSkip(x: number, y: number): boolean {
    return this.visible && this.step <= this.total && x >= SKIP.x && x < SKIP.x + SKIP.w && y >= SKIP.y && y < SKIP.y + SKIP.h;
  }

  update(dt: number): void {
    this.t += dt;
    this.pop = Math.min(1, this.pop + dt / 0.18);
    this.nudgeT = Math.max(0, this.nudgeT - dt);
  }

  draw(g: CanvasRenderingContext2D): void {
    if (!this.visible) return;
    this.drawMarker(g);
    const dx = this.nudgeT > 0 ? Math.sin(this.nudgeT * 60) * 10 * (this.nudgeT / 0.2) : 0;
    const s = 0.94 + 0.06 * backOut(this.pop);
    g.save();
    g.translate(BOX.x + BOX.w / 2 + dx, BOX.y + BOX.h / 2);
    g.scale(s, s);
    roundRect(g, -BOX.w / 2, -BOX.h / 2, BOX.w, BOX.h, 20);
    g.fillStyle = "rgba(13,13,31,0.94)";
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = SKIN.accent;
    g.stroke();
    const label = this.step <= this.total ? `TUTORIAL  ${this.step} / ${this.total}` : "TUTORIAL";
    text(g, label, -BOX.w / 2 + 24, -BOX.h / 2 + 38, 20, SKIN.accent, "left");
    const lines = t(this.key).split("\n");
    lines.forEach((l, i) => text(g, l, 0, 18 + (i - (lines.length - 1) / 2) * 38 + 10, 27, SKIN.text, "center"));
    g.restore();
    if (this.step <= this.total) {
      roundRect(g, SKIP.x, SKIP.y, SKIP.w, SKIP.h, 14);
      g.fillStyle = "rgba(235,250,255,0.08)";
      g.fill();
      text(g, t("TUT_SKIP"), SKIP.x + SKIP.w / 2, SKIP.y + 28, 20, "rgba(235,250,255,0.8)", "center");
    }
  }

  private drawMarker(g: CanvasRenderingContext2D): void {
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 7);
    const gold = "#ffd94d";
    const bounce = 14 + 12 * Math.abs(Math.sin(this.t * 5));
    if (this.cells.length) {
      let top = 1e9, sumX = 0;
      for (const r of this.cells) {
        g.fillStyle = alpha(gold, 0.1 + 0.15 * pulse);
        g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
        g.lineWidth = 4;
        g.strokeStyle = alpha(gold, 0.55 + 0.45 * pulse);
        const gr = pulse * 3 - 2;
        g.strokeRect(r.x - gr, r.y - gr, r.w + gr * 2, r.h + gr * 2);
        top = Math.min(top, r.y);
        sumX += r.x + r.w / 2;
      }
      arrow(g, sumX / this.cells.length, top - bounce, gold);
    }
    if (this.holdRect) {
      const r = this.holdRect, gr = 4 + pulse * 4;
      g.lineWidth = 5;
      g.strokeStyle = alpha(gold, 0.5 + 0.5 * pulse);
      g.strokeRect(r.x - gr, r.y - gr, r.w + gr * 2, r.h + gr * 2);
      arrow(g, r.x + r.w / 2, r.y - 12 - 12 * Math.abs(Math.sin(this.t * 5)), gold);
    }
  }
}

/** 끝이 아래(tip)를 가리키는 화살표 */
function arrow(g: CanvasRenderingContext2D, x: number, y: number, c: string): void {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x - 22, y - 26);
  g.lineTo(x - 9, y - 26);
  g.lineTo(x - 9, y - 50);
  g.lineTo(x + 9, y - 50);
  g.lineTo(x + 9, y - 26);
  g.lineTo(x + 22, y - 26);
  g.closePath();
  g.fillStyle = c;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.stroke();
}

function backOut(k: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
}
