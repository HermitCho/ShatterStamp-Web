import { bestMove } from "../core/bot.ts";
import { GAME_TIME, GameRules, Grade, STAMP_COOLDOWN, tierFor, type BreakResult } from "../core/game-rules.ts";
import { BOARD_COLORS, BOARD_COLS, BOARD_ROWS, localSeed, newBoard, newQueue, REPLAY_VERSION, type ReplayEvent } from "../core/replay.ts";
import { ShapeQueue } from "../core/shape-queue.ts";
import type { Cell, Shape } from "../core/shapes.ts";
import { Sfx } from "./audio.ts";
import { BoardView, CELL, BLOCK, roundRect, type BreakEvent } from "./board-view.ts";
import { Fx } from "./fx.ts";
import { Menus } from "./menus.ts";
import { askNickname } from "./nick-input.ts";
import { createOnline, type RunTicket } from "./online.ts";
import { Music } from "./music.ts";
import { StageFx } from "./stage.ts";
import { TitleScreen } from "./title.ts";
import { Tutorial, type Rect as TRect } from "./tutorial.ts";
import { GRADE_KEYS, t } from "./i18n.ts";
import { fitText, outlined, panel, text } from "./draw.ts";
import { alpha, font, mix, SKIN } from "./skin.ts";
import { ease, Tweens } from "./tween.ts";

export const W = 720;
export const H = 1280;
const COLS = BOARD_COLS, ROWS = BOARD_ROWS, COLORS = BOARD_COLORS;
/** 받아 둔 판 표(시드)를 이 시간이 지나면 버리고 새로 받는다(서버는 6시간 뒤 만료) */
const TICKET_MAX_AGE = 3 * 3600 * 1000;
const BOARD_X = 24, BOARD_Y = 400, BOARD_SCALE = 0.8;
const SIDE_X = 552, SIDE_W = 148;
const NEXT_COUNT = 4;

type State = "title" | "tutorial" | "countdown" | "play" | "pause" | "result";
const TUT_TOTAL = 4;

/** 상단 가운데 일시정지 버튼 */
const PAUSE_BTN = { x: 318, y: 52, w: 84, h: 84 };

interface Rect { x: number; y: number; w: number; h: number }

/** 오른쪽 세로 줄의 모양 칸(HOLD / NOW / NEXT) */
interface Slot extends Rect {
  title: string;
  cellPx: number;
  cells: Cell[];
  highlight: boolean;
  dimmed: boolean;
  cooldown: number;
  /** 미끄러져 들어오는 중의 남은 위치 차이 */
  oy: number;
  alpha: number;
  hint?: string;
}

