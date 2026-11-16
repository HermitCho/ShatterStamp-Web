// 밸런스 시뮬레이션: 여러 성향의 봇으로 한 판을 돌려 결과를 비교한다.
// 실행: npm run sim -- [--runs=30] [--base=1000] [--growth=90]
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
  pick: "random" | "half" | "direct" | "best";
  note: string;
}

const BOTS: Bot[] = [
  { name: "spam", min: 0.05, max: 0.15, pick: "random", note: "아무 데나 아주 빠르게" },
  { name: "sloppy", min: 0.3, max: 0.6, pick: "half", note: "상위 절반 자리, 빠르게" },
  { name: "direct", min: 0.6, max: 1.0, pick: "direct", note: "도장으로 바로 부수는 칸 수만 보고 최고 자리" },
  { name: "reader", min: 0.9, max: 1.5, pick: "best", note: "연쇄까지 읽어 점수 최고 자리, 약 1.2초" },
  { name: "expert", min: 0.5, max: 0.8, pick: "best", note: "연쇄까지 읽어 최고 자리, 빠르게" },
];

const arg = (k: string, d: number) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? Number(a.split("=")[1]) : d;
};
const runs = arg("runs", 30);
const base = arg("base", 1000);
const growth = arg("growth", 90);

function pick(bot: Bot, options: PlanResult[], rng: Rng): PlanResult {
  switch (bot.pick) {
    case "best":
      return options[0];
    case "direct":
      return options.reduce((a, b) => (b.counts[0] > a.counts[0] ? b : a));
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
  let lock = 0;
  const chainHist = [0, 0, 0, 0, 0];
  let fevers = 0;
  while (true) {
    const cells = queue.pop().cells;
    const next = queue.peek(1)[0].cells;
    const options = planMoves(model, cells, next);
    const mv = pick(bot, options, rng);
    rules.tick(Math.max(rng.range(bot.min, bot.max), lock));
    if (rules.isOver()) break;
    const res = model.resolve(mv.x, mv.y, cells, next)!;
    const counts = res.steps.map((s) => s.broken.length);
    const r = rules.registerStamp(counts, res.steps.reduce((a, s) => a + s.bombs.length, 0));
    if (r.feverStarted) fevers++;
    chainHist[Math.min(r.chains, 4)]++;
    lock = lockTime(r.chains);
    if (rules.isOver()) break;
  }
  return { rules, chainHist, fevers };
}

console.log(`runs=${runs} target=${base}+${growth}/s`);
console.log("bot       score  (min-max)          len    bonus stamps chains bombs fever  chain0/1/2/3/4+ %");
for (const bot of BOTS) {
  const scores: number[] = [];
  let len = 0, bonus = 0, stamps = 0, chains = 0, bombs = 0, fevers = 0;
  const hist = [0, 0, 0, 0, 0];
  for (let r = 0; r < runs; r++) {
    const res = play(bot, 1000 + r);
    scores.push(res.rules.score);
    len += res.rules.elapsed;
    bonus += res.rules.bonusTimeTotal;
    stamps += res.rules.stamps;
    chains += res.rules.chainTotal;
    bombs += res.rules.bombTotal;
    fevers += res.fevers;
    res.chainHist.forEach((v, i) => (hist[i] += v));
  }
  scores.sort((a, b) => a - b);
  const sum = hist.reduce((a, b) => a + b, 0);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / runs);
  const f = (v: number, w = 5) => (v / runs).toFixed(1).padStart(w);
  console.log(
    `${bot.name.padEnd(8)} ${String(avg).padStart(6)}  (${String(scores[0]).padStart(6)}-${String(scores.at(-1)).padStart(6)})  ` +
      `${f(len)}s  +${f(bonus, 4)}s ${f(stamps)} ${f(chains)} ${f(bombs)} ${f(fevers)}   ` +
      hist.map((v) => Math.round((100 * v) / sum)).join("/") + `   ${bot.note}`,
  );
}
