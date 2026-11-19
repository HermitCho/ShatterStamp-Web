// 리플레이 검증 테스트: 게임처럼 프레임 단위로 시간을 흘리며 한 판을 두고, 서버 계산(simulateRun)이 같은 점수를 내는지 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { planMoves } from "../src/core/bot.ts";
import { FAIL_LOCK, GAME_TIME, GameRules, HOLD_COOLDOWN, MIN_BREAK, STAMP_COOLDOWN } from "../src/core/game-rules.ts";
import { newBoard, newQueue, REPLAY_VERSION, simulateRun, type Replay, type ReplayEvent } from "../src/core/replay.ts";
import { Rng } from "../src/core/rng.ts";
import { FEVER_SHAPE, type Shape } from "../src/core/shapes.ts";

/** game.ts의 흐름(update의 tick → 입력 처리, 쿨다운, 홀드, 튜토리얼)을 그대로 흉내 낸 한 판 */
function playLikeClient(seed: number, opts: { tutorial?: boolean; botSeed?: number; sloppy?: number } = {}) {
  const rnd = new Rng(opts.botSeed ?? 7);
  const board = newBoard(seed);
  const queue = newQueue(seed);
  const rules = new GameRules();
  rules.timeLeft = GAME_TIME;
  let current: Shape = queue.pop();
  let held: Shape | null = null;
  let holdLock = 0;
  let stampLock = 0;
  const events: ReplayEvent[] = [];
  let tutorial: ReplayEvent[] | null = null;

  const hold = (log: ReplayEvent[], t: number) => {
    if (holdLock > 0 || rules.inFever) return;
    if (!held) {
      held = current;
      current = queue.pop();
    } else [held, current] = [current, held];
    holdLock = HOLD_COOLDOWN;
    log.push(["h", t]);
  };
  const best = () => (rules.inFever ? planMoves(board, FEVER_SHAPE.cells, FEVER_SHAPE.cells) : planMoves(board, current.cells, queue.peek(1)[0].cells))[0];
  const place = (x: number, y: number, tut = false) => {
    if (!tut && rules.inFever) {
      // 피버: 3×3, 어디든, 모양 순서는 그대로
      const res = board.resolve(x, y, FEVER_SHAPE.cells, FEVER_SHAPE.cells, false)!;
      return { counts: res.steps.map((s) => s.broken.length), colors: res.colors, crystals: 0 };
    }
    if (!tut && board.stampCount(x, y, current.cells) < MIN_BREAK) return "small" as const;
    const res = board.resolve(x, y, current.cells, queue.peek(1)[0].cells);
    if (!res) return null;
    current = queue.pop();
    return { counts: res.steps.map((s) => s.broken.length), colors: res.colors, crystals: res.steps.reduce((a, s) => a + s.crystals.length, 0) };
  };

  if (opts.tutorial) {
    tutorial = [];
    for (let i = 0; i < 3; i++) {
      const mv = best();
      place(mv.x, mv.y, true);
      tutorial.push(["s", 0, mv.x, mv.y]);
    }
    hold(tutorial, 0);
    held = null;
    holdLock = 0;
  }

  let think = 0.5, autos = 0;
  while (true) {
    // 프레임: 60Hz 근처로 흔들리고, 가끔 히트스톱(0.05배)이 걸린다
    const real = 1 / 60 + (rnd.next() - 0.5) * 0.006;
    const dt = rnd.next() < 0.08 ? real * 0.05 : real;
    rules.tick(dt);
    if (stampLock > 0) stampLock = Math.max(0, stampLock - dt);
    if (holdLock > 0) holdLock = Math.max(0, holdLock - dt);
    if (rules.isOver()) break;
    // 막힌 판(지금 모양으로 MIN_BREAK칸 자리가 없음): 게임처럼 자동 부수기
    if (!rules.inFever && stampLock <= 0 && !board.hasBreak(current.cells, MIN_BREAK)) {
      const res = board.autoBreak(queue.peek(1)[0].cells)!;
      events.push(["a", rules.elapsed]);
      rules.registerStamp(res.steps.map((s) => s.broken.length), res.colors, res.steps.reduce((a, s) => a + s.crystals.length, 0));
      stampLock = STAMP_COOLDOWN;
      autos++;
      continue;
    }
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
      : best();
    const r = place(mv.x, mv.y);
    if (r === "small") {
      // 너무 작아 안 찍힘: 기록하지 않고 잠깐 막힌다
      stampLock = FAIL_LOCK;
      continue;
    }
    if (!r) continue;
    events.push(["s", rules.elapsed, mv.x, mv.y]);
    rules.registerStamp(r.counts, r.colors, r.crystals);
    // 게임은 연쇄 연출이 끝날 때까지 더 오래 막는다(서버는 최소 쿨다운만 본다)
    stampLock = STAMP_COOLDOWN + (rnd.next() < 0.5 ? 0 : 0.4 * (r.counts.length - 1));
  }
  const replay: Replay = { v: REPLAY_VERSION, tutorial, events };
  return { replay, score: rules.score, maxCombo: rules.maxChain, biggest: rules.biggest, elapsed: rules.elapsed, fevers: rules.feverCount, autos };
}

