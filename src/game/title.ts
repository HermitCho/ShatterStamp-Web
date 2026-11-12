import { roundRect } from "./board-view.ts";
import { FONT, SKIN } from "./skin.ts";
import { t } from "./i18n.ts";

/**
 * 타이틀 화면의 로고와 배경(Godot 버전 title_logo.gd / title_backdrop.gd와 같은 연출).
 * 로고: SHATTER 글자가 흩어진 자리에서 모여들고 → STAMP가 도장처럼 쾅 찍힌다(onSlam).
 * 이후 네온이 가끔 깜빡이고 STAMP가 숨 쉬듯 움직인다.
 * 배경: 밤하늘과 별, 지평선 빛, 앞으로 흘러오는 원근 격자 바닥, 떠오르며 돌다가 가끔 깨지는 네온 블록.
 */
const W = 720, H = 1280;
const CYAN = "#4debff";
const PINK = "#ff47d9";
const TOP_SIZE = 100, STAMP_SIZE = 104, GAP = 4;
const GATHER_TIME = 0.42, STAGGER = 0.05, SLAM_AT = 0.78, SLAM_TIME = 0.14;
const SLANT = -0.22;
/** Leave a measured pause between the logo impression and the two title actions. */
const LOGO_Y = 124;
const HORIZON = 1140;
const LOGO_ZONE = { x: 40, y: 120, w: 640, h: 440 };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Letter { ch: string; x: number; w: number; fx: number; fy: number; rot0: number }
interface Shard { x: number; y: number; vx: number; vy: number; t: number; max: number; c: string; w: number }
interface Floater { x: number; y: number; v: number; rot: number; rv: number; s: number; a: number; c: number; life: number }

export class TitleScreen {
  onSlam: () => void = () => {};
  private t = 99;
  private slamDone = true;
  private flicker = 0;
  private nextFlicker = 2;
  private letters: Letter[] = [];
  private shards: Shard[] = [];
  private stars: { x: number; y: number; r: number; ph: number }[] = [];
  private floaters: Floater[] = [];
  private bt = 0;

  constructor() {
    for (let i = 0; i < 54; i++) this.stars.push({ x: Math.random() * W, y: Math.random() * HORIZON * 0.9, r: rand(0.6, 1.6), ph: Math.random() * 6.28 });
    for (let i = 0; i < 8; i++) this.floaters.push(this.newFloater(true));
  }

  /** 글꼴이 준비된 뒤 글자 폭을 잰다. */
  private layout(g: CanvasRenderingContext2D): void {
    if (this.letters.length) return;
    g.font = `700 ${TOP_SIZE}px ${FONT}`;
    const ws = [...t("LOGO_TOP")].map((c) => g.measureText(c).width);
    const total = ws.reduce((a, b) => a + b + GAP, -GAP);
    let x = (W - total) / 2;
    [...t("LOGO_TOP")].forEach((ch, i) => {
      this.letters.push({ ch, x, w: ws[i], fx: 0, fy: 0, rot0: 0 });
      x += ws[i] + GAP;
    });
  }

  playIntro(): void {
    this.t = 0;
    this.slamDone = false;
    for (const l of this.letters) this.scatter(l);
    this.pendingScatter = this.letters.length === 0;
  }

  private pendingScatter = false;

  private scatter(l: Letter): void {
    const a = Math.random() * Math.PI * 2, d = rand(260, 520);
    l.fx = Math.cos(a) * d;
    l.fy = Math.sin(a) * d;
    l.rot0 = rand(-2.5, 2.5);
  }

  introLength(): number {
    return SLAM_AT + SLAM_TIME;
  }

