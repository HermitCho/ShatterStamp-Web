// 핵심 로직 테스트. 실행: npm test  (node --test tests/)
import assert from "node:assert/strict";
import { test } from "node:test";
import { BoardModel, CHAIN_MIN, CRYSTAL, CRYSTAL_COL, CRYSTAL_CROSS, CRYSTAL_MIN, CRYSTAL_ROW, CROSS_MIN, EMPTY } from "../src/core/board-model.ts";
import { allMoves, bestMove, planMoves } from "../src/core/bot.ts";
import { CHAIN_MULT, COLOR_MULT, CRYSTAL_TIME, GameRules, basePoints } from "../src/core/game-rules.ts";
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

test("color multiplier on the stamp step, small chain bonus, time from colors and crystals", () => {
  const r = new GameRules();
  const res = r.registerStamp([10, 6, 5], 3, 0);
  assert.deepEqual(res.stepPoints, [
    Math.trunc(basePoints(10) * COLOR_MULT[3]), Math.trunc(basePoints(6) * CHAIN_MULT), Math.trunc(basePoints(5) * CHAIN_MULT),
  ]);
  assert.equal(res.chains, 2);
  assert.equal(res.mult, COLOR_MULT[3]);
  assert.equal(r.maxChain, 2);
  assert.equal(r.biggest, 10);
  assert.equal(res.timeDelta, 0.25, "3 colors: +0.25s");
  assert.equal(r.registerStamp([10], 1, 0).timeDelta, 0, "one color: no time");
  assert.equal(r.registerStamp([10], 5, 2).timeDelta, 0.5 + 2 * CRYSTAL_TIME, "4+ colors and crystals");
  assert.equal(r.crystalTotal, 2);
  // 1색과 2색: 같은 칸 수라도 여러 색이 더 높다
  assert.ok(r.registerStamp([12], 2, 0).points > r.registerStamp([12], 1, 0).points);
});

