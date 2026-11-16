// 핵심 로직 테스트. 실행: npm test  (node --test tests/)
import assert from "node:assert/strict";
import { test } from "node:test";
import { BOMB_MIN, BoardModel, CHAIN_MIN, EMPTY } from "../src/core/board-model.ts";
import { allMoves, bestMove, planMoves } from "../src/core/bot.ts";
import { FEVER_MULT, FEVER_NEED, FEVER_TIME, GameRules, basePoints } from "../src/core/game-rules.ts";
import { ShapeQueue } from "../src/core/shape-queue.ts";
import { getShape, SHAPES } from "../src/core/shapes.ts";

function modelFrom(rows: string[]): BoardModel {
  const m = new BoardModel(rows[0].length, rows.length, 5, 1);
  rows.forEach((r, y) => [...r].forEach((ch, x) => m.set(x, y, Number(ch))));
  return m;
}

test("connected same-color blocks break together", () => {
  const m = modelFrom(["0011", "0211", "2222", "3332"]);
  // 한 칸(0,0)만 찍어도 연결된 0 세 개가 부서진다.
  let info = m.computeBreak(0, 0, [{ x: 0, y: 0 }]);
  assert.equal(info.stamp.length, 1);
  assert.equal(info.all.length, 3);
  // 0 영역과 1 영역 경계를 가로로 찍으면 두 덩어리 모두 부서진다.
  info = m.computeBreak(1, 0, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  assert.equal(info.all.length, 7);
  // 대각선이 아니라 상하좌우로만 연결된다.
  info = m.computeBreak(1, 1, [{ x: 0, y: 0 }]);
  assert.equal(info.all.length, 6);
});

test("stamp cells outside the board are ignored", () => {
  const m = modelFrom(["01", "10"]);
  const info = m.computeBreak(1, 1, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
  assert.equal(info.stamp.length, 1);
});

test("gravity and refill keep the board full", () => {
  const m = modelFrom(["01", "23", "44"]);
  const res = m.applyBreak(m.computeBreak(0, 1, [{ x: 0, y: 0 }]).all);
  assert.ok(m.isFull());
  assert.equal(m.get(0, 1), 0, "0 fell from row 0 to row 1");
  assert.equal(m.get(0, 2), 4, "bottom untouched");
  assert.equal(res.moves.length, 1);
  assert.equal(res.spawns.length, 1);
  assert.equal(res.spawns[0].fromY, -1);
});

test("every shape has odd size and contains its center", () => {
  SHAPES.forEach((_, i) => {
    const s = getShape(i);
    assert.ok(s.cells.some((p) => p.x === 0 && p.y === 0), `${s.id} has center`);
    const xs = s.cells.map((p) => p.x), ys = s.cells.map((p) => p.y);
    assert.equal(Math.min(...xs) + Math.max(...xs), 0, `${s.id} centered x`);
    assert.equal(Math.min(...ys) + Math.max(...ys), 0, `${s.id} centered y`);
  });
});

test("bag gives every shape once per cycle", () => {
  const q = new ShapeQueue(42);
  const seen = new Set(SHAPES.map(() => q.pop().id));
  assert.equal(seen.size, SHAPES.length);
});

test("long bot run keeps a valid full board", () => {
  const m = new BoardModel(8, 9, 5, 99);
  m.fillInitial();
  const q = new ShapeQueue(7);
  for (let i = 0; i < 200; i++) {
    const cells = q.pop().cells;
    const mv = bestMove(m, cells);
    m.applyBreak(m.computeBreak(mv.x, mv.y, cells).all, q.peek(1)[0].cells);
    assert.ok(m.isFull(), `full at step ${i}`);
  }
  assert.ok([...m.cells].every((c) => c >= 0 && c < 5));
});

test("fast best move matches brute-force BFS", () => {
  const m = new BoardModel(8, 9, 5, 31);
  const q = new ShapeQueue(31);
  for (let t = 0; t < 40; t++) {
    m.fillInitial();
    const cells = q.pop().cells;
    assert.equal(bestMove(m, cells).count, allMoves(m, cells)[0].count, `trial ${t}`);
  }
});

test("chain multiplier, fever gauge, time target", () => {
  const r = new GameRules();
  const res = r.registerStamp([10, 6, 5], 0);
  assert.deepEqual(res.stepPoints, [basePoints(10), basePoints(6) * 2, basePoints(5) * 3]);
  assert.equal(res.chains, 2);
  assert.equal(r.maxChain, 2);
  assert.equal(r.biggest, 10);
  assert.equal(r.feverGauge, 2);
  // 게이지가 차면 피버: 점수 ×2, FEVER_TIME 뒤 끝난다
  const f = r.registerStamp(Array(FEVER_NEED).fill(5), 0);
  assert.ok(f.feverStarted && r.inFever);
  assert.equal(r.registerStamp([10], 0).points, basePoints(10) * FEVER_MULT);
  assert.ok(r.tick(FEVER_TIME + 0.01), "fever times out");
  assert.ok(!r.inFever);
  const t0 = r.timeTarget();
  r.tick(10);
  assert.ok(r.timeTarget() > t0, "time target rises");
  r.reset();
  assert.equal(r.registerStamp([3], 0).timeDelta, 0, "small stamp gives no time");
  assert.ok(r.registerStamp([30], 0).timeDelta >= 1, "big stamp over target gives time");
});

test("falling blocks that link up chain-break; fresh blocks do not start chains", () => {
  // 0열: 1이 네 칸(1~4행), 맨 아래는 0. 0을 찍으면 1 네 칸이 한 칸 내려와 (1,5)의 1과 이어진다(5칸 → 연쇄).
  const m = modelFrom([
    "2342",
    "1234",
    "1342",
    "1423",
    "1234",
    "0132",
  ]);
  const res = m.resolve(0, 5, [{ x: 0, y: 0 }])!;
  assert.ok(res.steps.length >= 2, "a chain happened");
  assert.equal(res.steps[1].chain, 1);
  assert.ok(res.steps[1].broken.length >= CHAIN_MIN);
  assert.ok(res.steps[1].broken.every((b) => b.color === 1));
  assert.ok(m.isFull());
  // 보드 복사본으로 미리 계산한 결과와 실제 결과가 같다
  const a = new BoardModel(8, 9, 5, 5);
  a.fillInitial();
  const b = a.clone();
  const cells = [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
  for (let i = 0; i < 30; i++) {
    const plan = planMoves(a, cells, cells)[0];
    const ra = a.resolve(plan.x, plan.y, cells, cells)!;
    const rb = b.resolve(plan.x, plan.y, cells, cells)!;
    assert.deepEqual(ra.steps.map((s) => s.broken.length), plan.counts);
    assert.deepEqual(rb, ra);
    assert.deepEqual([...b.cells], [...a.cells]);
  }
});

test("fresh blocks never start a chain on their own", () => {
  const m = new BoardModel(8, 9, 5, 3);
  m.fillInitial();
  const q = new ShapeQueue(3);
  for (let i = 0; i < 60; i++) {
    const cells = q.pop().cells;
    const mv = planMoves(m, cells, q.peek(1)[0].cells)[i % 5];
    const res = m.resolve(mv.x, mv.y, cells, q.peek(1)[0].cells)!;
    for (const s of res.steps.slice(1)) {
      // 연쇄 덩어리마다 시작 칸(떨어진 블록)이 있다
      assert.ok(s.seeds.length > 0);
    }
    assert.ok(m.isFull());
  }
});

test("bombs blast 3x3 and are made by big stamps", () => {
  const m = modelFrom(["0123", "1230", "2301", "3012"]);
  m.bombs[1 * 4 + 1] = 1; // (1,1)
  const info = m.expandBombs([{ x: 1, y: 1 }]);
  assert.equal(info.cells.length, 9);
  assert.deepEqual(info.bombs, [{ x: 1, y: 1 }]);
  // 이웃 폭탄도 이어서 터진다
  m.bombs[2 * 4 + 2] = 1;
  assert.equal(m.expandBombs([{ x: 1, y: 1 }]).cells.length, 14);
  // 한 번에 BOMB_MIN칸 이상 → 찍은 자리에 폭탄
  const big = new BoardModel(8, 9, 5, 1);
  big.cells.fill(2);
  const res = big.resolve(3, 3, [{ x: 0, y: 0 }])!;
  assert.ok(res.steps[0].broken.length >= BOMB_MIN);
  assert.deepEqual(res.bomb, { x: 3, y: 3 });
  assert.ok(big.isBomb(3, 3));
  assert.ok([...big.cells].every((c) => c !== EMPTY));
});

function bestSpread(steer: boolean): number {
  const m = new BoardModel(8, 9, 5, 77);
  m.fillInitial();
  const q = new ShapeQueue(77);
  let cur = q.pop().cells;
  const vals: number[] = [];
  for (let i = 0; i < 150; i++) {
    const mv = bestMove(m, cur);
    vals.push(mv.count);
    const nxt = q.pop().cells;
    m.applyBreak(m.computeBreak(mv.x, mv.y, cur).all, steer ? nxt : []);
    cur = nxt;
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
}

test("refill steering narrows the best-break spread", () => {
  const off = bestSpread(false), on = bestSpread(true);
  assert.ok(on < off * 0.6, `spread ${off.toFixed(2)} -> ${on.toFixed(2)}`);
});