  update(dt: number): void {
    this.t += dt;
    this.bt += dt;
    if (!this.slamDone && this.t >= SLAM_AT + SLAM_TIME) {
      this.slamDone = true;
      for (let i = 0; i < 34; i++) {
        const a = Math.random() * Math.PI * 2, spd = rand(200, 560);
        this.shards.push({ x: W / 2 + Math.cos(a) * 190, y: LOGO_Y + 255 + Math.sin(a) * 70, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, t: 0, max: rand(0.3, 0.7), c: i % 3 ? PINK : CYAN, w: 4 });
      }
      this.onSlam();
    }
    this.nextFlicker -= dt;
    if (this.nextFlicker <= 0) {
      this.flicker = 0.22;
      this.nextFlicker = rand(2.5, 6);
    }
    this.flicker = Math.max(0, this.flicker - dt);
    for (const s of this.shards) {
      s.t += dt;
      s.vx *= 0.95;
      s.vy *= 0.95;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.shards = this.shards.filter((s) => s.t < s.max);
    // 떠다니는 블록
    this.floaters.forEach((f, i) => {
      f.y += f.v * dt;
      f.rot += f.rv * dt;
      f.life -= dt;
      if (f.life <= 0 && f.y < H - 40) {
        const col = SKIN.blocks[f.c];
        for (let k = 0; k < 14; k++) {
          const a = Math.random() * 6.28, spd = rand(60, 220) * f.a;
          this.shards.push({ x: f.x, y: f.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, t: 0, max: rand(0.5, 1.1), c: col, w: f.s * 0.12 });
        }
        this.floaters[i] = this.newFloater(false);
      } else if (f.y < -80) this.floaters[i] = this.newFloater(false);
    });
  }

  private newFloater(anywhere: boolean): Floater {
    const depth = rand(0.35, 1);
    return {
      x: Math.random() < 0.5 ? rand(24, 132) : rand(W - 132, W - 24),
      y: anywhere ? rand(140, H) : H + 60, v: -rand(12, 28) * depth,
      rot: Math.random() * 6.28, rv: rand(-0.18, 0.18), s: 28 + 28 * depth, a: 0.12 + 0.2 * depth,
      c: Math.floor(Math.random() * 5), life: rand(24, 48),
    };
  }

  // ---------------------------------------------------------------- 그리기

  drawBackdrop(g: CanvasRenderingContext2D): void {
    const sky = g.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, "#080517");
    sky.addColorStop(0.55, "#10081d");
    sky.addColorStop(1, "#190a25");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, HORIZON);
    // Broad pools of logo-coloured light give the open composition depth.
    for (const [x, y, radius, color] of [[180, 250, 370, "rgba(55,194,228,0.07)"], [520, 420, 390, "rgba(239,61,197,0.08)"]] as const) {
      const halo = g.createRadialGradient(x, y, 0, x, y, radius);
      halo.addColorStop(0, color); halo.addColorStop(1, "rgba(9,7,21,0)");
      g.fillStyle = halo; g.fillRect(0, 0, W, HORIZON);
    }
    for (const s of this.stars) {
      const quiet = s.x > 150 && s.x < 570 && s.y > 520 ? 0.3 : 1;
      g.globalAlpha = (0.08 + 0.2 * (0.5 + 0.5 * Math.sin(this.bt * 0.8 + s.ph))) * quiet;
      g.fillStyle = "#ccf2ff";
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, 6.28);
      g.fill();
    }
    g.globalAlpha = 1;
    // 바닥 + 지평선 빛
    g.fillStyle = "#08030f";
    g.fillRect(0, HORIZON, W, H - HORIZON);
    const glow = g.createLinearGradient(0, HORIZON - 70, 0, HORIZON + 56);
    glow.addColorStop(0, "rgba(255,64,217,0)");
    glow.addColorStop(0.55, "rgba(255,64,217,0.08)");
    glow.addColorStop(1, "rgba(255,64,217,0)");
    g.fillStyle = glow;
    g.fillRect(0, HORIZON - 70, W, 126);
    const horizon = g.createLinearGradient(0, 0, W, 0);
    horizon.addColorStop(0, "rgba(255,64,217,0)");
    horizon.addColorStop(0.5, "rgba(255,64,217,0.28)");
    horizon.addColorStop(1, "rgba(255,64,217,0)");
    g.strokeStyle = horizon;
    g.lineWidth = 1.5;
    line(g, 0, HORIZON, W, HORIZON);
    // 세로선: 소실점으로 모인다
    g.strokeStyle = "rgba(64,230,255,0.06)";
    g.lineWidth = 1.5;
    for (let i = -12; i <= 12; i++) line(g, W / 2, HORIZON, W / 2 + i * 110, H);
    // 가로선: 앞으로 흘러온다(가까울수록 간격이 넓다)
    const scroll = (this.bt * 0.6) % 1, depth = H - HORIZON;
    for (let i = 0; i < 12; i++) {
      const z = (i + 1 - scroll) / 12;
      const y = HORIZON + depth * z * z;
      g.strokeStyle = `rgba(64,230,255,${0.025 + 0.06 * z})`;
      g.lineWidth = 1 + 1.5 * z;
      line(g, 0, y, W, y);
    }
    for (const f of this.floaters) {
      const col = SKIN.blocks[f.c];
      let a = f.a;
      if (f.x > LOGO_ZONE.x && f.x < LOGO_ZONE.x + LOGO_ZONE.w && f.y > LOGO_ZONE.y && f.y < LOGO_ZONE.y + LOGO_ZONE.h) a *= 0.25;
      // Open menu labels need quiet space even when a floater passes behind them.
      if (f.x > 84 && f.x < 636 && f.y > 540 && f.y < 1280) a *= 0.12;
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.rot);
      g.globalAlpha = a;
      g.shadowColor = col;
      g.shadowBlur = 12;
      g.fillStyle = "rgba(10,5,20,0.8)";
      g.fillRect(-f.s / 2, -f.s / 2, f.s, f.s);
      g.lineWidth = 3;
      g.strokeStyle = col;
      g.strokeRect(-f.s / 2, -f.s / 2, f.s, f.s);
      g.shadowBlur = 0;
      g.fillStyle = col;
      g.fillRect(-f.s * 0.16, -f.s * 0.16, f.s * 0.32, f.s * 0.32);
      g.restore();
    }
    const floorFade = g.createLinearGradient(0, HORIZON, 0, H);
    floorFade.addColorStop(0, "rgba(8,5,16,0)");
    floorFade.addColorStop(1, "rgba(8,5,16,0.85)");
    g.fillStyle = floorFade; g.fillRect(0, HORIZON, W, H - HORIZON);
  }

  drawLogo(g: CanvasRenderingContext2D): void {
    this.layout(g);
    if (this.pendingScatter) {
      this.pendingScatter = false;
      for (const l of this.letters) this.scatter(l);
    }
    const dim = this.flicker > 0 && this.flicker % 0.11 > 0.055 ? 0.84 : 1;
    const baseY = LOGO_Y + 128;
    this.letters.forEach((l, i) => {
      const p = Math.min(1, Math.max(0, (this.t - i * STAGGER) / GATHER_TIME));
      if (p <= 0) return;
      const e = 1 - (1 - p) ** 3;
      g.save();
      g.translate(l.x + l.w / 2 + l.fx * (1 - e), baseY - TOP_SIZE * 0.35 + l.fy * (1 - e));
      g.rotate(l.rot0 * (1 - e));
      g.transform(1, 0, SLANT, 1, 0, 0);
      const flash = p > 0.85 && p < 1 ? 1 - (p - 0.85) / 0.15 : 0;
      glowText(g, l.ch, -l.w / 2, TOP_SIZE * 0.35, TOP_SIZE, flash > 0 ? "#b3f7ff" : CYAN, Math.min(1, p * 2) * dim);
      g.restore();
    });
    const gathered = this.t >= (this.letters.length - 1) * STAGGER + GATHER_TIME;
    if (gathered && this.letters.length) {
      // 오른쪽 끝에서 뒤로 흩날리는 파편(고정 배치)
      const last = this.letters[this.letters.length - 1];
      const x1 = last.x + last.w + 10;
      let seed = 9;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      g.fillStyle = CYAN;
      g.globalAlpha = 0.75 * dim;
      for (let i = 0; i < 9; i++) {
        const qx = x1 - 6 + r() * 76, qy = baseY - TOP_SIZE * (0.05 + r() * 0.7);
        const s = (5 + r() * 7) * (1 - (qx - x1) / 110), rot = r() * 6.28;
        g.save();
        g.translate(qx, qy);
        g.rotate(rot);
        g.beginPath();
        g.moveTo(0, -s);
        g.lineTo(s * 0.6, s * 0.5);
        g.lineTo(-s * 0.5, s * 0.6);
        g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
    }
    this.drawStamp(g);
    for (const s of this.shards) {
      const k = s.t / s.max;
      g.strokeStyle = s.c;
      g.globalAlpha = 1 - k;
      g.lineWidth = s.w * (1 - k) + 1;
      line(g, s.x - s.vx * 0.04, s.y - s.vy * 0.04, s.x, s.y);
    }
    g.globalAlpha = 1;
  }

  private drawStamp(g: CanvasRenderingContext2D): void {
    const p = Math.min(1, Math.max(0, (this.t - SLAM_AT) / SLAM_TIME));
    if (p <= 0) return;
    let sc = 2.6 + (1 - 2.6) * p * p;
    if (this.slamDone) {
      sc = 1 + 0.008 * Math.sin(this.t * 1.5);
      const since = this.t - SLAM_AT - SLAM_TIME;
      if (since < 0.2) sc *= 1 - 0.06 * Math.sin((since / 0.2) * Math.PI);
    }
    const a = Math.min(1, p * 1.5);
    g.save();
    g.translate(W / 2, LOGO_Y + 255);
    g.rotate((-4 * Math.PI) / 180);
    g.scale(sc, sc);
    g.font = `700 ${STAMP_SIZE}px ${FONT}`;
    const ws = [...t("LOGO_BOTTOM")].map((c) => g.measureText(c).width);
    const tw = ws.reduce((x, y) => x + y, 0) + 12 * 4;
    const fx = -tw / 2 - 34, fy = -82, fw = tw + 68, fh = 156;
    g.globalAlpha = a;
    g.shadowColor = PINK;
    g.shadowBlur = 22;
    roundRect(g, fx, fy, fw, fh, 26);
    g.lineWidth = 6;
    g.strokeStyle = PINK;
    g.stroke();
    g.shadowBlur = 0;
    g.globalAlpha = a * 0.6;
    roundRect(g, fx + 12, fy + 12, fw - 24, fh - 24, 18);
    g.lineWidth = 2.5;
    g.stroke();
    let x = -tw / 2;
    [...t("LOGO_BOTTOM")].forEach((c, i) => {
      glowText(g, c, x, STAMP_SIZE * 0.36, STAMP_SIZE, PINK, a);
      x += ws[i] + 12;
    });
    g.restore();
  }
}

function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

/** 네온관 글씨: 바깥 빛 + 밝은 속(왼쪽 기준선 위치) */
function glowText(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, a: number): void {
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.lineJoin = "round";
  g.globalAlpha = a * 0.16;
  g.strokeStyle = col;
  g.lineWidth = 16;
  g.strokeText(s, x, y);
  g.globalAlpha = a;
  g.lineWidth = 3;
  g.shadowColor = col;
  g.shadowBlur = 18;
  g.strokeText(s, x, y);
  g.shadowBlur = 0;
  g.fillStyle = "#f0fbff";
  g.globalAlpha = a;
  g.fillText(s, x, y);
  g.fillStyle = col;
  g.globalAlpha = a * 0.35;
  g.fillText(s, x, y);
  g.globalAlpha = 1;
}
