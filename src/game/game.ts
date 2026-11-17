import { touchUI } from "./device.ts";
import { planMoves } from "../core/bot.ts";
import { FAIL_LOCK, FEVER_NEED, FEVER_TIME, GAME_TIME, GameRules, HOLD_COOLDOWN, MIN_BREAK, STAMP_COOLDOWN, type StampResult } from "../core/game-rules.ts";
import { FEVER_SHAPE } from "../core/shapes.ts";
import { BOARD_COLORS, BOARD_COLS, BOARD_ROWS, localSeed, newBoard, newQueue, REPLAY_VERSION, type Replay, type ReplayEvent } from "../core/replay.ts";
import { ShapeQueue } from "../core/shape-queue.ts";
import type { Cell, Shape } from "../core/shapes.ts";
import { scalePitch, Sfx } from "./audio.ts";
import { BoardView, CELL, BLOCK, blockColor, chainColor, drawBlockIcon, roundRect, type BreakEvent, type StepEvent } from "./board-view.ts";
import { CRYSTAL_COL, CRYSTAL_CROSS, CRYSTAL_ROW } from "../core/board-model.ts";
import { colorMult } from "../core/game-rules.ts";
import { Fx } from "./fx.ts";
import { Hype } from "./hype.ts";
import { Menus } from "./menus.ts";
import { askNickname } from "./nick-input.ts";
import { createOnline, type RunTicket } from "./online.ts";
import { GAME_BPM, Music } from "./music.ts";
import { StageFx } from "./stage.ts";
import { TitleScreen } from "./title.ts";
import { Tutorial, type Rect as TRect } from "./tutorial.ts";
import { t } from "./i18n.ts";
import { accentLine, fitText, outlined, panel, text } from "./draw.ts";
import { alpha, font, mix, SKIN } from "./skin.ts";
import { ease, Tweens } from "./tween.ts";

export const W = 720;
export const H = 1280;
const COLS = BOARD_COLS, ROWS = BOARD_ROWS, COLORS = BOARD_COLORS;
/** 받아 둔 판 표(시드)를 이 시간이 지나면 버리고 새로 받는다(서버는 6시간 뒤 만료) */
const TICKET_MAX_AGE = 3 * 3600 * 1000;
/**
 * 못 보낸 판(인터넷 끊김, 보내기 전에 창을 닫음)을 기기에 맡겨 두는 곳. 다음에 연결되면 다시 보낸다.
 * 서버는 판 표를 받은 지 6시간이 지나면 받지 않으므로 조금 앞서 버린다. 5번 실패해도 버린다.
 */
const PENDING_KEY = "ss.pending";
const PENDING_MAX_AGE = 6 * 3600 * 1000 - 5 * 60 * 1000;
const PENDING_TRIES = 5;

interface PendingRun {
  run: string;
  /** 판 표를 받은 시각(ms) */
  at: number;
  /** 어느 계정의 판인지 (계정이 바뀌면 그 판 표는 쓸 수 없다) */
  account: string;
  score: number;
  replay: Replay;
  tries: number;
}
/** 플레이 화면 전체를 아래로 내리는 양(아래 안내 상자를 없앤 만큼 위아래 여백을 고르게) */
export const PLAY_OY = 72;
/** 판 테두리(보드 밖 12칸 단위)까지 포함해 왼쪽 끝이 위 상자들과 맞도록 */
const BOARD_SCALE = 0.78, BOARD_PAD = 12 * BOARD_SCALE;
const BOARD_X = 24 + BOARD_PAD, BOARD_Y = 400 + PLAY_OY;
/** 오른쪽 모양 칸: 오른쪽 끝을 위 상자들(24~696)과 맞춘다 */
const SIDE_X = 556, SIDE_W = 140;
const NEXT_COUNT = 4;

type State = "title" | "tutorial" | "countdown" | "play" | "pause" | "result";
const TUT_TOTAL = 4;

/** 오른쪽 위 구석 일시정지 버튼(가운데는 큰 시간 숫자 자리) */
const PAUSE_BTN = { x: 616, y: 12, w: 84, h: 84 };
/** 판 영역(화면 좌표) */
const BOARD_BOX = { x: BOARD_X, y: BOARD_Y, w: BOARD_COLS * CELL * BOARD_SCALE, h: BOARD_ROWS * CELL * BOARD_SCALE };
/** 점수 숫자 자리(점수 조각이 날아가는 곳) */
/** 점수 숫자 자리(오른쪽 위). 점수 조각이 이리로 빨려 들어간다. */
const SCORE_AT = { x: 148, y: 112 + PLAY_OY };
/** 떠오르는 글자 움직임: 쾅 / 튀어나옴 / 떠오름 / 흔들리다 떨어짐 */
const Pop = { BIG: 0, BOUNCE: 1, PLAIN: 2, DROP: 3 } as const;
/** 판 아래 바닥 격자의 지평선 */
const FLOOR_Y = 1078;
/** 이어하기 뒤 다시 멈출 수 있기까지의 시간(초). 멈춤·이어하기를 반복해 생각할 시간을 버는 꼼수를 줄인다. */
const PAUSE_LOCK = 3;

interface Rect { x: number; y: number; w: number; h: number }

/** 들어오는 연출 0→1 (delay초 뒤 0.38초 동안, 끝에서 살짝 감속) */
function introEase(t: number, delay: number): number {
  const k = Math.min(1, Math.max(0, (t - delay) / 0.38));
  return 1 - (1 - k) ** 3;
}

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

