/** 글자 그리기 도우미 */
import { alpha, font, SKIN } from "./skin.ts";

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign, glow?: string): void {
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
export function outlined(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string): void {
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

/** Keep translated labels and large scores inside their allotted space. */
export function fitText(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, width: number, color: string, align: CanvasTextAlign = "left"): void {
  g.font = font(size);
  const measured = g.measureText(s).width;
  text(g, s, x, y, measured > width ? size * width / measured : size, color, align);
}

/** User names keep a readable size even when all twelve characters are wide. */
export function ellipsisText(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, width: number, color: string, align: CanvasTextAlign = "left"): void {
  g.font = font(size);
  if (g.measureText(s).width > width) {
    const chars = [...s];
    while (chars.length && g.measureText(chars.join("") + "…").width > width) chars.pop();
    s = chars.join("") + "…";
  }
  text(g, s, x, y, size, color, align);
}

/** Open separators fade at their ends, without enclosing the menu content. */
export function accentLine(g: CanvasRenderingContext2D, x: number, y: number, width: number, color = SKIN.accent): void {
  const glow = g.createLinearGradient(x, y, x + width, y);
  glow.addColorStop(0, alpha(color, 0));
  glow.addColorStop(0.2, alpha(color, 0.3));
  glow.addColorStop(0.5, alpha(color, 0.65));
  glow.addColorStop(0.8, alpha(color, 0.3));
  glow.addColorStop(1, alpha(color, 0));
  g.fillStyle = glow;
  g.fillRect(x, y, width, 2);
}

/** Wrap on words, with a character fallback for Korean and long words. */
export function wrapText(g: CanvasRenderingContext2D, s: string, x: number, y: number, width: number, size: number, lineHeight: number, color = SKIN.text, align: CanvasTextAlign = "left"): number {
  g.font = font(size);
  const lines: string[] = [];
  for (const paragraph of s.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width <= width) { line = next; continue; }
      if (line) lines.push(line);
      line = "";
      for (const ch of word) {
        if (line && g.measureText(line + ch).width > width) { lines.push(line); line = ""; }
        line += ch;
      }
    }
    lines.push(line);
  }
  lines.forEach((line, i) => text(g, line, x, y + i * lineHeight, size, color, align));
  return lines.length * lineHeight;
}

export function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent = SKIN.panelBorder, radius = 24): void {
  g.save();
  const fill = g.createLinearGradient(x, y, x + w * 0.4, y + h);
  fill.addColorStop(0, "#1c172f");
  fill.addColorStop(1, SKIN.panel);
  g.beginPath();
  g.roundRect(x, y, w, h, radius);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = accent;
  g.stroke();
  g.beginPath();
  g.moveTo(x + radius, y + 1);
  g.lineTo(x + w - radius, y + 1);
  g.strokeStyle = "rgba(255,255,255,0.07)";
  g.stroke();
  g.restore();
}

/** An opaque, quiet backdrop keeps paused boards and effects out of menus. */
export function menuBackdrop(g: CanvasRenderingContext2D): void {
  g.fillStyle = SKIN.bg;
  g.fillRect(0, 0, 720, 1280);
  const halo = g.createRadialGradient(360, 100, 0, 360, 100, 700);
  halo.addColorStop(0, "#261334");
  halo.addColorStop(1, alpha(SKIN.bg, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, 720, 1280);
  g.strokeStyle = "rgba(100,90,160,0.08)";
  g.lineWidth = 1;
  for (let x = -720; x <= 1440; x += 90) {
    g.beginPath(); g.moveTo(360, 930); g.lineTo(x, 1280); g.stroke();
  }
  for (let y = 962; y < 1280; y += (y - 900) * 0.35) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(720, y); g.stroke();
  }
}
