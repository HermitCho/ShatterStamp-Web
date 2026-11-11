import { roundRect } from "./board-view.ts";
import { t } from "./i18n.ts";
import { alpha, font, SKIN } from "./skin.ts";

interface Action {
  y: number;
  label: () => string;
  value?: () => string;
  primary?: boolean;
  /** 가로 위치·폭을 정해 나란히 놓는 항목(탭)에 쓴다. 없으면 가운데. */
  x?: number;
  width?: number;
  /** 작은 글씨 항목(타이틀 아래 닉네임 줄) */
  small?: boolean;
  /** 탭이면: 지금 보고 있는 탭인지 */
  tab?: () => boolean;
}

export interface StampFootprint {
  x: number;
  y: number;
  width: number;
}

const HEIGHT = 88, ANGLE = -0.055, RADIUS = 18;
const GLIDE = 0.14, PRESS = 0.05, RELEASE = 0.09;
const ROW_WIDTH = 652, TRACK_WIDTH = 496, TRACK_Y = 18;
const PRIMARY_SIZE = 58;

/** One travelling START stamp; drawing and picking share its landing footprints. */
export class StampMenu {
  private measure = document.createElement("canvas").getContext("2d")!;
  private selected = -1;
  private elapsed = GLIDE + PRESS + RELEASE;
  private from: StampFootprint | null = null;
  private target: StampFootprint | null = null;
  private frame: StampFootprint | null = null;
  private fromScale = 1;
  private scale = 1;
  private clock = 0;

  /** Decoration has its own clock; the travelling stamp keeps its original timing. */
  update(dt: number): void {
    this.clock += dt;
  }

  private color(i: number): string {
    return i % 2 ? SKIN.score : SKIN.accent;
  }

  private width(label: string, size: number, weight = 900): number {
    this.measure.font = font(size, weight);
    return this.measure.measureText(label).width;
  }

  buttonFootprint(b: Action): StampFootprint {
    return {
      x: b.x ?? 360, y: b.y + 46,
      width: b.width ?? (b.value ? ROW_WIDTH : Math.min(540, Math.max(b.small ? 240 : 300,
        this.width(b.label(), b.primary ? PRIMARY_SIZE : b.small ? 26 : 35, b.primary ? 900 : 700) + 100))),
    };
  }

  sliderFootprint(y: number): StampFootprint {
    return { x: 360, y: y - TRACK_Y, width: ROW_WIDTH };
  }

  private local(f: StampFootprint, x: number, y: number): { x: number; y: number } {
    const dx = x - f.x, dy = y - f.y;
    return { x: dx * Math.cos(ANGLE) + dy * Math.sin(ANGLE), y: -dx * Math.sin(ANGLE) + dy * Math.cos(ANGLE) };
  }

  hit(f: StampFootprint, x: number, y: number): boolean {
    const p = this.local(f, x, y);
    if (Math.abs(p.x) > f.width / 2 || Math.abs(p.y) > HEIGHT / 2) return false;
    const cx = Math.max(0, Math.abs(p.x) - (f.width / 2 - RADIUS));
    const cy = Math.max(0, Math.abs(p.y) - (HEIGHT / 2 - RADIUS));
    // The moving ink never steals a neighbouring item's fixed, rounded hit area.
    return cx * cx + cy * cy <= RADIUS * RADIUS;
  }

  sliderValue(y: number, x: number, py: number): number {
    return (this.local(this.sliderFootprint(y), x, py).x + TRACK_WIDTH / 2) / TRACK_WIDTH;
  }

  resetSelection(): void {
    this.selected = -1;
    this.from = this.target = this.frame = null;
    this.fromScale = this.scale = 1;
    this.elapsed = GLIDE + PRESS + RELEASE;
  }

