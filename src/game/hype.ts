import { outlined } from "./draw.ts";
import { neonText } from "./neon.ts";
import { alpha, font, mix } from "./skin.ts";
import { ease, Tweens } from "./tween.ts";

/**
 * 플레이 중 기분을 띄우는 연출(레퍼런스 보드 1·2·3번):
 *  - 판을 비스듬히 가로지르는 큰 띠(피버 / 20·30… 콤보 돌파)
 *  - 도장 찍은 자리에 크게 뜨는 콤보 숫자
 *  - 콤보 5·15·25…마다 터지는 칭찬 글자
 *  - 얻은 점수가 줄줄이 떠올랐다가 점수판으로 빨려 들어가는 점수 조각
 * 글자는 다른 큰 연출(GO!·FEVER·TIME UP)처럼 두 언어 모두 영어.
 */

interface Banner { text: string; color: string; x: number; a: number; streak: number }
interface ComboNum { n: number; x: number; y: number; color: string; scale: number; a: number; dy: number }
interface Praise { text: string; color: string; scale: number; a: number; rot: number }
interface Chip { text: string; color: string; x: number; y: number; scale: number; a: number }

const W = 720;
const PRAISE = ["NICE!", "AWESOME!", "AMAZING!", "INSANE!"];

export class Hype {
  private tweens = new Tweens();
  private banner: Banner | null = null;
  private combo: ComboNum | null = null;
  private praise: Praise | null = null;
  private chips: Chip[] = [];
  private comboTw: { kill(): void } | null = null;

  /**
   * box: 판 영역(콤보 숫자를 판 안에 두고, 띠·칭찬 글자를 판 가운데에 둔다)
   * scoreAt: 점수 조각이 날아갈 점수 숫자 자리, onChip: 조각이 도착했을 때
   */
  private readonly box: { x: number; y: number; w: number; h: number };
  private readonly scoreAt: { x: number; y: number };
  private readonly onChip: (points: number) => void;

  constructor(box: Hype["box"], scoreAt: Hype["scoreAt"], onChip: (points: number) => void) {
    this.box = box;
    this.scoreAt = scoreAt;
    this.onChip = onChip;
  }

  /** 날아가는 중인 점수 합(점수판은 이만큼 덜 보여 주다가 도착할 때 채운다) */
  pending = 0;

  clear(): void {
    this.tweens.clear();
    this.banner = null;
    this.combo = null;
    this.praise = null;
    this.chips = [];
    this.pending = 0;
    this.comboTw = null;
  }

  /** 비스듬한 띠가 왼쪽에서 들어와 잠깐 멈췄다가 오른쪽으로 빠져나간다(1초 안). */
  showBanner(text: string, color: string): void {
    const b: Banner = { text, color, x: -W, a: 1, streak: 0 };
    this.banner = b;
    this.tweens.add()
      .to(0.2, (k) => {
        b.x = -W * (1 - k);
        b.streak = k;
      }, ease.outCubic)
      .to(0.42, (k) => (b.x = 26 * k))
      .to(0.2, (k) => {
        b.x = 26 + W * 1.1 * k;
        b.a = 1 - k * 0.6;
      }, ease.inQuad)
      .call(() => this.banner === b && (this.banner = null));
  }

  /** 도장 자리에 콤보 숫자: 크게 툭 튀어나왔다가 제자리, 잠깐 뒤 떠오르며 사라진다. */
  showCombo(n: number, x: number, y: number, color: string): void {
    const bx = this.box;
    const c: ComboNum = {
      n, color, scale: 1.7, a: 1, dy: 0,
      x: Math.min(Math.max(x, bx.x + 80), bx.x + bx.w - 80),
      y: Math.min(Math.max(y, bx.y + 70), bx.y + bx.h - 70),
    };
    this.comboTw?.kill();
    this.combo = c;
    this.comboTw = this.tweens.add()
      .to(0.16, (k) => (c.scale = 1.7 - 0.7 * k), ease.outBack)
      // 툭 튀어나온 뒤엔 반투명으로 물러나 아래 블록이 보이게
      .to(0.12, (k) => (c.a = 1 - 0.5 * k))
      .wait(0.2)
      .to(0.32, (k) => {
        c.a = 0.5 * (1 - k);
        c.dy = -26 * k;
      }, ease.inQuad)
      .call(() => this.combo === c && (this.combo = null));
  }

