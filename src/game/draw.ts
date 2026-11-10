/** 글자 그리기 도우미 */
import { font } from "./skin.ts";

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
