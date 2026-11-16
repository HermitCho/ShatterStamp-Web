import { touchUI } from "./device.ts";
import { BoardModel } from "../core/board-model.ts";
import { BLOCK, BoardView, CELL, chainColor, drawBombMark, type BreakEvent } from "./board-view.ts";
import { fitText, text, wrapText } from "./draw.ts";
import { Fx } from "./fx.ts";
import { t, type TextKey } from "./i18n.ts";
import { alpha, mix, SKIN } from "./skin.ts";
import { Tweens } from "./tween.ts";

/** 게임 방법 페이지 수 */
export const HOWTO_PAGES = 3;

const HOLD_AFTER = 1.3, FADE = 0.25;
// 게임과 같은 BoardView·Fx 좌표로 그린 뒤 그림 전체를 줄인다.
const BOARD_SCALE = 0.8;
const stamp = [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
const BODY = "#d0cddd";

function boardFrom(rows: string[]): BoardModel {
  const model = new BoardModel(rows[0].length, rows.length, 5, 1);
  rows.forEach((row, y) => [...row].forEach((ch, x) => model.set(x, y, Number(ch))));
  return model;
}

/**
 * 움직이는 예시 하나: 진짜 BoardView로 찍고(번짐·낙하·연쇄까지) 잠깐 뒤 처음 보드로 돌아가 되풀이한다.
 * 예시는 자기 보드·연출·조각을 따로 가져서 실제 판이나 점수를 건드리지 않는다.
 */
class Demo {
  readonly board = new BoardView(0, 0, BOARD_SCALE);
  private readonly tweens = new Tweens();
  private fx = new Fx();
  time = 0;
  ev: BreakEvent | null = null;
  private restoreAt = 9;
  readonly rows: string[];
  readonly at: { x: number; y: number };
  readonly model: BoardModel;
  /** 도장 단계에서 부서질 칸(예시 설명용) */
  readonly hit: Set<number>;
  /** 찍기 전 올려 둔 모습을 보여 주는 시간(초) */
  private readonly stampAt: number;
  /** 찍은 뒤 연출 재생 빠르기(1 = 게임과 같음, 작을수록 느리게) */
  private readonly speed: number;

  constructor(rows: string[], at: { x: number; y: number }, stampAt = 1.1, speed = 1) {
    this.rows = rows;
    this.at = at;
    this.stampAt = stampAt;
    this.speed = speed;
    this.model = boardFrom(rows);
    this.hit = new Set(this.model.computeBreak(at.x, at.y, stamp).all.map((p) => p.y * this.model.cols + p.x));
    this.reset();
  }

  get cols(): number {
    return this.model.cols;
  }

  reset(): void {
    this.time = 0;
    this.restore();
  }

  private restore(): void {
    this.tweens.clear();
    this.fx = new Fx();
    this.ev = null;
    this.restoreAt = 9;
    this.board.setModel(boardFrom(this.rows), false);
    this.board.setPiece(stamp);
  }

  /** 지금 몇 번째 단계가 터지고 있는지(찍기 전 -1) */
  get stepNow(): number {
    if (!this.ev) return -1;
    const k = this.time - this.stampAt;
    let i = 0;
    this.ev.steps.forEach((s, j) => k >= s.at && (i = j));
    return i;
  }

  /** 찍기 전·되돌린 뒤 = 1, 찍는 동안 0으로 사라졌다가 다시 나타나는 알림 값 */
  get ready(): boolean {
    return this.time < this.stampAt;
  }

  get opacity(): number {
    return Math.min(1, Math.min(this.time, this.restoreAt + FADE - this.time) / FADE);
  }

  update(dt: number): void {
    // 단계 경계에서 나눠 돌려야 처음·되풀이·디버그 시간 진행이 같다
    // 찍은 뒤(연출~되돌리기 전)에는 speed만큼 느리게 돌린다. dt는 실제 시간, step은 예시 시간.
    while (dt > 1e-9) {
      const boundary = this.time < this.stampAt ? this.stampAt : this.time < this.restoreAt ? this.restoreAt : this.restoreAt + FADE;
      const rate = this.time >= this.stampAt && this.time < this.restoreAt ? this.speed : 1;
      const step = Math.min(dt * rate, 1 / 120, boundary - this.time);
      this.tweens.update(step);
      this.board.update(step);
      this.fx.update(step);
      this.time += step;
      dt -= step / rate;
      if (this.time >= boundary) {
        if (boundary === this.stampAt) this.land();
        else if (boundary === this.restoreAt) this.restore();
        else this.time = 0;
      }
    }
  }

  private land(): void {
    const ev = this.board.placeAt(this.at.x, this.at.y)!;
    this.ev = ev;
    this.restoreAt = this.stampAt + ev.duration + HOLD_AFTER;
    // 게임의 juiceStep과 같은 블록별 터짐(가벼운 판)
    for (const st of ev.steps) {
      for (const b of st.broken) {
        const col = SKIN.blocks[b.color];
        this.tweens.add().wait(b.delay).call(() => {
          this.fx.burst(b.x, b.y, col, 4, 280);
          this.fx.flash(b.x, b.y, BLOCK * BOARD_SCALE, mix(col, "#ffffff", 0.75));
        });
      }
      this.tweens.add().wait(st.at).call(() => {
        const x = st.chain === 0 ? ev.ax : st.cx, y = st.chain === 0 ? ev.ay : st.cy;
        this.fx.ring(x, y, 70 + st.count * 6, st.chain === 0 ? SKIN.ring : chainColor(st.chain));
        if (st.chain > 0) this.fx.sparkle(x, y, chainColor(st.chain), 10, 380);
      });
    }
  }

  /** x, y에 칸 크기 cs로 그린다. 찍기 전에는 게임과 같은 도장 칸 표시를 덧그린다. */
  draw(g: CanvasRenderingContext2D, x: number, y: number, cs: number, footprint: boolean): void {
    const m = this.model, boardW = m.cols * cs, boardH = m.rows * cs;
    const outline = this.ready ? 1 : Math.max(0, 1 - (this.time - this.stampAt) / 0.2);
    g.save();
    // 조각과 빛 고리는 그림 안에서만(글자를 덮지 않게)
    g.beginPath(); g.rect(x - 14, y - 14, boardW + 28, boardH + 28); g.clip();
    g.globalAlpha *= this.opacity;
    g.translate(x, y);
    const scale = cs / (CELL * BOARD_SCALE);
    g.scale(scale, scale);
    this.board.draw(g);
    if (footprint && outline > 0) {
      g.save();
      g.scale(BOARD_SCALE, BOARD_SCALE);
      g.globalAlpha *= outline;
      this.drawFootprint(g);
      g.restore();
    }
    this.fx.draw(g);
    g.restore();
  }

  /** 가르치는 덧그림: 게임 미리보기와 같은 모양(밖은 어둡게, 회백색 윤곽, 찍는 칸은 굵은 흰 칸) */
  private drawFootprint(g: CanvasRenderingContext2D): void {
    const m = this.model, hit = this.hit;
    g.fillStyle = SKIN.dim;
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      if (!hit.has(y * m.cols + x)) g.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    // 부서질 영역: 게임과 같이 블록이 제 색으로 밝아지고 얇은 회백색 윤곽
    this.board.glowCells(g, [...hit].map((i) => ({ x: i % m.cols, y: Math.floor(i / m.cols) })));
    const has = (x: number, y: number) => m.inBounds(x, y) && hit.has(y * m.cols + x);
    g.lineCap = "square";
    for (const [lw, c] of [[8, "rgba(0,0,8,0.8)"], [3, "rgba(220,226,240,0.85)"]] as const) {
      g.lineWidth = lw; g.strokeStyle = c;
      g.beginPath();
      for (const i of hit) {
        const px0 = i % m.cols, py0 = Math.floor(i / m.cols), px = px0 * CELL, py = py0 * CELL;
        if (!has(px0, py0 - 1)) { g.moveTo(px, py); g.lineTo(px + CELL, py); }
        if (!has(px0, py0 + 1)) { g.moveTo(px, py + CELL); g.lineTo(px + CELL, py + CELL); }
        if (!has(px0 - 1, py0)) { g.moveTo(px, py); g.lineTo(px, py + CELL); }
        if (!has(px0 + 1, py0)) { g.moveTo(px + CELL, py); g.lineTo(px + CELL, py + CELL); }
      }
      g.stroke();
    }
    for (const o of stamp) {
      const x = this.at.x + o.x, y = this.at.y + o.y;
      g.save();
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.beginPath(); g.roundRect(x * CELL + 5, y * CELL + 5, CELL - 10, CELL - 10, 12);
      g.fill();
      g.shadowColor = "rgba(255,255,255,0.9)"; g.shadowBlur = 14;
      g.lineWidth = 6; g.strokeStyle = "#ffffff"; g.stroke();
      g.restore();
    }
  }
}

/** 게임 방법 세 페이지: 1 찍으면 번져요 / 2 떨어지면 연쇄 / 3 폭탄 · 피버 · 시간 */
export class Howto {
  page = 0;
  // 1쪽: 분홍·하늘·금색이 함께 부서지고, 떨어져 있는 같은 색은 남는다(연쇄 없음)
  private readonly spread = new Demo(["00422", "00311", "40312", "23040"], { x: 2, y: 2 });
  // 2쪽: 맨 아래에서 둘째 줄을 찍으면 위 금색 기둥이 내려와 바닥 금색과 이어져 연쇄.
  //      올려 둔 모습을 2.6초 보여 주고, 떨어지고 이어지는 과정을 절반 넘게 느리게 보여 준다.
  private readonly chain = new Demo(["24142", "31213", "41314", "00000", "21112"], { x: 2, y: 3 }, 2.6, 0.45);

  reset(page = 0): void {
    this.page = page;
    this.spread.reset();
    this.chain.reset();
  }

  update(dt: number): void {
    if (this.page === 0) this.spread.update(dt);
    else if (this.page === 1) this.chain.update(dt);
  }

  /** 페이지 하나를 그린다. top: 제목 줄 위치 */
  draw(g: CanvasRenderingContext2D, top: number): void {
    const x = 60, w = 600, n = this.page + 1;
    text(g, t("HOWTO_STEP_FMT", String(n).padStart(2, "0")), x, top + 34, 30, SKIN.accent, "left");
    fitText(g, t(`HOWTO_C${n}_T` as TextKey), x + 70, top + 34, 38, w - 70, SKIN.text);
    if (this.page === 0) this.drawSpread(g, x, top, w);
    else if (this.page === 1) this.drawChain(g, x, top, w);
    else this.drawExtras(g, x, top, w);
    // 페이지 점
    for (let i = 0; i < HOWTO_PAGES; i++) {
      g.fillStyle = i === this.page ? SKIN.accent : alpha(SKIN.muted, 0.35);
      g.beginPath();
      g.arc(360 + (i - 1) * 34, 1062, i === this.page ? 8 : 6, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawSpread(g: CanvasRenderingContext2D, x: number, top: number, w: number): void {
    wrapText(g, t("HOWTO_C1_B"), x, top + 92, w, 29, 38, BODY);
    const d = this.spread, cs = 76, bx = 360 - (d.cols * cs) / 2, by = top + 208;
    d.draw(g, bx, by, cs, true);
    const ly = by + d.model.rows * cs + 54;
    fitText(g, t("HOWTO_STAMP_FMT", 3), 360, ly, 28, w, SKIN.text, "center");
    fitText(g, t("HOWTO_BREAK_FMT", d.hit.size), 360, ly + 44, 30, w, d.ready ? SKIN.text : SKIN.accent, "center");
    accentDivider(g, ly + 84);
    wrapText(g, t(touchUI() ? "HOWTO_AIM" : "HOWTO_AIM_PC"), 360, ly + 130, w, 26, 36, SKIN.muted, "center");
  }

  private drawChain(g: CanvasRenderingContext2D, x: number, top: number, w: number): void {
    wrapText(g, t("HOWTO_C2_B"), x, top + 92, w, 29, 38, BODY);
    const d = this.chain, cs = 72, bx = 360 - (d.cols * cs) / 2, by = top + 208;
    d.draw(g, bx, by, cs, true);
    // 지금 무슨 일이 일어나는지: 찍기 → 연쇄 1 ×2
    const i = d.stepNow, ly = by + d.model.rows * cs + 58;
    const [key, col] = i < 0 ? ["HOWTO_CHAIN_0", SKIN.text] : i === 0 ? ["HOWTO_CHAIN_1", SKIN.accent] : ["HOWTO_CHAIN_2", chainColor(i)];
    fitText(g, t(key as TextKey, i), 360, ly, 32, w, col, "center");
    accentDivider(g, ly + 40);
    wrapText(g, t("HOWTO_CHAIN_NOTE"), 360, ly + 86, w, 25, 35, SKIN.muted, "center");
  }

  /** 3쪽: 그림 하나 + 짧은 설명 세 줄 */
  private drawExtras(g: CanvasRenderingContext2D, x: number, top: number, w: number): void {
    const rows: { title: TextKey; body: TextKey; pic: (cx: number, cy: number) => void }[] = [
      {
        title: "HOWTO_BOMB_T", body: "HOWTO_BOMB_B",
        pic: (cx, cy) => {
          // 3×3 칸 + 가운데 폭탄
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            g.strokeStyle = alpha("#ffffff", dx === 0 && dy === 0 ? 0.9 : 0.35);
            g.lineWidth = 2;
            g.strokeRect(cx + dx * 34 - 15, cy + dy * 34 - 15, 30, 30);
          }
          drawBombMark(g, cx, cy, 10, 1);
        },
      },
      {
        title: "HOWTO_FEVER_T", body: "HOWTO_FEVER_B",
        pic: (cx, cy) => {
          text(g, "FEVER", cx, cy - 10, 28, SKIN.tiers[3], "center");
          g.fillStyle = alpha(SKIN.tiers[3], 0.18); g.fillRect(cx - 70, cy + 10, 140, 6);
          g.save(); g.fillStyle = SKIN.tiers[3]; g.shadowColor = SKIN.tiers[3]; g.shadowBlur = 10;
          g.fillRect(cx - 70, cy + 8, 100, 10); g.restore();
          text(g, "×2", cx, cy + 56, 30, SKIN.timeText, "center");
        },
      },
      {
        title: "HOWTO_TIME_T", body: "HOWTO_TIME_B",
        pic: (cx, cy) => text(g, t("SEC_FMT", 1), cx, cy + 14, 44, "#66ff99", "center"),
      },
    ];
    rows.forEach((r, i) => {
      const y = top + 110 + i * 236;
      if (i > 0) {
        g.fillStyle = alpha(SKIN.muted, 0.22);
        g.fillRect(x, y - 30, w, 1);
      }
      r.pic(x + 80, y + 70);
      fitText(g, t(r.title), x + 190, y + 34, 32, w - 190, SKIN.text);
      wrapText(g, t(r.body), x + 190, y + 82, w - 190, 26, 35, BODY);
    });
  }
}

function accentDivider(g: CanvasRenderingContext2D, y: number): void {
  g.fillStyle = alpha(SKIN.muted, 0.25);
  g.fillRect(260, y, 200, 1);
}