  /** 칭찬 글자: level 0~3 (NICE → AWESOME → AMAZING → INSANE) */
  showPraise(level: number, color: string): void {
    const p: Praise = { text: PRAISE[Math.min(level, PRAISE.length - 1)], color, scale: 2.1, a: 0, rot: -0.07 };
    this.praise = p;
    this.tweens.add()
      .to(0.14, (k) => {
        p.scale = 2.1 - 1.1 * k;
        p.a = Math.min(1, k * 2);
      }, ease.inQuad)
      .to(0.08, (k) => (p.scale = 1 + 0.05 * Math.sin(k * Math.PI)))
      .wait(0.42)
      .to(0.3, (k) => {
        p.scale = 1 + 0.15 * k;
        p.a = 1 - k;
      }, ease.outCubic)
      .call(() => this.praise === p && (this.praise = null));
  }

  /** 점수 조각: 도장 자리에서 떠올라 잠깐 머문 뒤 점수판으로 빨려 들어간다. 연속으로 찍으면 줄줄이 쌓인다. */
  addChip(points: number, x: number, y: number, color: string): void {
    if (points <= 0) return;
    // 아직 머무는 조각들은 위로 한 칸씩 밀어 올린다(팩맨 CE2처럼 줄줄이)
    for (const o of this.chips) if (o.scale >= 1) o.y -= 34;
    // 콤보 숫자(도장 자리) 위쪽에 띄운다. 판 위쪽 끝이면 콤보 숫자 아래로.
    const c: Chip = { text: `+${points.toLocaleString()}`, color, x, y: y - 104 >= this.box.y + 20 ? y - 104 : y + 150, scale: 1, a: 0 };
    this.chips.push(c);
    this.pending += points;
    let fx = 0, fy = 0;
    this.tweens.add()
      .to(0.12, (k) => {
        c.a = k;
        c.scale = 1.35 - 0.35 * k;
      }, ease.outBack)
      .wait(0.32)
      .call(() => {
        fx = c.x;
        fy = c.y;
        c.scale = 0.99; // 날아가는 중: 더 밀려 올라가지 않는다
      })
      .to(0.34, (k) => {
        c.x = fx + (this.scoreAt.x - fx) * k;
        c.y = fy + (this.scoreAt.y - fy) * k - Math.sin(k * Math.PI) * 60;
        c.scale = 0.99 - 0.45 * k;
      }, ease.inQuad)
      .call(() => {
        this.chips = this.chips.filter((o) => o !== c);
        this.pending = Math.max(0, this.pending - points);
        this.onChip(points);
      });
  }

  /** 머물러 있는 점수 조각 자리(미리보기 표시가 피해 간다) */
  chipRects(): { x: number; y: number; w: number; h: number }[] {
    return this.chips.filter((c) => c.scale >= 1 && c.a > 0.05).map((c) => {
      const w = c.text.length * 22 + 24;
      return { x: c.x - w / 2, y: c.y - 22, w, h: 52 };
    });
  }

  /** 판이 끝날 때 등: 날아가던 점수를 바로 다 채운다. */
  flushChips(): void {
    this.chips = [];
    this.pending = 0;
  }

  update(dt: number): void {
    this.tweens.update(dt);
  }

