import { BoardModel } from "../core/board-model.ts";
import { GRADE_NAMES } from "../core/game-rules.ts";
import { roundRect } from "./board-view.ts";
import { text } from "./draw.ts";
import { t, type TextKey } from "./i18n.ts";
import { alpha, font, mix, SKIN } from "./skin.ts";

/**
 * 게임 방법 카드 한 장: 왼쪽 그림(실제 게임과 같은 표시 방식) + 오른쪽 제목과 짧은 설명.
 * kind: 0 = 찍으면 번진다, 1 = 판정 색, 2 = 콤보와 시간
 */
const PIC_W = 236;

export function drawCard(g: CanvasRenderingContext2D, kind: 0 | 1 | 2, x: number, y: number, w: number, h: number): void {
  roundRect(g, x, y, w, h, 22);
  g.fillStyle = SKIN.panel;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = SKIN.panelBorder;
  g.stroke();
  const pic = { x: x + 14, y: y + 14, w: PIC_W - 14, h: h - 28 };
  if (kind === 0) drawSpread(g, pic);
  else if (kind === 1) drawGrades(g, pic);
  else drawCombo(g, pic);
  const n = kind + 1;
  text(g, t(`HOWTO_C${n}_T` as TextKey), x + PIC_W + 20, y + 52, 30, SKIN.accent, "left");
  t(`HOWTO_C${n}_B` as TextKey)
    .split("\n")
    .forEach((line, i) => text(g, line, x + PIC_W + 20, y + 100 + i * 38, 24, SKIN.text, "left"));
}

interface Box { x: number; y: number; w: number; h: number }

/** 찍은 3칸 중 한 칸만 분홍 덩어리에 걸쳐도 덩어리 전체가 함께 부서진다(부서질 칸은 실제 규칙으로 계산). */
function drawSpread(g: CanvasRenderingContext2D, pic: Box): void {
  const grid = ["31002", "40012", "10432", "23141"];
  const model = new BoardModel(5, 4, 5, 1);
  grid.forEach((row, yy) => [...row].forEach((ch, xx) => model.set(xx, yy, Number(ch))));
  const stamp = [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
  const ax = 1, ay = 2;
  const hit = new Set(model.computeBreak(ax, ay, stamp).all.map((p) => p.y * 5 + p.x));
  const cs = 40;
  const ox = pic.x + (pic.w - 5 * cs) / 2, oy = pic.y + (pic.h - 4 * cs) / 2;
  for (let yy = 0; yy < 4; yy++) {
    for (let xx = 0; xx < 5; xx++) {
      const col = SKIN.blocks[model.get(xx, yy)];
      roundRect(g, ox + xx * cs + 4, oy + yy * cs + 4, cs - 8, cs - 8, 7);
      g.fillStyle = alpha(mix(col, "#000000", 0.75), 1);
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = col;
      g.stroke();
      if (!hit.has(yy * 5 + xx)) {
        g.fillStyle = SKIN.dim;
        g.fillRect(ox + xx * cs, oy + yy * cs, cs, cs);
      }
    }
  }
  const has = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < 5 && yy < 4 && hit.has(yy * 5 + xx);
  for (const [lw, c] of [[9, "rgba(0,0,8,0.85)"], [4, SKIN.grades[0]]] as const) {
    g.lineWidth = lw;
    g.strokeStyle = c;
    g.lineCap = "square";
    g.beginPath();
    for (const i of hit) {
      const xx = i % 5, yy = (i / 5) | 0, px = ox + xx * cs, py = oy + yy * cs;
      if (!has(xx, yy - 1)) { g.moveTo(px, py); g.lineTo(px + cs, py); }
      if (!has(xx, yy + 1)) { g.moveTo(px, py + cs); g.lineTo(px + cs, py + cs); }
      if (!has(xx - 1, yy)) { g.moveTo(px, py); g.lineTo(px, py + cs); }
      if (!has(xx + 1, yy)) { g.moveTo(px + cs, py); g.lineTo(px + cs, py + cs); }
    }
    g.stroke();
  }
  g.lineWidth = 2.5;
  g.strokeStyle = "#fff";
  for (const o of stamp) g.strokeRect(ox + (ax + o.x) * cs + 8, oy + (ay + o.y) * cs + 8, cs - 16, cs - 16);
}

/** 판정 알약 네 개 */
function drawGrades(g: CanvasRenderingContext2D, pic: Box): void {
  const items: [string, number][] = [["+15", 0], ["+12", 1], ["+9", 2], ["+4", 3]];
  const h = 40, gap = (pic.h - h * 4) / 3;
  items.forEach(([n, gi], i) => {
    const col = SKIN.grades[gi];
    const ry = pic.y + i * (h + gap);
    roundRect(g, pic.x + 8, ry, pic.w - 16, h, 20);
    g.fillStyle = "rgba(5,3,15,0.94)";
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = col;
    g.stroke();
    text(g, n, pic.x + 24, ry + 29, 24, "#fff", "left");
    text(g, GRADE_NAMES[gi], pic.x + 84, ry + 28, 20, col, "left");
  });
}

/** 콤보 글자 + 줄어드는 막대 + FEVER x3 + 시간 +1초 */
function drawCombo(g: CanvasRenderingContext2D, pic: Box): void {
  const cx = pic.x + pic.w / 2;
  const y = pic.y + 40;
  text(g, "10 COMBO", cx, y, 34, SKIN.tiers[3], "center");
  g.fillStyle = "rgba(255,255,255,0.15)";
  g.fillRect(cx - 80, y + 14, 160, 6);
  g.fillStyle = SKIN.tiers[3];
  g.fillRect(cx - 50, y + 14, 100, 6);
  text(g, "FEVER! x3", cx, y + 68, 30, SKIN.grades[0], "center");
  g.font = font(34);
  text(g, t("SEC_FMT", 1), cx, y + 118, 34, "#66ff99", "center");
}