test("falling blocks that link up chain-break; fresh blocks do not start chains", () => {
  // 0열: 1이 다섯 칸(0~4행), 맨 아래는 0. 0을 찍으면 1 다섯 칸이 한 칸 내려와 (1,5)의 1과 이어진다(6칸 → 연쇄).
  const m = modelFrom([
    "1342",
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

test("column crystals clear their column only", () => {
  const m = modelFrom(["0123", "1230", "2301", "3012"]);
  m.set(1, 1, CRYSTAL);
  m.crystals[1 * 4 + 1] = CRYSTAL_COL;
  const info = m.expandCrystals([{ x: 0, y: 1 }]);
  assert.deepEqual(info.crystals, [{ x: 1, y: 1, kind: CRYSTAL_COL }]);
  assert.deepEqual(new Set(info.cells.map((p) => `${p.x},${p.y}`)), new Set(["0,1", "1,0", "1,1", "1,2", "1,3"]));
});

test("crystals: break when a neighbor breaks, clear their row (cross: row and column), never link colors", () => {
  const m = modelFrom(["0123", "1230", "2301", "3012"]);
  const put = (x: number, y: number, kind: number) => {
    m.set(x, y, CRYSTAL);
    m.crystals[y * 4 + x] = kind;
  };
  put(1, 1, CRYSTAL_ROW);
  // (0,1) 옆이 부서지면 (1,1) 크리스탈이 깨지며 1행 전체
  let info = m.expandCrystals([{ x: 0, y: 1 }]);
  assert.deepEqual(info.crystals, [{ x: 1, y: 1, kind: CRYSTAL_ROW }]);
  assert.deepEqual(new Set(info.cells.map((p) => `${p.x},${p.y}`)), new Set(["0,1", "1,1", "2,1", "3,1"]));
  // 십자는 세로 줄도, 줄에 걸린 크리스탈은 이어서 깨진다
  put(1, 1, CRYSTAL_CROSS);
  put(3, 2, CRYSTAL_ROW); // 1행이 지워지며 (3,1) 옆이라 이어서 깨지고 2행도
  info = m.expandCrystals([{ x: 0, y: 1 }]);
  assert.equal(info.crystals.length, 2);
  assert.equal(info.cells.length, 4 + 3 + 3, "row 1 + column 1 + rest of row 2");
  // 크리스탈은 색 덩어리로 번지지 않는다: 크리스탈을 직접 찍어도 그 칸만
  const m2 = modelFrom(["00", "00"]);
  m2.set(0, 0, CRYSTAL);
  m2.set(1, 0, CRYSTAL);
  assert.equal(m2.computeBreak(0, 0, [{ x: 0, y: 0 }]).all.length, 1);
});

test("crystals are made by big or many-color stamps, not by cells a crystal cleared", () => {
  // 한 색으로 CROSS_MIN칸 이상 → 십자
  const big = new BoardModel(8, 9, 5, 1);
  big.cells.fill(2);
  const res = big.resolve(3, 3, [{ x: 0, y: 0 }])!;
  assert.ok(res.steps[0].broken.length >= CROSS_MIN);
  assert.equal(res.colors, 1);
  assert.deepEqual(res.crystal, { x: 3, y: 3, kind: CRYSTAL_CROSS });
  assert.equal(big.get(3, 3), CRYSTAL);
  assert.ok([...big.cells].every((c) => c !== EMPTY));
  // CRYSTAL_MIN칸 이상: 옆으로 길게 부수면 가로줄, 위아래로 길게 부수면 세로줄
  const wide = modelFrom(["00000001", "00000012", "12341234", "34123412"]);
  wide.steerTrials = 1;
  const rw = wide.resolve(0, 0, [{ x: 0, y: 0 }])!;
  assert.equal(rw.steps[0].broken.length, CRYSTAL_MIN);
  assert.equal(rw.crystal?.kind, CRYSTAL_ROW);
  const tall = modelFrom(["0012", "0023", "0034", "0041", "0012", "0023", "0013", "1234"]);
  tall.steerTrials = 1;
  const rt = tall.resolve(0, 0, [{ x: 0, y: 0 }])!;
  assert.equal(rt.steps[0].broken.length, 14);
  assert.equal(rt.crystal?.kind, CRYSTAL_COL);
  // 네 가지 색을 3칸씩 → 십자
  const four = modelFrom(["0000", "1112", "3332", "4442"]);
  four.steerTrials = 1;
  const r4 = four.resolve(0, 1, [{ x: 0, y: -1 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }])!;
  assert.equal(r4.colors, 4);
  assert.deepEqual(r4.colorSet, [0, 1, 3, 4]);
  assert.equal(r4.crystal?.kind, CRYSTAL_CROSS);
  // 작은 도장이 크리스탈 줄을 터뜨려도(줄 칸은 세지 않음) 새 크리스탈은 안 생긴다
  const m = modelFrom(["01234012", "12340123"]);
  m.set(1, 0, CRYSTAL);
  m.crystals[1] = CRYSTAL_ROW;
  m.steerTrials = 1;
  const r = m.resolve(0, 0, [{ x: 0, y: 0 }])!;
  assert.equal(r.steps[0].broken.length, 8);
  assert.equal(r.crystal, null);
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

test("the fever song is exactly as long as fever", async () => {
  const { FEVER_SONG } = await import("../src/game/music.ts");
  const { FEVER_TIME } = await import("../src/core/game-rules.ts");
  assert.equal(FEVER_SONG, FEVER_TIME);
});

test("dead board check and auto break take the biggest group of each color", () => {
  // 체크무늬: 한 칸짜리 모양으로는 어디를 찍어도 1칸 → 9칸 자리가 없다
  const checker = modelFrom(["0101", "1010", "0101", "1010"]);
  assert.equal(checker.hasBreak([{ x: 0, y: 0 }], 9), false);
  const big = modelFrom(["0000", "0000", "0111", "2222"]);
  assert.equal(big.hasBreak([{ x: 0, y: 0 }], 9), true);
  // 색 0: 세 칸 덩어리(왼쪽 위)와 한 칸 → 세 칸만. 색 1: 두 칸 → 그대로. 색 2: 한 칸 둘 → 먼저 만난 것
  const m = modelFrom(["0012", "0112", "2010", "1220"]);
  const cells = m.biggestGroups().map((p) => `${p.x},${p.y}`).sort();
  const colorOf = (k: string) => { const [x, y] = k.split(",").map(Number); return m.get(x, y); };
  // 색마다 한 덩어리만 들어 있고, 그 크기가 그 색의 가장 큰 덩어리와 같다
  const { ids, sizes } = m.components();
  for (let c = 0; c < 3; c++) {
    const mine = cells.filter((k) => colorOf(k) === c);
    const groupIds = new Set(mine.map((k) => { const [x, y] = k.split(",").map(Number); return ids[y * m.cols + x]; }));
    assert.equal(groupIds.size, 1, `color ${c}: one group`);
    const maxSize = Math.max(...[...ids].filter((id, i) => id >= 0 && m.cells[i] === c).map((id) => sizes[id]));
    assert.equal(mine.length, maxSize, `color ${c}: biggest`);
  }
});