  /** 판 위 콤보 숫자: 부서지는 효과(원·조각)보다 아래에 그린다(그늘이 효과를 덮지 않게) */
  drawCombo(g: CanvasRenderingContext2D): void {
    const c = this.combo;
    if (c && c.a > 0.01) {
      // 굵은 검은 테두리 없이 가는 네온 관 + 살짝 기울인 글자(띠·칭찬 글자와 같은 결)
      const a = Math.min(1, c.a);
      g.save();
      g.translate(c.x, c.y + c.dy);
      g.scale(c.scale, c.scale);
      g.transform(1, 0, -0.14, 1, 0, 0);
      // 블록 위에서도 읽히게 뒤를 부드럽게 어둡게
      const shade = g.createRadialGradient(0, 10, 10, 0, 10, 90);
      shade.addColorStop(0, `rgba(5,3,15,${0.4 * a})`);
      shade.addColorStop(1, "rgba(5,3,15,0)");
      g.fillStyle = shade;
      g.fillRect(-100, -80, 200, 180);
      neonText(g, String(c.n), 0, -4, 84, c.color, a, 0.35, -2);
      neonText(g, "COMBO", 0, 50, 22, mix(c.color, "#ffffff", 0.3), a * 0.9, 0.5, 5);
      g.restore();
    }
  }

  /** 판 위 칭찬 글자·띠: 효과보다 위 */
  drawOverlay(g: CanvasRenderingContext2D): void {
    const p = this.praise;
    if (p && p.a > 0.01) {
      const bx = this.box;
      g.save();
      g.translate(bx.x + bx.w / 2, bx.y + bx.h * 0.3);
      g.rotate(p.rot);
      g.scale(p.scale, p.scale);
      neonText(g, p.text, 0, 0, 84, p.color, p.a, 0.55);
      g.restore();
    }
    const b = this.banner;
    if (b) this.drawBanner(g, b);
  }

  private drawBanner(g: CanvasRenderingContext2D, b: Banner): void {
    const cy = this.box.y + this.box.h / 2, h = 132, slant = 46;
    g.save();
    g.globalAlpha = b.a;
    g.translate(b.x, cy);
    // 띠 앞쪽의 속도선
    g.fillStyle = alpha(b.color, 0.35 * (1 - b.streak * 0.6));
    for (let i = 0; i < 5; i++) {
      const y = -h / 2 + 14 + i * 26, len = 120 + ((i * 53) % 90);
      g.fillRect(W + 30 + (i % 2) * 40, y, len, 4);
    }
    // 띠: 어두운 속 + 위아래 빛나는 선
    g.beginPath();
    g.moveTo(-20 + slant, -h / 2);
    g.lineTo(W + 20 + slant, -h / 2);
    g.lineTo(W + 20 - slant, h / 2);
    g.lineTo(-20 - slant, h / 2);
    g.closePath();
    g.fillStyle = "rgba(6,3,16,0.86)";
    g.fill();
    const edge = (y: number) => {
      g.fillStyle = b.color;
      g.shadowColor = b.color;
      g.shadowBlur = 16;
      g.fillRect(-60, y - 2.5, W + 120, 5);
      g.shadowBlur = 0;
    };
    edge(-h / 2);
    edge(h / 2);
    // 오른쪽을 가리키는 꺾쇠 세 개
    g.strokeStyle = alpha(b.color, 0.5);
    g.lineWidth = 10;
    g.lineJoin = "miter";
    for (let i = 0; i < 3; i++) {
      const x = W - 150 + i * 34;
      g.beginPath();
      g.moveTo(x, -30);
      g.lineTo(x + 22, 0);
      g.lineTo(x, 30);
      g.stroke();
    }
    // 비스듬한 큰 글자
    g.transform(1, 0, -0.22, 1, 0, 0);
    g.font = font(78);
    const tw = g.measureText(b.text).width;
    const size = tw > 470 ? (78 * 470) / tw : 78;
    neonText(g, b.text, W / 2 - 40, 4, size, b.color, b.a, 0.6);
    g.restore();
  }

  /** 점수 조각(HUD 위) */
  drawChips(g: CanvasRenderingContext2D): void {
    for (const c of this.chips) {
      if (c.a <= 0.01) continue;
      g.save();
      g.globalAlpha = Math.min(1, c.a);
      g.translate(c.x, c.y);
      g.scale(c.scale, c.scale);
      outlined(g, c.text, 0, 12, 38, c.color);
      g.restore();
    }
  }
}
