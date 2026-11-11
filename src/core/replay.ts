import { BoardModel } from "./board-model.ts";
import { bestMove } from "./bot.ts";
import { GAME_TIME, GameRules, STAMP_COOLDOWN } from "./game-rules.ts";
import { ShapeQueue } from "./shape-queue.ts";
import type { Shape } from "./shapes.ts";

/**
 * 판 다시 돌리기(리플레이) 검증. 랭킹 점수 조작 방지 2단계.
 *
 * 게임은 서버가 준 시드로 보드와 모양 순서를 만들고, 찍기·홀드를 "게임 시간"과 함께 기록한다.
 * 서버는 같은 시드와 기록으로 이 파일의 simulateRun을 돌려 점수를 직접 계산한다.
 * → 브라우저가 보낸 점수는 쓰지 않는다. 기록이 규칙에 어긋나면(쿨다운 무시, 시간 끝난 뒤 찍기 등) 거절한다.
 *
 * 이 파일과 같은 폴더의 규칙 코드는 서버(supabase/functions/_shared/core)에 그대로 복사해 쓴다.
 * 규칙을 바꾸면 REPLAY_VERSION을 올리고 서버 함수도 다시 배포해야 한다(README 참고).
 */
export const REPLAY_VERSION = 1;

export const BOARD_COLS = 8;
export const BOARD_ROWS = 9;
export const BOARD_COLORS = 5;

/** 튜토리얼에서 찍는 횟수(1~3단계) */
const TUTORIAL_STAMPS = 3;
/** 한 판 기록의 최대 길이. 쿨다운 0.35초로 1시간을 찍어도 1만 번을 넘지 않는다. */
const MAX_EVENTS = 10000;
const MAX_TIME = 3600;
/** 게임은 짧은 시간 조각을 여러 번 더하고, 서버는 한 번에 더한다. 그 사이의 아주 작은 소수점 오차 허용치. */
const EPS = 1e-6;

/** ["s", 게임 시간, x, y] = 찍기, ["h", 게임 시간] = 홀드. 튜토리얼 중 기록의 시간은 0이다. */
export type ReplayEvent = ["s", number, number, number] | ["h", number];

export interface Replay {
  v: number;
  /** 튜토리얼을 거쳤으면 그 동안의 기록(보드가 이어지므로 필요하다), 아니면 null */
  tutorial: ReplayEvent[] | null;
  events: ReplayEvent[];
}

export type SimResult =
  | { ok: true; score: number; maxCombo: number; biggest: number; duration: number }
  | { ok: false; reason: string };

export function boardSeed(seed: number): number {
  return seed >>> 0 || 1;
}

export function queueSeed(seed: number): number {
  return Math.imul((seed ^ 0x5bd1e995) >>> 0, 0x9e3779b1) >>> 0 || 1;
}

export function newBoard(seed: number): BoardModel {
  const m = new BoardModel(BOARD_COLS, BOARD_ROWS, BOARD_COLORS, boardSeed(seed));
  m.fillInitial();
  return m;
}

export function newQueue(seed: number): ShapeQueue {
  return new ShapeQueue(queueSeed(seed));
}

/** 서버 표가 없을 때(손님·연결 실패) 쓰는 시드. 0은 "무작위"라는 뜻이라 피한다. */
export function localSeed(): number {
  return (Math.floor(Math.random() * 0x7ffffffe) + 1) | 0;
}

/** 받은 기록의 모양 검사. 잘못된 값이 섞이면 이유 문자열을 돌려준다. */
function parseEvents(raw: unknown, inTutorial: boolean): ReplayEvent[] | string {
  if (!Array.isArray(raw) || raw.length > MAX_EVENTS) return "format";
  const out: ReplayEvent[] = [];
  for (const e of raw) {
    if (!Array.isArray(e)) return "format";
    const t = e[1];
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > MAX_TIME) return "format";
    if (inTutorial && t !== 0) return "format";
    if (e[0] === "h" && e.length === 2) out.push(["h", t]);
    else if (e[0] === "s" && e.length === 4) {
      const [, , x, y] = e;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= BOARD_COLS || y >= BOARD_ROWS) return "format";
      out.push(["s", t, x, y]);
    } else return "format";
  }
  return out;
}

/** 시드와 기록으로 한 판을 처음부터 다시 돌려 점수를 계산한다. 게임 화면 코드와 같은 규칙 코드를 쓴다. */
export function simulateRun(seed: number, replay: unknown): SimResult {
  const fail = (reason: string): SimResult => ({ ok: false, reason });
  if (typeof replay !== "object" || replay === null) return fail("format");
  const r = replay as Record<string, unknown>;
  if (r.v !== REPLAY_VERSION) return fail("version");
  const tutorial = r.tutorial === null ? null : parseEvents(r.tutorial, true);
  const events = parseEvents(r.events, false);
  if (typeof tutorial === "string") return fail(tutorial);
  if (typeof events === "string") return fail(events);

  const board = newBoard(seed);
  const queue = newQueue(seed);
  let current: Shape = queue.pop();
  let held: Shape | null = null;
  let holdUsed = false;

  /** 게임의 doHold와 같다 */
  const hold = (): boolean => {
    if (holdUsed) return false;
    if (!held) {
      held = current;
      current = queue.pop();
    } else {
      [held, current] = [current, held];
    }
    holdUsed = true;
    return true;
  };
  /** 게임의 tryPlace → BoardView.placeAt과 같다. 판정 기준(bestN)은 찍기 직전 보드에서 계산한다. */
  const stamp = (x: number, y: number): { n: number; bestN: number } | null => {
    const info = board.computeBreak(x, y, current.cells);
    if (info.stamp.length === 0) return null;
    const bestN = bestMove(board, current.cells).count;
    board.applyBreak(info.all, queue.peek(1)[0].cells);
    current = queue.pop();
    holdUsed = false;
    return { n: info.all.length, bestN };
  };

  // 튜토리얼: 점수·시간은 버리지만 보드와 모양 순서는 본 게임으로 이어진다. 최고 자리만 찍을 수 있다.
  if (tutorial) {
    let stamps = 0;
    for (const e of tutorial) {
      if (e[0] === "h") {
        if (!hold()) return fail("hold");
        continue;
      }
      if (++stamps > TUTORIAL_STAMPS) return fail("tutorial");
      const res = stamp(e[2], e[3]);
      if (!res || res.n < res.bestN) return fail("tutorial");
    }
    held = null;
    holdUsed = false;
  }

  const rules = new GameRules();
  rules.timeLeft = GAME_TIME;
  let lastStamp = -Infinity;
  for (const e of events) {
    const t = e[1];
    if (t < rules.elapsed - EPS) return fail("order");
    if (t > rules.elapsed) rules.tick(t - rules.elapsed);
    // 게임은 남은 시간이 0이 되는 순간 끝나므로 그 뒤의 입력은 있을 수 없다
    if (rules.timeLeft <= -EPS) return fail("late");
    if (e[0] === "h") {
      if (!hold()) return fail("hold");
      continue;
    }
    if (t - lastStamp < STAMP_COOLDOWN - EPS) return fail("cooldown");
    lastStamp = t;
    const res = stamp(e[2], e[3]);
    if (!res) return fail("empty");
    rules.registerBreak(res.n, res.bestN);
  }
  return {
    ok: true,
    score: rules.score,
    maxCombo: rules.maxCombo,
    biggest: rules.biggest,
    duration: rules.elapsed + Math.max(0, rules.timeLeft),
  };
}
