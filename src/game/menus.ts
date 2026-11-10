import { roundRect } from "./board-view.ts";
import { text } from "./draw.ts";
import { drawCard } from "./howto.ts";
import { getLang, setLang, t, type TextKey } from "./i18n.ts";
import { alpha, font, mix, SKIN } from "./skin.ts";
import { ease, Tweens } from "./tween.ts";
import { GRADE_NAMES } from "../core/game-rules.ts";

/**
 * 메뉴 화면: 타이틀 / 게임 방법 / 설정 / 일시정지 / 결과.
 * 캔버스에 직접 그리는 작은 위젯(버튼, 슬라이더)과 키보드 이동(↑↓ Tab, Enter, Esc, ←→ 슬라이더)을 갖는다.
 * 버튼을 누르면 콜백만 부르고, 실제 흐름은 Game이 처리한다.
 */
const W = 720, H = 1280;
const BTN_W = 420, BTN_H = 92;
const BTN_X = (W - BTN_W) / 2;

export type PanelId = "title" | "howto" | "settings" | "pause" | "result";

export interface Settings {
  sfx: number;
  music: number;
  shake: boolean;
}

export interface ResultData {
  score: number;
  best: number;
  newBest: boolean;
  maxCombo: number;
  grades: number[];
  time: number;
  biggest: number;
}

export interface MenuActions {
  start(): void;
  tutorial(): void;
  resume(): void;
  restart(): void;
  toTitle(): void;
  settingsChanged(s: Settings): void;
  click(): void;
  sound(name: "pop" | "big" | "perfect" | "tick", pitch?: number, db?: number): void;
  shake(power: number): void;
}

/** 결과 연출 진행 상태(값은 0~1 또는 지금 보이는 숫자) */
interface ResultAnim {
  running: boolean;
  title: number;
  titleScale: number;
  score: number;
  scoreA: number;
  scoreScale: number;
  best: number;
  bestScale: number;
  rows: { a: number; dx: number; values: number[] }[];
  buttons: number;
}

interface Button {
  kind: "button";
  y: number;
  label: () => string;
  primary?: boolean;
  onPress: () => void;
  press: number;
}

interface Slider {
  kind: "slider";
  y: number;
  label: () => string;
  get: () => number;
  set: (v: number) => void;
}

type Widget = Button | Slider;

interface Panel {
  dim: number;
  widgets: Widget[];
  draw: (g: CanvasRenderingContext2D) => void;
}

const SETTINGS_KEY = "ss.settings";

export function loadSettings(): Settings {
  const d: Settings = { sfx: 0.8, music: 0.6, shake: true };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return d;
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 저장 못 해도 진행 */
  }
}

export class Menus {
  current: PanelId | null = null;
  best = 0;
  result: ResultData | null = null;
  readonly settings: Settings;
  private panels: Record<PanelId, Panel>;
  private fade = 0;
  private focus = -1;
  private hover = -1;
  private drag: Slider | null = null;
  private settingsBack: PanelId = "title";
  private clock = 0;

  private actions: MenuActions;
  private tweens = new Tweens();
  private anim: ResultAnim | null = null;

