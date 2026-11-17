import { touchUI } from "./device.ts";
import { BoardModel } from "../core/board-model.ts";
import { BLOCK, BoardView, CELL, blockColor, chainColor, drawBlockIcon, drawCrystal, type BreakEvent } from "./board-view.ts";
import { CRYSTAL, CRYSTAL_COL, CRYSTAL_CROSS, CRYSTAL_ROW } from "../core/board-model.ts";
import { fitText, text, wrapText } from "./draw.ts";
import { Fx } from "./fx.ts";
import { t, type TextKey } from "./i18n.ts";
import { alpha, mix, SKIN } from "./skin.ts";
import { Tweens } from "./tween.ts";

/** 게임 방법 페이지 수 */
export const HOWTO_PAGES = 5;

const HOLD_AFTER = 1.3, FADE = 0.25;
// 게임과 같은 BoardView·Fx 좌표로 그린 뒤 그림 전체를 줄인다.
const BOARD_SCALE = 0.8;
const stamp = [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
const BODY = "#d0cddd";

/** 예시 판 글자: 0~4 블록 색, R 가로줄 · V 세로줄 · X 십자 크리스탈 */
const CRYSTAL_CHARS: Record<string, number> = { R: CRYSTAL_ROW, V: CRYSTAL_COL, X: CRYSTAL_CROSS };

function boardFrom(rows: string[]): BoardModel {
  const model = new BoardModel(rows[0].length, rows.length, 5, 1);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const kind = CRYSTAL_CHARS[ch];
    if (kind) {
      model.set(x, y, CRYSTAL);
      model.crystals[y * model.cols + x] = kind;
    } else model.set(x, y, Number(ch));
  }));
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
  /** 이 예시의 도장 모양 */
  private readonly shape: { x: number; y: number }[];

  constructor(rows: string[], at: { x: number; y: number }, stampAt = 1.1, speed = 1, shape = stamp) {
    this.rows = rows;
    this.at = at;
    this.stampAt = stampAt;
    this.speed = speed;
    this.shape = shape;
    this.model = boardFrom(rows);
    this.hit = new Set(this.model.computeBreak(at.x, at.y, shape).all.map((p) => p.y * this.model.cols + p.x));
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
    this.board.setPiece(this.shape);
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
        const col = blockColor(b.color);
        this.tweens.add().wait(b.delay).call(() => {
          this.fx.burst(b.x, b.y, col, 4, 280);
          this.fx.flash(b.x, b.y, BLOCK * BOARD_SCALE, mix(col, "#ffffff", 0.75));
        });
      }
      for (const cr of st.crystals) {
        this.tweens.add().wait(cr.delay).call(() => {
          const w = this.model.cols * CELL * BOARD_SCALE, h = this.model.rows * CELL * BOARD_SCALE, c = "#e8f6ff";
          if (cr.kind !== CRYSTAL_COL) this.fx.beam(w / 2, cr.y, w + 30, CELL * BOARD_SCALE * 0.5, false, c);
          if (cr.kind !== CRYSTAL_ROW) this.fx.beam(cr.x, h / 2, h + 30, CELL * BOARD_SCALE * 0.5, true, c);
          this.fx.ring(cr.x, cr.y, CELL * BOARD_SCALE * 1.6, "rgba(255,255,255,0.95)");
          this.fx.sparkle(cr.x, cr.y, "#ffffff", 12, 420);
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

  /** 가르치는 덧그림: 게임 미리보기와 똑같이 그린다(BoardView.drawBreakArea를 같이 쓴다) */
  private drawFootprint(g: CanvasRenderingContext2D): void {
    const m = this.model;
    const cells = [...this.hit].map((i) => ({ x: i % m.cols, y: Math.floor(i / m.cols) }));
    this.board.drawBreakArea(g, cells, this.at, this.shape, false);
  }

}

/** 게임 방법 세 페이지: 1 찍으면 번져요 / 2 떨어지면 연쇄 / 3 폭탄 · 피버 · 시간 */
export class Howto {
  page = 0;
  /** 3쪽 크리스탈 그림이 반짝이는 시계 */
  private clock = 0;
  // 1쪽: 분홍·하늘·금색이 함께 부서지고, 떨어져 있는 같은 색은 남는다(연쇄 없음)
  private readonly spread = new Demo(["00422", "00311", "40312", "23040"], { x: 2, y: 2 });
  // 2쪽: 맨 아래에서 둘째 줄을 찍으면 위 금색 기둥이 내려와 바닥 금색과 이어져 연쇄.
  //      올려 둔 모습을 2.6초 보여 주고, 떨어지고 이어지는 과정을 절반 넘게 느리게 보여 준다.
  private readonly chain = new Demo(["24142", "31213", "41314", "00000", "21112"], { x: 2, y: 3 }, 2.6, 0.45);
  // 4쪽: 가운데 크리스탈 바로 왼쪽 칸을 찍으면 크리스탈이 함께 깨지며 줄을 지운다(세 판이 조금씩 엇갈려)
  private readonly crystals = (["R", "V", "X"] as const).map((k, i) =>
    new Demo(["01234", "23401", `40${k}12`, "12340", "34012"], { x: 1, y: 2 }, 1.2 + i * 0.35, 0.4, [{ x: 0, y: 0 }]));

  reset(page = 0): void {
    this.page = page;
    this.spread.reset();
    this.chain.reset();
    for (const d of this.crystals) d.reset();
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.page === 0) this.spread.update(dt);
    else if (this.page === 1) this.chain.update(dt);
    else if (this.page === 3) for (const d of this.crystals) d.update(dt);
  }

  /** 페이지 하나를 그린다. top: 제목 줄 위치 */
  draw(g: CanvasRenderingContext2D, top: number): void {
    const x = 60, w = 600, n = this.page + 1;
    text(g, t("HOWTO_STEP_FMT", String(n).padStart(2, "0")), x, top + 34, 30, SKIN.accent, "left");
    fitText(g, t(`HOWTO_C${n}_T` as TextKey), x + 70, top + 34, 38, w - 70, SKIN.text);
    if (this.page === 0) this.drawSpread(g, x, top, w);
    else if (this.page === 1) this.drawChain(g, x, top, w);
    else if (this.page === 2) this.drawColors(g, x, top, w);
    else if (this.page === 3) this.drawCrystals(g, x, top, w);
    else this.drawTime(g, x, top, w);
    // 페이지 점
    for (let i = 0; i < HOWTO_PAGES; i++) {
      g.fillStyle = i === this.page ? SKIN.accent : alpha(SKIN.muted, 0.35);
      g.beginPath();
      g.arc(360 + (i - (HOWTO_PAGES - 1) / 2) * 34, 1062, i === this.page ? 8 : 6, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawSpread(g: CanvasRenderingContext2D, x: number, top: number, w: number): void {
    const end = wrapText(g, t("HOWTO_C1_B"), x, top + 92, w, 29, 38, BODY);
    // 핵심 규칙 한 줄은 따로, 금빛으로 빛나게
    text(g, t("HOWTO_C1_RULE"), x, top + 92 + end - 38 + 52, 30, SKIN.timeText, "left", alpha(SKIN.timeText, 0.6));
    const d = this.spread, cs = 76, bx = 360 - (d.cols * cs) / 2, by = top + 236;
    d.draw(g, bx, by, cs, true);
    const ly = by + d.model.rows * cs + 50;
    fitText(g, t("HOWTO_STAMP_FMT", 3), 360, ly, 26, w, SKIN.muted, "center");
    fitText(g, t("HOWTO_BREAK_FMT", d.hit.size), 360, ly + 40, 26, w, SKIN.muted, "center");
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

  /** 3쪽 여러 색: 색 가짓수별 배율 표 */
  private drawColors(g: CanvasRenderingContext2D, x: number, top: number, w: number): void {
    wrapText(g, t("HOWTO_COLORS_B"), x, top + 92, w, 29, 38, BODY);
    const MULT = ["×1.5", "×2.2", "×3", "×4"], COLS = ["#40f2ff", "#ffc733", "#ff8c1a", "#ff40d9"];
    for (let r = 0; r < 4; r++) {
      const n = r + 2, y = top + 290 + r * 118;
      if (r > 0) {
        g.fillStyle = alpha(SKIN.muted, 0.18);
        g.fillRect(x + 40, y - 60, w - 80, 1);
      }
      for (let c = 0; c < n; c++) drawBlockIcon(g, c, x + 70 + c * 64, y, 52);
      text(g, MULT[r], x + w - 40, y + 16, 50, COLS[r], "right", alpha(COLS[r], 0.5));
    }
    accentDivider(g, top + 700);
    wrapText(g, t("HOWTO_COLORS_NOTE"), 360, top + 750, w, 26, 36, SKIN.muted, "center");
  }

  /** 4쪽 크리스탈: 가로줄 · 세로줄 · 십자, 지우는 줄 빛과 생기는 조건 */
  private drawCrystals(g: CanvasRenderingContext2D, x: number, top: number, w: number): void {
    wrapText(g, t("HOWTO_CRYSTAL_B"), x, top + 92, w, 27, 36, BODY);
    const kinds: [number, TextKey, TextKey][] = [
      [CRYSTAL_ROW, "HOWTO_CR_ROW", "HOWTO_CR_ROW_IF"],
      [CRYSTAL_COL, "HOWTO_CR_COL", "HOWTO_CR_COL_IF"],
      [CRYSTAL_CROSS, "HOWTO_CR_CROSS", "HOWTO_CR_CROSS_IF"],
    ];
    kinds.forEach(([, name, cond], k) => {
      // 작은 판에서 진짜로 깨지는 모습(크리스탈 옆 칸을 찍으면 → 줄이 통째로)
      const d = this.crystals[k], cs = 36, cx = x + 100 + k * 200;
      d.draw(g, cx - (d.cols * cs) / 2, top + 300, cs, true);
      text(g, t(name), cx, top + 540, 32, SKIN.text, "center");
      fitText(g, t(cond), cx, top + 582, 24, 190, SKIN.muted, "center");
    });
    accentDivider(g, top + 700);
    wrapText(g, t("HOWTO_CRYSTAL_NOTE"), 360, top + 750, w, 26, 36, SKIN.muted, "center");
  }

  /** 5쪽 시간 늘리기: 무엇으로 몇 초 */
  private drawTime(g: CanvasRenderingContext2D, x: number, top: number, w: number): void {
    wrapText(g, t("HOWTO_TIME_B"), x, top + 92, w, 29, 38, BODY);
    const rows: [TextKey, string, (cx: number, cy: number) => void][] = [
      ["HOWTO_TIME_3", "+0.25", (cx, cy) => { for (let c = 0; c < 3; c++) drawBlockIcon(g, c, cx + c * 56, cy, 46); }],
      ["HOWTO_TIME_4", "+0.5", (cx, cy) => { for (let c = 0; c < 4; c++) drawBlockIcon(g, c, cx + c * 56, cy, 46); }],
      ["HOWTO_TIME_CR", "+0.5", (cx, cy) => drawCrystal(g, cx + 20, cy, 26, CRYSTAL_ROW, this.clock)],
    ];
    rows.forEach(([name, sec, pic], r) => {
      const y = top + 290 + r * 140;
      if (r > 0) {
        g.fillStyle = alpha(SKIN.muted, 0.18);
        g.fillRect(x + 40, y - 70, w - 80, 1);
      }
      pic(x + 60, y - 6);
      text(g, t(name), x + 60, y + 52, 26, SKIN.muted, "left");
      text(g, t("TIME_DELTA_FMT", sec), x + w - 40, y + 14, 50, "#66ff99", "right", alpha("#66ff99", 0.5));
    });
    accentDivider(g, top + 700);
    wrapText(g, t("HOWTO_TIME_NOTE"), 360, top + 750, w, 26, 36, SKIN.muted, "center");
  }
}

function accentDivider(g: CanvasRenderingContext2D, y: number): void {
  g.fillStyle = alpha(SKIN.muted, 0.25);
  g.fillRect(260, y, 200, 1);
}
