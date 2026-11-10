import { roundRect } from "./board-view.ts";
import { FONT, SKIN } from "./skin.ts";
import { neonText } from "./neon.ts";
import { ease, Tweens } from "./tween.ts";

/**
 * 판 전체에 걸친 큰 연출: 시작 카운트다운(3·2·1·GO!), TIME UP, 피버 배지와 FEVER END, 화면 가장자리 빛.
 * HUD 위, 메뉴 아래에 그린다. 글자는 두 언어 모두 영어(연출 문구 규칙).
 */
const W = 720, H = 1280, CENTER_Y = 720;
/** 피버 배지 자리: 보드 위쪽 빈 공간(보드를 가리지 않는다) */
const BADGE_Y = 238;
const GO_COLOR = "#ffd133";

interface Big {
  text: string;
  size: number;
  color: string;
  y: number;
  scale: number;
  alpha: number;
  rot: number;
  /** 네온 글씨(GO!)로 그릴 때 빛 세기 */
  neon?: number;
  outline?: string;
}

export class StageFx {
  /** 0~1: 마지막 5초 붉은 가장자리 빛 / 피버 분홍 가장자리 빛 */
  danger = 0;
  feverGlow = 0;
  private tweens = new Tweens();
  private bigs: Big[] = [];
  private band: { h: number; a: number } | null = null;
  private badge: Big | null = null;
  private t = 0;
  private run = 0;

  clear(): void {
    this.run++;
    this.tweens.clear();
    this.bigs = [];
    this.band = null;
    this.badge = null;
    this.danger = 0;
    this.feverGlow = 0;
  }

  /** 3, 2, 1, GO! — beat(n)를 3·2·1·0(GO) 때 부르고, 끝나면 done(). 중간에 clear()되면 done을 부르지 않는다. */
  countdown(beat: (n: number) => void, done: () => void): void {
    const run = ++this.run;
    const seq = this.tweens.add();
    for (const n of [3, 2, 1]) {
      seq.call(() => {
        beat(n);
        const b = this.big(String(n), 220, SKIN.text);
        b.outline = "rgba(64,217,255,0.55)";
        this.slam(b, 2.2, 0.16);
        this.tweens.add().wait(0.5).to(0.2, (k) => {
          b.alpha = 1 - k;
          b.scale = 1 - 0.3 * k;
        }).call(() => this.remove(b));
      }).wait(0.62);
    }
    seq.call(() => {
      if (run !== this.run) return;
      beat(0);
      this.go();
      done();
    });
  }

  /** GO!: 판 없이 글자만, 노란 네온 빛. 쾅 찍히고 지직 깜빡이며 켜졌다가 꺼지듯 사라진다. */
  private go(): void {
    const b = this.big("GO!", 200, GO_COLOR);
    b.neon = 0;
    b.scale = 1.8;
    this.tweens.add()
      .to(0.13, (k) => {
        b.scale = 1.8 - 0.8 * k;
        b.neon = Math.min(1, k * 2.6);
      }, ease.inQuad)
      .to(0.06, (k) => (b.scale = 1 + 0.04 * k))
      .to(0.1, (k) => (b.scale = 1.04 - 0.04 * k), ease.outBack)
      .to(0.03, (k) => (b.neon = 1 - 0.65 * k))
      .to(0.03, (k) => (b.neon = 0.35 + 0.65 * k))
      .wait(0.3)
      .to(0.04, (k) => (b.neon = 1 - 0.8 * k))
      .to(0.04, (k) => (b.neon = 0.2 + 0.7 * k))
      .to(0.18, (k) => (b.neon = 0.9 * (1 - k)))
      .call(() => this.remove(b));
  }

  timeUp(): void {
    this.band = { h: 0, a: 0.82 };
    const band = this.band;
    this.tweens.add().to(0.12, (k) => (band.h = 170 * k), ease.outBack);
    const b = this.big("TIME UP!", 120, "#ff5959");
    b.outline = "rgba(64,217,255,0.55)";
    this.slam(b, 2.6, 0.14);
  }

