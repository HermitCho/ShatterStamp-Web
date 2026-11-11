// 리플레이 검증 테스트: 게임처럼 프레임 단위로 시간을 흘리며 한 판을 두고, 서버 계산(simulateRun)이 같은 점수를 내는지 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bestMove } from "../src/core/bot.ts";
import { GAME_TIME, GameRules, STAMP_COOLDOWN } from "../src/core/game-rules.ts";
import { newBoard, newQueue, REPLAY_VERSION, simulateRun, type Replay, type ReplayEvent } from "../src/core/replay.ts";
import { Rng } from "../src/core/rng.ts";
import type { Shape } from "../src/core/shapes.ts";

/** game.ts의 흐름(update의 tick → 입력 처리, 쿨다운, 홀드, 튜토리얼)을 그대로 흉내 낸 한 판 */
function playLikeClient(seed: number, opts: { tutorial?: boolean; botSeed?: number; sloppy?: number } = {}) {
  const rnd = new Rng(opts.botSeed ?? 7);
  const board = newBoard(seed);
  const queue = newQueue(seed);
  const rules = new GameRules();
  rules.timeLeft = GAME_TIME;
  let current: Shape = queue.pop();
  let held: Shape | null = null;
  let holdUsed = false;
  let stampLock = 0;
  const events: ReplayEvent[] = [];
  let tutorial: ReplayEvent[] | null = null;

  const hold = (log: ReplayEvent[], t: number) => {
    if (holdUsed) return;
    if (!held) {
      held = current;
      current = queue.pop();
    } else [held, current] = [current, held];
    holdUsed = true;
    log.push(["h", t]);
  };
  const place = (x: number, y: number) => {
    const bestN = bestMove(board, current.cells).count;
    const info = board.computeBreak(x, y, current.cells);
    if (info.stamp.length === 0) return null;
    board.applyBreak(info.all, queue.peek(1)[0].cells);
    current = queue.pop();
    holdUsed = false;
    return { n: info.all.length, bestN };
  };

  if (opts.tutorial) {
    tutorial = [];
    for (let i = 0; i < 3; i++) {
      const mv = bestMove(board, current.cells);
      place(mv.x, mv.y);
      tutorial.push(["s", 0, mv.x, mv.y]);
    }
    hold(tutorial, 0);
    held = null;
    holdUsed = false;
  }

  let think = 0.5;
  while (true) {
    // 프레임: 60Hz 근처로 흔들리고, 가끔 히트스톱(0.05배)이 걸린다
    const real = 1 / 60 + (rnd.next() - 0.5) * 0.006;
    const dt = rnd.next() < 0.08 ? real * 0.05 : real;
    rules.tick(dt);
    if (stampLock > 0) stampLock = Math.max(0, stampLock - dt);
    if (rules.isOver()) break;
    think -= dt;
    if (think > 0) continue;
    think = rnd.range(0.05, 0.7);
    if (rnd.next() < 0.1) {
      hold(events, rules.elapsed);
      continue;
    }
    if (stampLock > 0) continue;
    const mv = rnd.next() < (opts.sloppy ?? 0.3)
      ? { x: rnd.int(0, board.cols - 1), y: rnd.int(0, board.rows - 1) }
      : bestMove(board, current.cells);
    const r = place(mv.x, mv.y);
    if (!r) continue;
    events.push(["s", rules.elapsed, mv.x, mv.y]);
    rules.registerBreak(r.n, r.bestN);
    stampLock = STAMP_COOLDOWN;
  }
  const replay: Replay = { v: REPLAY_VERSION, tutorial, events };
  return { replay, score: rules.score, maxCombo: rules.maxCombo, biggest: rules.biggest, elapsed: rules.elapsed };
}

/** JSON으로 보내고 받은 것처럼 만든다 */
const wire = (r: Replay): Replay => JSON.parse(JSON.stringify(r));

test("server replay reproduces the client's score exactly", () => {
  for (let i = 0; i < 40; i++) {
    const seed = 1000 + i * 7919;
    const game = playLikeClient(seed, { tutorial: i % 3 === 0, botSeed: i + 1, sloppy: (i % 5) / 5 });
    const sim = simulateRun(seed, wire(game.replay));
    assert.ok(sim.ok, `game ${i}: ${!sim.ok && sim.reason}`);
    if (!sim.ok) continue;
    assert.equal(sim.score, game.score, `game ${i} score`);
    assert.equal(sim.maxCombo, game.maxCombo, `game ${i} combo`);
    assert.equal(sim.biggest, game.biggest, `game ${i} biggest`);
    assert.ok(Math.abs(sim.duration - game.elapsed) < 0.05, `game ${i} duration ${sim.duration} vs ${game.elapsed}`);
  }
});

test("a different seed gives a different result (seed binds the board)", () => {
  const game = playLikeClient(4242, { botSeed: 3 });
  const sim = simulateRun(4243, wire(game.replay));
  assert.ok(!sim.ok || sim.score !== game.score);
});

test("tampered replays are rejected", () => {
  const seed = 777;
  const game = playLikeClient(seed, { botSeed: 9 });
  const stamps = () => game.replay.events.filter((e) => e[0] === "s") as ["s", number, number, number][];
  const bad = (mutate: (r: Replay) => void, reason: string) => {
    const r = wire(game.replay);
    mutate(r);
    const sim = simulateRun(seed, r);
    assert.equal(sim.ok ? "ok" : sim.reason, reason);
  };
  // 쿨다운(0.35초)보다 빨리 찍기: 두 번째 찍기를 첫 번째 바로 뒤로 당긴다
  const s = stamps();
  bad((r) => {
    const i = r.events.findIndex((e) => e[0] === "s" && e[1] === s[1][1]);
    r.events[i][1] = s[0][1] + 0.1;
  }, "cooldown");
  // 시간이 끝난 뒤에 더 찍기
  bad((r) => r.events.push(["s", game.elapsed + 5, 0, 0]), "late");
  // 시간 거꾸로
  bad((r) => r.events.splice(1, 0, ["h", 0.0001 + r.events[0][1] - 0.5]), "order");
  // 보드 밖, 이상한 값
  bad((r) => r.events.push(["s", game.elapsed - 0.01, 99, 0]), "format");
  bad((r) => r.events.push(["s", Number.NaN, 0, 0] as unknown as ReplayEvent), "format");
  bad((r) => ((r as unknown as { events: unknown }).events = "hack"), "format");
  // 다른 규칙 버전
  bad((r) => (r.v = REPLAY_VERSION + 1), "version");
  // 튜토리얼 핑계로 시간 없이 아무 데나 찍기
  bad((r) => (r.tutorial = [["s", 0, 0, 0], ["s", 0, 1, 1], ["s", 0, 2, 2], ["s", 0, 3, 3]]), "tutorial");
  // 한 판에 홀드 두 번 연속
  bad((r) => r.events.splice(0, 0, ["h", 0], ["h", 0]), "hold");
});

test("score comes from the board, not from the client's claim", () => {
  // 같은 기록이면 몇 번을 돌려도 같은 점수이고, 기록 없는 판은 0점이다.
  const empty = simulateRun(5, { v: REPLAY_VERSION, tutorial: null, events: [] });
  assert.deepEqual(empty, { ok: true, score: 0, maxCombo: 0, biggest: 0, duration: GAME_TIME });
});
