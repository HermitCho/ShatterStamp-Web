import { FONT } from "./skin.ts";

/**
 * 네온 글씨: 바깥으로 번지는 빛 여러 겹 + 얇은 어두운 테두리(블록 위에서도 윤곽 유지) + 색 관 + 밝은 속.
 * (x, y)는 글자 가운데. glow 0~1은 켜짐 정도(깜빡임 연출용), coreWhite는 속을 얼마나 하얗게 할지.
 */
export function neonText(
  g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string,
  glow = 1, coreWhite = 0.45, spacing = 0,
): void {
  if (glow <= 0.001) return;
  g.save();
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  const chars = [...s];
  const widths = chars.map((c) => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  const core = mixWhite(color, coreWhite);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    // 빛: 굵은 외곽선 두 겹을 옅게
    g.globalAlpha = glow * 0.12;
    g.strokeStyle = color;
    g.lineWidth = size * 0.28;
    g.strokeText(c, cx, y);
    g.globalAlpha = glow * 0.25;
    g.lineWidth = size * 0.19;
    g.strokeText(c, cx, y);
    g.globalAlpha = glow * 0.75;
    g.strokeStyle = "#05030f";
    g.lineWidth = size * 0.125;
    g.strokeText(c, cx, y);
    g.globalAlpha = glow;
    g.strokeStyle = color;
    g.lineWidth = size * 0.07;
    g.shadowColor = color;
    g.shadowBlur = size * 0.25;
    g.strokeText(c, cx, y);
    g.shadowBlur = 0;
    g.fillStyle = core;
    g.fillText(c, cx, y);
    cx += widths[i] + spacing;
  }
  g.restore();
}

function mixWhite(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - t) + 255 * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
