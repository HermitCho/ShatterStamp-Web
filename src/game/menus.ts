import { roundRect } from "./board-view.ts";
import { accentLine, ellipsisText, fitText, menuBackdrop, text, wrapText } from "./draw.ts";
import { Howto } from "./howto.ts";
import { getLang, GRADE_KEYS, setLang, t, type TextKey } from "./i18n.ts";
import { StampMenu, type StampFootprint } from "./stamp-menu.ts";
import { alpha, font, SKIN } from "./skin.ts";
import { ease, Tweens } from "./tween.ts";
import type { LeaderRow, MyRow } from "./online.ts";

/**
 * 메뉴 화면: 타이틀 / 게임 방법 / 설정 / 일시정지 / 결과.
 * 캔버스에 직접 그리는 작은 위젯(버튼, 슬라이더)과 키보드 이동(↑↓ Tab, Enter, Esc, ←→ 슬라이더)을 갖는다.
 * 버튼을 누르면 콜백만 부르고, 실제 흐름은 Game이 처리한다.
 */
const W = 720;
const BTN_W = 552;
const BTN_X = (W - BTN_W) / 2;

export type PanelId = "title" | "howto" | "settings" | "pause" | "result" | "ranking";

/** 랭킹 화면에 보일 내용. Game이 온라인 결과를 받아 채운다. */
export interface RankView {
  mode: "all" | "mine";
  /** off: 연결 정보 없음 / loading / ready / error */
  status: "off" | "loading" | "ready" | "error";
  /** 로그인했으면 닉네임("" = 아직 안 정함), 안 했으면 null */
  nickname: string | null;
  all: LeaderRow[];
  mine: MyRow[];
  myRank: { rank: number; best: number } | null;
}

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
  /** 랭킹 화면을 열거나 보기(전체/내 기록)를 바꿀 때: 목록을 새로 불러온다 */
  rankRefresh(): void;
  rankLogin(): void;
  rankLogout(): void;
  rankNickname(): void;
}

/** 결과 연출 진행 상태(값은 0~1 또는 지금 보이는 숫자) */
interface ResultAnim {
  running: boolean;
  title: number;
  score: number;
  scoreA: number;
  scoreScale: number;
  best: number;
  rows: { a: number; dx: number; values: number[] }[];
  buttons: number;
}

interface Button {
  kind: "button";
  y: number;
  label: () => string;
  primary?: boolean;
  value?: () => string;
  /** true면 그리지도 고르지도 않는다(로그인 상태에 따라 바뀌는 버튼) */
  hidden?: () => boolean;
  x?: number;
  width?: number;
  small?: boolean;
  profile?: boolean;
  tab?: () => boolean;
  onPress: () => void;
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
  /** 결과 화면 랭킹 한 줄 (Game이 등록 결과에 맞춰 바꾼다) */
  resultRank = "";
  readonly rank: RankView = { mode: "all", status: "off", nickname: null, all: [], mine: [], myRank: null };
  readonly settings: Settings;
  private panels: Record<PanelId, Panel>;
  private fade = 0;
  private focus = -1;
  private hover = -1;
  private drag: Slider | null = null;
  private settingsBack: PanelId = "title";

  private actions: MenuActions;
  private tweens = new Tweens();
  private anim: ResultAnim | null = null;
  private readonly look = new StampMenu();
  private readonly howto = new Howto();

