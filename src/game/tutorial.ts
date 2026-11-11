import { roundRect } from "./board-view.ts";
import { panel, text, wrapText } from "./draw.ts";
import { t, type TextKey } from "./i18n.ts";
import { alpha, SKIN } from "./skin.ts";

/**
 * 첫 판 안내 상자 + "여기 찍어 보세요" 표시 + 건너뛰기 버튼.
 * 진행(언제 다음 단계로 갈지)은 Game이 정하고, 여기서는 그리기와 건너뛰기 버튼 판정만 한다.
 */
const BOX = { x: 24, y: 1042, w: 672, h: 190 };
const SKIP = { x: BOX.x + BOX.w - 164, y: BOX.y + 12, w: 148, h: 56 };

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
    panel(g, -BOX.w / 2, -BOX.h / 2, BOX.w, BOX.h, "#437c86", 22);
    const label = this.step <= this.total ? t("TUT_PROGRESS", this.step, this.total) : t("TUTORIAL_BTN");
    text(g, label, -BOX.w / 2 + 24, -BOX.h / 2 + 46, 26, SKIN.accent, "left");
    for (let i = 0; i < this.total; i++) {
      roundRect(g, -36 + i * 32, -BOX.h / 2 + 33, 22, 6, 3);
      g.fillStyle = i < this.step ? SKIN.accent : "#35334a"; g.fill();
    }
    wrapText(g, t(this.key), -BOX.w / 2 + 24, -BOX.h / 2 + 100, BOX.w - 48, 28, 34);
    g.restore();
    if (this.step <= this.total) {
      roundRect(g, SKIP.x, SKIP.y, SKIP.w, SKIP.h, 14);
      g.fillStyle = "rgba(235,250,255,0.08)";
      g.fill();
      text(g, t("TUT_SKIP"), SKIP.x + SKIP.w / 2, SKIP.y + 37, 26, SKIN.text, "center");
    }
  }

  private drawMarker(g: CanvasRenderingContext2D): void {
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 7);
    const gold = "#ffd94d";
    if (this.cells.length) {
      for (const r of this.cells) {
        g.fillStyle = alpha(gold, 0.1 + 0.15 * pulse);
        g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
        g.lineWidth = 4;
        g.strokeStyle = alpha(gold, 0.55 + 0.45 * pulse);
        const gr = pulse * 3 - 2;
        g.strokeRect(r.x - gr, r.y - gr, r.w + gr * 2, r.h + gr * 2);
      }
      // 찍을 칸(첫 칸 = 모양의 가운데): 흰 테두리로 따로 표시하고, 화살표 끝이 이 칸 안을 가리킨다.
      // (모양 전체 위에서 가리키면 맨 윗칸을 찍으라는 뜻으로 오해할 수 있다)
      const c = this.cells[0];
      g.lineWidth = 3;
      g.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * pulse})`;
      g.strokeRect(c.x + 9, c.y + 9, c.w - 18, c.h - 18);
      arrow(g, c.x + c.w / 2, c.y + c.h / 2 - 2 - 10 * Math.abs(Math.sin(this.t * 5)), gold);
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