interface FloatText {
  lines: { text: string; size: number; color: string }[];
  x: number;
  y: number;
  scale: number;
  alpha: number;
  dx: number;
  placement?: "grade" | "time";
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export class Game {
  state: State = "title";
  readonly rules = new GameRules();
  readonly board = new BoardView(BOARD_X, BOARD_Y, BOARD_SCALE);
  readonly fx = new Fx();
  readonly sfx = new Sfx();
  private tweens = new Tweens();
  private queue = new ShapeQueue();
  private current!: Shape;
  private held: Shape | null = null;
  private holdUsed = false;
  private stampLock = 0;
  private best = 0;
  private trauma = 0;
  private hitstop = 0;
  private flash = { color: "#ffffff", a: 0 };
  private inFever = false;
  private bgMix = 0;
  private perfectStreak = 0;
  private floats: FloatText[] = [];
  private gradeFloat: FloatText | null = null;
  private comboText = { text: "", color: SKIN.text, scale: 1, alpha: 0 };
  private timePulse = 1;
  private lastTick = -1;
  private pressing = false;
  private clock = 0;
  private readonly touchControls = matchMedia("(pointer: coarse)");
  private shakeOn = true;
  /** 판마다 1씩 늘린다. 판이 바뀐 뒤 늦게 도착한 예약 동작(결과 화면 열기 등)을 무시하는 데 쓴다. */
  private run = 0;
  /** 첫 접속 대기("화면을 눌러 시작") 중인지. 첫 입력에서 소리를 열고 메뉴를 띄운다. */
  private gate = false;
  /** 대기 화면을 깨운 탭이 손을 뗄 때 메뉴 버튼으로 눌리지 않게 한 번 무시한다. */
  private swallowUp = false;
  /** 온라인 랭킹 (로그인·점수 등록·TOP 10) */
  private readonly online = createOnline();
  /** 랭킹 목록 요청 번호: 늦게 도착한 옛 응답을 버린다 */
  private rankReq = 0;
  /** Google 로그인에서 돌아왔으면 메뉴를 열 때 랭킹 화면부터 보여 준다 */
  private openRankingNext = false;
  /** 다음 판에 쓸 서버 표(시드). 판을 시작할 때 꺼내 쓴다. */
  private nextTicket: RunTicket | null = null;
  private ticketLoading = false;
  /** 지금 판의 표. 없으면(손님·연결 실패) 랭킹에 올리지 않는다. */
  private ticket: RunTicket | null = null;
  /** 지금 판의 찍기·홀드 기록(서버가 다시 돌려 점수를 계산한다). 튜토리얼을 거쳤으면 그 기록도 따로 둔다. */
  private log: ReplayEvent[] = [];
  private tutLog: ReplayEvent[] | null = null;
  /** 지금 판의 시드 (자동 확인 스크립트가 리플레이를 다시 돌려 볼 때 읽는다) */
  seed = 0;
  readonly menus: Menus;
  private readonly stage = new StageFx();
  private readonly title = new TitleScreen();
  private readonly music = new Music();
  private readonly tutorial = new Tutorial();
  private tutorialDone = false;
  private forceTutorial = false;
  private tutStep = 0;
  private tutAccepting = false;
  private feverT = 0;
  private emberT = 0;
  autoplay = false;
  private autoTimer = 0;

  private hold: Slot;
  private now: Slot;
  private nexts: Slot[] = [];

  /** 디버그: 시작 시간(초). 결과 화면을 빨리 보려고 쓴다. */
  private startTime = GAME_TIME;

  constructor(opts: { autoplay?: boolean; seed?: number; time?: number } = {}) {
    this.autoplay = !!opts.autoplay;
    if (opts.time) this.startTime = opts.time;
    try {
      this.best = Number(localStorage.getItem("ss.best") ?? 0) || 0;
    } catch {
      this.best = 0;
    }
    try {
      this.tutorialDone = localStorage.getItem("ss.tutorial") === "1";
    } catch {
      this.tutorialDone = false;
    }
    this.title.onSlam = () => {
      this.sfx.play("big", 1.1, -4);
      this.sfx.play("break", 0.8, -6);
      this.trauma = Math.min(1, this.trauma + 0.35);
    };
    this.menus = new Menus({
      start: () => this.start(),
      tutorial: () => {
        this.forceTutorial = true;
        this.start();
      },
      resume: () => this.resume(),
      restart: () => this.start(),
      toTitle: () => this.toTitle(),
      settingsChanged: (s) => this.applySettings(s),
      click: () => {
        this.sfx.unlock();
        this.sfx.play("hold", 1.2, -6);
      },
      sound: (name, pitch = 1, db = 0) => this.sfx.play(name, pitch, db),
      shake: (p) => (this.trauma = Math.min(1, this.trauma + p)),
      rankRefresh: () => void this.refreshRanking(),
      rankLogin: () => void this.online.signIn(),
      rankLogout: () => void this.online.signOut(),
      rankNickname: () => this.editNickname(),
    });
    this.menus.rank.status = this.online.configured ? "ready" : "off";
    this.online.onChange = () => this.onOnlineChange();
    void this.online.init().catch(() => {
      /* 연결 실패해도 게임은 그대로 */
    });
    this.menus.best = this.best;
    this.applySettings(this.menus.settings);
    let y = BOARD_Y;
    this.hold = this.slot("HOLD", y, 118, 20, false);
    this.hold.hint = "HOLD_HINT";
    y += 128;
    this.now = this.slot("NOW", y, 170, 30, true);
    y += 178 + 28;
    for (let i = 0; i < NEXT_COUNT; i++) {
      const h = i === 0 ? 104 : 56;
      const s = this.slot("", y, h, i === 0 ? 20 : 11, false);
      s.alpha = 1 - 0.15 * i;
      this.nexts.push(s);
      y += h + 6;
    }
    this.board.setup(COLS, ROWS, COLORS, opts.seed ?? 0);
    if (this.autoplay) this.start();
    else {
      this.gate = true;
      this.openTitle();
    }
  }

  private openTitle(): void {
    this.state = "title";
    this.menus.best = this.best;
    if (this.gate) this.menus.close();
    else this.menus.open("title");
    this.title.playIntro();
    this.music.playTitle();
    this.prepareRun();
  }

  /**
   * 첫 입력(화면 안팎 클릭·터치, 아무 키): 소리를 열고, 대기 화면이면 타이틀 메뉴를 띄운다.
   * fromCanvas: 캔버스 위 탭이면 이어지는 손 떼기를 메뉴 버튼 누름으로 처리하지 않는다.
   */
  wake(fromCanvas = false): void {
    this.unlockAudio();
    if (!this.gate) return;
    this.gate = false;
    this.swallowUp = fromCanvas;
    if (this.openRankingNext) {
      this.openRankingNext = false;
      this.menus.openRanking();
    } else this.menus.open("title");
    // 로고가 찍히는 소리·흔들림을 음악과 함께 다시 들려준다(처음 등장 때는 소리를 낼 수 없었다)
    this.sfx.play("big", 1.1, -4);
    this.sfx.play("break", 0.8, -6);
    this.trauma = Math.min(1, this.trauma + 0.35);
  }

  // ---------------------------------------------------------------- 온라인 랭킹

  private onOnlineChange(): void {
    const nick = this.online.nickname;
    // 다른 계정이거나 로그아웃했으면 받아 둔 표는 쓸 수 없다
    if (nick !== this.menus.rank.nickname) this.nextTicket = null;
    this.menus.rank.nickname = nick;
    let afterLogin = false;
    try {
      afterLogin = sessionStorage.getItem("ss.afterLogin") === "1";
      if (afterLogin && nick !== null) sessionStorage.removeItem("ss.afterLogin");
    } catch {
      /* 없어도 진행 */
    }
    if (afterLogin && nick !== null) {
      // 로그인에서 막 돌아옴: 대기 화면을 넘기면 랭킹부터, 이미 메뉴면 바로 랭킹으로
      if (this.gate) this.openRankingNext = true;
      else if (this.state === "title") this.menus.openRanking();
    }
    if (nick === "") this.editNickname();
    if (this.menus.current === "ranking") void this.refreshRanking();
    this.prepareRun();
  }

  private async refreshRanking(): Promise<void> {
    const rv = this.menus.rank;
    if (!this.online.configured) {
      rv.status = "off";
      return;
    }
    const req = ++this.rankReq;
    rv.status = "loading";
    try {
      const [list, mine] = await Promise.all([
        rv.mode === "all" ? this.online.leaderboard() : this.online.myTop(),
        this.online.myRank(),
      ]);
      if (req !== this.rankReq) return;
      if (rv.mode === "all") rv.all = list as typeof rv.all;
      else rv.mine = list as typeof rv.mine;
      rv.myRank = mine;
      rv.status = "ready";
    } catch {
      if (req === this.rankReq) rv.status = "error";
    }
  }

  /** 닉네임 입력 창 (로그인 직후 자동으로, 또는 랭킹 화면의 닉네임 줄에서). 취소하면 나중에 정할 수 있다. */
  private editNickname(): void {
    if (this.online.nickname === null) return;
    askNickname(
      this.online.nickname,
      (name) => this.online.setNickname(name),
      () => {
        if (this.menus.current === "ranking") void this.refreshRanking();
      },
    );
  }

  /** 랭킹에 올릴 수 있는 판인지: 자동 플레이, 시간을 바꾼 판, 콘솔 조작 훅(?debug=1)을 연 판은 올리지 않는다 */
  private rankable(): boolean {
    const debug = new URLSearchParams(location.search).has("debug");
    return !this.autoplay && this.startTime === GAME_TIME && !debug && this.online.configured;
  }

  private record(e: ReplayEvent): void {
    if (this.state === "tutorial") this.tutLog?.push(e);
    else this.log.push(e);
  }

  /**
   * 다음 판의 서버 표(시드)를 미리 받아 둔다. 판 도중에는 받지 않는다
   * (새 표를 받으면 서버가 이전 표를 무효로 하므로, 진행 중인 판의 기록을 못 올리게 된다).
   */
  private prepareRun(): void {
    if (this.nextTicket || this.ticketLoading || !this.rankable() || !this.online.nickname) return;
    if (this.state !== "title" && this.state !== "result") return;
    this.ticketLoading = true;
    const owner = this.online.nickname;
    void this.online.startRun().then((tk) => {
      this.ticketLoading = false;
      if (this.online.nickname !== owner) return;
      if (tk) this.nextTicket = tk;
      // 너무 빨리 다시 요청해 거절됐을 수 있다: 잠시 뒤 한 번 더
      else setTimeout(() => this.prepareRun(), 3000);
    });
  }

  /** 판이 끝났을 때 랭킹 등록. 서버가 기록을 다시 돌려 계산한 점수만 올라간다. */
  private submitScore(): void {
    this.menus.resultRank = "";
    if (!this.rankable()) return;
    const nick = this.online.nickname;
    if (nick === null) {
      this.menus.resultRank = t("RESULT_RANK_GUEST");
      return;
    }
    if (nick === "") {
      this.menus.resultRank = t("RESULT_RANK_NICK");
      return;
    }
    const tk = this.ticket;
    this.ticket = null;
    if (!tk) {
      // 판을 시작할 때 서버 표를 못 받았다(연결 실패 등)
      this.menus.resultRank = t("RESULT_RANK_UNRANKED");
      this.prepareRun();
      return;
    }
    const r = this.rules, run = this.run;
    this.menus.resultRank = t("RESULT_RANK_SAVING");
    const replay = { v: REPLAY_VERSION, tutorial: this.tutLog, events: this.log };
    void this.online.submitRun({ run: tk.id, replay, score: r.score }).then((res) => {
      // 기록을 올린 뒤에 다음 판 표를 받는다(먼저 받으면 이번 판 표가 무효가 된다)
      this.prepareRun();
      if (this.run !== run) return;
      this.menus.resultRank = res.ok
        ? res.rank ? t("RESULT_RANK_FMT", res.rank) : t("RESULT_RANK_SAVED")
        : res.reason === "guest" ? t("RESULT_RANK_GUEST")
        : res.reason === "nickname" ? t("RESULT_RANK_NICK")
        : res.reason === "limit" ? t("RESULT_RANK_LIMIT")
        : res.reason === "rejected" ? t("RESULT_RANK_REJECTED")
        : res.reason === "outdated" ? t("RESULT_RANK_OUTDATED")
        : res.reason === "off" ? "" : t("RESULT_RANK_FAIL");
    });
  }

  private applySettings(s: { sfx: number; music: number; shake: boolean }): void {
    this.sfx.setVolume(s.sfx);
    this.music.setVolume(s.music);
    this.shakeOn = s.shake;
  }

  /** 첫 사용자 입력: 효과음을 열고 배경 음악을 만들기 시작한다. */
  private unlockAudio(): void {
    this.sfx.unlock();
    const ctx = this.sfx.context;
    if (ctx) this.music.attach(ctx);
  }

  private pause(): void {
    if (this.state !== "play") return;
    this.state = "pause";
    this.pressing = false;
    this.board.setAnchor(null);
    this.hitstop = 0;
    this.menus.open("pause");
    this.music.setPaused(true);
  }

  private resume(): void {
    if (this.state !== "pause") return;
    this.menus.close();
    this.state = "play";
    this.music.setPaused(false);
    this.music.setFever(this.inFever);
  }

  private toTitle(): void {
    this.run++;
    this.breakCombo(true);
    this.stage.clear();
    this.tutorial.close();
    this.comboText.alpha = 0;
    this.floats = [];
    this.board.setup(COLS, ROWS, COLORS);
    this.held = null;
    this.nexts.forEach((s) => (s.cells = []));
    this.now.cells = [];
    this.hold.cells = [];
    this.rules.reset();
    this.openTitle();
  }

  private slot(title: string, y: number, h: number, cellPx: number, highlight: boolean): Slot {
    return { x: SIDE_X, y, w: SIDE_W, h, title, cellPx, cells: [], highlight, dimmed: false, cooldown: 0, oy: 0, alpha: 1 };
  }

  // ---------------------------------------------------------------- 흐름

  start(): void {
    this.run++;
    this.menus.close();
    this.floats = [];
    this.trauma = 0;
    this.rules.reset();
    this.rules.timeLeft = this.startTime;
    // 랭킹 판은 서버가 준 시드로 보드와 모양 순서를 만든다(서버가 같은 판을 다시 돌려 확인한다)
    const tk = this.nextTicket && Date.now() - this.nextTicket.at < TICKET_MAX_AGE ? this.nextTicket : null;
    this.nextTicket = null;
    this.ticket = this.rankable() ? tk : null;
    const seed = (this.seed = this.ticket?.seed ?? localSeed());
    this.board.setModel(newBoard(seed));
    this.queue = newQueue(seed);
    this.log = [];
    this.tutLog = null;
    this.held = null;
    this.holdUsed = false;
    this.stampLock = 0;
    this.perfectStreak = 0;
    this.inFever = false;
    this.board.fever = false;
    this.comboText.alpha = 0;
    this.lastTick = -1;
    this.stage.clear();
    this.tutorial.close();
    this.current = this.queue.pop();
    this.refreshPieces();
    this.music.playGame();
    const showTut = (!this.tutorialDone || this.forceTutorial) && !this.autoplay;
    this.forceTutorial = false;
    if (showTut) {
      this.tutLog = [];
      this.beginTutorial();
    }
    else this.beginCountdown();
  }

  /** 3, 2, 1, GO! 동안 보드는 보이고 미리보기도 되지만 찍을 수는 없다. 시간도 흐르지 않는다. */
  private beginCountdown(): void {
    this.state = "countdown";
    const run = this.run;
    this.stage.countdown(
      (n) => {
        if (n > 0) this.sfx.play("count", 1 + (3 - n) * 0.12);
        else {
          this.sfx.play("go");
          this.sfx.play("start", 1.2, -4);
        }
      },
      () => {
        if (this.run === run && this.state === "countdown") this.state = "play";
      },
    );
  }

  // ---------------------------------------------------------------- 튜토리얼

  private beginTutorial(): void {
    this.state = "tutorial";
    this.tutStep = 1;
    this.showTut();
  }

  private showTut(): void {
    if (this.tutStep <= 3) {
      this.tutAccepting = true;
      this.tutorial.show(this.tutStep, TUT_TOTAL, `TUT_${this.tutStep}` as "TUT_1", this.bestCells());
    } else if (this.tutStep === 4) {
      this.tutorial.show(4, TUT_TOTAL, "TUT_4", [], this.hold);
    } else {
      this.tutorial.show(TUT_TOTAL + 1, TUT_TOTAL, "TUT_5", []);
      const run = this.run;
      this.tweens.add().wait(1.8).call(() => this.run === run && this.finishTutorial());
    }
  }

  /** 다음 단계 안내를 잠깐 뒤에 띄운다(방금 찍은 연출을 볼 틈). */
  private nextTut(delay: number): void {
    this.tutStep++;
    this.tutAccepting = false;
    this.tutorial.cells = [];
    const run = this.run;
    this.tweens.add().wait(delay).call(() => {
      if (this.run === run && this.state === "tutorial") this.showTut();
    });
  }

  private finishTutorial(): void {
    if (this.state !== "tutorial") return;
    this.tutorialDone = true;
    try {
      localStorage.setItem("ss.tutorial", "1");
    } catch {
      /* 저장 못 해도 진행 */
    }
    this.tutorial.close();
    // 연습한 점수·콤보는 버리고 깨끗하게 시작한다(보드는 그대로).
    this.rules.reset();
    this.rules.timeLeft = this.startTime;
    this.perfectStreak = 0;
    this.comboText.alpha = 0;
    this.held = null;
    this.holdUsed = false;
    this.refreshPieces();
    this.beginCountdown();
  }

  /** 지금 모양을 가장 많이 부수는 자리의 칸들(화면 좌표). 첫 칸이 찍을 칸(모양의 가운데 = 마우스 칸)이다. */
  private bestCells(): TRect[] {
    const mv = bestMove(this.board.model, this.current.cells);
    const cs = CELL * BOARD_SCALE;
    const center = this.current.cells.filter((o) => o.x === 0 && o.y === 0);
    const rest = this.current.cells.filter((o) => o.x !== 0 || o.y !== 0);
    return [...center, ...rest]
      .map((o) => ({ x: mv.x + o.x, y: mv.y + o.y }))
      .filter((p) => this.board.model.inBounds(p.x, p.y))
      .map((p) => ({ x: BOARD_X + p.x * cs, y: BOARD_Y + p.y * cs, w: cs, h: cs }));
  }

  /** 튜토리얼 1~3단계는 최고 자리(PERFECT, 동점 자리 모두)만 받는다. */
  private tutRejects(c: Cell): boolean {
    if (this.state !== "tutorial") return false;
    if (!this.tutAccepting) return true;
    return this.board.model.computeBreak(c.x, c.y, this.current.cells).all.length < this.board.bestN;
  }

  private onTutRejected(c: Cell): void {
    this.sfx.play("tick", 0.6, -6);
    this.tutorial.nudge();
    if (!this.tutAccepting) return;
    const [x, y] = this.board.toScreen(c.x, c.y);
    this.float([{ text: t("TUT_WRONG"), size: 30, color: "#ffd94d" }], Math.min(Math.max(x, 210), 510), y);
  }

  private end(): void {
    this.state = "result";
    this.board.setAnchor(null);
    this.breakCombo(true);
    this.stage.danger = 0;
    this.stage.timeUp();
    this.music.endGame();
    this.sfx.play("end");
    this.sfx.play("big", 0.8);
    this.trauma = Math.min(1, this.trauma + 0.5);
    const r = this.rules;
    const newBest = r.score > this.best && !this.autoplay;
    if (newBest) {
      this.best = r.score;
      try {
        localStorage.setItem("ss.best", String(this.best));
      } catch {
        /* 저장 못 해도 진행 */
      }
    }
    this.menus.result = {
      score: r.score, best: this.best, newBest, maxCombo: r.maxCombo,
      grades: r.gradeCounts.slice(), time: Math.round(r.bonusTimeTotal), biggest: r.biggest,
    };
    this.menus.best = this.best;
    this.submitScore();
    const run = this.run;
    this.tweens.add().wait(1.5).call(() => {
      if (this.run !== run || this.state !== "result") return;
      this.stage.clear();
      this.menus.open("result");
    });
  }

  private refreshPieces(): void {
    this.board.setPiece(this.current.cells);
    this.board.nextOffsets = this.queue.peek(1)[0].cells;
    this.now.cells = this.current.cells;
    const nexts = this.queue.peek(NEXT_COUNT);
    this.nexts.forEach((s, i) => (s.cells = nexts[i].cells));
    this.hold.dimmed = this.holdUsed;
    this.hold.cells = this.held?.cells ?? [];
    if (this.state === "tutorial" && this.tutStep <= 3 && this.tutAccepting) this.tutorial.cells = this.bestCells();
  }

  private doHold(): void {
    if (!(this.state === "play" || this.state === "tutorial") || this.holdUsed) return;
    const fromQueue = !this.held;
    if (fromQueue) {
      this.held = this.current;
      this.current = this.queue.pop();
    } else {
      [this.held, this.current] = [this.current, this.held!];
    }
    this.holdUsed = true;
    this.record(["h", this.state === "tutorial" ? 0 : this.rules.elapsed]);
    this.sfx.play("hold");
    this.refreshPieces();
    if (fromQueue) this.slideQueue();
    else this.slideIn(this.now, -130);
    this.slideIn(this.hold, 130);
    if (this.state === "tutorial" && this.tutStep === 4) this.nextTut(0.4);
  }

  /** 큐가 한 칸 당겨질 때: 모든 모양이 아래 칸 자리에서 위로 미끄러져 올라온다. */
  private slideQueue(): void {
    this.slideIn(this.now, this.nexts[0].y - this.now.y);
    this.nexts.forEach((s, i) => this.slideIn(s, i === NEXT_COUNT - 1 ? 70 : this.nexts[i + 1].y - s.y));
  }

  private slideIn(s: Slot, dy: number): void {
    s.oy = dy;
    this.tweens.add().to(0.22, (k) => (s.oy = dy * (1 - k)), ease.outCubic);
  }

  // ---------------------------------------------------------------- 찍기

  private tryPlace(c: Cell): void {
    if (this.state === "countdown") return;
    if (this.state !== "play" && this.state !== "tutorial") return;
    if (this.tutRejects(c)) {
      this.onTutRejected(c);
      return;
    }
    if (this.stampLock > 0) {
      this.onBlocked();
      return;
    }
    const bestN = this.board.bestN;
    const ev = this.board.placeAt(c.x, c.y);
    if (!ev) return;
    this.record(["s", this.state === "tutorial" ? 0 : this.rules.elapsed, c.x, c.y]);
    this.onBroke(ev, bestN);
  }

  private onBroke(ev: BreakEvent, bestN: number): void {
    const r = this.rules.registerBreak(ev.count, bestN);
    this.stampLock = STAMP_COOLDOWN;
    this.perfectStreak = r.grade === Grade.PERFECT ? this.perfectStreak + 1 : 0;
    this.juice(ev, r);
    this.gradeText(r, ev);
    if (this.state === "tutorial") {
      this.rules.timeLeft = this.startTime; // 연습 중에는 시간이 늘거나 줄지 않는다
      r.timeDelta = 0;
    }
    if (r.timeDelta > 0) {
      this.float([{ text: t("TIME_DELTA_FMT", `+${r.timeDelta}`), size: 28, color: "#66ff99" }], 610, 250).placement = "time";
      this.sfx.play("bonus");
      this.timePulse = 1.25;
    } else if (r.timeDelta < 0) {
      this.float([{ text: t("TIME_DELTA_FMT", r.timeDelta), size: 28, color: "#ff5959" }], 610, 250).placement = "time";
    }
    if (r.grade === Grade.MISS) this.breakCombo();
    this.current = this.queue.pop();
    this.holdUsed = false;
    this.refreshPieces();
    this.slideQueue();
    if (this.state === "tutorial" && this.tutStep <= 3) this.nextTut(0.55);
  }

  /** 쿨다운 중에 찍으려 하면 NOW 칸을 살짝 흔들어 "아직"이라고 알려 준다. */
  private onBlocked(): void {
    this.sfx.play("tick", 0.6, -8);
    const s = this.now;
    this.tweens.add().to(0.12, (k) => (s.oy = Math.sin(k * Math.PI * 3) * 6 * (1 - k)));
  }

  /** quiet: 판이 끝나거나 타이틀로 갈 때처럼 "FEVER END" 연출 없이 조용히 끝낸다. */
  private breakCombo(quiet = false): void {
    this.tweens.add().to(0.25, (k) => (this.comboText.alpha = 1 - k));
    if (this.inFever) {
      this.inFever = false;
      this.board.fever = false;
      this.music.setFever(false);
      this.stage.feverGlow = 0;
      if (quiet) this.stage.hideFeverBadge();
      else {
        this.stage.feverEnd();
        this.sfx.play("fever_end", 1, -3);
      }
    }
  }

  // ---------------------------------------------------------------- 타격감

  private juice(ev: BreakEvent, r: BreakResult): void {
    const n = ev.count, tier = r.tier;
    const power = 280 + tier * 110;
    let amount = 4 + tier * 2;
    if (ev.broken.length > 35) amount = Math.max(2, amount - 2);
    for (const b of ev.broken) {
      const col = SKIN.blocks[b.color];
      // 번지는 파괴에 맞춰 블록마다 차례로 터뜨린다
      this.tweens.add().wait(b.delay).call(() => {
        this.fx.burst(b.x, b.y, col, amount, power);
        this.fx.flash(b.x, b.y, BLOCK * BOARD_SCALE, mix(col, "#ffffff", 0.75));
      });
    }
    this.fx.ring(ev.ax, ev.ay, 70 + n * 6 + tier * 40, SKIN.ring);

    if (r.grade === Grade.MISS) {
      // 실수는 약하고 둔탁하게: 짧은 흔들림 + 낮은 소리 + 붉은 섬광
      this.trauma = Math.min(1, this.trauma + 0.25);
      this.sfx.play("break", 0.7, -6);
      this.sfx.play("miss");
      this.flashScreen("#ff1a1a", 0.18);
      return;
    }
    const perfect = r.grade === Grade.PERFECT;
    this.trauma = Math.min(1, this.trauma + 0.12 + n * 0.012 + tier * 0.08 + (perfect ? 0.1 : 0));
    if (n >= 12 || tier >= 1 || perfect) this.hitstop = 0.025 + Math.min(n, 40) * 0.0012 + tier * 0.015;
    this.sfx.play("break", (0.9 + Math.random() * 0.2) * (n >= 15 ? 0.85 : 1));
    this.sfx.play("pop", 1 + Math.min(this.rules.combo - 1, 24) * 0.055, -4);
    if (perfect) {
      // PERFECT 보상: 금빛 별 + 겹 링 + 연속 PERFECT마다 한 음씩 올라가는 차임
      const gold = SKIN.grades[Grade.PERFECT];
      const s = Math.min(this.perfectStreak, 8);
      this.fx.sparkle(ev.ax, ev.ay, gold, 10 + s * 3, 420 + s * 40);
      this.fx.ring(ev.ax, ev.ay, 110 + n * 7 + s * 12, gold);
      const pitch = Math.pow(2, ((s - 1) * 2) / 12);
      this.sfx.play("perfect", pitch, -3);
      this.sfx.play("sparkle", 0.95 + Math.random() * 0.13, -8);
      if (s >= 3) this.sfx.play("perfect", pitch * 1.5, -10);
      if (tier < 2) this.flashScreen("#ffffff", 0.06 + s * 0.015);
    }
    if (n >= 15) this.sfx.play("big");
    if (tier >= 2) this.flashScreen("#ffffff", 0.1 + (tier - 2) * 0.08);
    if (tier >= 3 && !this.inFever) this.enterFever();
    this.comboPop(tier);
  }

  private comboPop(tier: number): void {
    if (this.rules.combo < 2) {
      this.comboText.alpha = 0;
      return;
    }
    const c = this.comboText;
    c.text = t("COMBO_FMT", this.rules.combo);
    c.color = SKIN.tiers[tier];
    c.alpha = 1;
    const from = 1.3 + tier * 0.15;
    this.tweens.add().to(0.2, (k) => (c.scale = from + (1 - from) * k), ease.outBack);
  }

  private enterFever(): void {
    this.inFever = true;
    this.board.fever = true;
    this.sfx.play("fever");
    this.sfx.play("big", 1.2, -2);
    this.flashScreen("#ffffff", 0.5);
    this.trauma = Math.min(1, this.trauma + 0.35);
    const cx = BOARD_X + (COLS * CELL * BOARD_SCALE) / 2, cy = BOARD_Y + (ROWS * CELL * BOARD_SCALE) / 2;
    this.fx.ring(cx, cy, 520, SKIN.tiers[3]);
    this.fx.ring(cx, cy, 340, "rgba(255,255,255,0.8)");
    this.stage.feverStart();
    this.music.setFever(true);
    for (let i = 0; i < 24; i++) this.fx.ember(20 + Math.random() * 680, 1290, `hsl(${290 + Math.random() * 70},100%,72%)`);
  }

  private flashScreen(color: string, a: number): void {
    this.flash.color = color;
    this.flash.a = a;
  }

  /** 판정 글자 묶음: [판정] / [+점수] / [N개 / 최고 M개(PERFECT 아닐 때)]가 한 덩어리로 움직인다. */
  private gradeText(r: BreakResult, ev: BreakEvent): void {
    let size = [62, 50, 40, 44][r.grade];
    let text: string = t(GRADE_KEYS[r.grade]);
    if (r.grade === Grade.PERFECT) {
      size += Math.min(this.perfectStreak - 1, 4) * 3;
      if (this.perfectStreak >= 2) text = t("GRADE_STREAK_FMT", text, this.perfectStreak);
    }
    const lines = [
      { text, size, color: SKIN.grades[r.grade] },
      { text: t("POINTS_FMT", r.points), size: 34, color: SKIN.tiers[r.tier] },
    ];
    if (r.grade !== Grade.PERFECT && r.bestN > 0) lines.push({ text: t("GRADE_SUB", ev.count, r.bestN), size: 26, color: SKIN.text });
    if (this.gradeFloat) this.gradeFloat.alpha = 0;
    const f = this.float(lines, Math.min(Math.max(ev.ax, 230), 490), ev.ay - 10, false, r.grade);
    f.placement = "grade";
    this.gradeFloat = f;
  }

  /** 떠오르는 글자. kind: 판정마다 움직임이 다르다(PERFECT 쾅 / GREAT 튀어나옴 / MISS 흔들리다 떨어짐). */
  private float(lines: FloatText["lines"], x: number, y: number, big = false, kind: number = Grade.GOOD): FloatText {
    const f: FloatText = { lines, x, y, scale: 1, alpha: 1, dx: 0 };
    this.floats.push(f);
    const tw = this.tweens.add();
    if (big || kind === Grade.PERFECT) {
      f.scale = 1.6;
      f.alpha = 0;
      tw.to(0.12, (k) => {
        f.scale = 1.6 - 0.6 * k;
        f.alpha = Math.min(1, k * 2);
      }, ease.inQuad)
        .wait(big ? 0.5 : 0.28)
        .to(0.45, (k) => {
          f.y = y - 70 * k;
          f.alpha = 1 - k;
        }, ease.outCubic);
    } else if (kind === Grade.GREAT) {
      f.scale = 1.6;
      tw.to(0.18, (k) => (f.scale = 1.6 - 0.6 * k), ease.outBack)
        .wait(0.12)
        .to(0.5, (k) => {
          f.y = y - 80 * k;
          f.alpha = 1 - Math.max(0, (k - 0.2) / 0.8);
        }, ease.outCubic);
    } else if (kind === Grade.MISS) {
      tw.to(0.2, (k) => (f.dx = Math.sin(k * Math.PI * 5) * 12 * (1 - k)))
        .to(0.45, (k) => {
          f.y = y + 50 * k;
          f.alpha = 1 - k;
        }, ease.inQuad);
    } else {
      tw.to(0.7, (k) => {
        f.y = y - 90 * k;
        f.alpha = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
      }, ease.outCubic);
    }
    tw.call(() => (this.floats = this.floats.filter((o) => o !== f)));
    return f;
  }

  // ---------------------------------------------------------------- 입력

  pointerDown(x: number, y: number, button: number): void {
    if (this.gate) {
      this.wake(true);
      return;
    }
    this.unlockAudio();
    if (this.menus.pointerDown(x, y)) return;
    if (this.state === "tutorial" && this.tutorial.hitSkip(x, y)) {
      this.finishTutorial();
      return;
    }
    if (this.state !== "play" && this.state !== "tutorial" && this.state !== "countdown") return;
    if (inRect(PAUSE_BTN, x, y)) {
      this.pause();
      return;
    }
    if (button === 2 || inRect(this.hold, x, y)) {
      this.doHold();
      return;
    }
    this.pressing = true;
    this.board.setAnchor(this.board.cellAt(x, y));
  }

  pointerMove(x: number, y: number, touch: boolean): void {
    // 대기 화면을 깨운 탭은 메뉴 선택(도장 위치)에도 쓰지 않는다
    if (this.swallowUp) return;
    if (this.menus.pointerMove(x, y)) return;
    if (!["play", "tutorial", "countdown"].includes(this.state) || (touch && !this.pressing)) return;
    this.board.setAnchor(this.board.cellAt(x, y));
  }

  pointerUp(x: number, y: number, touch: boolean): void {
    if (this.swallowUp) {
      this.swallowUp = false;
      return;
    }
    if (this.menus.pointerUp(x, y)) return;
    if (!this.pressing) return;
    this.pressing = false;
    const c = this.board.cellAt(x, y);
    if (c) this.tryPlace(c);
    // 터치는 손가락을 떼면 미리보기를 숨긴다(마우스는 커서 위치에 계속 표시)
    this.board.setAnchor(null);
    if (!touch && ["play", "tutorial", "countdown"].includes(this.state)) this.board.setAnchor(c);
  }

  key(code: string): void {
    if (this.gate) {
      this.wake();
      return;
    }
    this.unlockAudio();
    if (this.state === "tutorial" && ["Space", "ShiftLeft", "ShiftRight", "KeyC"].includes(code)) {
      this.doHold();
      return;
    }
    if (this.state === "play") {
      if (["Space", "ShiftLeft", "ShiftRight", "KeyC"].includes(code)) this.doHold();
      else if (code === "Escape" || code === "KeyP") this.pause();
      return;
    }
    this.menus.key(code);
  }

  // ---------------------------------------------------------------- 프레임

  update(realDt: number): void {
    this.clock += realDt;
    let dt = realDt;
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      dt = realDt * 0.05;
    }
    this.trauma = Math.max(0, this.trauma - realDt * 1.8);
    this.flash.a = Math.max(0, this.flash.a - realDt * (this.flash.a / 0.25 + 0.5));
    this.timePulse += (1 - this.timePulse) * Math.min(1, realDt * 10);
    this.bgMix += ((this.inFever ? 1 : 0) - this.bgMix) * Math.min(1, realDt * 6);
    this.tweens.update(dt);
    this.board.update(dt);
    this.fx.update(dt);
    this.menus.update(realDt);
    this.stage.update(dt);
    this.title.update(realDt);
    this.tutorial.update(realDt);

    if (this.state === "tutorial") {
      if (this.stampLock > 0) this.stampLock = Math.max(0, this.stampLock - dt);
      this.now.cooldown = this.stampLock / STAMP_COOLDOWN;
    }
    if (this.state !== "play") return;
    if (this.rules.tick(dt)) this.breakCombo();
    if (this.stampLock > 0) this.stampLock = Math.max(0, this.stampLock - dt);
    this.now.cooldown = this.stampLock / STAMP_COOLDOWN;

    this.timeWarning();
    if (this.inFever) this.feverFrame(dt);
    if (this.autoplay) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0 && this.stampLock <= 0) {
        this.autoTimer = 0.35 + Math.random() * 0.55;
        const mv = bestMove(this.board.model, this.current.cells);
        this.board.setAnchor({ x: mv.x, y: mv.y });
        this.tryPlace({ x: mv.x, y: mv.y });
      }
    }
    if (this.rules.isOver()) {
      this.rules.timeLeft = 0;
      this.end();
    }
  }

  /** 남은 10초부터 매초 째깍, 5초부터는 높고 급한 경고음 + 시간 숫자 튀기 + 화면 가장자리 붉은 빛(매초 뛴다). */
  private timeWarning(): void {
    const tl = this.rules.timeLeft;
    const sec = Math.ceil(tl);
    if (tl <= 10 && tl > 0 && sec !== this.lastTick) {
      this.lastTick = sec;
      if (sec <= 5) {
        this.sfx.play("warn", 1 + (5 - sec) * 0.07);
        this.timePulse = 1.25;
      } else this.sfx.play("tick");
    }
    if (tl <= 5 && tl > 0) {
      const beat = Math.pow(tl - Math.floor(tl), 4); // 초가 바뀐 직후 가장 밝고 점점 흐려진다
      this.stage.danger = (0.25 + 0.75 * beat) * (0.18 + 0.17 * ((5 - tl) / 5));
    } else this.stage.danger = 0;
  }

  /** 피버 중: 가장자리 분홍 빛이 뛰고, 화면 아래에서 불꽃이 올라온다. */
  private feverFrame(dt: number): void {
    this.feverT += dt;
    this.stage.feverGlow = 0.24 + 0.12 * Math.sin(this.feverT * 9);
    this.emberT -= dt;
    while (this.emberT <= 0) {
      this.emberT += 0.05;
      this.fx.ember(10 + Math.random() * 700, 1290, `hsl(${280 + Math.random() * 80},90%,75%)`);
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    if (this.state === "title") {
      // 타이틀: 전용 배경 + 로고(게임 방법·설정은 그 위에 어둡게 덮인다)
      const s = this.shakeOn ? 14 * this.trauma * this.trauma : 0;
      g.save();
      g.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
      this.title.drawBackdrop(g);
      if (this.menus.current === "title" || this.gate) this.title.drawLogo(g);
      g.restore();
      if (this.gate) this.menus.drawTapToStart(g, this.clock);
      else this.menus.draw(g);
      return;
    }
    g.fillStyle = mix(SKIN.bg, SKIN.bgFever, this.bgMix);
    g.fillRect(0, 0, W, H);
    const s = this.shakeOn ? 26 * this.trauma * this.trauma : 0;
    g.save();
    g.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
    this.board.draw(g);
    this.fx.draw(g);
    g.restore();
    this.drawHud(g);
    this.drawSlots(g);
    this.tutorial.draw(g);
    for (const f of this.floats) this.drawFloat(g, f);
    this.stage.draw(g);
    if (this.flash.a > 0.001) {
      g.globalAlpha = this.flash.a * 0.3;
      g.fillStyle = this.flash.color;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (this.state === "play") this.drawPauseButton(g);
    this.menus.draw(g);
  }

  private drawHud(g: CanvasRenderingContext2D): void {
    const r = this.rules;
    panel(g, 24, 24, 672, 206);
    text(g, t("SCORE"), 48, 67, 27, SKIN.score, "left");
    fitText(g, r.score.toLocaleString(), 48, 133, 60, 250, SKIN.text);
    fitText(g, t("BEST_FMT", Math.max(this.best, 0).toLocaleString()), 48, 177, 25, 260, SKIN.muted);
    text(g, t("TIME"), 672, 67, 27, SKIN.timeText, "right");
    // 남은 시간 60·30·10초 기준: 숫자 노랑→주황→빨강, 막대 하늘→보라→빨강
    const tl = Math.max(0, r.timeLeft);
    const danger = tl >= 60 ? 0 : tl >= 30 ? (60 - tl) / 60 : tl >= 10 ? 0.5 + (30 - tl) / 40 : 1;
    const timeCol = danger < 0.5 ? mix(SKIN.timeText, "#ff8c1a", danger * 2) : mix("#ff8c1a", SKIN.warn, (danger - 0.5) * 2);
    const barCol = danger < 0.5 ? mix(SKIN.time, "#b866ff", danger * 2) : mix("#b866ff", SKIN.warn, (danger - 0.5) * 2);
    g.save();
    g.translate(672, 113);
    const pulse = 1 + (this.timePulse - 1) * 0.35;
    g.scale(pulse, pulse);
    fitText(g, tl.toFixed(1), 0, 20, 60, 228, timeCol, "right");
    g.restore();
    if (this.state === "play") fitText(g, t("TARGET_FMT", r.timeTarget()), 672, 177, 24, 304, "#a9d8bf", "right");
    roundRect(g, 48, 202, 624, 8, 4);
    g.fillStyle = "#30273e"; g.fill();
    g.fillStyle = barCol;
    const barWidth = 624 * Math.min(1, tl / GAME_TIME);
    if (barWidth > 0) { roundRect(g, 48, 202, barWidth, 8, Math.min(4, barWidth / 2)); g.fill(); }

    // All combo and grade feedback lives in this strip, clear of the board.
    panel(g, 24, 252, 672, 124, this.inFever ? "#683159" : SKIN.panelBorder, 20);
    const c = this.comboText;
    if (!this.inFever) text(g, t("ARCADE_TAG"), 48, 292, 23, SKIN.muted, "left");
    if (c.alpha > 0.01 && c.text) {
      g.save();
      g.globalAlpha = c.alpha;
      g.translate(660, 292);
      const scale = 1 + (c.scale - 1) * 0.15;
      g.scale(scale, scale);
      fitText(g, c.text, 0, 0, 32, 240, c.color, "right");
      g.restore();
      const k = r.combo > 0 ? Math.min(1, r.comboTimer / r.comboWindow) : 0;
      g.fillStyle = SKIN.tiers[tierFor(r.combo)];
      g.globalAlpha = c.alpha;
      g.fillRect(440, 304, 220 * k, 4);
      g.globalAlpha = 1;
    }
    if (!this.gradeFloat || this.gradeFloat.alpha <= 0.01) {
      fitText(g, t("PLAY_HINT"), 360, 349, 26, 624, SKIN.muted, "center");
    }
    const touch = this.touchControls.matches;
    if (this.state !== "tutorial") {
      panel(g, 24, 1070, 672, 114);
      text(g, t(touch ? "TOUCH_HINT" : "FOOTER"), 360, 1117, 27, SKIN.muted, "center");
      text(g, t(touch ? "TOUCH_HOLD" : "FOOTER_PAUSE"), 360, 1158, 25, SKIN.muted, "center");
    } else fitText(g, t(touch ? "TOUCH_HINT" : "HOWTO_KEYS"), 360, 1260, 24, 672, SKIN.muted, "center");
  }

  private drawSlots(g: CanvasRenderingContext2D): void {
    for (const s of [this.hold, this.now, ...this.nexts]) {
      g.save();
      g.globalAlpha = s.alpha;
      panel(g, s.x, s.y, s.w, s.h, s.highlight ? "#b94ca8" : SKIN.panelBorder, 16);
      let top = 0;
      if (s.title) {
        text(g, t(s.title as "HOLD" | "NOW"), s.x + s.w / 2, s.y + 34, 27, s.highlight ? SKIN.score : SKIN.text, "center");
        top = 42;
      }
      if (s.hint && s.cells.length === 0) t(s.hint as "HOLD_HINT").split("\n").forEach((line, i) => text(g, line, s.x + s.w / 2, s.y + 74 + i * 28, 24, SKIN.muted, "center"));
      g.beginPath();
      g.rect(s.x, s.y, s.w, s.h);
      g.clip();
      this.drawPiece(g, s, top);
      if (s.cooldown > 0) {
        const w = (s.w - 40) * s.cooldown;
        g.fillStyle = "rgba(255,255,255,0.6)";
        g.fillRect(s.x + (s.w - w) / 2, s.y + s.h - 18, w, 6);
      }
      g.restore();
    }
    text(g, t("NEXT"), SIDE_X + SIDE_W / 2, this.nexts[0].y - 8, 24, SKIN.muted, "center");
  }

  private drawPiece(g: CanvasRenderingContext2D, s: Slot, top: number): void {
    if (s.cells.length === 0) return;
    let mnx = 99, mny = 99, mxx = -99, mxy = -99;
    for (const c of s.cells) {
      mnx = Math.min(mnx, c.x);
      mny = Math.min(mny, c.y);
      mxx = Math.max(mxx, c.x);
      mxy = Math.max(mxy, c.y);
    }
    const p = Math.min(s.cellPx, (s.w - 24) / (mxx - mnx + 1), (s.h - top - 18) / (mxy - mny + 1));
    const dw = (mxx - mnx + 1) * p, dh = (mxy - mny + 1) * p;
    const ox = s.x + (s.w - dw) / 2, oy = s.y + top + (s.h - top - dh) / 2 + s.oy;
    const inset = Math.max(2, p * 0.08);
    const dim = s.dimmed || s.cooldown > 0;
    g.fillStyle = dim ? SKIN.pieceDim : SKIN.piece;
    if (!dim) {
      g.shadowColor = alpha(SKIN.piece, 0.7);
      g.shadowBlur = 10;
    }
    for (const c of s.cells) g.fillRect(ox + (c.x - mnx) * p + inset, oy + (c.y - mny) * p + inset, p - inset * 2, p - inset * 2);
    g.shadowBlur = 0;
  }

  private drawFloat(g: CanvasRenderingContext2D, f: FloatText): void {
    if (f.alpha <= 0.01) return;
    if (f.placement === "grade") {
      if (f !== this.gradeFloat) return;
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, f.alpha));
      fitText(g, f.lines[0].text, 48, 349, 32, f.lines.length > 2 ? 250 : 420, f.lines[0].color);
      fitText(g, f.lines[1].text, 672, 349, 32, 160, f.lines[1].color, "right");
      if (f.lines[2]) fitText(g, f.lines[2].text, 414, 349, 24, 210, SKIN.muted, "center");
      g.restore();
      return;
    }
    // Time bonuses sit below the timer; other small notices retain their location.
    if (f.placement === "time") {
      g.save(); g.globalAlpha = Math.max(0, Math.min(1, f.alpha));
      text(g, f.lines[0].text, 670, 247, 25, f.lines[0].color, "right");
      g.restore();
      return;
    }
    // 긴 글자(PERFECT x12! 등)가 화면 밖으로 나가지 않게 가로 위치를 안쪽으로 당긴다.
    let half = 0;
    for (const l of f.lines) {
      g.font = font(l.size);
      half = Math.max(half, (g.measureText(l.text).width / 2 + l.size * 0.2) * f.scale);
    }
    const x = half * 2 >= W - 20 ? W / 2 : Math.min(Math.max(f.x + f.dx, half + 10), W - half - 10);
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, f.alpha));
    g.translate(x, f.y);
    g.scale(f.scale, f.scale);
    let y = 0;
    for (const [i, l] of f.lines.entries()) {
      if (i > 0) y += l.size * 1.25;
      outlined(g, l.text, 0, y + l.size * 0.35, l.size, l.color);
    }
    g.restore();
  }

  private drawPauseButton(g: CanvasRenderingContext2D): void {
    const b = PAUSE_BTN;
    panel(g, b.x, b.y, b.w, b.h, SKIN.panelBorder, 24);
    g.fillStyle = SKIN.text;
    g.fillRect(b.x + 31, b.y + 28, 8, 28);
    g.fillRect(b.x + 45, b.y + 28, 8, 28);
  }
}
