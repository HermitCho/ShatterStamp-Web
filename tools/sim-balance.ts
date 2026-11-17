// 밸런스 시뮬레이션: 여러 성향의 봇으로 한 판을 돌려 결과를 비교한다.
// 실행: npm run sim -- [--runs=8]
// 확인할 것: 막 누르기가 확실히 꼴찌인지, 판 길이가 늘어지지 않는지(시간 보너스·크리스탈), 크리스탈이 몇 개 생기는지.
import { BoardModel } from "../src/core/board-model.ts";
import { planMoves, type PlanResult } from "../src/core/bot.ts";
import { GameRules, STAMP_COOLDOWN } from "../src/core/game-rules.ts";
import { Rng } from "../src/core/rng.ts";
import { ShapeQueue } from "../src/core/shape-queue.ts";

/** 게임이 연쇄 연출이 끝날 때까지 다음 찍기를 막는 시간(board-view의 연출 길이와 대략 같게) */
export function lockTime(chains: number): number {
  return Math.max(STAMP_COOLDOWN, 0.45 + 0.42 * chains);
}

interface Bot {
  name: string;
  /** 생각하는 시간(초) */
  min: number;
  max: number;
  pick: (o: PlanResult[], rng: Rng) => PlanResult;
  note: string;
}

// planMoves는 점수 높은 순. 사람은 연쇄를 못 읽지만 연쇄 점수는 ×0.3이라 거의 차이가 없다.
const BOTS: Bot[] = [
  { name: "spam", min: 0.05, max: 0.15, pick: (o, r) => o[r.int(0, o.length - 1)], note: "아무 데나 아주 빠르게" },
  {
    name: "glance", min: 0.4, max: 0.7, note: "무작위 6자리만 보고 그중 가장 좋은 곳",
    pick: (o, r) => Array.from({ length: 6 }, () => o[r.int(0, o.length - 1)]).reduce((a, b) => (b.points > a.points ? b : a)),
  },
  {
    name: "finder", min: 0.9, max: 1.5, note: "최고의 85% 이상인 자리 중 하나",
    pick: (o, r) => { const g = o.filter((p) => p.points >= 0.85 * o[0].points); return g[r.int(0, g.length - 1)]; },
  },
  { name: "expert", min: 0.6, max: 1.0, pick: (o) => o[0], note: "최고 자리, 빠르게" },
];

const arg = (k: string, d: number) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? Number(a.split("=")[1]) : d;
};
const runs = arg("runs", 8);

function play(bot: Bot, seed: number) {
  const rng = new Rng(seed);
  const model = new BoardModel(8, 9, 5, seed);
  model.fillInitial();
  const queue = new ShapeQueue(seed);
  const rules = new GameRules();
  let lock = 0, made = 0, colors = 0;
  while (true) {
    const cells = queue.pop().cells;
    const next = queue.peek(1)[0].cells;
    const mv = bot.pick(planMoves(model, cells, next), rng);
    rules.tick(Math.max(rng.range(bot.min, bot.max), lock));
    if (rules.isOver() || rules.elapsed > 300) break;
    const res = model.resolve(mv.x, mv.y, cells, next)!;
    const counts = res.steps.map((s) => s.broken.length);
    const r = rules.registerStamp(counts, res.colors, res.steps.reduce((a, s) => a + s.crystals.length, 0));
    if (res.crystal) made++;
    colors += res.colors;
    lock = lockTime(r.chains);
    if (rules.isOver()) break;
  }
  return { rules, made, colors };
}

console.log(`runs=${runs}`);
console.log("bot      score (×spam)   len    stamps colors crystals made/broken");
let spam = 0;
for (const bot of BOTS) {
  let score = 0, len = 0, stamps = 0, made = 0, broke = 0, colors = 0;
  for (let r = 0; r < runs; r++) {
    const res = play(bot, 1000 + r);
    score += res.rules.score;
    len += res.rules.elapsed;
    stamps += res.rules.stamps;
    made += res.made;
    broke += res.rules.crystalTotal;
    colors += res.colors / Math.max(1, res.rules.stamps);
  }
  const avg = score / runs;
  if (bot.name === "spam") spam = avg;
  const f = (v: number, w = 5) => (v / runs).toFixed(1).padStart(w);
  console.log(
    `${bot.name.padEnd(7)} ${String(Math.round(avg)).padStart(7)} (×${(avg / spam).toFixed(2)})  ${f(len)}s ${f(stamps)} ${f(colors)}   ${f(made)}/${f(broke)}   ${bot.note}`,
  );
}