  updateSelection(target: StampFootprint, selected: number, dt: number): void {
    if (!this.frame || !this.target) {
      this.from = this.target = this.frame = { ...target };
      this.selected = selected;
      return;
    }
    if (selected !== this.selected || target.x !== this.target.x
      || target.y !== this.target.y || target.width !== this.target.width) {
      // Retarget from the visible impression, even in the middle of a glide/press.
      this.from = { ...this.frame };
      this.fromScale = this.scale;
      this.target = { ...target };
      this.selected = selected;
      this.elapsed = 0;
    }
    this.elapsed = Math.min(GLIDE + PRESS + RELEASE, this.elapsed + dt);
    const k = 1 - (1 - Math.min(1, this.elapsed / GLIDE)) ** 3;
    const from = this.from!;
    this.frame = {
      x: from.x + (target.x - from.x) * k,
      y: from.y + (target.y - from.y) * k,
      width: from.width + (target.width - from.width) * k,
    };
    if (this.elapsed < GLIDE) this.scale = this.fromScale + (1.04 - this.fromScale) * k;
    else if (this.elapsed < GLIDE + PRESS) {
      const p = (this.elapsed - GLIDE) / PRESS;
      this.scale = 1.04 - 0.07 * (1 - (1 - p) ** 2);
    } else {
      const p = Math.min(1, (this.elapsed - GLIDE - PRESS) / RELEASE);
      this.scale = 0.97 + 0.03 * (1 - (1 - p) ** 3);
    }
  }

  pressSelection(): void {
    // A click on a persistent row uses the same press as a completed glide.
    if (this.elapsed >= GLIDE) this.elapsed = GLIDE;
  }

  drawSelection(g: CanvasRenderingContext2D): void {
    if (!this.frame) return;
    g.save();
    this.transform(g, this.frame);
    g.scale(this.scale, this.scale);
    this.stamp(g, this.frame.width);
    g.restore();
  }

  private transform(g: CanvasRenderingContext2D, f: StampFootprint): void {
    g.translate(f.x, f.y); g.rotate(ANGLE);
  }

  /** Fits the same type treatment to headings, settings labels, and statistics. */
  lettering(g: CanvasRenderingContext2D, label: string, x: number, y: number, size: number,
    width: number, color: string, align: CanvasTextAlign = "center", lit = true): void {
    g.save();
    const measured = this.width(label, size);
    size *= Math.min(1, width / Math.max(1, measured));
    g.translate(x, y);
    g.font = font(size, 900); g.textAlign = align; g.textBaseline = "alphabetic";
    g.shadowColor = alpha(color, 0.65); g.shadowBlur = lit ? 16 : 0;
    g.fillStyle = color; g.fillText(label, 0, 0);
    g.restore();
  }

  heading(g: CanvasRenderingContext2D, label: string, y = 140): void {
    this.lettering(g, label, 360, y, 62, 590, SKIN.text);
  }

  private stamp(g: CanvasRenderingContext2D, width: number): void {
    const height = HEIGHT, color = SKIN.accent;
    g.save();
    roundRect(g, -width / 2 + 3, -height / 2 + 3, width - 6, height - 6, 16);
    g.fillStyle = alpha(color, 0.14); g.fill();
    g.strokeStyle = color; g.lineWidth = 5;
    g.shadowColor = color; g.shadowBlur = 20; g.stroke(); g.shadowBlur = 0;
    // Tiny, deterministic overprints give the single stamp frame a rough ink edge.
    g.strokeStyle = alpha(color, 0.45); g.lineWidth = 1.2;
    roundRect(g, -width / 2 + 1, -height / 2 + 4, width - 4, height - 8, 17); g.stroke();
    g.fillStyle = alpha(color, 0.5);
    for (let i = 0; i < 17; i++) {
      const x = -width / 2 + 24 + i * (width - 48) / 16;
      g.fillRect(x, -height / 2 + (i % 3), 2 + i % 3, 2);
      g.fillRect(x + 4, height / 2 - 3 - (i % 2), 3, 2);
    }
    g.restore();
  }

  private primary(g: CanvasRenderingContext2D, label: string, width: number): void {
    const size = PRIMARY_SIZE * Math.min(1,
      (width - 64) / Math.max(1, this.width(label, PRIMARY_SIZE)));
    g.font = font(size, 900); g.textAlign = "center"; g.textBaseline = "alphabetic";
    const baseline = size * 0.34;
    const breath = 0.5 - 0.5 * Math.cos(this.clock * Math.PI * 2 / 1.6);
    g.fillStyle = SKIN.accent; g.shadowColor = SKIN.accent;
    g.save();
    g.globalAlpha *= 0.32 + breath * 0.1;
    g.shadowBlur = 22 + breath * 8;
    g.fillText(label, 0, baseline);
    g.restore();
    g.shadowBlur = 7 + breath * 3;
    g.fillText(label, 0, baseline);
  }