  feverStart(): void {
    const b = this.big("FEVER!  x3", 66, "#ffffff");
    b.y = BADGE_Y;
    b.outline = SKIN.tiers[3];
    this.bigs = this.bigs.filter((o) => o !== this.badge);
    this.badge = b;
    this.slam(b, 2.4, 0.14);
    // 배지 자리에서 한 번 퍼지는 빛 글자
    const glow = this.big("FEVER!  x3", 66, "rgba(255,64,217,0.6)");
    glow.y = BADGE_Y;
    glow.alpha = 0;
    this.tweens.add().wait(0.12).call(() => (glow.alpha = 1)).to(0.45, (k) => {
      glow.scale = 1 + 0.8 * k;
      glow.alpha = 1 - k;
    }, ease.outCubic).call(() => this.remove(glow));
  }

  /** 판이 끝나거나 타이틀로 갈 때: 연출 없이 배지만 치운다. */
  hideFeverBadge(): void {
    if (this.badge) this.remove(this.badge);
    this.badge = null;
  }

  /** 배지가 회색 FEVER END로 바뀌어 기울며 떨어진다. */
  feverEnd(): void {
    const b = this.badge;
    if (!b) return;
    this.badge = null;
    b.text = "FEVER END";
    b.color = "#bfb3d9";
    b.outline = "#332e47";
    b.scale = 1;
    const y0 = b.y;
    this.tweens.add().to(0.8, (k) => {
      b.y = y0 + 90 * k * k;
      b.rot = 0.08 * k;
      b.alpha = k < 0.44 ? 1 : 1 - (k - 0.44) / 0.56;
    }).call(() => this.remove(b));
  }

  update(dt: number): void {
    this.t += dt;
    this.tweens.update(dt);
    if (this.badge) {
      this.badge.scale = 1 + 0.05 * Math.sin(this.t * 9);
      const hue = (0.92 + 0.12 * Math.sin(this.t * 2.5)) % 1;
      this.badge.outline = `hsl(${hue * 360},100%,62%)`;
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    vignette(g, "255,20,38", this.danger);
    vignette(g, "255,64,217", this.feverGlow);
    if (this.band && this.band.h > 1) {
      g.fillStyle = `rgba(5,3,13,${this.band.a})`;
      g.fillRect(-20, CENTER_Y - this.band.h / 2, W + 40, this.band.h);
    }
    for (const b of this.bigs) {
      if (b.alpha <= 0.01) continue;
      g.save();
      g.globalAlpha = Math.min(1, b.alpha);
      g.translate(W / 2, b.y);
      g.rotate(b.rot);
      g.scale(b.scale, b.scale);
      if (b.neon !== undefined) neonText(g, b.text, 0, 0, b.size, b.color, b.neon, 0.72, 4);
      else {
        g.font = `700 ${b.size}px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineJoin = "round";
        if (b.outline) {
          g.lineWidth = Math.max(10, b.size / 6);
          g.strokeStyle = b.outline;
          g.shadowColor = b.outline;
          g.shadowBlur = b.size * 0.3;
          g.strokeText(b.text, 0, 0);
          g.shadowBlur = 0;
        }
        g.fillStyle = b.color;
        g.fillText(b.text, 0, 0);
      }
      g.restore();
    }
  }

  private big(text: string, size: number, color: string): Big {
    const b: Big = { text, size, color, y: CENTER_Y, scale: 1, alpha: 1, rot: 0 };
    this.bigs.push(b);
    return b;
  }

  private remove(b: Big): void {
    this.bigs = this.bigs.filter((o) => o !== b);
  }

  /** 크게 시작해 제자리 크기로 쾅 내려앉는다. */
  private slam(b: Big, from: number, dur: number): void {
    b.scale = from;
    b.alpha = 0;
    this.tweens.add().to(dur, (k) => {
      b.scale = from + (1 - from) * k;
      b.alpha = Math.min(1, k * 2);
    }, ease.inQuad);
  }
}

/** 화면 가장자리 빛 */
function vignette(g: CanvasRenderingContext2D, rgb: string, amount: number): void {
  if (amount <= 0.001) return;
  const grad = g.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.62);
  grad.addColorStop(0, `rgba(${rgb},0)`);
  grad.addColorStop(1, `rgba(${rgb},${Math.min(1, amount * 1.6)})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // 가장자리 띠
  g.lineWidth = 24;
  g.strokeStyle = `rgba(${rgb},${Math.min(1, amount * 0.9)})`;
  roundRect(g, 0, 0, W, H, 0);
  g.stroke();
}