  constructor(actions: MenuActions) {
    this.actions = actions;
    this.settings = loadSettings();
    const btn = (y: number, key: TextKey, onPress: () => void, primary = false): Button => ({
      kind: "button", y, label: () => t(key), onPress, primary, press: 0,
    });
    const changed = () => {
      saveSettings(this.settings);
      this.actions.settingsChanged(this.settings);
    };
    this.panels = {
      title: {
        dim: 0,
        widgets: [
          btn(664, "START", () => this.actions.start(), true),
          btn(768, "HOW_TO_PLAY", () => this.open("howto")),
          btn(872, "TUTORIAL_BTN", () => this.actions.tutorial()),
          btn(976, "SETTINGS", () => this.openSettings("title")),
        ],
        draw: (g) => this.drawTitle(g),
      },
      howto: {
        dim: 0.94,
        widgets: [btn(1090, "BACK", () => this.open("title"), true)],
        draw: (g) => {
          heading(g, t("HOW_TO_PLAY"));
          for (let i = 0; i < 3; i++) drawCard(g, i as 0 | 1 | 2, 24, 280 + i * 250, W - 48, 232);
          text(g, t("HOWTO_KEYS"), W / 2, 1066, 22, "rgba(235,250,255,0.6)", "center");
        },
      },
      settings: {
        dim: 0.94,
        widgets: [
          { kind: "slider", y: 420, label: () => t("SOUND_FMT", Math.round(this.settings.sfx * 100)), get: () => this.settings.sfx, set: (v) => { this.settings.sfx = v; changed(); } },
          { kind: "slider", y: 570, label: () => t("MUSIC_FMT", Math.round(this.settings.music * 100)), get: () => this.settings.music, set: (v) => { this.settings.music = v; changed(); } },
          { kind: "button", y: 660, label: () => t("SHAKE_FMT", t(this.settings.shake ? "ON" : "OFF")), press: 0, onPress: () => { this.settings.shake = !this.settings.shake; changed(); } },
          { kind: "button", y: 772, label: () => t("LANGUAGE_FMT", t("LANG_NAME")), press: 0, onPress: () => setLang(getLang() === "ko" ? "en" : "ko") },
          btn(1080, "BACK", () => this.open(this.settingsBack), true),
        ],
        draw: (g) => heading(g, t("SETTINGS")),
      },
      pause: {
        dim: 0.97, // 멈춘 채로 다음 자리를 계산하지 못하게 보드를 거의 가린다
        widgets: [
          btn(440, "RESUME", () => this.actions.resume(), true),
          btn(552, "RESTART", () => this.actions.restart()),
          btn(664, "SETTINGS", () => this.openSettings("pause")),
          btn(776, "TITLE", () => this.actions.toTitle()),
        ],
        draw: (g) => heading(g, t("PAUSED")),
      },
      result: {
        dim: 0.86,
        widgets: [btn(930, "RETRY", () => this.actions.restart(), true), btn(1042, "TITLE", () => this.actions.toTitle())],
        draw: (g) => this.drawResult(g),
      },
    };
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  open(id: PanelId): void {
    this.tweens.clear();
    this.anim = null;
    this.current = id;
    if (id === "result") this.playResult();
    this.fade = 0;
    this.focus = -1;
    this.hover = -1;
    this.drag = null;
  }

  close(): void {
    this.current = null;
  }

  private openSettings(back: PanelId): void {
    this.settingsBack = back;
    this.open("settings");
  }

  /** Esc / 뒤로 가기 */
  back(): void {
    if (this.current === "howto") this.open("title");
    else if (this.current === "settings") this.open(this.settingsBack);
    else if (this.current === "pause") this.actions.resume();
  }

  private get widgets(): Widget[] {
    return this.current ? this.panels[this.current].widgets : [];
  }

  private hit(x: number, y: number): number {
    return this.widgets.findIndex((w) => x >= BTN_X - 20 && x < BTN_X + BTN_W + 20 && y >= w.y - (w.kind === "slider" ? 30 : 0) && y < w.y + (w.kind === "slider" ? 30 : BTN_H));
  }

  // ---------------------------------------------------------------- 입력 (열려 있으면 입력을 다 먹는다)

  pointerDown(x: number, y: number): boolean {
    if (!this.current) return false;
    if (this.current === "result" && this.anim?.running) {
      this.finishResult();
      return true;
    }
    const i = this.hit(x, y);
    const w = this.widgets[i];
    if (w?.kind === "slider") {
      this.drag = w;
      this.slide(w, x);
    } else if (w) {
      this.hover = i;
    }
    return true;
  }

  pointerMove(x: number, y: number): boolean {
    if (!this.current) return false;
    if (this.drag) this.slide(this.drag, x);
    else this.hover = this.hit(x, y);
    return true;
  }

  pointerUp(x: number, y: number): boolean {
    if (!this.current) return false;
    if (this.drag) {
      this.drag = null;
      return true;
    }
    const i = this.hit(x, y);
    const w = this.widgets[i];
    if (w?.kind === "button" && this.buttonsReady) this.press(w);
    return true;
  }

  private get buttonsReady(): boolean {
    return this.current !== "result" || (this.anim?.buttons ?? 1) > 0.5;
  }

  key(code: string): boolean {
    if (!this.current) return false;
    const ws = this.widgets;
    if (code === "ArrowDown" || code === "Tab") this.focus = (this.focus + 1) % ws.length;
    else if (code === "ArrowUp") this.focus = (this.focus - 1 + ws.length) % ws.length;
    else if (code === "Escape") this.back();
    else if (code === "Enter" || code === "Space" || code === "NumpadEnter") {
      if (this.current === "result" && this.anim?.running) {
        this.finishResult();
        return true;
      }
      const w = ws[Math.max(0, this.focus)];
      if (w?.kind === "button") this.press(w);
    } else if ((code === "ArrowLeft" || code === "ArrowRight") && ws[this.focus]?.kind === "slider") {
      const s = ws[this.focus] as Slider;
      s.set(Math.min(1, Math.max(0, Math.round((s.get() + (code === "ArrowRight" ? 0.05 : -0.05)) * 20) / 20)));
    }
    return true;
  }

  private slide(s: Slider, x: number): void {
    const v = Math.round(((x - BTN_X) / BTN_W) * 20) / 20;
    const nv = Math.min(1, Math.max(0, v));
    if (nv !== s.get()) s.set(nv);
  }

  private press(b: Button): void {
    b.press = 1;
    this.actions.click();
    b.onPress();
  }

  // ---------------------------------------------------------------- 그리기

  update(dt: number): void {
    this.clock += dt;
    this.tweens.update(dt);
    this.fade = Math.min(1, this.fade + dt / 0.18);
    for (const w of this.widgets) if (w.kind === "button") w.press = Math.max(0, w.press - dt / 0.15);
  }

  draw(g: CanvasRenderingContext2D): void {
    if (!this.current) return;
    const p = this.panels[this.current];
    g.save();
    g.globalAlpha = this.fade;
    g.fillStyle = `rgba(5,2,13,${p.dim})`;
    g.fillRect(0, 0, W, H);
    p.draw(g);
    const btnA = this.current === "result" ? (this.anim?.buttons ?? 1) : 1;
    p.widgets.forEach((w, i) => {
      g.save();
      g.globalAlpha *= btnA;
      if (btnA < 1) g.translate(0, 24 * (1 - btnA));
      if (w.kind === "button") this.drawButton(g, w, i);
      else this.drawSlider(g, w, i);
      g.restore();
    });
    g.restore();
  }

  private drawButton(g: CanvasRenderingContext2D, b: Button, i: number): void {
    const hot = this.hover === i;
    const focused = this.focus === i;
    const s = 1 - 0.06 * Math.sin(b.press * Math.PI);
    g.save();
    g.translate(W / 2, b.y + BTN_H / 2);
    g.scale(s, s);
    roundRect(g, -BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 22);
    if (b.primary) {
      g.shadowColor = alpha(SKIN.accent, 0.6);
      g.shadowBlur = hot ? 26 : 16;
      g.fillStyle = hot ? mix(SKIN.accent, "#ffffff", 0.25) : SKIN.accent;
      g.fill();
      g.shadowBlur = 0;
    } else {
      g.fillStyle = hot ? "#1a1433" : SKIN.button;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = hot ? "#ff80ea" : SKIN.buttonBorder;
      g.stroke();
    }
    if (focused) {
      roundRect(g, -BTN_W / 2 - 7, -BTN_H / 2 - 7, BTN_W + 14, BTN_H + 14, 28);
      g.lineWidth = 3;
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.stroke();
    }
    text(g, b.label(), 0, 13, 36, b.primary ? SKIN.onAccent : SKIN.text, "center");
    g.restore();
  }

  private drawSlider(g: CanvasRenderingContext2D, s: Slider, i: number): void {
    text(g, s.label(), W / 2, s.y - 34, 34, SKIN.text, "center");
    const v = s.get();
    roundRect(g, BTN_X, s.y - 6, BTN_W, 12, 6);
    g.fillStyle = SKIN.track;
    g.fill();
    roundRect(g, BTN_X, s.y - 6, BTN_W * v, 12, 6);
    g.fillStyle = SKIN.accent;
    g.fill();
    g.beginPath();
    g.arc(BTN_X + BTN_W * v, s.y, this.drag === s || this.focus === i ? 18 : 15, 0, Math.PI * 2);
    g.fillStyle = this.focus === i ? SKIN.accent : SKIN.text;
    g.shadowColor = alpha(SKIN.accent, 0.7);
    g.shadowBlur = 12;
    g.fill();
    g.shadowBlur = 0;
  }

  private drawTitle(g: CanvasRenderingContext2D): void {
    // 로고는 Game(TitleScreen)이 배경과 함께 그린다
    text(g, t("SUBTITLE"), W / 2, 576, 26, "rgba(235,250,255,0.75)", "center", "rgba(0,0,0,0.8)");
    if (this.best > 0) text(g, t("BEST_FMT", this.best), W / 2, 626, 30, SKIN.accent, "center", "rgba(0,0,0,0.8)");
  }

  // ---------------------------------------------------------------- 결과 연출

  /** 제목 → 점수가 띠리리릭 올라가며 쾅 → 최고 기록 → 아래 줄이 하나씩 나타나며 숫자 올라감 → 버튼. */
  private playResult(): void {
    const r = this.result;
    if (!r) return;
    const targets = [[r.maxCombo], r.grades.slice(), [r.time], [r.biggest]];
    const an: ResultAnim = {
      running: true, title: 0, titleScale: 1.6, score: 0, scoreA: 0, scoreScale: 1, best: 0, bestScale: 1,
      rows: targets.map((v) => ({ a: 0, dx: 60, values: v.map(() => 0) })), buttons: 0,
    };
    this.anim = an;
    const snd = this.actions.sound;
    const seq = this.tweens.add();
    seq.call(() => snd("pop", 0.8)).to(0.22, (k) => {
      an.title = Math.min(1, k * 2);
      an.titleScale = 1.6 - 0.6 * k;
    }, ease.inQuad).wait(0.13);
    // 점수: 클수록 조금 더 오래 올라간다
    const dur = Math.min(1.6, Math.max(0.7, 0.7 + r.score / 60000));
    seq.call(() => (an.scoreA = 1)).to(dur, this.counter(dur, (e) => (an.score = Math.round(r.score * e)), r.score > 0));
    seq.call(() => {
      an.score = r.score;
      snd("big", 1.2);
    }).to(0.25, (k) => (an.scoreScale = 1 + 0.25 * Math.sin(k * Math.PI)));
    seq.call(() => {
      if (r.newBest) {
        snd("perfect");
        this.actions.shake(0.5);
      }
    }).to(r.newBest ? 0.14 : 0.2, (k) => {
      an.best = Math.min(1, k * 2);
      an.bestScale = r.newBest ? 2.2 - 1.2 * k : 1;
    }, ease.inQuad).wait(0.3);
    an.rows.forEach((row, i) => {
      seq.call(() => snd("pop", 1 + i * 0.12, -4)).to(0.12, (k) => {
        row.a = k;
        row.dx = 60 * (1 - ease.outCubic(k));
      });
      const has = targets[i].some((v) => v > 0);
      seq.to(0.4, this.counter(0.4, (e) => (row.values = targets[i].map((v) => Math.round(v * e))), has))
        .call(() => (row.values = targets[i].slice()))
        .wait(0.1);
    });
    seq.to(0.25, (k) => (an.buttons = k), ease.outCubic).call(() => (an.running = false));
  }

  /** 0→1로 올라가는 숫자(처음엔 빠르게, 끝에서 천천히) + 점점 높아지는 틱 소리 */
  private counter(dur: number, set: (e: number) => void, sound: boolean): (k: number) => void {
    let lastTick = -1;
    return (k) => {
      set(1 - (1 - k) ** 3);
      const tt = k * dur;
      if (sound && tt - lastTick >= 0.045 && k < 1) {
        lastTick = tt;
        this.actions.sound("tick", 0.85 + 0.9 * k, -5);
      }
    };
  }

  /** 화면을 누르면: 진행 중인 연출을 멈추고 모든 값을 끝 상태로 보여 준다. */
  private finishResult(): void {
    const r = this.result, an = this.anim;
    if (!r || !an) return;
    this.tweens.clear();
    Object.assign(an, { running: false, title: 1, titleScale: 1, score: r.score, scoreA: 1, scoreScale: 1, best: 1, bestScale: 1, buttons: 1 });
    const targets = [[r.maxCombo], r.grades, [r.time], [r.biggest]];
    an.rows.forEach((row, i) => Object.assign(row, { a: 1, dx: 0, values: targets[i].slice() }));
  }

  private drawResult(g: CanvasRenderingContext2D): void {
    const r = this.result, an = this.anim;
    if (!r || !an) return;
    g.save();
    g.globalAlpha = an.title;
    g.translate(W / 2, 200);
    g.scale(an.titleScale, an.titleScale);
    text(g, t("TIME_UP"), 0, 24, 70, SKIN.accent, "center", alpha(SKIN.accent, 0.5));
    g.restore();
    g.globalAlpha = an.scoreA;
    text(g, t("SCORE"), W / 2, 296, 28, alpha(SKIN.score, 0.6), "center");
    g.save();
    g.translate(W / 2, 372);
    g.scale(an.scoreScale, an.scoreScale);
    text(g, String(an.score), 0, 36, 100, SKIN.score, "center", SKIN.scoreGlow);
    g.restore();
    g.globalAlpha = an.best;
    g.save();
    g.translate(W / 2, 470);
    g.scale(an.bestScale, an.bestScale);
    text(g, r.newBest ? t("NEW_BEST") : t("BEST_FMT", r.best), 0, 12, 34, r.newBest ? SKIN.timeText : SKIN.accent, "center", r.newBest ? SKIN.timeGlow : undefined);
    g.restore();
    const rowY = [528, 606, 716, 794];
    const rowH = [66, 96, 66, 66];
    an.rows.forEach((row, i) => {
      if (row.a <= 0) return;
      g.globalAlpha = row.a;
      const x = 110 + row.dx, y = rowY[i];
      roundRect(g, x, y, 500, rowH[i], 16);
      g.fillStyle = SKIN.panel;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = SKIN.panelBorder;
      g.stroke();
      if (i === 1) {
        for (let k = 0; k < 4; k++) {
          const cx = x + k * 125 + 62.5;
          text(g, GRADE_NAMES[k], cx, y + 32, 18, SKIN.grades[k], "center");
          text(g, String(row.values[k]), cx, y + 76, 34, SKIN.grades[k], "center");
        }
        return;
      }
      const name = [t("R_MAX_COMBO"), "", t("R_TIME"), t("R_BIGGEST")][i];
      const v = row.values[0];
      const val = i === 2 ? t("SEC_FMT", v) : i === 3 ? t("COUNT_FMT", v) : String(v);
      text(g, name, x + 28, y + 43, 28, "rgba(235,250,255,0.75)", "left");
      text(g, val, x + 472, y + 46, 34, SKIN.text, "right");
    });
    g.globalAlpha = 1;
  }
}

function heading(g: CanvasRenderingContext2D, s: string, y = 230): void {
  g.font = font(70);
  text(g, s, W / 2, y, 70, SKIN.accent, "center", alpha(SKIN.accent, 0.5));
}
