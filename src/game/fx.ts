/** 가벼운 파티클: 파편, 블록 섬광, 충격파 링, 반짝이 별. 배열에 담아 한 번에 그린다. */
const GRAVITY = 1800;

interface Part { x: number; y: number; vx: number; vy: number; t: number; max: number; s: number; c: string; r: number; rv: number }
interface Flash { x: number; y: number; s: number; c: string; t: number; max: number }
interface Ring { x: number; y: number; r: number; c: string; t: number; max: number }
interface Star { x: number; y: number; vx: number; vy: number; t: number; max: number; s: number; c: string; ember?: boolean }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Fx {
  private parts: Part[] = [];
  private flashes: Flash[] = [];
  private rings: Ring[] = [];
  private stars: Star[] = [];

  burst(x: number, y: number, c: string, amount: number, power: number): void {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = rand(0.35, 1) * power;
      this.parts.push({
        x: x + rand(-18, 18), y: y + rand(-18, 18),
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - power * 0.4,
        t: 0, max: rand(0.35, 0.7), s: rand(6, 13), c, r: Math.random() * 6.28, rv: rand(-14, 14),
      });
    }
  }

  flash(x: number, y: number, size: number, c: string): void {
    this.flashes.push({ x, y, s: size, c, t: 0, max: 0.16 });
  }

  ring(x: number, y: number, r: number, c: string): void {
    this.rings.push({ x, y, r, c, t: 0, max: 0.38 });
  }

  sparkle(x: number, y: number, c: string, amount: number, power: number): void {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = rand(0.3, 1) * power;
      this.stars.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, t: 0, max: rand(0.5, 0.9), s: rand(5, 10), c });
    }
  }

  /** 피버 불꽃: 화면 아래에서 천천히 떠오르며 흔들린다(별과 같은 목록을 쓰되 위로 뜬다). */
  ember(x: number, y: number, c: string): void {
    this.stars.push({ x, y, vx: rand(-30, 30), vy: -rand(260, 520), t: 0, max: rand(1.2, 2.2), s: rand(3, 7), c, ember: true });
  }

  update(dt: number): void {
    for (const p of this.parts) {
      p.t += dt;
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.rv * dt;
    }
    for (const s of this.stars) {
      s.t += dt;
      if (s.ember) {
        s.vx += Math.sin(s.t * 6 + s.max * 10) * 120 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        continue;
      }
      s.vx *= 1 - 3 * dt;
      s.vy = s.vy * (1 - 3 * dt) + 60 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    for (const f of this.flashes) f.t += dt;
    for (const r of this.rings) r.t += dt;
    this.parts = this.parts.filter((p) => p.t < p.max);
    this.stars = this.stars.filter((s) => s.t < s.max);
    this.flashes = this.flashes.filter((f) => f.t < f.max);
    this.rings = this.rings.filter((r) => r.t < r.max);
  }

  draw(g: CanvasRenderingContext2D): void {
    g.save();
    for (const f of this.flashes) {
      const k = 1 - f.t / f.max;
      const s = f.s * (1 + 0.25 * (1 - k));
      g.globalAlpha = k * 0.65;
      g.fillStyle = f.c;
      g.fillRect(f.x - s / 2, f.y - s / 2, s, s);
    }
    g.globalCompositeOperation = "lighter";
    for (const r of this.rings) {
      const k = r.t / r.max;
      g.globalAlpha = (1 - k) * 0.45;
      g.strokeStyle = r.c;
      g.lineWidth = 5 * (1 - k) + 1;
      g.beginPath();
      g.arc(r.x, r.y, r.r * (1 - (1 - k) ** 3), 0, Math.PI * 2);
      g.stroke();
    }
    for (const p of this.parts) {
      const k = 1 - p.t / p.max;
      g.globalAlpha = k;
      g.fillStyle = p.c;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      const s = p.s * (0.5 + 0.5 * k);
      g.fillRect(-s / 2, -s / 2, s, s);
      g.restore();
    }
    for (const s of this.stars) {
      const k = 1 - s.t / s.max;
      g.globalAlpha = k * (0.6 + 0.4 * Math.sin(s.t * 40));
      g.fillStyle = s.c;
      star(g, s.x, s.y, s.s * (0.6 + 0.4 * k));
    }
    g.restore();
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.35;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
