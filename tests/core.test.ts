// 핵심 로직 테스트. 실행: npm test  (node --test tests/)
import assert from "node:assert/strict";
import { test } from "node:test";
import { BoardModel } from "../src/core/board-model.ts";
import { allMoves, bestMove } from "../src/core/bot.ts";
import { COMBO_WINDOW, GameRules, Grade, gradeFor, MISS_PENALTY } from "../src/core/game-rules.ts";
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

test("grades, combo, miss penalty, time target", () => {
  assert.equal(gradeFor(10, 10), Grade.PERFECT);
  assert.equal(gradeFor(8, 10), Grade.GREAT);
  assert.equal(gradeFor(6, 10), Grade.GOOD);
  assert.equal(gradeFor(5, 10), Grade.MISS);
  const r = new GameRules();
  r.registerBreak(10, 10);
  r.tick(0.5);
  r.registerBreak(9, 10);
  assert.equal(r.combo, 2, "combo continues on good stamps");
  const before = r.timeLeft;
  const res = r.registerBreak(2, 10);
  assert.equal(r.combo, 0);
  assert.ok(res.comboLost);
  assert.equal(r.timeLeft, before - MISS_PENALTY);
  r.registerBreak(10, 10);
  assert.ok(r.tick(COMBO_WINDOW + 0.01), "combo times out");
  const t0 = r.timeTarget();
  r.tick(10);
  assert.ok(r.timeTarget() > t0, "time target rises");
  r.reset();
  assert.equal(r.registerBreak(3, 3).timeDelta, 0, "small perfect gives no time");
  assert.ok(r.registerBreak(30, 30).timeDelta >= 1, "big stamp over target gives time");
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
