// 밸런스 시뮬레이션: 여러 성향의 봇으로 GameRules를 돌려 결과를 비교한다.
// 실행: npm run sim -- [--runs=30] [--base=1000] [--growth=90]
import { BoardModel } from "../src/core/board-model.ts";
import { allMoves, type MoveResult } from "../src/core/bot.ts";
import { GameRules, STAMP_COOLDOWN } from "../src/core/game-rules.ts";
import { Rng } from "../src/core/rng.ts";
import { ShapeQueue } from "../src/core/shape-queue.ts";

interface Bot {
  name: string;
  min: number;
  max: number;
  pick: "random" | "half" | "great" | "best" | "scrub";
  note: string;
}

const BOTS: Bot[] = [
  { name: "spam", min: 0.15, max: 0.25, pick: "random", note: "아무 데나 아주 빠르게" },
  { name: "sloppy", min: 0.35, max: 0.6, pick: "half", note: "상위 절반 자리, 빠르게" },
  { name: "decent", min: 0.7, max: 1.2, pick: "great", note: "최대의 75% 이상, 약 1초" },
  { name: "careful", min: 1.4, max: 2.2, pick: "best", note: "항상 최고 자리, 약 2초" },
  { name: "expert", min: 0.6, max: 1.0, pick: "best", note: "항상 최고 자리, 빠르게" },
  { name: "scrub", min: 0.06, max: 0.1, pick: "scrub", note: "판정 색을 보며 무작위로 훑다 PERFECT면 찍음" },
];

const arg = (k: string, d: number) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? Number(a.split("=")[1]) : d;
};
const runs = arg("runs", 30);
const base = arg("base", 1000);
const growth = arg("growth", 90);

function scrub(options: MoveResult[], bestN: number, bot: Bot, rng: Rng): [MoveResult, number] {
  const order = options.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  let t = 0.25;
  let seen = order[0];
  for (const o of order) {
    t += rng.range(bot.min, bot.max);
    if (o.count > seen.count) seen = o;
    if (o.count >= bestN || t >= 2.0) break;
  }
  return [seen, t];
}

function pick(bot: Bot, options: MoveResult[], bestN: number, rng: Rng): MoveResult {
  switch (bot.pick) {
    case "best":
      return options[0];
    case "great": {
      const good = options.filter((o) => o.count >= bestN * 0.75);
      return good[rng.int(0, good.length - 1)];
    }
    case "half": {
      const half = options.slice(0, Math.max(1, options.length >> 1));
      return half[rng.int(0, half.length - 1)];
    }
    default:
      return options[rng.int(0, options.length - 1)];
  }
}

function play(bot: Bot, seed: number) {
  const rng = new Rng(seed);
  const model = new BoardModel(8, 9, 5, seed);
  model.fillInitial();
  const queue = new ShapeQueue(seed);
  const rules = new GameRules();
  rules.targetBase = base;
  rules.targetGrowth = growth;
  while (true) {
    const cells = queue.pop().cells;
    const options = allMoves(model, cells);
    const bestN = options[0].count;
    let mv: MoveResult, wait: number;
    if (bot.pick === "scrub") [mv, wait] = scrub(options, bestN, bot, rng);
    else {
      wait = rng.range(bot.min, bot.max);
      mv = pick(bot, options, bestN, rng);
    }
    rules.tick(Math.max(wait, STAMP_COOLDOWN));
    if (rules.isOver()) break;
    const info = model.computeBreak(mv.x, mv.y, cells);
    rules.registerBreak(info.all.length, bestN);
    model.applyBreak(info.all, queue.peek(1)[0].cells);
    if (rules.isOver()) break;
  }
  return rules;
}

console.log(`runs=${runs} target=${base}+${growth}/s`);
console.log("bot       score  (min-max)          len    bonus  combo  P/G/G/M %");
for (const bot of BOTS) {
  const scores: number[] = [];
  let len = 0, bonus = 0, combo = 0;
  const g = [0, 0, 0, 0];
  for (let r = 0; r < runs; r++) {
    const res = play(bot, 1000 + r);
    scores.push(res.score);
    len += res.elapsed;
    bonus += res.bonusTimeTotal;
    combo += res.maxCombo;
    res.gradeCounts.forEach((v, i) => (g[i] += v));
  }
  scores.sort((a, b) => a - b);
  const sum = g.reduce((a, b) => a + b, 0);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / runs);
  console.log(
    `${bot.name.padEnd(8)} ${String(avg).padStart(6)}  (${String(scores[0]).padStart(6)}-${String(scores.at(-1)).padStart(6)})  ` +
      `${(len / runs).toFixed(1).padStart(5)}s  +${(bonus / runs).toFixed(1).padStart(4)}s  ${(combo / runs).toFixed(1).padStart(5)}  ` +
      g.map((v) => Math.round((100 * v) / sum)).join("/") + `   ${bot.note}`,
  );
}