/** 여러 색 가짓수별 글자 색: 2색 하늘 / 3색 금 / 4색 주황 / 5색 분홍 */
const COLORS_COL = ["#ffffff", "#ffffff", "#40f2ff", "#ffc733", "#ff8a3d", "#ff40d9"];
/** 배율 글자(1.5, 2.2, 3, 4) */
const multText = (colors: number): string => String(colorMult(colors));

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
  /** 홀드를 바꾼 뒤 다시 바꿀 수 있을 때까지 남은 시간(게임 시간) */
  private holdLock = 0;
  private stampLock = 0;
  /** 이 기기에서 낸 최고 점수(손님일 때 보여 준다) */
  private localBest = 0;
  /** 로그인한 계정의 최고 점수(서버 기록). 로그인 안 했거나 아직 못 받았으면 null */
  private accountBest: number | null = null;
  /** 이어하기 뒤 다시 멈출 수 있을 때까지 남은 시간(초) */
  private pauseLock = 0;
  private trauma = 0;
  private hitstop = 0;
  private flash = { color: "#ffffff", a: 0 };
  private inFever = false;
  private bgMix = 0;
  private floats: FloatText[] = [];
  /** 안 찍힌 자리에 잠깐 뜨는 빨간 X(화면 좌표, 지난 시간) */
  private misses: { x: number; y: number; t: number }[] = [];
  /** 판 위쪽 줄의 이번 찍기 결과(연쇄 수 · 얻은 점수) */
  private gradeFloat: FloatText | null = null;
  /** 이번 찍기 연출 동안 다음 찍기를 막는 전체 시간(NOW 칸 아래 막대 비율) */
  private lockTotal = STAMP_COOLDOWN;
  /** 피버 게이지가 차오를 때 잠깐 밝아진다 */
  private gaugePulse = 0;
  /** 위쪽 색 줄: 지난 찍기에서 셈에 든 색 */
  private lastColors: number[] = [];
  private timePulse = 1;
  /** 점수 조각이 도착할 때 점수 숫자가 툭 커진다 */
  private scorePulse = 1;
  /** 0~1: 음악 박자(박 직후 1) */
  private beat = 0;
  /** 화면에 보이는 점수: 점수 조각이 도착할 때만 오른다(절대 내려가지 않게). 연출이 다 끝나면 실제 점수와 맞춘다. */
  private shownScore = 0;
  private readonly hype = new Hype(BOARD_BOX, SCORE_AT, (points) => {
    this.shownScore = Math.min(this.rules.score, this.shownScore + points);
    this.scorePulse = 1.16;
    this.sfx.play("tick", 1.6, -12);
  });
  private lastTick = -1;
  private pressing = false;
  private clock = 0;
  /** 판 시작 뒤 지난 시간(위 상자·오른쪽 칸이 차례로 들어오는 연출) */
  private intro = 9;
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
  /** 마지막으로 본 계정 (바뀌면 받아 둔 표·최고 점수를 다시 받는다) */
  private lastAccount: string | null = null;
  /** 이 페이지에서 손님 계정 만들기를 이미 해 봤는지 (실패해도 계속 다시 묻지 않는다) */
  private guestTried = false;
  /** 판 기록을 보내는 중 (그동안 맡겨 둔 판을 또 보내지 않는다) */
  private submitting = false;
  /** 닉네임 정하기 창을 이번 접속에서 결과 화면에 띄운 적 있는지 */
  private askedNick = false;
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
      this.localBest = Number(localStorage.getItem("ss.best") ?? 0) || 0;
    } catch {
      this.localBest = 0;
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
      // 로그아웃하면 다음 판부터는 새 손님으로 기록한다
      rankLogout: () => void this.online.signOut().then(() => this.online.ensureGuest()),
      rankNickname: () => this.editNickname(),
    });
    this.menus.rank.status = this.online.configured ? "ready" : "off";
    this.online.onChange = () => this.onOnlineChange();
    void this.online.init().catch(() => {
      /* 연결 실패해도 게임은 그대로 */
    });
    this.menus.best = this.best;
    this.applySettings(this.menus.settings);
    // 오른쪽 줄의 위아래 끝도 판 테두리와 맞춘다
    let y = Math.round(BOARD_Y - BOARD_PAD);
    this.hold = this.slot("HOLD", y, 118, 20, false);
    this.hold.hint = "empty";
    y += 128;
    this.now = this.slot("NOW", y, 170, 30, true);
    y += 170 + 10;
    for (let i = 0; i < NEXT_COUNT; i++) {
      const h = i === 0 ? 104 : 50;
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

  /** 화면에 보여 줄 최고 점수: Google 계정이면 계정 기록, 손님이면 계정과 이 기기 중 높은 쪽, 계정이 없으면 이 기기 기록 */
  private get best(): number {
    if (this.online.nickname === null) return this.localBest;
    if (this.online.guest) return Math.max(this.localBest, this.accountBest ?? 0);
    return this.accountBest ?? 0;
  }

  /** 계정 최고 점수를 서버에서 다시 받는다 */
  private loadAccountBest(): void {
    if (this.online.nickname === null) {
      this.accountBest = null;
      if (this.state !== "result") this.menus.best = this.best;
      return;
    }
    void this.online.myRank().then((r) => {
      if (this.online.nickname === null) return;
      this.accountBest = r?.best ?? 0;
      if (this.state !== "result") this.menus.best = this.best;
    }).catch(() => {
      /* 못 받으면 다음 기회에 */
    });
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
    // 처음 온 사람: 손님 계정을 만들어 첫 판부터 기록이 남게 한다(첫 화면은 가볍게 두려고 첫 입력 뒤에)
    if (!this.guestTried && !this.autoplay && this.online.configured && this.online.nickname === null) {
      this.guestTried = true;
      void this.online.ensureGuest();
    }
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
    if (this.online.account !== this.lastAccount) {
      this.lastAccount = this.online.account;
      this.nextTicket = null;
      // 로그인·로그아웃·계정이 바뀌면 최고 점수도 그 계정 것으로
      this.accountBest = null;
      this.loadAccountBest();
    }
    this.menus.rank.nickname = nick;
    this.menus.rank.guest = this.online.guest;
    this.menus.rank.guestsRanked = this.online.guestsRanked;
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
    // Google로 처음 로그인했는데 닉네임이 없으면 바로 묻는다(손님은 첫 판이 끝난 뒤에 묻는다)
    if (nick === "" && !this.online.guest) this.editNickname();
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
        // 결과 화면에서 닉네임을 정했으면 방금 판의 순위를 보여 준다
        if (this.state === "result" && this.online.nickname) {
          void this.online.myRank().then((m) => {
            if (m?.rank && this.state === "result") this.menus.resultRank = t("RESULT_RANK_FMT", m.rank);
          }).catch(() => {
            /* 못 받으면 그대로 */
          });
        }
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
    if (this.nextTicket || this.ticketLoading || this.submitting || !this.rankable() || this.online.nickname === null) return;
    if (this.state !== "title" && this.state !== "result") return;
    this.ticketLoading = true;
    const owner = this.online.account;
    // 맡겨 둔 판이 있으면 먼저 보낸다(새 표를 받으면 서버가 그 판 표를 닫는다)
    void this.sendPending().then((clear) => {
      if (!clear) {
        this.ticketLoading = false;
        setTimeout(() => this.prepareRun(), 10_000);
        return;
      }
      return this.online.startRun().then((tk) => {
        this.ticketLoading = false;
        if (this.online.account !== owner) return;
        if (tk) this.nextTicket = tk;
        // 너무 빨리 다시 요청해 거절됐을 수 있다: 잠시 뒤 한 번 더
        else setTimeout(() => this.prepareRun(), 3000);
      });
    });
  }

  private loadPending(): PendingRun | null {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return raw ? (JSON.parse(raw) as PendingRun) : null;
    } catch {
      return null;
    }
  }

  private savePending(p: PendingRun | null): void {
    try {
      if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
      else localStorage.removeItem(PENDING_KEY);
    } catch {
      /* 저장 못 하면 다시 보내기만 못 한다 */
    }
  }

  /** 맡겨 둔 판을 보낸다. 더 기다릴 것이 없으면(보냈거나 버렸으면) true, 연결이 안 돼 다음에 다시 보내야 하면 false. */
  private async sendPending(): Promise<boolean> {
    const p = this.loadPending();
    if (!p) return true;
    if (p.account !== this.online.account || Date.now() - p.at > PENDING_MAX_AGE || !p.run || !p.replay) {
      this.savePending(null);
      return true;
    }
    const res = await this.online.submitRun({ run: p.run, replay: p.replay, score: p.score });
    if (!res.ok && res.reason === "error" && ++p.tries < PENDING_TRIES) {
      this.savePending(p);
      return false;
    }
    this.savePending(null);
    if (res.ok && res.best != null && this.online.account === p.account) {
      this.accountBest = res.best;
      if (this.state !== "result") this.menus.best = this.best;
    }
    return true;
  }

  /** 판이 끝났을 때 랭킹 등록. 서버가 기록을 다시 돌려 계산한 점수만 올라간다. */
  private submitScore(): void {
    this.menus.resultRank = "";
    if (!this.rankable()) return;
    if (this.online.nickname === null) {
      this.menus.resultRank = t("RESULT_RANK_GUEST");
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
    const replay: Replay = { v: REPLAY_VERSION, tutorial: this.tutLog, events: this.log };
    const account = this.online.account ?? "";
    // 보내기 전에 기기에 먼저 맡긴다: 연결이 끊기거나 창을 닫아도 다음에 다시 보낸다
    const pending: PendingRun = { run: tk.id, at: tk.at, account, score: r.score, replay, tries: 0 };
    this.savePending(pending);
    // 계정 최고 점수는 서버 확인 전에 먼저 반영하고, 등록 결과(서버 계산)로 바로잡는다
    const before = this.accountBest;
    if (this.accountBest !== null && r.score > this.accountBest) this.accountBest = r.score;
    this.submitting = true;
    void this.online.submitRun({ run: tk.id, replay, score: r.score }).then((res) => {
      this.submitting = false;
      const retry = !res.ok && res.reason === "error";
      if (!retry) this.savePending(null);
      // 기록을 올린 뒤에 다음 판 표를 받는다(먼저 받으면 이번 판 표가 무효가 된다)
      this.prepareRun();
      if (this.online.account === account) {
        if (res.ok && res.best != null) this.accountBest = res.best;
        else if (!res.ok) this.accountBest = before;
        if (this.state !== "result") this.menus.best = this.best;
      }
      if (this.run !== run) return;
      this.menus.resultRank = res.ok
        ? res.rank ? t("RESULT_RANK_FMT", res.rank)
          : this.online.guest && !this.online.guestsRanked ? t("RESULT_RANK_GOOGLE")
          : this.online.nickname === "" ? t("RESULT_RANK_NICK") : t("RESULT_RANK_SAVED")
        : res.reason === "guest" ? t("RESULT_RANK_GUEST")
        : res.reason === "limit" ? t("RESULT_RANK_LIMIT")
        : res.reason === "rejected" ? t("RESULT_RANK_REJECTED")
        : res.reason === "outdated" ? t("RESULT_RANK_OUTDATED")
        : res.reason === "off" ? "" : t("RESULT_RANK_PENDING");
      // 손님의 첫 기록: 결과 화면이 뜬 뒤 닉네임을 한 번 묻는다(취소해도 기록은 남아 있다)
      if (res.ok && res.rank == null && this.online.nickname === "" && this.online.guestsRanked && !this.askedNick) {
        this.askedNick = true;
        setTimeout(() => {
          if (this.run === run && this.state === "result" && this.online.nickname === "") this.editNickname();
        }, 1800);
      }
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

  /** 탭·앱을 벗어나면: 진행 중인 판은 일시정지 화면으로(이어한 직후 잠금도 무시), 소리는 끈다. */
  setHidden(hidden: boolean): void {
    if (hidden && this.state === "play") {
      this.pauseLock = 0;
      this.pause();
    }
    this.sfx.setSuspended(hidden);
  }

  private pause(): void {
    if (this.state !== "play") return;
    if (this.pauseLock > 0) {
      // 이어한 직후에는 잠깐 다시 멈출 수 없다
      this.sfx.play("tick", 0.6, -8);
      return;
    }
    this.state = "pause";
    this.pressing = false;
    this.board.setAnchor(null);
    this.hitstop = 0;
    this.menus.open("pause");
    this.music.setPaused(true);
  }

  /** 이어하기: 바로 시작하지 않고 3, 2, 1, GO! 뒤에 시간이 다시 흐른다. 그 뒤 잠깐은 다시 멈출 수 없다. */
  private resume(): void {
    if (this.state !== "pause") return;
    this.menus.close();
    // 피버 곡은 게임 시간과 맞아야 하므로 3·2·1 동안(시간이 멈춤) 계속 멈춰 두고 GO! 때 이어 튼다
    if (!this.inFever) this.music.setPaused(false);
    this.pauseLock = PAUSE_LOCK;
    this.beginCountdown();
  }

  private toTitle(): void {
    this.run++;
    this.exitFever(true);
    this.stage.clear();
    this.hype.clear();
    this.tutorial.close();
    this.floats = [];
    this.misses = [];
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
    this.intro = 0;
    this.menus.close();
    this.floats = [];
    this.misses = [];
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
    this.holdLock = 0;
    this.stampLock = 0;
    this.pauseLock = 0;
    this.inFever = false;
    this.board.fever = false;
    this.lastTick = -1;
    this.stage.clear();
    this.hype.clear();
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
          this.board.frameKick("#ffd133", 70, 0.6);
        }
      },
      () => {
        if (this.run === run && this.state === "countdown") {
          this.state = "play";
          this.music.setPaused(false);
        }
      },
      this.pauseLock === 0,
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
      this.tutorial.show(4, TUT_TOTAL, touchUI() ? "TUT_4" : "TUT_4_PC", [], this.hold);
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
    this.exitFever(true);
    this.hype.clear();
    this.held = null;
    this.holdLock = 0;
    this.refreshPieces();
    this.beginCountdown();
  }

  /** 지금 모양으로 점수가 가장 높은 자리(연쇄까지 계산) */
  private bestPlan() {
    return planMoves(this.board.model, this.current.cells, this.queue.peek(1)[0].cells)[0];
  }

  /** 점수가 가장 높은 자리의 칸들(화면 좌표). 첫 칸이 찍을 칸(모양의 가운데 = 마우스 칸)이다. */
  private bestCells(): TRect[] {
    const mv = this.bestPlan();
    const cs = CELL * BOARD_SCALE;
    const center = this.current.cells.filter((o) => o.x === 0 && o.y === 0);
    const rest = this.current.cells.filter((o) => o.x !== 0 || o.y !== 0);
    return [...center, ...rest]
      .map((o) => ({ x: mv.x + o.x, y: mv.y + o.y }))
      .filter((p) => this.board.model.inBounds(p.x, p.y))
      .map((p) => ({ x: BOARD_X + p.x * cs, y: BOARD_Y + p.y * cs, w: cs, h: cs }));
  }

  /** 튜토리얼 1~3단계는 화살표 자리(점수가 가장 높은 자리, 동점 자리 모두)만 받는다. 서버 검증과 같은 규칙. */
  private tutRejects(c: Cell): boolean {
    if (this.state !== "tutorial") return false;
    if (!this.tutAccepting || this.stampLock > 0) return true;
    const plans = planMoves(this.board.model, this.current.cells, this.queue.peek(1)[0].cells);
    const mine = plans.find((p) => p.x === c.x && p.y === c.y);
    return !mine || mine.points < plans[0].points;
  }

  private onTutRejected(c: Cell): void {
    this.sfx.play("tick", 0.6, -6);
    this.tutorial.nudge();
    if (!this.tutAccepting) return;
    const [x, y] = this.board.toScreen(c.x, c.y);
    this.float([{ text: t("TUT_WRONG"), size: 30, color: "#ffd94d" }], Math.min(Math.max(x, 210), 510), y);
  }

  /**
   * 판 끝 연출: 모든 게 멈칫(느린 화면 + 판 테두리 붉은 빛) → TIME UP 쾅 → 남은 블록이 대각선으로 차례로 부서짐 → 결과 화면.
   */
  private end(): void {
    this.state = "result";
    this.board.setAnchor(null);
    this.hype.flushChips();
    this.exitFever(true);
    this.stage.danger = 0;
    this.music.endGame();
    this.sfx.play("end");
    this.hitstop = 0.3;
    this.flashScreen("#ffffff", 0.35);
    this.board.frameKick(SKIN.warn, 70, 0.6);
    const run0 = this.run;
    this.tweens.add().wait(0.3).call(() => {
      if (this.run !== run0) return;
      this.stage.timeUp();
      this.sfx.play("big", 0.8);
      this.trauma = Math.min(1, this.trauma + 0.5);
    });
    // 남은 블록 연출(점수 없음, 끝났다는 손맛): 판 가운데에서 충격파가 퍼지며 가까운 블록부터 튕겨 부서진다
    const end = this.board.shockAll(0.75);
    const pieces = end.pieces;
    this.tweens.add().wait(0.75).call(() => {
      if (this.run !== run0) return;
      this.fx.ring(end.cx, end.cy, 900, SKIN.ring);
      this.sfx.play("big", 1.2);
    });
    pieces.forEach((b, i) => {
      this.tweens.add().wait(b.delay).call(() => {
        if (this.run !== run0) return;
        this.fx.burst(b.x, b.y, blockColor(b.color), 3, 260);
        if (i % 6 === 0) this.sfx.play("pop", 0.8 + (i / pieces.length) * 0.8, -10);
      });
    });
    const r = this.rules;
    const newBest = r.score > this.best && !this.autoplay;
    if (r.score > this.localBest && !this.autoplay) {
      this.localBest = r.score;
      try {
        localStorage.setItem("ss.best", String(this.localBest));
      } catch {
        /* 저장 못 해도 진행 */
      }
    }
    // 신기록이면 결과 화면의 「최고」도 이번 점수로(서버 확인 전 예전 최고가 보이지 않게)
    const best = newBest ? r.score : this.best;
    this.menus.result = {
      score: r.score, best, newBest, maxChain: r.maxChain,
      chains: r.chainTotal, crystals: r.crystalTotal, time: Math.round(r.bonusTimeTotal), biggest: r.biggest,
    };
    this.menus.best = best;
    this.submitScore();
    const run = this.run;
    this.tweens.add().wait(end.last + 0.55).call(() => {
      if (this.run !== run || this.state !== "result") return;
      this.stage.clear();
      this.menus.open("result");
    });
  }

  /** 본 게임에서 피버 중인가(도장이 3×3, 어디든 찍힘, 홀드 안 됨) */
  private get feverNow(): boolean {
    return this.state === "play" && this.rules.inFever;
  }

  private refreshPieces(): void {
    const fever = this.feverNow;
    const cells = fever ? FEVER_SHAPE.cells : this.current.cells;
    // 피버 중 보충 조정은 다음에도 3×3을 쓴다고 보고 맞춘다(서버 replay.ts와 같게)
    this.board.nextOffsets = fever ? FEVER_SHAPE.cells : this.queue.peek(1)[0].cells;
    this.board.setPiece(cells);
    this.now.cells = cells;
    const nexts = this.queue.peek(NEXT_COUNT);
    this.nexts.forEach((s, i) => (s.cells = nexts[i].cells));
    this.hold.dimmed = fever;
    this.hold.cells = this.held?.cells ?? [];
    if (this.state === "tutorial" && this.tutStep <= 3 && this.tutAccepting) this.tutorial.cells = this.bestCells();
  }

  private doHold(): void {
    if (!(this.state === "play" || this.state === "tutorial") || this.feverNow) return;
    if (this.holdLock > 0) {
      // 방금 바꿨으면 잠깐(HOLD_COOLDOWN초) 기다린다: 칸만 살짝 흔들어 알려 준다
      this.sfx.play("tick", 0.6, -10);
      const s = this.hold;
      this.tweens.add().to(0.12, (k) => (s.oy = Math.sin(k * Math.PI * 3) * 5 * (1 - k)));
      return;
    }
    const fromQueue = !this.held;
    if (fromQueue) {
      this.held = this.current;
      this.current = this.queue.pop();
    } else {
      [this.held, this.current] = [this.current, this.held!];
    }
    this.holdLock = HOLD_COOLDOWN;
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
    if (this.state === "play" && !this.rules.inFever && this.board.model.stampCount(c.x, c.y, this.board.offsets) < MIN_BREAK) {
      this.onTooSmall(c);
      return;
    }
    const ev = this.board.placeAt(c.x, c.y);
    if (!ev) return;
    this.record(["s", this.state === "tutorial" ? 0 : this.rules.elapsed, c.x, c.y]);
    this.onBroke(ev);
  }

  /** 점수는 바로 계산하고, 화면은 단계(도장 → 연쇄 1 → 연쇄 2 …)마다 시간에 맞춰 터뜨린다. */
  private onBroke(ev: BreakEvent): void {
    const tutorial = this.state === "tutorial";
    const r = this.rules.registerStamp(ev.counts, ev.colors, ev.crystalCount);
    if (tutorial) {
      this.rules.timeLeft = this.startTime; // 연습 중에는 시간이 늘거나 줄지 않는다
      r.timeDelta = 0;
    }
    // 연쇄 연출이 끝날 때까지 다음 찍기를 막는다(빨리 누르기보다 잘 찍기). 피버 중·피버 시작 땐 쿨다운만.
    this.stampLock = this.lockTotal = r.fever || r.feverStarted ? STAMP_COOLDOWN : Math.max(STAMP_COOLDOWN, ev.duration);
    const run = this.run;
    let sum = 0;
    ev.steps.forEach((st, i) => {
      sum += r.stepPoints[i];
      const upTo = sum;
      this.tweens.add().wait(st.at).call(() => {
        if (this.run !== run) return;
        this.juiceStep(st, r.stepPoints[i], ev);
        this.stampLine(st.chain, upTo, ev);
      });
    });
    this.tweens.add().wait(ev.duration).call(() => this.run === run && this.stampDone(ev, r));
    // 위쪽 색 줄: 이번에 셈에 든 색이 켜진다(도장 번짐이 끝날 때)
    this.tweens.add().wait(ev.waveTime).call(() => {
      if (this.run !== run) return;
      this.lastColors = ev.colorSet;
      if (r.colors >= 2) this.gaugePulse = 1;
    });
    if (r.chains > 0 || r.crystals > 0) this.gaugePulse = 1;
    if (r.fever) {
      // 피버 도장은 모양 순서를 쓰지 않는다
      this.refreshPieces();
      return;
    }
    this.current = this.queue.pop();
    if (r.feverStarted && this.state === "play") this.enterFever();
    this.refreshPieces();
    if (!r.feverStarted) this.slideQueue();
    if (tutorial && this.tutStep <= 3) this.nextTut(ev.duration + 0.45);
  }

  /** 모든 단계가 끝난 뒤: 시간 보너스, 새 크리스탈 */
  private stampDone(ev: BreakEvent, r: StampResult): void {
    if (r.timeDelta > 0) {
      const sec = Number(r.timeDelta.toFixed(2)).toString();
      this.float([{ text: t("TIME_DELTA_FMT", `+${sec}`), size: 28, color: "#66ff99" }], 610, 250).placement = "time";
      this.sfx.play("bonus");
      this.timePulse = 1.25;
    }
    if (ev.crystal) {
      const { x, y, kind } = ev.crystal;
      this.fx.ring(x, y, 110, "rgba(255,255,255,0.9)");
      this.fx.sparkle(x, y, "#e8f6ff", 14, 340);
      this.sfx.play("sparkle", kind === CRYSTAL_CROSS ? 1.35 : kind === CRYSTAL_COL ? 1.25 : 1.15, -2);
      const label = t(kind === CRYSTAL_CROSS ? "CRYSTAL_CROSS_NEW" : kind === CRYSTAL_COL ? "CRYSTAL_COL_NEW" : "CRYSTAL_NEW");
      // 연쇄 숫자가 바로 옆에 떠 있으면 크리스탈 아래쪽에 띄워 겹치지 않게
      const cb = this.hype.comboAt();
      const near = cb && Math.abs(cb.x - x) < 170 && Math.abs(cb.y - (y - 50)) < 110;
      this.float([{ text: label, size: 30, color: "#e8f6ff" }], x, near ? y + 62 : y - 50, false, Pop.BOUNCE);
    }
  }

  /** 쿨다운 중에 찍으려 하면 NOW 칸을 살짝 흔들어 "아직"이라고 알려 준다. */
  /** 너무 작아서 안 찍힘: 누른 칸에 빨간 X, 낮은 소리, 살짝 흔들림, 잠깐 못 찍는다 */
  private onTooSmall(c: Cell): void {
    this.sfx.play("miss", 1, -2);
    this.trauma = Math.min(1, this.trauma + 0.18);
    this.stampLock = this.lockTotal = FAIL_LOCK;
    const s = this.now;
    this.tweens.add().to(0.2, (k) => (s.oy = Math.sin(k * Math.PI * 4) * 8 * (1 - k)));
    // 글자 대신 누른 칸에 빨간 X 하나(미리보기의 흐린 점선이 「여긴 작다」를 이미 말해 준다)
    const [x, y] = this.board.toScreen(c.x, c.y);
    this.misses.push({ x, y, t: 0 });
  }

  private onBlocked(): void {
    this.sfx.play("tick", 0.6, -8);
    const s = this.now;
    this.tweens.add().to(0.12, (k) => (s.oy = Math.sin(k * Math.PI * 3) * 6 * (1 - k)));
  }

  /** 피버 시작: 도장이 3×3으로 바뀌고 어디든 찍힌다. */
  private enterFever(): void {
    this.inFever = true;
    this.board.fever = true;
    this.feverT = 0;
    this.sfx.play("fever");
    this.sfx.play("big", 1.2, -2);
    this.flashScreen("#ffffff", 0.5);
    this.trauma = Math.min(1, this.trauma + 0.35);
    const cx = BOARD_X + (COLS * CELL * BOARD_SCALE) / 2, cy = BOARD_Y + (ROWS * CELL * BOARD_SCALE) / 2;
    this.fx.ring(cx, cy, 520, SKIN.tiers[3]);
    this.fx.ring(cx, cy, 340, "rgba(255,255,255,0.8)");
    this.stage.feverStart();
    this.hype.showBanner("FEVER!", SKIN.tiers[3]);
    this.board.frameKick(SKIN.tiers[3], 80, 0.7);
    this.music.setFever(true);
    for (let i = 0; i < 24; i++) this.fx.ember(20 + Math.random() * 680, 1290, `hsl(${290 + Math.random() * 70},100%,72%)`);
    // NOW 칸의 3×3이 튀어 오른다
    const s = this.now;
    this.tweens.add().to(0.3, (k) => (s.oy = -18 * Math.sin(k * Math.PI)));
  }

  /** 피버 끝. quiet: 판이 끝나거나 타이틀로 갈 때처럼 "FEVER END" 연출 없이 조용히 끝낸다. */
  private exitFever(quiet = false): void {
    if (!this.inFever) return;
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

  // ---------------------------------------------------------------- 타격감

  /** 한 단계가 터질 때. 연쇄가 깊을수록 색·소리·흔들림이 세진다. */
  private juiceStep(st: StepEvent, points: number, ev: BreakEvent): void {
    const n = st.count, ch = st.chain, lv = Math.min(ch, 3), col = chainColor(ch);
    const power = 280 + lv * 110;
    let amount = 4 + lv * 2;
    if (st.broken.length > 35) amount = Math.max(2, amount - 2);
    // 번지는 파괴에 맞춰 블록마다 차례로 터뜨리고, 유리 소리가 음계를 따라 올라간다(연쇄가 깊을수록 높은 데서 시작).
    // 소리는 같은 순간에 몰리면 묶어서 하나만(너무 시끄럽지 않게, 최대 14음).
    const order = [...st.broken].sort((a, b) => a.delay - b.delay);
    let lastNote = -1, notes = 0;
    order.forEach((b) => {
      const bc = blockColor(b.color);
      const ring = b.delay - lastNote >= 0.03 && notes < 14;
      if (ring) {
        lastNote = b.delay;
        notes++;
      }
      const step = notes - 1 + ch * 2;
      this.tweens.add().wait(b.delay - st.at).call(() => {
        this.fx.burst(b.x, b.y, bc, amount, power);
        this.fx.flash(b.x, b.y, BLOCK * BOARD_SCALE, mix(bc, "#ffffff", 0.75));
        if (ring) this.sfx.play("blip", scalePitch(step) * (this.inFever ? 1.26 : 1), -13 + Math.min(notes, 6));
      });
    });
    for (const cr of st.crystals) {
      // 크리스탈: 가로(십자면 세로도) 한 줄을 꿰뚫는 빛줄기
      this.tweens.add().wait(cr.delay - st.at).call(() => {
        const cs = CELL * BOARD_SCALE, w = COLS * cs, h = ROWS * cs;
        const hue = Math.floor(Math.random() * 360);
        const c = `hsl(${hue},95%,72%)`;
        if (cr.kind !== CRYSTAL_COL) this.fx.beam(BOARD_X + w / 2, cr.y, w + 40, cs * 0.5, false, c);
        if (cr.kind !== CRYSTAL_ROW) this.fx.beam(cr.x, BOARD_Y + h / 2, h + 40, cs * 0.5, true, c);
        this.fx.ring(cr.x, cr.y, cs * 1.6, "rgba(255,255,255,0.95)");
        this.fx.sparkle(cr.x, cr.y, "#ffffff", 16, 560);
        this.flashScreen("#ffffff", 0.18);
        this.trauma = Math.min(1, this.trauma + 0.3);
        this.hitstop = Math.max(this.hitstop, 0.05);
        this.sfx.play("big", 1.25, -3);
        this.sfx.play("zap", 1, -2);
      });
    }
    const x = ch === 0 ? ev.ax : st.cx, y = ch === 0 ? ev.ay : st.cy;
    this.fx.ring(x, y, 70 + n * 6 + lv * 40, ch === 0 ? SKIN.ring : col);
    this.trauma = Math.min(1, this.trauma + 0.1 + n * 0.01 + lv * 0.07);
    if (n >= 12 || ch >= 1) this.hitstop = Math.max(this.hitstop, 0.025 + Math.min(n, 40) * 0.0012 + lv * 0.012);
    this.sfx.play("break", (0.9 + Math.random() * 0.2) * (n >= 15 ? 0.85 : 1), -3);
    if (ch === 0) this.sfx.play("thump", 1, -1);
    this.sfx.play("pop", 1 + ch * 0.12, -6);
    if (ch === 0 && ev.colors >= 3) {
      // 여러 색: 숫자를 안 봐도 「좋은 자리였다」를 알게 소리·흔들림·빛을 색 가짓수만큼 키운다
      const c = ev.colors;
      // 여러 색: 색 가짓수만큼 위로 올라가는 아르페지오(도-미-솔-높은 도-높은 미)
      for (let k = 0; k < c; k++) {
        const p = scalePitch([0, 2, 3, 5, 7][k]);
        this.tweens.add().wait(k * 0.05).call(() => this.sfx.play("perfect", p, -6));
      }
      if (c >= 4) {
        this.sfx.play("bonus", 1.2, -2);
        this.flashScreen("#ffffff", 0.12 + (c - 4) * 0.08);
        this.board.frameKick("#ffffff", 50 + (c - 4) * 20, 0.6);
      }
      this.trauma = Math.min(1, this.trauma + 0.06 * c);
      this.fx.sparkle(x, y, "#ffffff", 4 * c, 300 + 40 * c);
    }
    if (ch >= 1) {
      // 연쇄: 단계마다 한 음씩 올라가는 차임 + 판 위에 큰 연쇄 숫자
      const pitch = scalePitch(Math.min(ch, 10) + 1);
      this.sfx.play("stab", pitch, -5);
      if (ch >= 2) this.sfx.play("sparkle", 0.95 + ch * 0.05, -8);
      this.fx.sparkle(x, y, col, 6 + lv * 4, 360 + lv * 50);
      this.hype.showCombo(ch, x, y, col, "CHAIN");
      if (ch >= 3) this.flashScreen("#ffffff", 0.08 + Math.min(ch - 3, 3) * 0.05);
      if (ch >= 3 && ch % 2 === 1) {
        this.hype.showPraise((ch - 3) / 2, ch >= 5 ? SKIN.timeText : SKIN.accent);
        this.sfx.play("sparkle", 1.1, -4);
      }
    }
    if (n >= 15) {
      this.sfx.play("big", 1, -2);
      this.sfx.play("whoosh", 0.9 + Math.random() * 0.2, n >= 25 ? -2 : -5);
    }
    // 판 테두리 빛 고리: 아주 크게 부쉈을 때와 두 번째 연쇄부터(너무 자주면 무뎌진다)
    if (n >= 18 || ch >= 2) this.board.frameKick(col, 30 + Math.min(n, 30) + lv * 10);
    this.hype.addChip(points, x, y, col);
  }

  private flashScreen(color: string, a: number): void {
    this.flash.color = color;
    this.flash.a = a;
  }

  /** 판 위쪽 줄: 왼쪽 「3색 ×2.2」(연쇄 땐 「연쇄 2」, 한 색이면 「18칸」), 오른쪽 이번 찍기로 얻은 점수(단계마다 늘어난다). */
  private stampLine(chain: number, points: number, ev: BreakEvent): void {
    const col = chain > 0 ? chainColor(chain) : ev.colors >= 2 ? COLORS_COL[Math.min(ev.colors, 5)] : chainColor(0);
    const left = chain > 0 ? t("CHAIN_FMT", chain) : ev.colors >= 2 ? t("COLORS_FMT", ev.colors, multText(ev.colors)) : t("CELLS_FMT", ev.counts[0]);
    const lines = [
      { text: left, size: 32, color: col },
      { text: t("POINTS_FMT", points), size: 32, color: col },
    ];
    if (this.gradeFloat) this.gradeFloat.alpha = 0;
    // 다음 도장을 찍으면 바로 바뀐다. 읽을 시간이 있게 다른 글자보다 오래 둔다.
    const f = this.float(lines, 360, 0, false, chain > 0 ? Pop.BIG : Pop.PLAIN, 2.4);
    f.placement = "grade";
    this.gradeFloat = f;
  }

  /**
   * 떠오르는 글자. kind: 판정마다 움직임이 다르다(PERFECT 쾅 / GREAT 튀어나옴 / MISS 흔들리다 떨어짐).
   * stay: 머무르고 사라지는 시간 배율(튀어나오는 순간은 그대로)
   */
  private float(lines: FloatText["lines"], x: number, y: number, big = false, kind: number = Pop.PLAIN, stay = 1): FloatText {
    const f: FloatText = { lines, x, y, scale: 1, alpha: 1, dx: 0 };
    this.floats.push(f);
    const tw = this.tweens.add();
    if (big || kind === Pop.BIG) {
      f.scale = 1.6;
      f.alpha = 0;
      tw.to(0.12, (k) => {
        f.scale = 1.6 - 0.6 * k;
        f.alpha = Math.min(1, k * 2);
      }, ease.inQuad)
        .wait((big ? 0.5 : 0.28) * stay)
        .to(0.45 * stay, (k) => {
          f.y = y - 70 * k;
          f.alpha = 1 - k;
        }, ease.outCubic);
    } else if (kind === Pop.BOUNCE) {
      f.scale = 1.6;
      tw.to(0.18, (k) => (f.scale = 1.6 - 0.6 * k), ease.outBack)
        .wait(0.12 * stay)
        .to(0.5 * stay, (k) => {
          f.y = y - 80 * k;
          f.alpha = 1 - Math.max(0, (k - 0.2) / 0.8);
        }, ease.outCubic);
    } else if (kind === Pop.DROP) {
      tw.to(0.2, (k) => (f.dx = Math.sin(k * Math.PI * 5) * 12 * (1 - k)))
        .to(0.45 * stay, (k) => {
          f.y = y + 50 * k;
          f.alpha = 1 - k;
        }, ease.inQuad);
    } else {
      tw.to(0.7 * stay, (k) => {
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
    this.intro += realDt;
    let dt = realDt;
    // 피버 중엔 멈칫(히트스톱) 없이: 피버 6초가 피버 곡 6초와 어긋나지 않게
    if (this.hitstop > 0 && this.inFever) this.hitstop = 0;
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      dt = realDt * 0.05;
    }
    this.trauma = Math.max(0, this.trauma - realDt * 1.8);
    this.flash.a = Math.max(0, this.flash.a - realDt * (this.flash.a / 0.25 + 0.5));
    this.timePulse += (1 - this.timePulse) * Math.min(1, realDt * 10);
    this.scorePulse += (1 - this.scorePulse) * Math.min(1, realDt * 12);
    // 배경 음악 박자(소리가 아직 안 켜졌으면 같은 빠르기의 시계로)
    let ph = this.music.beatPhase();
    if (ph < 0) ph = (this.clock * GAME_BPM / 60) % 1;
    const live = this.state === "play" || this.state === "countdown" || this.state === "tutorial";
    this.beat = Math.exp(-ph * 5) * (live ? 1 : 0.3);
    this.board.beat = this.beat;
    this.bgMix += ((this.inFever ? 1 : 0) - this.bgMix) * Math.min(1, realDt * 6);
    this.tweens.update(dt);
    this.hype.update(dt);
    // 날아가는 조각도, 터지는 연출도 없으면 보이는 점수를 실제 점수에 맞춘다(점수가 줄어든 판 시작 포함)
    if (this.hype.pending === 0 && this.board.busy <= 0) this.shownScore = this.rules.score;
    this.board.avoid = this.hype.chipRects();
    this.board.feverMix = this.bgMix;
    this.board.minBreak = this.state === "tutorial" || this.rules.inFever ? 0 : MIN_BREAK;
    this.board.update(dt);
    this.fx.update(dt);
    for (const m of this.misses) m.t += realDt;
    this.misses = this.misses.filter((m) => m.t < MISS_TIME);
    this.menus.update(realDt);
    this.stage.update(dt);
    this.title.update(realDt);
    this.tutorial.update(realDt);

    if (this.state === "tutorial") {
      if (this.stampLock > 0) this.stampLock = Math.max(0, this.stampLock - dt);
      if (this.holdLock > 0) this.holdLock = Math.max(0, this.holdLock - dt);
      this.now.cooldown = this.stampLock / this.lockTotal;
      this.hold.cooldown = this.holdLock / HOLD_COOLDOWN;
    }
    this.gaugePulse = Math.max(0, this.gaugePulse - realDt * 2.5);
    if (this.state !== "play") return;
    if (this.pauseLock > 0) this.pauseLock = Math.max(0, this.pauseLock - realDt);
    this.rules.tick(dt);
    if (this.stampLock > 0) this.stampLock = Math.max(0, this.stampLock - dt);
    // 홀드 간격도 게임 시간으로 센다(서버가 기록의 시각 차이로 같은 검사를 한다)
    if (this.holdLock > 0) this.holdLock = Math.max(0, this.holdLock - dt);
    this.now.cooldown = this.stampLock / this.lockTotal;
    this.hold.cooldown = this.holdLock / HOLD_COOLDOWN;
    if (this.inFever && !this.rules.inFever) {
      // 피버 끝: 원래 모양 순서로 돌아간다
      this.exitFever();
      this.refreshPieces();
      this.slideIn(this.now, -130);
    }

    this.timeWarning();
    if (this.inFever) this.feverFrame(dt);
    if (this.autoplay) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0 && this.stampLock <= 0) {
        this.autoTimer = 0.35 + Math.random() * 0.55;
        const mv = this.bestPlan();
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
    this.drawFloor(g);
    const s = this.shakeOn ? 26 * this.trauma * this.trauma : 0;
    g.save();
    g.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
    this.board.draw(g);
    this.hype.drawCombo(g);
    this.fx.draw(g);
    this.hype.drawOverlay(g);
    g.restore();
    this.drawHud(g);
    this.drawSlots(g);
    this.hype.drawChips(g);
    this.tutorial.draw(g);
    if (this.state !== "countdown") for (const f of this.floats) this.drawFloat(g, f);
    for (const m of this.misses) drawMiss(g, m.x, m.y, m.t);
    if (this.state === "countdown") this.drawCountdownBackdrop(g);
    this.stage.draw(g);
    if (this.flash.a > 0.001) {
      g.globalAlpha = this.flash.a * 0.3;
      g.fillStyle = this.flash.color;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (this.state === "play" || (this.state === "countdown" && this.pauseLock > 0)) this.drawPauseButton(g);
    this.menus.draw(g);
  }

  private drawHud(g: CanvasRenderingContext2D): void {
    g.save();
    // 판이 시작되면 위 상자들이 위에서 내려앉는다
    const k = introEase(this.intro, 0);
    g.globalAlpha *= k;
    g.translate(0, PLAY_OY - 48 * (1 - k));
    this.drawHudPanels(g);
    g.restore();
  }

  /** 판 아래 바닥 격자: 박자마다 밝아지고, 피버 땐 분홍·금색으로 물든다. 판 뒤에는 은은한 빛 웅덩이. */
  private drawFloor(g: CanvasRenderingContext2D): void {
    const fm = this.bgMix, beat = this.beat;
    const cx = BOARD_BOX.x + BOARD_BOX.w / 2, cy = BOARD_BOX.y + BOARD_BOX.h / 2;
    const pool = g.createRadialGradient(cx, cy, 60, cx, cy, 560);
    pool.addColorStop(0, alpha(mix("#40d9ff", "#ff40d9", fm), 0.05 + 0.07 * fm + 0.03 * beat));
    pool.addColorStop(1, "rgba(9,7,21,0)");
    g.fillStyle = pool;
    g.fillRect(0, 0, W, H);
    const lineCol = mix("#40e6ff", "#ff6be0", fm);
    g.save();
    g.lineWidth = 1.5;
    g.strokeStyle = alpha(lineCol, 0.07 + 0.12 * beat);
    g.beginPath();
    for (let i = -10; i <= 10; i++) {
      g.moveTo(W / 2 + i * 22, FLOOR_Y);
      g.lineTo(W / 2 + i * 130, H);
    }
    // 가로선: 앞으로 흘러온다(가까울수록 간격이 넓다)
    const scroll = (this.clock * 0.5) % 1, depth = H - FLOOR_Y;
    for (let i = 0; i < 7; i++) {
      const y = FLOOR_Y + depth * ((i + scroll) / 7) ** 2;
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();
    const hz = g.createLinearGradient(0, 0, W, 0);
    const hc = mix("#ff40d9", "#ffc733", fm);
    hz.addColorStop(0, alpha(hc, 0));
    hz.addColorStop(0.5, alpha(hc, 0.25 + 0.35 * beat));
    hz.addColorStop(1, alpha(hc, 0));
    g.strokeStyle = hz;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, FLOOR_Y);
    g.lineTo(W, FLOOR_Y);
    g.stroke();
    g.restore();
  }

  /**
   * 위쪽 표시: 상자 없이 큰 숫자와 얇은 선만. 왼쪽 점수 · 가운데 최고 · 오른쪽 큰 시간,
   * 그 아래 왼쪽 끝이 오른쪽으로 줄어드는 시간 막대와 다음 +1초 목표,
   * 그 아래 피버 게이지 줄과 이번 찍기 결과 줄(위아래 선 하나씩).
   */
  private drawHudPanels(g: CanvasRenderingContext2D): void {
    const r = this.rules;
    // 남은 시간 60·30·10초 기준: 숫자 노랑→주황→빨강, 막대 하늘→보라→빨강
    const tl = Math.max(0, r.timeLeft);
    const danger = tl >= 60 ? 0 : tl >= 30 ? (60 - tl) / 60 : tl >= 10 ? 0.5 + (30 - tl) / 40 : 1;
    const timeCol = danger < 0.5 ? mix(SKIN.timeText, "#ff8c1a", danger * 2) : mix("#ff8c1a", SKIN.warn, (danger - 0.5) * 2);
    const barCol = danger < 0.5 ? mix(SKIN.time, "#b866ff", danger * 2) : mix("#b866ff", SKIN.warn, (danger - 0.5) * 2);
    // 시간은 오른쪽(막대가 오른쪽으로 줄어들어 끝까지 남는 쪽), 점수는 왼쪽
    text(g, t("TIME"), 672, 62, 26, alpha(SKIN.timeText, 0.8), "right");
    g.save();
    // 왼쪽 점수 숫자와 같은 크기·높이로(시간만 튀어 보이지 않게)
    g.translate(672, 112);
    const pulse = 1 + (this.timePulse - 1) * 0.5;
    g.scale(pulse, pulse);
    g.font = font(56);
    g.textAlign = "right";
    g.textBaseline = "alphabetic";
    g.shadowColor = alpha(timeCol, 0.55);
    g.shadowBlur = 18;
    g.fillStyle = timeCol;
    g.fillText(tl.toFixed(1), 0, 20);
    g.restore();
    text(g, t("BEST"), 360, 62, 24, SKIN.muted, "center");
    fitText(g, Math.max(this.best, 0).toLocaleString(), 360, 124, 32, 170, SKIN.muted, "center");
    text(g, t("SCORE"), 48, 62, 26, SKIN.score, "left");
    g.save();
    const sp = this.scorePulse;
    g.translate(48, 112); g.scale(sp, sp); g.translate(-48, -112);
    fitText(g, Math.max(0, this.shownScore).toLocaleString(), 48, 132, 56, 230, SKIN.text, "left");
    g.restore();
    // 시간 막대: 오른쪽 끝은 고정, 왼쪽 끝이 오른쪽으로 줄어든다
    g.fillStyle = "rgba(64,217,255,0.12)";
    g.fillRect(48, 168, 624, 4);
    const barWidth = 624 * Math.min(1, tl / GAME_TIME);
    if (barWidth > 0) {
      g.save();
      g.fillStyle = barCol;
      g.shadowColor = barCol;
      g.shadowBlur = 10;
      g.fillRect(672 - barWidth, 166, barWidth, 8);
      // 막대 끝의 밝은 점: 어느 쪽으로 줄어드는지 한눈에
      g.fillStyle = "#ffffff";
      g.fillRect(672 - barWidth, 164, 4, 12);
      g.restore();
    }
    // 여러 색 줄: 다섯 색 표시 중 지난 찍기에서 셈에 든 색이 켜지고, 오른쪽에 그 배율
    accentLine(g, 24, 244, 672, SKIN.muted);
    text(g, t("COLORS_LABEL"), 48, 304, 24, alpha(SKIN.text, 0.7), "left");
    const cp = this.gaugePulse;
    for (let c = 0; c < COLORS; c++) {
      const lit = this.lastColors.includes(c);
      const cx = 240 + c * 66, cy = 294;
      g.save();
      g.globalAlpha = lit ? 1 : 0.22;
      if (lit) {
        g.shadowColor = SKIN.blocks[c];
        g.shadowBlur = 10 + 16 * cp;
      }
      drawBlockIcon(g, c, cx, cy, lit ? 46 + 8 * cp : 40);
      g.restore();
    }
    this.drawFeverGauge(g);
    const n = this.lastColors.length;
    if (n >= 2) {
      g.save();
      const s = 1 + 0.3 * cp;
      g.translate(672, 294);
      g.scale(s, s);
      text(g, `×${multText(n)}`, 0, 12, 36, COLORS_COL[Math.min(n, 5)], "right", COLORS_COL[Math.min(n, 5)]);
      g.restore();
    }
  }

  /**
   * 피버 게이지 = 색 줄의 아래 선. 평소엔 연쇄·크리스탈로 왼쪽부터 분홍으로 차고,
   * 피버 땐 남은 시간만큼 줄어든다. 글자 없이 선 하나로.
   */
  private drawFeverGauge(g: CanvasRenderingContext2D): void {
    const r = this.rules, fever = this.inFever;
    const k = fever ? Math.min(1, r.feverLeft / FEVER_TIME) : Math.min(1, r.feverGauge / FEVER_NEED);
    const col = SKIN.tiers[3];
    const gx = 24, gw = 672, gy = 380;
    accentLine(g, gx, gy, gw, SKIN.muted);
    if (k <= 0) return;
    g.save();
    const hot = fever ? 0.5 + 0.5 * Math.sin(this.feverT * 12) : this.gaugePulse;
    g.fillStyle = mix(col, "#ffffff", hot * 0.5);
    g.shadowColor = col;
    g.shadowBlur = fever ? 18 : 8 + 12 * this.gaugePulse;
    g.fillRect(gx, gy - 3, gw * k, 6);
    // 끝의 밝은 점: 얼마나 찼는지 한눈에
    g.fillStyle = "#ffffff";
    g.fillRect(gx + gw * k - 3, gy - 6, 4, 12);
    g.restore();
  }

  private drawSlots(g: CanvasRenderingContext2D): void {
    [this.hold, this.now, ...this.nexts].forEach((s, i) => {
      g.save();
      // 오른쪽 칸들은 하나씩 옆에서 미끄러져 들어온다
      const k = introEase(this.intro, 0.1 + i * 0.05);
      g.globalAlpha = s.alpha * k;
      g.translate(60 * (1 - k), 0);
      panel(g, s.x, s.y, s.w, s.h, s.highlight ? "#b94ca8" : SKIN.panelBorder, 16);
      let top = 0;
      if (s.title) {
        text(g, t(s.title as "HOLD" | "NOW"), s.x + s.w / 2, s.y + 34, 27, s.highlight ? SKIN.score : SKIN.text, "center");
        top = 42;
      }
      if (s.hint && s.cells.length === 0) {
        // 빈 홀드 칸: 글자 대신 점선 빈 자리 하나
        g.save();
        g.strokeStyle = "rgba(197,195,214,0.45)"; g.lineWidth = 3; g.setLineDash([8, 7]);
        roundRect(g, s.x + s.w / 2 - 26, s.y + top + (s.h - top) / 2 - 30, 52, 52, 8);
        g.stroke();
        g.restore();
      }
      g.beginPath();
      g.rect(s.x, s.y, s.w, s.h);
      g.clip();
      this.drawPiece(g, s, top);
      if (s.cooldown > 0) {
        // 남은 대기 시간 막대(작은 홀드 칸은 모양을 가리지 않게 맨 아래 가장자리에 얇게)
        const w = (s.w - 40) * s.cooldown, small = s.h < 130;
        g.fillStyle = "rgba(255,255,255,0.6)";
        g.fillRect(s.x + (s.w - w) / 2, s.y + s.h - (small ? 9 : 18), w, small ? 4 : 6);
      }
      g.restore();
    });
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
      g.translate(0, PLAY_OY);
      g.globalAlpha = Math.max(0, Math.min(1, f.alpha));
      fitText(g, f.lines[0].text, 48, 352, 32, 300, f.lines[0].color);
      fitText(g, f.lines[1].text, 672, 352, 32, 300, f.lines[1].color, "right");
      if (f.lines[2]) fitText(g, f.lines[2].text, 414, 349, 24, 210, SKIN.muted, "center");
      g.restore();
      return;
    }
    // Time bonuses temporarily replace the target, keeping the HUD gutter clear.
    if (f.placement === "time") {
      g.save(); g.translate(0, PLAY_OY); g.globalAlpha = Math.max(0, Math.min(1, f.alpha));
      text(g, f.lines[0].text, 360, 212, 32, f.lines[0].color, "center", f.lines[0].color);
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

  private drawCountdownBackdrop(g: CanvasRenderingContext2D): void {
    // The board remains visible while the numeral gets a quiet focal area.
    g.save();
    g.translate(0, PLAY_OY);
    const shade = g.createRadialGradient(360, 720, 50, 360, 720, 440);
    shade.addColorStop(0, "rgba(9,7,21,0.88)");
    shade.addColorStop(0.65, "rgba(9,7,21,0.7)");
    shade.addColorStop(1, "rgba(9,7,21,0.22)");
    g.fillStyle = shade; g.fillRect(16, 392, 688, 640);
    if (this.pauseLock > 0) {
      text(g, t("RESUME_READY"), 360, 536, 34, SKIN.accent, "center");
      accentLine(g, 280, 568, 160);
    }
    g.restore();
  }

  private drawPauseButton(g: CanvasRenderingContext2D): void {
    const b = PAUSE_BTN;
    const locked = this.state === "countdown" || this.pauseLock > 0;
    g.save();
    g.beginPath();
    g.arc(b.x + b.w / 2, b.y + b.h / 2, 32, 0, Math.PI * 2);
    g.fillStyle = "rgba(9,7,21,0.6)";
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = alpha(SKIN.text, 0.35);
    g.stroke();
    if (locked) {
      // A lock silhouette plus the progress ring explains why pause is unavailable.
      g.strokeStyle = SKIN.timeText; g.lineWidth = 4;
      g.beginPath(); g.arc(b.x + 42, b.y + 34, 10, Math.PI, Math.PI * 2); g.stroke();
      roundRect(g, b.x + 27, b.y + 34, 30, 24, 5);
      g.fillStyle = SKIN.timeText; g.fill();
      g.fillStyle = SKIN.panel; g.fillRect(b.x + 40, b.y + 42, 4, 8);
    } else {
      g.fillStyle = SKIN.text;
      g.fillRect(b.x + 32, b.y + 30, 7, 24);
      g.fillRect(b.x + 45, b.y + 30, 7, 24);
    }
    g.restore();
    // 다시 멈출 수 있을 때까지 남은 시간: 버튼 둘레를 따라 차오르는 빛
    if (locked) {
      const k = this.state === "play" ? 1 - this.pauseLock / PAUSE_LOCK : 0;
      g.save();
      g.strokeStyle = alpha(SKIN.accent, 0.18); g.lineWidth = 4;
      g.beginPath(); g.arc(b.x + b.w / 2, b.y + b.h / 2, 38, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = SKIN.accent;
      g.lineWidth = 4;
      g.lineCap = "round";
      g.shadowColor = SKIN.accent;
      g.shadowBlur = 10;
      g.beginPath();
      g.arc(b.x + b.w / 2, b.y + b.h / 2, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      g.stroke();
      if (this.state === "play") text(g, t("PAUSE_LOCK_FMT", Math.ceil(this.pauseLock)), b.x - 6, b.y + b.h / 2 + 9, 26, SKIN.timeText, "right");
      g.restore();
    }
  }
}

const MISS_TIME = 0.7;

/** 안 찍힘 표시(금지 표시): 누른 칸 위쪽에 톡 튀어나와 살짝 떠오르다 사라진다(예전 글자처럼). */
function drawMiss(g: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const k = t / MISS_TIME;
  const pop = t < 0.08 ? 0.6 + 0.6 * (t / 0.08) : t < 0.16 ? 1.2 - 0.2 * ((t - 0.08) / 0.08) : 1;
  const a = t < MISS_TIME - 0.25 ? 1 : (MISS_TIME - t) / 0.25;
  // 금지 표시: 진한 빨간 네온 원 + 사선(왼쪽 위 → 오른쪽 아래), 밝은 심
  const r = 22 * pop, d = r * Math.SQRT1_2;
  g.save();
  g.translate(x, y - 58 - 30 * (1 - (1 - k) ** 2));
  g.globalAlpha = Math.max(0, a);
  g.lineCap = "round";
  const path = () => {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.moveTo(-d, -d);
    g.lineTo(d, d);
  };
  path();
  g.lineWidth = 12;
  g.strokeStyle = "rgba(20,0,8,0.55)";
  g.stroke();
  g.shadowColor = "#ff2a4d";
  g.shadowBlur = 18;
  g.strokeStyle = "#ff2a4d";
  g.lineWidth = 8;
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = "#ffc2cc";
  g.lineWidth = 2.5;
  g.stroke();
  g.restore();
}