/** JSON으로 보내고 받은 것처럼 만든다 */
const wire = (r: Replay): Replay => JSON.parse(JSON.stringify(r));

test("server replay reproduces the client's score exactly", () => {
  let fevers = 0, autos = 0;
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
    fevers += game.fevers;
    autos += game.autos;
  }
  assert.ok(fevers > 0, "some games reach fever (3x3 stamps are checked too)");
  assert.ok(autos > 0, "some games hit a dead board (auto breaks are checked too)");
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
    const i0 = r.events.findIndex((e) => e[0] === "s" && e[1] === s[0][1]);
    const i = r.events.findIndex((e) => e[0] === "s" && e[1] === s[1][1]);
    for (let k = i0 + 1; k <= i; k++) r.events[k][1] = s[0][1] + 0.1; // 사이의 홀드도 함께 당긴다
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

test("stamps that break fewer than MIN_BREAK blocks are rejected by the server", () => {
  const seed = 4242;
  const board = newBoard(seed);
  const cells = newQueue(seed).pop().cells;
  let spot: [number, number] | null = null;
  for (let y = 0; y < board.rows && !spot; y++)
    for (let x = 0; x < board.cols && !spot; x++) if (board.stampCount(x, y, cells) < MIN_BREAK) spot = [x, y];
  assert.ok(spot, "a small spot exists");
  const res = simulateRun(seed, { v: REPLAY_VERSION, tutorial: null, events: [["s", 1, spot[0], spot[1]]] });
  assert.equal(res.ok, false);
});

test("holds can repeat, but only HOLD_COOLDOWN seconds apart", () => {
  const ok = simulateRun(99, { v: REPLAY_VERSION, tutorial: null, events: [["h", 1], ["h", 1 + HOLD_COOLDOWN], ["h", 1 + 2 * HOLD_COOLDOWN]] });
  assert.ok(ok.ok, !ok.ok ? ok.reason : "");
  const fast = simulateRun(99, { v: REPLAY_VERSION, tutorial: null, events: [["h", 1], ["h", 1.3]] });
  assert.ok(!fast.ok && fast.reason === "hold");
});

test("the server rejects an auto break when the board still has a 9+ spot", () => {
  const seed = 31337;
  const board = newBoard(seed);
  const queue = newQueue(seed);
  assert.ok(board.hasBreak(queue.pop().cells, MIN_BREAK), "a fresh board has a stampable spot");
  const sim = simulateRun(seed, wire({ v: REPLAY_VERSION, tutorial: null, events: [["a", 1]] }));
  assert.ok(!sim.ok && sim.reason === "auto");
});