  constructor(actions: MenuActions) {
    this.actions = actions;
    this.settings = loadSettings();
    const btn = (y: number, key: TextKey, onPress: () => void, primary = false): Button => ({
      kind: "button", y, label: () => t(key), onPress, primary,
    });
    const changed = () => {
      saveSettings(this.settings);
      this.actions.settingsChanged(this.settings);
    };
    this.panels = {
      title: {
        dim: 0,
        widgets: [
          btn(596, "START", () => this.actions.start(), true),
          btn(708, "RANKING", () => this.openRanking()),
          btn(802, "HOW_TO_PLAY", () => this.open("howto")),
          btn(896, "TUTORIAL_BTN", () => this.actions.tutorial()),
          btn(990, "SETTINGS", () => this.openSettings("title")),
          {
            // 로그인했으면 메뉴 아래에 내 닉네임과 '닉네임 변경'
            kind: "button", y: 1154, profile: true, width: 552,
            label: () => t("RANK_EDIT_NAME"), value: () => this.rank.nickname || t("RANK_NICK_UNSET"),
            onPress: () => this.actions.rankNickname(),
            hidden: () => this.rank.status === "off" || this.rank.nickname === null,
          },
        ],
        draw: (g) => this.drawTitle(g),
      },
      howto: {
        dim: 0.94,
        widgets: [btn(1168, "BACK", () => this.open("title"), true)],
        draw: (g) => {
          this.look.heading(g, t("HOW_TO_PLAY"));
          text(g, t("HOWTO_SUB"), W / 2, 196, 28, SKIN.muted, "center");
          // 세 단락을 고른 간격으로 위에서부터 채우고, 조작 안내와 뒤로 버튼 사이에 숨 쉴 틈을 둔다
          this.howto.drawSection(g, 0, 60, 236, 600);
          this.howto.drawSection(g, 1, 60, 648, 600);
          this.howto.drawSection(g, 2, 60, 870, 600);
          fitText(g, t("HOWTO_KEYS"), W / 2, 1098, 25, 624, SKIN.muted, "center");
        },
      },
      settings: {
        dim: 0.94,
        widgets: [
          { kind: "slider", y: 396, label: () => t("SOUND"), get: () => this.settings.sfx, set: (v) => { this.settings.sfx = v; changed(); } },
          { kind: "slider", y: 548, label: () => t("MUSIC"), get: () => this.settings.music, set: (v) => { this.settings.music = v; changed(); } },
          { kind: "button", y: 714, label: () => t("SHAKE"), value: () => t(this.settings.shake ? "ON" : "OFF"), onPress: () => { this.settings.shake = !this.settings.shake; changed(); } },
          { kind: "button", y: 854, label: () => t("LANGUAGE"), value: () => t("LANG_NAME"), onPress: () => setLang(getLang() === "ko" ? "en" : "ko") },
          btn(1096, "BACK", () => this.open(this.settingsBack), true),
        ],
        draw: (g) => {
          this.look.heading(g, t("SETTINGS"));
          text(g, t("SETTINGS_SUB"), W / 2, 208, 28, SKIN.muted, "center");
          this.look.lettering(g, t("AUDIO"), BTN_X, 298, 28, BTN_W, SKIN.accent, "left", false);
          accentLine(g, BTN_X, 628, BTN_W, SKIN.muted);
          this.look.lettering(g, t("PREFERENCES"), BTN_X, 682, 28, BTN_W, SKIN.score, "left", false);
          accentLine(g, BTN_X, 994, BTN_W, SKIN.muted);
        },
      },
      pause: {
        dim: 0.97, // 멈춘 채로 다음 자리를 계산하지 못하게 보드를 거의 가린다
        widgets: [
          btn(560, "RESUME", () => this.actions.resume(), true),
          btn(682, "RESTART", () => this.actions.restart()),
          btn(794, "SETTINGS", () => this.openSettings("pause")),
          btn(906, "TITLE", () => this.actions.toTitle()),
        ],
        draw: (g) => {
          g.save(); g.translate(360, 258); g.rotate(-0.055);
          g.fillStyle = SKIN.score;
          g.shadowColor = SKIN.score; g.shadowBlur = 18;
          for (const x of [-23, 9]) {
            roundRect(g, x, -22, 14, 44, 4);
            g.fill();
          }
          g.restore();
          this.look.heading(g, t("PAUSED"), 408);
          fitText(g, t("PAUSE_SUB"), W / 2, 480, 30, 600, SKIN.muted, "center");
          accentLine(g, 200, 1056, 320, SKIN.score);
          fitText(g, t("PAUSE_META"), W / 2, 1110, 28, 600, SKIN.muted, "center");
        },
      },
      ranking: {
        dim: 0.94,
        widgets: [
          {
            kind: "button", y: 176, x: 232, width: 256, label: () => t("RANK_TAB_ALL"),
            tab: () => this.rank.mode === "all", onPress: () => this.rankTab("all"),
          },
          {
            kind: "button", y: 176, x: 488, width: 256, label: () => t("RANK_TAB_MINE"),
            tab: () => this.rank.mode === "mine", onPress: () => this.rankTab("mine"),
          },
          {
            kind: "button", y: 1000, width: 464, label: () => t("RANK_LOGIN"), onPress: () => this.actions.rankLogin(),
            hidden: () => this.rank.status === "off" || this.rank.nickname !== null,
          },
          {
            kind: "button", y: 972, x: 260, width: 304, profile: true,
            label: () => t("RANK_EDIT_NAME"), value: () => this.rank.nickname || t("RANK_NICK_UNSET"),
            onPress: () => this.actions.rankNickname(), hidden: () => this.rank.nickname === null,
          },
          {
            kind: "button", y: 972, x: 538, width: 156, small: true,
            label: () => t("RANK_LOGOUT"), onPress: () => this.actions.rankLogout(),
            hidden: () => this.rank.nickname === null,
          },
          btn(1132, "BACK", () => this.open("title"), true),
        ],
        draw: (g) => this.drawRanking(g),
      },
      result: {
        dim: 0.86,
        widgets: [btn(1052, "RETRY", () => this.actions.restart(), true), btn(1160, "TITLE", () => this.actions.toTitle())],
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
    if (id === "howto") this.howto.reset();
    if (id === "result") this.playResult();
    this.fade = 0;
    this.focus = -1;
    this.hover = -1;
    this.drag = null;
    this.look.resetSelection();
    this.updateSelection(0);
  }

  close(): void {
    this.current = null;
  }

  private rankTab(mode: "all" | "mine"): void {
    if (this.rank.mode === mode) return;
    this.rank.mode = mode;
    this.actions.rankRefresh();
  }

  openRanking(): void {
    this.rank.mode = "all";
    this.open("ranking");
    this.actions.rankRefresh();
  }

  private openSettings(back: PanelId): void {
    this.settingsBack = back;
    this.open("settings");
  }

  /** Esc / 뒤로 가기 */
  back(): void {
    if (this.current === "howto" || this.current === "ranking") this.open("title");
    else if (this.current === "settings") this.open(this.settingsBack);
    else if (this.current === "pause") this.actions.resume();
  }

  private get widgets(): Widget[] {
    return this.current ? this.panels[this.current].widgets.filter((w) => !(w.kind === "button" && w.hidden?.())) : [];
  }

  /** Keyboard input takes over from hover; an untouched option selects its primary action. */
  private get selected(): number {
    if (this.drag) return this.widgets.indexOf(this.drag);
    if (this.focus >= 0) return this.focus;
    if (this.hover >= 0) return this.hover;
    return Math.max(0, this.widgets.findIndex((w) => w.kind === "button" && w.primary));
  }

  private footprint(w: Widget): StampFootprint {
    return w.kind === "slider" ? this.look.sliderFootprint(w.y) : this.look.buttonFootprint(w);
  }

  private updateSelection(dt: number): void {
    const selected = this.selected, w = this.widgets[selected];
    if (w) this.look.updateSelection(this.footprint(w), selected, dt);
  }

  private hit(x: number, y: number): number {
    const offset = this.current === "result" ? 24 * (1 - (this.anim?.buttons ?? 1)) : 0;
    return this.widgets.findIndex((w) => this.look.hit(this.footprint(w), x, y - offset));
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
    if (i >= 0) { this.focus = -1; this.hover = i; }
    if (w?.kind === "slider") {
      this.drag = w;
      this.slide(w, x, y);
    } else if (w) {
      this.hover = i;
    }
    return true;
  }

  pointerMove(x: number, y: number): boolean {
    if (!this.current) return false;
    if (this.drag) this.slide(this.drag, x, y);
    else {
      // 항목 사이 빈 곳에서는 도장을 마지막 항목에 그대로 둔다(기본 버튼으로 튀어 오르지 않게)
      const i = this.hit(x, y);
      if (i >= 0) {
        this.hover = i;
        this.focus = -1;
      }
    }
    return true;
  }

  pointerUp(x: number, y: number): boolean {
    if (!this.current) return false;
    if (this.drag) {
      this.drag = null;
      const i = this.hit(x, y);
      if (i >= 0) this.hover = i;
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
    if (code === "ArrowDown" || code === "Tab" || code === "ArrowUp") {
      this.focus = (this.selected + (code === "ArrowUp" ? -1 : 1) + ws.length) % ws.length;
      this.drag = null;
      this.hover = -1;
    } else if (code === "Escape") this.back();
    else if (code === "Enter" || code === "Space" || code === "NumpadEnter") {
      if (this.current === "result" && this.anim?.running) {
        this.finishResult();
        return true;
      }
      const w = ws[this.selected];
      if (w?.kind === "button") this.press(w);
    } else if ((code === "ArrowLeft" || code === "ArrowRight") && ws[this.selected]?.kind === "slider") {
      const s = ws[this.selected] as Slider;
      this.focus = this.selected;
      this.drag = null;
      this.hover = -1;
      s.set(Math.min(1, Math.max(0, Math.round((s.get() + (code === "ArrowRight" ? 0.05 : -0.05)) * 20) / 20)));
    }
    return true;
  }

  private slide(s: Slider, x: number, y: number): void {
    const v = Math.round(this.look.sliderValue(s.y, x, y) * 20) / 20;
    const nv = Math.min(1, Math.max(0, v));
    if (nv !== s.get()) s.set(nv);
  }

  private press(b: Button): void {
    this.look.pressSelection();
    this.actions.click();
    b.onPress();
  }

  // ---------------------------------------------------------------- 그리기

  update(dt: number): void {
    this.tweens.update(dt);
    this.look.update(dt);
    if (this.current === "howto") this.howto.update(dt);
    this.fade = Math.min(1, this.fade + dt / 0.18);
    this.updateSelection(dt);
  }

  draw(g: CanvasRenderingContext2D): void {
    if (!this.current) return;
    const p = this.panels[this.current];
    g.save();
    if (p.dim > 0) menuBackdrop(g);
    g.globalAlpha = this.fade;
    p.draw(g);
    const btnA = this.current === "result" ? (this.anim?.buttons ?? 1) : 1;
    g.save();
    g.globalAlpha *= btnA;
    if (btnA < 1) g.translate(0, 24 * (1 - btnA));
    this.look.drawSelection(g);
    this.widgets.forEach((w, i) => {
      if (w.kind === "button") this.look.button(g, w, i, i === this.selected);
      else this.look.slider(g, w.label(), w.y, w.get(), i, i === this.selected);
    });
    g.restore();
    g.restore();
  }

  /**
   * 첫 접속 대기 화면: 타이틀 글자는 그대로 두고 메뉴 자리에 깜박이는 안내를 띄운다.
   * 브라우저는 사용자가 한 번 눌러야 소리를 허용하므로, 이 한 번으로 음악을 연다.
   */
  drawTapToStart(g: CanvasRenderingContext2D, time: number): void {
    this.drawTitle(g);
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.4);
    g.save();
    g.globalAlpha = 0.78 + 0.22 * pulse;
    this.look.lettering(g, t("TAP_TO_START"), W / 2, 800, 46, 600, SKIN.accent);
    g.restore();
    accentLine(g, 260, 828, 200);
    this.look.lettering(g, t("TAP_SOUND_HINT"), W / 2, 888, 28, 600, SKIN.muted, "center", false);
  }

  private drawTitle(g: CanvasRenderingContext2D): void {
    this.look.lettering(g, t("ARCADE_TAG"), W / 2, 100, 27, 600, SKIN.accent);
    text(g, t("SUBTITLE"), W / 2, 494, 30, SKIN.text, "center");
    this.look.lettering(g, t("TITLE_META"), W / 2, 544, 26, 600, SKIN.score);
    const shade = g.createLinearGradient(0, 1050, 0, 1280);
    shade.addColorStop(0, "rgba(9,7,21,0)");
    shade.addColorStop(0.3, "rgba(9,7,21,0.8)");
    shade.addColorStop(1, "rgba(9,7,21,0.94)");
    g.fillStyle = shade; g.fillRect(0, 1050, W, 230);
    if (this.best > 0) {
      accentLine(g, 160, 1078, 400, SKIN.timeText);
      this.look.lettering(g, t("BEST_FMT", this.best.toLocaleString()), W / 2, 1132, 36, 600, SKIN.timeText);
    }
  }

  // ---------------------------------------------------------------- 결과 연출

  /** 제목 → 점수가 띠리리릭 올라가며 쾅 → 최고 기록 → 아래 줄이 하나씩 나타나며 숫자 올라감 → 버튼. */
  private playResult(): void {
    const r = this.result;
    if (!r) return;
    const targets = [[r.maxCombo], r.grades.slice(), [r.time], [r.biggest]];
    const an: ResultAnim = {
      running: true, title: 0, score: 0, scoreA: 0, scoreScale: 1, best: 0,
      rows: targets.map((v) => ({ a: 0, dx: 60, values: v.map(() => 0) })), buttons: 0,
    };
    this.anim = an;
    const snd = this.actions.sound;
    const seq = this.tweens.add();
    seq.call(() => snd("pop", 0.8)).to(0.22, (k) => {
      an.title = Math.min(1, k * 2);
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
    Object.assign(an, { running: false, title: 1, score: r.score, scoreA: 1, scoreScale: 1, best: 1, buttons: 1 });
    const targets = [[r.maxCombo], r.grades, [r.time], [r.biggest]];
    an.rows.forEach((row, i) => Object.assign(row, { a: 1, dx: 0, values: targets[i].slice() }));
  }

  private drawRanking(g: CanvasRenderingContext2D): void {
    const rv = this.rank, look = this.look;
    look.heading(g, t("RANKING"), 112);
    text(g, t(rv.mode === "all" ? "RANK_SUB" : "RANK_SUB_MINE"), W / 2, 306, 24, SKIN.muted, "center");
    const left = 104, right = 616, top = 400, step = 48;
    // Ranking uses the font's native weight and equal-width digits, without the
    // synthetic heavy lettering used by menu stamps. Numeric columns share an edge.
    const ink = (s: string, x: number, y: number, size: number, width: number, color: string,
      align: CanvasTextAlign = "right", lit = false) => {
      g.save();
      g.font = font(size);
      const measured = g.measureText(s).width;
      g.font = font(size * Math.min(1, width / Math.max(1, measured)));
      g.textAlign = align; g.textBaseline = "alphabetic";
      g.fillStyle = color;
      if (lit) { g.shadowColor = alpha(color, 0.55); g.shadowBlur = 9; }
      g.fillText(s, x, y);
      g.restore();
    };
    const message = (key: TextKey) => {
      accentLine(g, 260, 526, 200);
      wrapText(g, t(key), 360, 596, right - left, 28, 44, SKIN.muted, "center");
    };
    const hasRows = rv.status === "ready" && (rv.mode === "all" ? rv.all.length > 0 : rv.nickname !== null && rv.mine.length > 0);
    if (hasRows) {
      ink(t("RANK_PLACE"), 118, 354, 21, 52, SKIN.muted, "center");
      ink(t(rv.mode === "all" ? "RANK_PLAYER" : "RANK_DATE"), 166, 354, 22, 200, SKIN.muted, "left");
      ink(t("RANK_COMBO"), 442, 354, 22, 82, SKIN.muted);
      ink(t("SCORE"), right, 354, 22, 152, SKIN.muted);
      accentLine(g, left, 368, right - left, SKIN.muted);
    }
    const rowAccent = (y: number, own: boolean) => {
      if (own) {
        const glow = g.createLinearGradient(left - 12, y, right + 8, y);
        glow.addColorStop(0, alpha(SKIN.accent, 0.13));
        glow.addColorStop(1, alpha(SKIN.accent, 0));
        g.fillStyle = glow; g.fillRect(left - 12, y - 30, right - left + 20, 42);
        g.fillStyle = SKIN.accent; g.fillRect(left - 12, y - 24, 3, 27);
      }
    };
    if (rv.status === "off") message("RANK_OFF");
    else if (rv.status === "loading") message("RANK_LOADING");
    else if (rv.status === "error") message("RANK_ERROR");
    else if (rv.mode === "all") {
      if (!rv.all.length) message("RANK_EMPTY");
      rv.all.forEach((r, i) => {
        const y = top + i * step, col = r.mine ? SKIN.accent : i < 3 ? SKIN.timeText : SKIN.text;
        rowAccent(y, r.mine);
        ink(String(r.rank), 118, y, 24, 48, i < 3 ? SKIN.timeText : SKIN.muted, "center", i < 3);
        ellipsisText(g, r.nickname, 166, y, 26, 200, col);
        ink(String(r.maxCombo), 442, y, 23, 66, r.mine ? SKIN.accent : SKIN.muted);
        ink(r.score.toLocaleString(), right, y, 28, 152, r.mine ? SKIN.accent : SKIN.score, "right", r.mine || i < 3);
      });
    } else {
      if (rv.nickname === null) message("RANK_GUEST_RECORDS");
      else if (!rv.mine.length) message("RANK_NO_SCORE");
      rv.mine.forEach((r, i) => {
        const y = top + i * step;
        rowAccent(y, i === 0);
        ink(String(i + 1), 118, y, 24, 48, i === 0 ? SKIN.timeText : SKIN.muted, "center", i === 0);
        ink(`${r.at.getMonth() + 1}/${r.at.getDate()}`, 166, y, 25, 200, SKIN.text, "left");
        ink(String(r.maxCombo), 442, y, 23, 66, SKIN.muted);
        ink(r.score.toLocaleString(), right, y, 28, 152, i === 0 ? SKIN.accent : SKIN.score, "right", i === 0);
      });
    }
    // 아래: 내 순위 또는 로그인 안내
    if (rv.status !== "off") {
      accentLine(g, 244, 880, 232, rv.myRank ? SKIN.timeText : SKIN.accent);
      if (rv.nickname !== null && rv.myRank) {
        ink(t("RANK_MY_PLACE"), left, 926, 23, 120, SKIN.muted, "left");
        ink(t("RANK_PLACE_FMT", rv.myRank.rank), 310, 926, 30, 80, SKIN.timeText, "right", true);
        ink(t("BEST_FMT", rv.myRank.best.toLocaleString()), right, 926, 25, 268, SKIN.timeText);
      } else {
        wrapText(g, t(rv.nickname === null ? "RANK_GUEST" : "RANK_NO_SCORE"), 360, 926, right - left, 24, 34, SKIN.muted, "center");
      }
    }
  }

  private drawResult(g: CanvasRenderingContext2D): void {
    const r = this.result, an = this.anim, look = this.look;
    if (!r || !an) return;
    g.save(); g.globalAlpha *= an.title;
    look.heading(g, t("TIME_UP"), 166);
    g.restore();
    text(g, t("RESULT_TAG"), 360, 239, 28, SKIN.muted, "center");
    look.lettering(g, t("SCORE"), 360, 294, 28, 560, SKIN.score);
    g.save(); g.globalAlpha *= an.scoreA;
    const pulse = 1 + (an.scoreScale - 1) * 0.2;
    g.translate(360, 367); g.scale(pulse, pulse); g.translate(-360, -367);
    look.score(g, an.score.toLocaleString(), SKIN.score);
    g.restore();
    g.save(); g.globalAlpha *= an.best;
    look.lettering(g, r.newBest ? t("NEW_BEST") : t("BEST_FMT", r.best.toLocaleString()), 360, 484, 36, 600, SKIN.timeText);
    if (this.resultRank) {
      // Long service messages wrap at a readable size instead of shrinking.
      wrapText(g, this.resultRank, 360, 542, 600, 30, 38, SKIN.accent, "center");
    }
    g.restore();
    const statX = [160, 0, 360, 560];
    an.rows.forEach((row, i) => {
      if (row.a <= 0) return;
      g.save(); g.globalAlpha *= row.a; g.translate(0, row.dx * 0.2);
      if (i === 1) {
        look.lettering(g, t("RESULT_GRADES"), 64, 782, 28, 592, SKIN.muted, "left", false);
        accentLine(g, 64, 801, 592, SKIN.muted);
        const max = Math.max(1, ...r.grades);
        for (let k = 0; k < 4; k++) {
          const x = 64 + k % 2 * 324, y = 846 + Math.floor(k / 2) * 98;
          look.lettering(g, t(GRADE_KEYS[k]), x, y, 28, 162, SKIN.grades[k], "left", false);
          look.lettering(g, String(row.values[k]), x + 268, y, 39, 100, SKIN.text, "right");
          look.meter(g, x, y + 25, 268, row.values[k] / max, SKIN.grades[k]);
        }
      } else {
        const x = statX[i], value = row.values[0];
        const name = i === 0 ? "R_MAX_COMBO" : i === 2 ? "R_TIME" : "R_BIGGEST";
        const val = i === 2 ? t("SEC_FMT", value) : i === 3 ? t("COUNT_FMT", value) : String(value);
        const col = i === 0 ? SKIN.score : i === 2 ? SKIN.accent : SKIN.timeText;
        fitText(g, t(name), x, 634, 27, 180, SKIN.muted, "center");
        g.save();
        g.translate(x, 690); g.rotate(-0.055); g.translate(-x, -690);
        look.lettering(g, val, x, 700, 46, 170, col);
        g.restore();
        accentLine(g, x - 56, 726, 112, col);
      }
      g.restore();
    });
  }
}