  button(g: CanvasRenderingContext2D, b: Action, i: number, active: boolean): void {
    const f = this.buttonFootprint(b);
    g.save(); this.transform(g, f);
    if (b.primary) {
      this.primary(g, b.label(), f.width);
    } else if (b.value) {
      this.lettering(g, b.label(), -276, 11, 30, 342, active ? SKIN.accent : SKIN.muted, "left", active);
      this.lettering(g, b.value(), 276, 11, 32, 160, active ? SKIN.accent : this.color(i), "right", active);
    } else if (b.tab) {
      // 탭: 보고 있는 탭은 하늘색 글자 + 빛나는 굵은 밑줄, 아닌 탭은 흐린 글자
      const on = b.tab(), size = 38 * Math.min(1, (f.width - 40) / Math.max(1, this.width(b.label(), 38, 900)));
      this.lettering(g, b.label(), 0, 12, size, f.width - 40, on || active ? SKIN.accent : SKIN.muted, "center", on);
      if (on) {
        const w = Math.min(f.width - 60, this.width(b.label(), size, 900) + 24);
        g.save();
        g.fillStyle = SKIN.accent; g.shadowColor = SKIN.accent; g.shadowBlur = 14;
        roundRect(g, -w / 2, 26, w, 6, 3); g.fill();
        g.restore();
      }
    } else {
      const base = b.small ? 26 : 35;
      const size = base * Math.min(1, (f.width - 100) / Math.max(1, this.width(b.label(), base, 700)));
      g.font = font(size, 700); g.textAlign = "center"; g.textBaseline = "alphabetic";
      g.fillStyle = active ? SKIN.accent : SKIN.text;
      g.fillText(b.label(), 0, 13);
    }
    g.restore();
  }

  slider(g: CanvasRenderingContext2D, label: string, y: number, value: number, i: number, active: boolean): void {
    const col = this.color(i);
    g.save(); this.transform(g, this.sliderFootprint(y));
    this.lettering(g, label, -276, -6, 30, 360, active ? SKIN.accent : SKIN.text, "left", active);
    this.lettering(g, t("PERCENT_FMT", Math.round(value * 100)), 276, -6, 30, 130, active ? SKIN.accent : col, "right");
    this.meter(g, -TRACK_WIDTH / 2, TRACK_Y, TRACK_WIDTH, value, col);
    const x = -TRACK_WIDTH / 2 + TRACK_WIDTH * value;
    g.save(); g.translate(x, TRACK_Y);
    g.rotate(-0.22); g.fillStyle = col; g.fillRect(-10, -13, 20, 26);
    if (active) { g.strokeStyle = SKIN.text; g.lineWidth = 2; g.strokeRect(-16, -19, 32, 38); }
    g.restore(); g.restore();
  }

  meter(g: CanvasRenderingContext2D, x: number, y: number, width: number, value: number, color: string): void {
    g.save();
    const count = 28, step = width / count;
    for (let j = 0; j < count; j++) {
      g.fillStyle = alpha(color, j < Math.round(value * count) ? 1 : 0.17);
      g.save(); g.translate(x + j * step, y);
      g.transform(1, 0, -0.3, 1, 0, 0);
      g.fillRect(0, -4, step - 3, 8); g.restore();
    }
    g.restore();
  }

  score(g: CanvasRenderingContext2D, value: string, color: string): void {
    g.save();
    g.translate(360, 367); g.rotate(-0.055);
    // The score is an ink impression, with open swipes rather than a panel.
    g.save(); g.globalAlpha *= 0.35;
    this.lettering(g, value, 2, 34, 108, 558, color);
    g.restore();
    this.lettering(g, value, 0, 30, 108, 558, color);
    g.fillStyle = alpha(color, 0.7); g.fillRect(-220, 49, 440, 4);
    g.fillRect(-206, 57, 375, 2);
    for (let i = 0; i < 22; i++) g.fillRect(-230 + i * 22, 52 + i % 4, 2, 2);
    g.restore();
  }
}
